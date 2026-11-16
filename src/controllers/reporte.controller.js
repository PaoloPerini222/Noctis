import dwPool, { dwConfigurado } from "../dw/db.js";
import { cargarDw } from "../dw/etl.js";

// Reportes del admin. Todo sale del Data Warehouse (base aparte), nunca de la base del sistema.
// Ingresos = eventos en un estado que genera ingreso (confirmado o realizado, ver estado_dim).
// Filtro opcional por año (?anio=2026); sin año se ve toda la historia.

const NO_CONFIGURADO = { mensaje: "El Data Warehouse no está configurado" };

// $1 = empresa, $2 = año (o null). Los eventos sin fecha solo entran cuando no se filtra por año.
const DEL_ANIO = "($2::int is null or t.anio = $2)";

const CONSULTAS = {
  ingresosPorMes: `
    select t.mes, t.nombre_mes, sum(f.importe_total) as ingresos, count(*) as eventos
    from evento_hecho f
    join tiempo_dim t on t.id_tiempo = f.id_tiempo
    join estado_dim s on s.estado = f.estado
    where f.id_empresa = $1 and s.genera_ingreso and ${DEL_ANIO}
    group by t.mes, t.nombre_mes
    order by t.mes`,

  ingresosPorSucursal: `
    select coalesce(su.nombre, 'Sin salón') as nombre, sum(f.importe_total) as ingresos, count(*) as eventos
    from evento_hecho f
    left join tiempo_dim t on t.id_tiempo = f.id_tiempo
    left join sucursal_dim su on su.id_sucursal = f.id_sucursal
    join estado_dim s on s.estado = f.estado
    where f.id_empresa = $1 and s.genera_ingreso and ${DEL_ANIO}
    group by su.nombre
    order by ingresos desc`,

  ingresosPorTipo: `
    select f.tipo_evento as nombre, sum(f.importe_total) as ingresos, count(*) as eventos
    from evento_hecho f
    left join tiempo_dim t on t.id_tiempo = f.id_tiempo
    join estado_dim s on s.estado = f.estado
    where f.id_empresa = $1 and s.genera_ingreso and ${DEL_ANIO}
    group by f.tipo_evento
    order by ingresos desc`,

  servicios: `
    select se.nombre, count(*) as veces, sum(v.precio) as ingresos
    from venta_servicio_hecho v
    join servicio_dim se on se.id_servicio = v.id_servicio
    left join tiempo_dim t on t.id_tiempo = v.id_tiempo
    join estado_dim s on s.estado = v.estado
    where v.id_empresa = $1 and s.genera_ingreso and ${DEL_ANIO}
    group by se.nombre
    order by veces desc, ingresos desc`,

  estados: `
    select s.estado, s.descripcion, count(f.id_evento) as eventos
    from estado_dim s
    left join (
      evento_hecho f left join tiempo_dim t on t.id_tiempo = f.id_tiempo
    ) on f.estado = s.estado and f.id_empresa = $1 and ${DEL_ANIO}
    group by s.estado, s.descripcion
    order by eventos desc`,

  // Días con un evento confirmado o realizado en cada salón, contra los días del período.
  ocupacion: `
    select su.nombre,
           count(distinct f.id_tiempo) as dias_reservados,
           (select count(*) from tiempo_dim t where ${DEL_ANIO}) as dias_periodo
    from sucursal_dim su
    left join (
      evento_hecho f
      join tiempo_dim t on t.id_tiempo = f.id_tiempo
      join estado_dim s on s.estado = f.estado and s.genera_ingreso
    ) on f.id_sucursal = su.id_sucursal and ${DEL_ANIO}
    where su.id_empresa = $1
    group by su.id_sucursal, su.nombre
    order by dias_reservados desc, su.nombre`,

  // Un cliente "vuelve" si tiene 2 o más eventos (sin contar rechazados ni cancelados).
  clientes: `
    select c.nombre_completo as nombre, count(*) as eventos,
           coalesce(sum(f.importe_total) filter (where s.genera_ingreso), 0) as gastado,
           count(*) >= 2 as vuelve
    from evento_hecho f
    join cliente_dim c on c.id_cliente = f.id_cliente
    left join tiempo_dim t on t.id_tiempo = f.id_tiempo
    join estado_dim s on s.estado = f.estado
    where f.id_empresa = $1 and f.estado not in ('rechazado', 'cancelado') and ${DEL_ANIO}
    group by c.id_cliente, c.nombre_completo
    order by gastado desc, eventos desc`,

  proveedores: `
    select p.nombre,
           count(*) as consultas,
           count(*) filter (where r.respondio) as respondidas,
           count(*) filter (where r.disponible) as disponibles,
           round(avg(r.horas_respuesta), 1) as horas_promedio
    from respuesta_proveedor_hecho r
    join proveedor_dim p on p.id_proveedor = r.id_proveedor
    join tiempo_dim t on t.id_tiempo = r.id_tiempo_aviso
    where r.id_empresa = $1 and ${DEL_ANIO}
    group by p.id_proveedor, p.nombre
    order by horas_promedio nulls last, p.nombre`,

  cambios: `
    select f.id_evento, f.tipo_evento, t.fecha::text as fecha, f.estado, c.nombre_completo as cliente, f.cant_cambios
    from evento_hecho f
    join cliente_dim c on c.id_cliente = f.id_cliente
    left join tiempo_dim t on t.id_tiempo = f.id_tiempo
    where f.id_empresa = $1 and f.cant_cambios > 0 and ${DEL_ANIO}
    order by f.cant_cambios desc, t.fecha desc nulls last
    limit 10`,
};

// pg devuelve count, sum y avg como texto: esas columnas se pasan a número.
const NUMERICAS = new Set([
  "ingresos", "eventos", "veces", "dias_reservados", "dias_periodo", "gastado",
  "consultas", "respondidas", "disponibles", "horas_promedio", "cant_cambios",
]);
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
      dwPool.query("select fin from carga_etl where ok order by id_carga desc limit 1"),
      dwPool.query(
        `select distinct t.anio from evento_hecho f join tiempo_dim t on t.id_tiempo = f.id_tiempo
         where f.id_empresa = $1 order by t.anio desc`,
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
      ultima_carga: carga.rows[0]?.fin ?? null,
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
    if (error.code === "42P01") {
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
