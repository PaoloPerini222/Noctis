import { readFile } from "node:fs/promises";
import pool from "../data/db.js";
import dwPool, { dwConfigurado } from "./db.js";

// ETL del Data Warehouse:
//   Extract   -> lee las tablas de la base del sistema (pool).
//   Transform -> arma dimensiones y hechos (importes, horas de respuesta, cantidad de cambios, id de fecha AAAAMMDD).
//   Load      -> los guarda en la base del DW (dwPool) con upsert: actualiza lo que ya estaba y nunca borra,
//                así el DW conserva la historia aunque algo se elimine en el sistema.
// Todo se carga en una transacción: si algo falla el DW queda como estaba.

const ZONA = "America/Argentina/Buenos_Aires";
const fechaId = (columna) => `to_char(${columna}, 'YYYYMMDD')::int`;

// Consultas a la base del sistema. Cada una devuelve filas con las mismas columnas que su tabla del DW.
const EXTRACCION = {
  empresa_dim: `select id_empresa, nombre, cuit, activo from empresas`,
  sucursal_dim: `select id_sucursal, id_empresa, nombre, direccion from sucursal`,
  cliente_dim: `select id_cliente, id_empresa, nombre_completo, email, telefono from cliente`,
  servicio_dim: `select id_servicio, id_empresa, nombre, precio as precio_lista from servicio`,
  proveedor_dim: `select id_proveedor, id_empresa, nombre from proveedor`,
  tipo_evento_dim: `select distinct tipo_evento from evento`,
  evento_hecho: `
    select e.id_evento, e.id_empresa, ${fechaId("e.fecha")} as id_tiempo, e.id_sucursal, e.id_cliente,
           e.tipo_evento, e.estado, e.cant_asistentes_estimada as asistentes,
           coalesce(v.importe, 0) as importe_total, coalesce(v.cantidad, 0) as cant_servicios,
           (select count(*) from cambio_evento c where c.id_evento = e.id_evento) as cant_cambios
    from evento e
    left join (
      select es.id_evento, sum(coalesce(es.precio, s.precio, 0)) as importe, count(*) as cantidad
      from evento_servicio es join servicio s on s.id_servicio = es.id_servicio
      group by es.id_evento
    ) v on v.id_evento = e.id_evento`,
  venta_servicio_hecho: `
    select es.id_evento, es.id_servicio, e.id_empresa, ${fechaId("e.fecha")} as id_tiempo, e.id_sucursal,
           e.id_cliente, e.tipo_evento, e.estado, coalesce(es.precio, s.precio, 0) as precio
    from evento_servicio es
    join evento e on e.id_evento = es.id_evento
    join servicio s on s.id_servicio = es.id_servicio`,
  respuesta_proveedor_hecho: `
    select ep.id_evento, ep.id_servicio, ep.id_proveedor, e.id_empresa,
           ${fechaId(`(ep.avisado_en at time zone '${ZONA}')`)} as id_tiempo_aviso,
           ep.estado, ep.estado <> 'avisado' as respondio, ep.estado = 'disponible' as disponible,
           case when ep.respondido_en is not null
                then round(extract(epoch from ep.respondido_en - ep.avisado_en)::numeric / 3600, 2) end as horas_respuesta
    from evento_proveedor ep
    join evento e on e.id_evento = ep.id_evento`,
  cambio_evento_hecho: `
    select c.id_cambio, c.id_evento, e.id_empresa,
           ${fechaId(`(c.fecha_registro at time zone '${ZONA}')`)} as id_tiempo, c.tipo_cambio
    from cambio_evento c
    join evento e on e.id_evento = c.id_evento`,
};

// Clave de cada tabla del DW (para el upsert). El orden respeta las FK: primero dimensiones, después hechos.
const CLAVES = {
  empresa_dim: ["id_empresa"],
  sucursal_dim: ["id_sucursal"],
  cliente_dim: ["id_cliente"],
  servicio_dim: ["id_servicio"],
  proveedor_dim: ["id_proveedor"],
  tipo_evento_dim: ["tipo_evento"],
  evento_hecho: ["id_evento"],
  venta_servicio_hecho: ["id_evento", "id_servicio"],
  respuesta_proveedor_hecho: ["id_evento", "id_servicio", "id_proveedor"],
  cambio_evento_hecho: ["id_cambio"],
};

// Rango de fechas que usan los hechos (más el año actual completo), para llenar tiempo_dim.
const RANGO_FECHAS = `
  select least(min(f), date_trunc('year', current_date)::date) as desde,
         greatest(max(f), (date_trunc('year', current_date) + interval '1 year - 1 day')::date) as hasta
  from (
    select fecha as f from evento
    union all select (avisado_en at time zone '${ZONA}')::date from evento_proveedor
    union all select (fecha_registro at time zone '${ZONA}')::date from cambio_evento
  ) fechas`;

