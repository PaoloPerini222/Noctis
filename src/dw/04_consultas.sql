-- =====================================================
-- PASO 7 · Verificar y consultar (se corre conectado a noctis_dw)
-- =====================================================
-- Para correrlas: Adminer en http://localhost:8082
--   Sistema PostgreSQL · Servidor db · Usuario eventos · Contraseña eventos · Base de datos noctis_dw
--   -> "Comando SQL", pegar y Ejecutar.
-- origen.* es la base operativa (vista con postgres_fdw), dw.* es el Data Warehouse.

-- Cargar (o volver a cargar) el DW
CALL dw.cargar();

-- Historial de cargas
SELECT id_carga, fecha, ok, filas, error FROM dw.carga_etl ORDER BY id_carga DESC;


-- ---------- VERIFICACIÓN: los totales del DW tienen que dar igual que en la base operativa ----------

-- Cantidad de reservas
SELECT
    (SELECT COUNT(*) FROM origen.evento) AS en_origen,
    (SELECT SUM(cantidad) FROM dw.hecho_reservas) AS en_warehouse;

-- Importe total de todas las reservas
SELECT
    (SELECT COALESCE(SUM(COALESCE(es.precio, s.precio, 0)), 0)
     FROM origen.evento_servicio es
     INNER JOIN origen.servicio s ON s.id_servicio = es.id_servicio) AS total_origen,
    (SELECT SUM(importe) FROM dw.hecho_reservas) AS total_warehouse;

-- Reservas por estado, lado a lado
SELECT o.estado, o.en_origen, w.en_warehouse
FROM (SELECT estado, COUNT(*) AS en_origen FROM origen.evento GROUP BY estado) o
FULL JOIN (
    SELECT s.estado, SUM(h.cantidad) AS en_warehouse
    FROM dw.hecho_reservas h
    INNER JOIN dw.dim_estado s ON s.sk_estado = h.sk_estado
    GROUP BY s.estado
) w ON w.estado = o.estado
ORDER BY o.estado;
-- Si algo se borró en el sistema, el DW lo sigue teniendo (guarda historia) y ahí el DW da más.


-- ---------- LAS PREGUNTAS ----------
-- Ingresos = reservas en un estado con genera_ingreso (confirmado o realizado).

-- 1) ¿Cuánto facturó cada empresa por mes?
SELECT e.nombre AS empresa,
       f.anio,
       f.nombre_mes,
       SUM(h.cantidad) AS reservas,
       SUM(h.importe) AS ingresos
FROM dw.hecho_reservas h
INNER JOIN dw.dim_empresa e ON e.sk_empresa = h.sk_empresa
INNER JOIN dw.dim_fecha f ON f.sk_fecha = h.sk_fecha
INNER JOIN dw.dim_estado s ON s.sk_estado = h.sk_estado
WHERE s.genera_ingreso
GROUP BY e.nombre, f.anio, f.mes, f.nombre_mes
ORDER BY e.nombre, f.anio, f.mes;

-- 2) ¿Qué tipo de evento deja más ingresos?
SELECT t.nombre AS tipo_evento,
       SUM(h.cantidad) AS reservas,
       SUM(h.importe) AS ingresos,
       ROUND(AVG(h.importe), 2) AS ticket_promedio
FROM dw.hecho_reservas h
INNER JOIN dw.dim_tipo_evento t ON t.sk_tipo_evento = h.sk_tipo_evento
INNER JOIN dw.dim_estado s ON s.sk_estado = h.sk_estado
WHERE s.genera_ingreso
GROUP BY t.nombre
ORDER BY ingresos DESC;

-- 3) ¿Qué salón tiene más eventos y cuánto factura?
SELECT e.nombre AS empresa,
       COALESCE(su.nombre, 'Sin salón') AS salon,
       SUM(h.cantidad) AS eventos,
       SUM(h.importe) AS ingresos
FROM dw.hecho_reservas h
INNER JOIN dw.dim_empresa e ON e.sk_empresa = h.sk_empresa
LEFT JOIN dw.dim_sucursal su ON su.sk_sucursal = h.sk_sucursal
INNER JOIN dw.dim_estado s ON s.sk_estado = h.sk_estado
WHERE s.genera_ingreso
GROUP BY e.nombre, su.nombre
ORDER BY eventos DESC, ingresos DESC;

-- 4) ¿Qué porcentaje de las reservas se confirma, se rechaza o se cancela?
SELECT s.descripcion AS estado,
       COALESCE(SUM(h.cantidad), 0) AS reservas,
       ROUND(100.0 * COALESCE(SUM(h.cantidad), 0) / SUM(SUM(h.cantidad)) OVER (), 1) AS porcentaje
FROM dw.dim_estado s
LEFT JOIN dw.hecho_reservas h ON h.sk_estado = s.sk_estado
GROUP BY s.sk_estado, s.descripcion
ORDER BY reservas DESC;


-- ---------- EXTRA (lo que también muestra la página Reportes) ----------

-- Clientes que vuelven (2 o más reservas sin contar rechazadas ni canceladas) y cuánto gastó cada uno
SELECT c.nombre_completo AS cliente,
       SUM(h.cantidad) AS reservas,
       COALESCE(SUM(h.importe) FILTER (WHERE s.genera_ingreso), 0) AS gastado,
       SUM(h.cantidad) >= 2 AS vuelve
FROM dw.hecho_reservas h
INNER JOIN dw.dim_cliente c ON c.sk_cliente = h.sk_cliente
INNER JOIN dw.dim_estado s ON s.sk_estado = h.sk_estado
WHERE s.estado NOT IN ('rechazado', 'cancelado')
GROUP BY c.sk_cliente, c.nombre_completo
ORDER BY gastado DESC;

-- Reservas por día de la semana: ¿se pide más para el fin de semana?
SELECT f.nombre_dia, f.es_fin_de_semana, SUM(h.cantidad) AS reservas
FROM dw.hecho_reservas h
INNER JOIN dw.dim_fecha f ON f.sk_fecha = h.sk_fecha
GROUP BY f.nombre_dia, f.es_fin_de_semana
ORDER BY reservas DESC;
