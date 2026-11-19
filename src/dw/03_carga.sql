-- =====================================================
-- PASOS 6 y 8 · Cargar los datos y guardar la carga en un procedimiento (se corre conectado a noctis_dw)
-- =====================================================
-- Cada INSERT ... SELECT es el ETL completo:
--   EXTRAER     -> el FROM lee la base operativa (esquema origen)
--   TRANSFORMAR -> el SELECT cambia ids por claves sk_, fechas por AAAAMMDD, NULL por 0, etc.
--   CARGAR      -> el INSERT guarda en el DW (esquema dw)
-- Orden obligatorio: primero las dimensiones, después los hechos.
-- ON CONFLICT hace que se pueda repetir: la primera vez inserta, las siguientes actualizan lo que cambió.
-- Nunca borra: si algo se elimina en el sistema, en el DW queda como historia.
--
-- Para cargar:  CALL dw.cargar();

CREATE OR REPLACE PROCEDURE dw.cargar()
LANGUAGE plpgsql
AS $$
DECLARE
    v_desde DATE;
    v_hasta DATE;
BEGIN
    -- ---------- 1) DIMENSIONES ----------

    -- dim_fecha: un día por fila, desde la reserva más vieja hasta la más nueva (y todo el año actual).
    SELECT LEAST(MIN(fecha), date_trunc('year', current_date)::DATE),
           GREATEST(MAX(fecha), (date_trunc('year', current_date) + INTERVAL '1 year - 1 day')::DATE)
    INTO v_desde, v_hasta
    FROM origen.evento;

    INSERT INTO dw.dim_fecha
    SELECT
        TO_CHAR(d, 'YYYYMMDD')::INT,
        d::DATE,
        EXTRACT(YEAR FROM d)::INT,
        EXTRACT(QUARTER FROM d)::INT,
        EXTRACT(MONTH FROM d)::INT,
        (ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
               'Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[EXTRACT(MONTH FROM d)::INT],
        EXTRACT(DAY FROM d)::INT,
        (ARRAY['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])[EXTRACT(ISODOW FROM d)::INT],
        EXTRACT(ISODOW FROM d) IN (6, 7)
    FROM generate_series(v_desde::TIMESTAMP, v_hasta::TIMESTAMP, INTERVAL '1 day') AS d
    ON CONFLICT (sk_fecha) DO NOTHING;

    INSERT INTO dw.dim_empresa (id_empresa, nombre, cuit)
    SELECT id_empresa, nombre, cuit
    FROM origen.empresas
    ON CONFLICT (id_empresa) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        cuit = EXCLUDED.cuit;

    INSERT INTO dw.dim_sucursal (id_sucursal, id_empresa, nombre, direccion)
    SELECT id_sucursal, id_empresa, nombre, direccion
    FROM origen.sucursal
    ON CONFLICT (id_sucursal) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        direccion = EXCLUDED.direccion;

    INSERT INTO dw.dim_cliente (id_cliente, id_empresa, nombre_completo, email)
    SELECT id_cliente, id_empresa, nombre_completo, email
    FROM origen.cliente
    ON CONFLICT (id_cliente) DO UPDATE
    SET nombre_completo = EXCLUDED.nombre_completo,
        email = EXCLUDED.email;

    -- TRANSFORMAR: en la base operativa el tipo es un texto libre repetido en cada evento; acá queda una fila por tipo.
    -- Se unifica la escritura (DW integrado): ' casamiento', 'CASAMIENTO' y 'Casamiento' son todos 'Casamiento'.
    INSERT INTO dw.dim_tipo_evento (nombre)
    SELECT DISTINCT UPPER(LEFT(TRIM(tipo_evento), 1)) || LOWER(SUBSTRING(TRIM(tipo_evento) FROM 2))
    FROM origen.evento
    ON CONFLICT (nombre) DO NOTHING;

    -- dim_estado no se carga acá: sus 5 filas son fijas y están en 02_esquema.sql.

    -- ---------- 2) HECHOS ----------
    -- Cada JOIN con una dimensión cambia el id de la base operativa por la clave sk_ del DW.
    INSERT INTO dw.hecho_reservas
        (id_evento, sk_fecha, sk_empresa, sk_sucursal, sk_cliente, sk_tipo_evento, sk_estado,
         cantidad, importe, cant_servicios, asistentes)
    SELECT
        e.id_evento,
        TO_CHAR(e.fecha, 'YYYYMMDD')::INT,      -- 2026-11-20 -> 20261120 (NULL si no tiene fecha)
        de.sk_empresa,
        ds.sk_sucursal,
        dc.sk_cliente,
        dt.sk_tipo_evento,
        dx.sk_estado,
        1,
        COALESCE(v.importe, 0),                 -- sin servicios elegidos -> 0
        COALESCE(v.cant_servicios, 0),
        e.cant_asistentes_estimada
    FROM origen.evento e
    -- Importe de la reserva: el precio guardado en la reserva o, si no tiene, el precio de lista del servicio.
    LEFT JOIN (
        SELECT es.id_evento,
               SUM(COALESCE(es.precio, s.precio, 0)) AS importe,
               COUNT(*) AS cant_servicios
        FROM origen.evento_servicio es
        INNER JOIN origen.servicio s ON s.id_servicio = es.id_servicio
        GROUP BY es.id_evento
    ) v ON v.id_evento = e.id_evento
    INNER JOIN dw.dim_empresa de     ON de.id_empresa = e.id_empresa
    LEFT JOIN  dw.dim_sucursal ds    ON ds.id_sucursal = e.id_sucursal   -- LEFT: hay eventos sin salón
    INNER JOIN dw.dim_cliente dc     ON dc.id_cliente = e.id_cliente
    INNER JOIN dw.dim_tipo_evento dt ON dt.nombre = UPPER(LEFT(TRIM(e.tipo_evento), 1)) || LOWER(SUBSTRING(TRIM(e.tipo_evento) FROM 2))
    INNER JOIN dw.dim_estado dx      ON dx.estado = e.estado
    ON CONFLICT (id_evento) DO UPDATE
    SET sk_fecha = EXCLUDED.sk_fecha,
        sk_sucursal = EXCLUDED.sk_sucursal,
        sk_tipo_evento = EXCLUDED.sk_tipo_evento,
        sk_estado = EXCLUDED.sk_estado,
        importe = EXCLUDED.importe,
        cant_servicios = EXCLUDED.cant_servicios,
        asistentes = EXCLUDED.asistentes;

    -- ---------- 3) Registro de la carga ----------
    INSERT INTO dw.carga_etl (ok, filas)
    SELECT true, jsonb_build_object(
        'dim_fecha', (SELECT COUNT(*) FROM dw.dim_fecha),
        'dim_empresa', (SELECT COUNT(*) FROM dw.dim_empresa),
        'dim_sucursal', (SELECT COUNT(*) FROM dw.dim_sucursal),
        'dim_cliente', (SELECT COUNT(*) FROM dw.dim_cliente),
        'dim_tipo_evento', (SELECT COUNT(*) FROM dw.dim_tipo_evento),
        'dim_estado', (SELECT COUNT(*) FROM dw.dim_estado),
        'hecho_reservas', (SELECT COUNT(*) FROM dw.hecho_reservas)
    );

    RAISE NOTICE 'Carga del data warehouse finalizada';
END;
$$;
