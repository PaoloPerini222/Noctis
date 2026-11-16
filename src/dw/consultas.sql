-- =====================================================
-- CONSULTAS DE EJEMPLO AL DATA WAREHOUSE noctis_DW
-- =====================================================
-- Para correrlas: http://localhost:8082 (Adminer) -> PostgreSQL · servidor noctis_dw · usuario dw · contraseña dw · base noctis_DW
-- -> "Comando SQL", pegar una consulta y Ejecutar.
-- Son las mismas que usa la página Reportes de la app (src/controllers/reporte.controller.js),
-- pero sin filtrar por empresa, así se ven todas. Para ver una sola agregá: and f.id_empresa = <id>.
-- Ingresos = eventos en un estado con genera_ingreso (confirmado o realizado).

-- 0) Estado de las cargas del ETL
select id_carga, inicio, fin, ok, filas, error from carga_etl order by id_carga desc;

-- 1a) Ingresos por mes
select e.nombre as empresa, t.anio, t.nombre_mes, sum(f.importe_total) as ingresos, count(*) as eventos
from evento_hecho f
join tiempo_dim t on t.id_tiempo = f.id_tiempo
join estado_dim s on s.estado = f.estado
join empresa_dim e on e.id_empresa = f.id_empresa
where s.genera_ingreso
group by e.nombre, t.anio, t.mes, t.nombre_mes
order by e.nombre, t.anio, t.mes;

-- 1b) Ingresos por sucursal
select e.nombre as empresa, coalesce(su.nombre, 'Sin salón') as sucursal, sum(f.importe_total) as ingresos, count(*) as eventos
from evento_hecho f
left join sucursal_dim su on su.id_sucursal = f.id_sucursal
join estado_dim s on s.estado = f.estado
join empresa_dim e on e.id_empresa = f.id_empresa
where s.genera_ingreso
group by e.nombre, su.nombre
order by ingresos desc;

-- 1c) Ingresos por tipo de evento
select f.tipo_evento, sum(f.importe_total) as ingresos, count(*) as eventos
from evento_hecho f
join estado_dim s on s.estado = f.estado
where s.genera_ingreso
group by f.tipo_evento
order by ingresos desc;

-- 2) Servicios más vendidos y cuánto deja cada uno
select se.nombre as servicio, count(*) as veces_vendido, sum(v.precio) as ingresos
from venta_servicio_hecho v
join servicio_dim se on se.id_servicio = v.id_servicio
join estado_dim s on s.estado = v.estado
where s.genera_ingreso
group by se.nombre
order by veces_vendido desc, ingresos desc;

-- 3) Eventos por estado (confirmados contra cancelados)
select s.descripcion as estado, count(f.id_evento) as eventos,
       round(100.0 * count(f.id_evento) / nullif(sum(count(f.id_evento)) over (), 0), 1) as porcentaje
from estado_dim s
left join evento_hecho f on f.estado = s.estado
group by s.estado, s.descripcion
order by eventos desc;

-- 4) Ocupación de cada salón en el año actual: días reservados contra días libres
select su.nombre as salon,
       count(distinct f.id_tiempo) as dias_reservados,
       (select count(*) from tiempo_dim where anio = extract(year from current_date)) - count(distinct f.id_tiempo) as dias_libres,
       round(100.0 * count(distinct f.id_tiempo) / (select count(*) from tiempo_dim where anio = extract(year from current_date)), 2) as ocupacion_pct
from sucursal_dim su
left join (
  evento_hecho f
  join tiempo_dim t on t.id_tiempo = f.id_tiempo and t.anio = extract(year from current_date)
  join estado_dim s on s.estado = f.estado and s.genera_ingreso
) on f.id_sucursal = su.id_sucursal
group by su.id_sucursal, su.nombre
order by dias_reservados desc;

-- 5) Clientes que vuelven y cuánto gastó cada uno (vuelve = 2 o más eventos, sin contar rechazados ni cancelados)
select c.nombre_completo as cliente, count(*) as eventos,
       coalesce(sum(f.importe_total) filter (where s.genera_ingreso), 0) as gastado,
       count(*) >= 2 as vuelve
from evento_hecho f
join cliente_dim c on c.id_cliente = f.id_cliente
join estado_dim s on s.estado = f.estado
where f.estado not in ('rechazado', 'cancelado')
group by c.id_cliente, c.nombre_completo
order by gastado desc;

-- 6) Proveedores: cuánto tardan en responder y qué porcentaje dice que está disponible
select p.nombre as proveedor,
       count(*) as consultas,
       count(*) filter (where r.respondio) as respondidas,
       round(avg(r.horas_respuesta), 1) as horas_promedio,
       round(100.0 * count(*) filter (where r.disponible) / nullif(count(*) filter (where r.respondio), 0), 1) as disponible_pct
from respuesta_proveedor_hecho r
join proveedor_dim p on p.id_proveedor = r.id_proveedor
group by p.id_proveedor, p.nombre
order by horas_promedio nulls last;

-- 7) Eventos con más cambios
select f.id_evento, f.tipo_evento, t.fecha, f.estado, c.nombre_completo as cliente, f.cant_cambios
from evento_hecho f
join cliente_dim c on c.id_cliente = f.id_cliente
left join tiempo_dim t on t.id_tiempo = f.id_tiempo
where f.cant_cambios > 0
order by f.cant_cambios desc
limit 10;

-- 7b) Detalle de los cambios por tipo
select tipo_cambio, count(*) as cantidad from cambio_evento_hecho group by tipo_cambio order by cantidad desc;
