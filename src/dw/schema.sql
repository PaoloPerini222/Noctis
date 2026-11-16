-- =====================================================
-- DATA WAREHOUSE noctis_DW (modelo estrella) - base aparte de la del sistema
-- =====================================================
-- Lo crea el ETL antes de cada carga (todo es IF NOT EXISTS, se puede correr muchas veces).
-- Las claves de las dimensiones son los mismos id de la base del sistema, así el ETL actualiza sin duplicar.
-- El DW guarda historia: lo que se borra en el sistema sigue acá (el ETL actualiza, nunca borra).

-- ---------- DIMENSIONES ----------

-- Un día por fila. id_tiempo = AAAAMMDD (ej. 20261115).
CREATE TABLE IF NOT EXISTS tiempo_dim (
    id_tiempo integer PRIMARY KEY,
    fecha date NOT NULL UNIQUE,
    dia smallint NOT NULL,
    mes smallint NOT NULL,
    nombre_mes varchar(12) NOT NULL,
    trimestre smallint NOT NULL,
    anio smallint NOT NULL,
    dia_semana smallint NOT NULL,          -- 1 = lunes ... 7 = domingo
    nombre_dia varchar(12) NOT NULL,
    fin_de_semana boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS empresa_dim (
    id_empresa integer PRIMARY KEY,
    nombre varchar(150) NOT NULL,
    cuit varchar(13),
    activo boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS sucursal_dim (
    id_sucursal integer PRIMARY KEY,
    id_empresa integer NOT NULL REFERENCES empresa_dim(id_empresa),
    nombre varchar(100) NOT NULL,
    direccion varchar(200)
);

CREATE TABLE IF NOT EXISTS cliente_dim (
    id_cliente integer PRIMARY KEY,
    id_empresa integer NOT NULL REFERENCES empresa_dim(id_empresa),
    nombre_completo varchar(201) NOT NULL,
    email varchar(100),
    telefono varchar(30)
);

CREATE TABLE IF NOT EXISTS servicio_dim (
    id_servicio integer PRIMARY KEY,
    id_empresa integer NOT NULL REFERENCES empresa_dim(id_empresa),
    nombre varchar(100) NOT NULL,
    precio_lista numeric(10,2)
);

CREATE TABLE IF NOT EXISTS proveedor_dim (
    id_proveedor integer PRIMARY KEY,
    id_empresa integer NOT NULL REFERENCES empresa_dim(id_empresa),
    nombre varchar(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS tipo_evento_dim (
    tipo_evento varchar(50) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS estado_dim (
    estado varchar(20) PRIMARY KEY,
    descripcion varchar(60) NOT NULL,
    genera_ingreso boolean NOT NULL       -- confirmado y realizado cuentan como ingreso
);

INSERT INTO estado_dim (estado, descripcion, genera_ingreso) VALUES
    ('propuesta', 'Reserva pendiente', false),
    ('confirmado', 'Confirmado', true),
    ('realizado', 'Realizado', true),
    ('rechazado', 'Rechazado', false),
    ('cancelado', 'Cancelado', false)
ON CONFLICT (estado) DO NOTHING;

-- ---------- HECHOS ----------

-- Un evento por fila.
CREATE TABLE IF NOT EXISTS evento_hecho (
    id_evento integer PRIMARY KEY,
    id_empresa integer NOT NULL REFERENCES empresa_dim(id_empresa),
    id_tiempo integer REFERENCES tiempo_dim(id_tiempo),      -- fecha del evento (puede no tener)
    id_sucursal integer REFERENCES sucursal_dim(id_sucursal),
    id_cliente integer NOT NULL REFERENCES cliente_dim(id_cliente),
    tipo_evento varchar(50) NOT NULL REFERENCES tipo_evento_dim(tipo_evento),
    estado varchar(20) NOT NULL REFERENCES estado_dim(estado),
    asistentes integer,
    importe_total numeric(12,2) NOT NULL DEFAULT 0,
    cant_servicios integer NOT NULL DEFAULT 0,
    cant_cambios integer NOT NULL DEFAULT 0
);

-- Un servicio vendido dentro de un evento por fila.
CREATE TABLE IF NOT EXISTS venta_servicio_hecho (
    id_evento integer NOT NULL,
    id_servicio integer NOT NULL REFERENCES servicio_dim(id_servicio),
    id_empresa integer NOT NULL REFERENCES empresa_dim(id_empresa),
    id_tiempo integer REFERENCES tiempo_dim(id_tiempo),
    id_sucursal integer REFERENCES sucursal_dim(id_sucursal),
    id_cliente integer NOT NULL REFERENCES cliente_dim(id_cliente),
    tipo_evento varchar(50) NOT NULL REFERENCES tipo_evento_dim(tipo_evento),
    estado varchar(20) NOT NULL REFERENCES estado_dim(estado),
    precio numeric(10,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (id_evento, id_servicio)
);

-- Una consulta a un proveedor (por servicio de una reserva) por fila.
CREATE TABLE IF NOT EXISTS respuesta_proveedor_hecho (
    id_evento integer NOT NULL,
    id_servicio integer NOT NULL REFERENCES servicio_dim(id_servicio),
    id_proveedor integer NOT NULL REFERENCES proveedor_dim(id_proveedor),
    id_empresa integer NOT NULL REFERENCES empresa_dim(id_empresa),
    id_tiempo_aviso integer NOT NULL REFERENCES tiempo_dim(id_tiempo),
    estado varchar(15) NOT NULL,           -- avisado (sin respuesta), disponible, no_disponible
    respondio boolean NOT NULL,
    disponible boolean NOT NULL,
    horas_respuesta numeric(10,2),         -- null si todavía no respondió
    PRIMARY KEY (id_evento, id_servicio, id_proveedor)
);

-- Un cambio registrado en un evento por fila.
CREATE TABLE IF NOT EXISTS cambio_evento_hecho (
    id_cambio integer PRIMARY KEY,
    id_evento integer NOT NULL,
    id_empresa integer NOT NULL REFERENCES empresa_dim(id_empresa),
    id_tiempo integer NOT NULL REFERENCES tiempo_dim(id_tiempo),
    tipo_cambio varchar(50) NOT NULL
);

-- Registro de cada carga del ETL.
CREATE TABLE IF NOT EXISTS carga_etl (
    id_carga integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    inicio timestamptz NOT NULL DEFAULT now(),
    fin timestamptz,
    ok boolean,
    filas jsonb,
    error text
);

CREATE INDEX IF NOT EXISTS evento_hecho_empresa_idx ON evento_hecho (id_empresa, id_tiempo);
CREATE INDEX IF NOT EXISTS venta_servicio_hecho_empresa_idx ON venta_servicio_hecho (id_empresa, id_tiempo);
CREATE INDEX IF NOT EXISTS respuesta_proveedor_hecho_empresa_idx ON respuesta_proveedor_hecho (id_empresa);
CREATE INDEX IF NOT EXISTS cambio_evento_hecho_empresa_idx ON cambio_evento_hecho (id_empresa, id_evento);
