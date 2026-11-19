import dwPool, { dwConfigurado } from "../dw/db.js";
import { cargarDw } from "../dw/etl.js";

// Reportes del admin. Todo sale del Data Warehouse (base noctis_dw), nunca de la base del sistema.
// Hechos: dw.hecho_reservas (una fila por reserva). Ingresos = reservas en un estado con genera_ingreso.
// Filtro opcional por año (?anio=2026); sin año se ve toda la historia.

const NO_CONFIGURADO = { mensaje: "El Data Warehouse no está configurado" };

// $1 = empresa (id de la base operativa), $2 = año (o null). Las reservas sin fecha solo entran sin filtro de año.
const DEL_ANIO = "($2::int is null or f.anio = $2)";

// Hechos de la empresa con sus dimensiones de empresa, estado y fecha; `joins` agrega otras dimensiones.
const reservas = (joins = "") => `
  from dw.hecho_reservas h
  join dw.dim_empresa e on e.sk_empresa = h.sk_empresa
  join dw.dim_estado s on s.sk_estado = h.sk_estado
  left join dw.dim_fecha f on f.sk_fecha = h.sk_fecha
  ${joins}
  where e.id_empresa = $1 and ${DEL_ANIO}`;

const CONSULTAS = {
  ingresosPorMes: `
    select f.mes, f.nombre_mes, sum(h.importe) as ingresos, sum(h.cantidad) as eventos
    ${reservas()} and s.genera_ingreso and f.sk_fecha is not null
    group by f.mes, f.nombre_mes
    order by f.mes`,

  ingresosPorSucursal: `
    select coalesce(su.nombre, 'Sin salón') as nombre, sum(h.importe) as ingresos, sum(h.cantidad) as eventos
    ${reservas("left join dw.dim_sucursal su on su.sk_sucursal = h.sk_sucursal")} and s.genera_ingreso
    group by su.nombre
    order by ingresos desc`,

  ingresosPorTipo: `
    select t.nombre, sum(h.importe) as ingresos, sum(h.cantidad) as eventos
    ${reservas("join dw.dim_tipo_evento t on t.sk_tipo_evento = h.sk_tipo_evento")} and s.genera_ingreso
    group by t.nombre
    order by ingresos desc`,

  // Todos los estados, aunque no tengan reservas.
  estados: `
    select s.estado, s.descripcion, coalesce(sum(h.cantidad), 0) as eventos
    from dw.dim_estado s
    left join (
      dw.hecho_reservas h
      join dw.dim_empresa e on e.sk_empresa = h.sk_empresa
      left join dw.dim_fecha f on f.sk_fecha = h.sk_fecha
    ) on h.sk_estado = s.sk_estado and e.id_empresa = $1 and ${DEL_ANIO}
    group by s.sk_estado, s.estado, s.descripcion
    order by eventos desc`,

  // Días con un evento confirmado o realizado en cada salón, contra los días del período.
  ocupacion: `
    select su.nombre,
           count(distinct h.sk_fecha) as dias_reservados,
           (select count(*) from dw.dim_fecha f where ${DEL_ANIO}) as dias_periodo
    from dw.dim_sucursal su
    left join (
      dw.hecho_reservas h
      join dw.dim_fecha f on f.sk_fecha = h.sk_fecha
      join dw.dim_estado s on s.sk_estado = h.sk_estado and s.genera_ingreso
    ) on h.sk_sucursal = su.sk_sucursal and ${DEL_ANIO}
    where su.id_empresa = $1
    group by su.sk_sucursal, su.nombre
    order by dias_reservados desc, su.nombre`,

  // Un cliente "vuelve" si tiene 2 o más reservas (sin contar rechazadas ni canceladas).
  clientes: `
    select c.nombre_completo as nombre, sum(h.cantidad) as eventos,
           coalesce(sum(h.importe) filter (where s.genera_ingreso), 0) as gastado,
           sum(h.cantidad) >= 2 as vuelve
    ${reservas("join dw.dim_cliente c on c.sk_cliente = h.sk_cliente")}
      and s.estado not in ('rechazado', 'cancelado')
    group by c.sk_cliente, c.nombre_completo
    order by gastado desc, eventos desc`,
};

// pg devuelve count y sum como texto: esas columnas se pasan a número.
const NUMERICAS = new Set(["ingresos", "eventos", "dias_reservados", "dias_periodo", "gastado"]);
const numerizar = (filas) =>
  filas.map((fila) =>
    Object.fromEntries(
      Object.entries(fila).map(([clave, valor]) => [clave, NUMERICAS.has(clave) && valor !== null ? Number(valor) : valor])
    )
  );

export const obtenerReportes = async (req, res) => {
  if (!dwConfigurado) return res.status(503).json(NO_CONFIGURADO);

  const anio = req.query.anio ? Number(req.query.anio) : null;
  if (anio !== null && !(Number.isInteger(anio) && anio >= 2000 && anio <= 2100)) {
    return res.status(400).json({ mensaje: "Año inválido" });
  }

  try {
    const idEmpresa = req.usuario.id_empresa;
    const nombres = Object.keys(CONSULTAS);
    const [carga, anios, ...resultados] = await Promise.all([
      dwPool.query("select fecha from dw.carga_etl where ok order by id_carga desc limit 1"),
      dwPool.query(
        `select distinct f.anio from dw.hecho_reservas h
         join dw.dim_empresa e on e.sk_empresa = h.sk_empresa
         join dw.dim_fecha f on f.sk_fecha = h.sk_fecha
         where e.id_empresa = $1 order by f.anio desc`,
        [idEmpresa]
      ),
      ...nombres.map((n) => dwPool.query(CONSULTAS[n], [idEmpresa, anio])),
    ]);

    const datos = Object.fromEntries(nombres.map((n, i) => [n, numerizar(resultados[i].rows)]));

    const ingresos = datos.ingresosPorTipo.reduce((total, f) => total + f.ingresos, 0);
    const eventosConIngreso = datos.ingresosPorTipo.reduce((total, f) => total + f.eventos, 0);
    const clientes = datos.clientes.length;
    const vuelven = datos.clientes.filter((c) => c.vuelve).length;

    res.json({
      anio,
      anios: anios.rows.map((f) => f.anio),
      ultima_carga: carga.rows[0]?.fecha ?? null,
      resumen: {
        ingresos,
        eventos: datos.estados.reduce((total, f) => total + f.eventos, 0),
        ticket_promedio: eventosConIngreso ? ingresos / eventosConIngreso : 0,
        clientes,
        clientes_que_vuelven: vuelven,
        porcentaje_vuelven: clientes ? (vuelven / clientes) * 100 : 0,
      },
      ...datos,
    });
  } catch (error) {
    console.error(error);
    // 3D000 = la base noctis_dw todavía no existe; 42P01 = todavía no tiene las tablas.
    if (error.code === "3D000" || error.code === "42P01") {
      return res.status(503).json({ mensaje: "El Data Warehouse todavía no tiene datos. Tocá Actualizar datos" });
    }
    res.status(500).json({ mensaje: "Error al obtener los reportes" });
  }
};

// Corre el ETL en el momento (botón "Actualizar datos").
export const actualizarReportes = async (req, res) => {
  if (!dwConfigurado) return res.status(503).json(NO_CONFIGURADO);
  try {
    const { filas } = await cargarDw();
    res.json({ mensaje: "Datos actualizados", filas });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "No se pudo actualizar el Data Warehouse" });
  }
};