const CARGAR_TIEMPO = `
  insert into tiempo_dim (id_tiempo, fecha, dia, mes, nombre_mes, trimestre, anio, dia_semana, nombre_dia, fin_de_semana)
  select to_char(d, 'YYYYMMDD')::int, d, extract(day from d), extract(month from d),
         (array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from d)],
         extract(quarter from d), extract(year from d), extract(isodow from d),
         (array['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])[extract(isodow from d)],
         extract(isodow from d) in (6, 7)
  from generate_series($1::date, $2::date, interval '1 day') as g(d)
  on conflict (id_tiempo) do nothing`;

// Inserta o actualiza todas las filas de una tabla en una sola consulta (las filas viajan como JSON).
const upsert = async (cliente, tabla, filas) => {
  if (filas.length === 0) return 0;
  const columnas = Object.keys(filas[0]);
  const clave = CLAVES[tabla];
  const resto = columnas.filter((c) => !clave.includes(c));
  const alChocar = resto.length
    ? `do update set ${resto.map((c) => `${c} = excluded.${c}`).join(", ")}`
    : "do nothing";
  await cliente.query(
    `insert into ${tabla} (${columnas.join(", ")})
     select ${columnas.join(", ")} from json_populate_recordset(null::${tabla}, $1::json)
     on conflict (${clave.join(", ")}) ${alChocar}`,
    [JSON.stringify(filas)]
  );
  return filas.length;
};

let cargando = null;

// Corre el ETL completo. Si ya hay una carga en curso devuelve esa misma (no se pisan).
export const cargarDw = () => {
  if (!dwConfigurado) return Promise.reject(new Error("El Data Warehouse no está configurado (faltan las variables DW_DB_*)"));
  cargando ??= ejecutar().finally(() => {
    cargando = null;
  });
  return cargando;
};

const ejecutar = async () => {
  const esquema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await dwPool.query(esquema);

  const { rows: [carga] } = await dwPool.query("insert into carga_etl default values returning id_carga");

  try {
    // Extract
    const [rango, ...resultados] = await Promise.all([
      pool.query(RANGO_FECHAS),
      ...Object.values(EXTRACCION).map((sql) => pool.query(sql)),
    ]);
    const datos = Object.fromEntries(Object.keys(EXTRACCION).map((tabla, i) => [tabla, resultados[i].rows]));

    // Load
    const cliente = await dwPool.connect();
    const filas = {};
    try {
      await cliente.query("BEGIN");
      const { desde, hasta } = rango.rows[0];
      await cliente.query(CARGAR_TIEMPO, [desde, hasta]);
      for (const tabla of Object.keys(CLAVES)) {
        filas[tabla] = await upsert(cliente, tabla, datos[tabla]);
      }
      await cliente.query("COMMIT");
    } catch (error) {
      await cliente.query("ROLLBACK");
      throw error;
    } finally {
      cliente.release();
    }

    await dwPool.query("update carga_etl set fin = now(), ok = true, filas = $2 where id_carga = $1", [carga.id_carga, filas]);
    // Actualiza las estadísticas de Postgres (las usa para planificar consultas y Adminer para mostrar cuántas filas hay).
    await dwPool.query("ANALYZE");
    return { id_carga: carga.id_carga, filas };
  } catch (error) {
    await dwPool.query("update carga_etl set fin = now(), ok = false, error = $2 where id_carga = $1", [carga.id_carga, error.message]);
    throw error;
  }
};

// Carga el DW unos segundos después de un cambio en el sistema (crear, editar o borrar algo, o una reserva del link).
// Si llegan varios cambios seguidos se hace una sola carga; si ya había una en curso, se espera a que termine y se
// corre otra, así no se pierde el último cambio.
const ESPERA_MS = 2000;
let pendiente = null;
export const cargarPronto = () => {
  if (!dwConfigurado) return;
  clearTimeout(pendiente);
  pendiente = setTimeout(async () => {
    await cargando?.catch(() => {});
    cargarDw().catch((error) => console.error("Error al cargar el DW:", error.message));
  }, ESPERA_MS);
};

// Recarga automática cada DW_ETL_HORAS horas (0 o vacío = solo a mano). La primera corre al levantar el back.
export const programarEtl = () => {
  const horas = Number(process.env.DW_ETL_HORAS ?? 0);
  if (!dwConfigurado || !(horas > 0)) return;
  const correr = () =>
    cargarDw()
      .then(({ filas }) => console.log("DW cargado:", filas))
      .catch((error) => console.error("Error al cargar el DW:", error.message));
  correr();
  setInterval(correr, horas * 60 * 60 * 1000).unref();
};
