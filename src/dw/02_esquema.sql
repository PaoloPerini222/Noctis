-- =====================================================
-- PASO 5 · Crear las tablas del Data Warehouse (se corre conectado a noctis_dw)
-- =====================================================
-- Proceso: las RESERVAS de eventos que recibe cada empresa.
-- Grano:   una fila de la tabla de hechos = una reserva (un evento de la base operativa).
-- Todo es IF NOT EXISTS: se puede correr muchas veces sin romper nada.

-- ---------- 1) Ver la base operativa desde el DW ----------
-- Son dos bases distintas en el mismo servidor. Postgres no deja hacer un SELECT de una base a otra,
-- así que usamos postgres_fdw: el esquema "origen" muestra las tablas de la base operativa como si
-- estuvieran acá. No copia nada: cada SELECT a origen.* lee en vivo la base eventos.
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS operativa
    FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (host 'localhost', port '5432', dbname 'eventos');   -- la base operativa, en este mismo servidor

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
    SERVER operativa
    OPTIONS (user 'eventos', password 'eventos');

-- Se vuelve a importar en cada arranque, así toma los cambios de columnas de la base operativa.
DROP SCHEMA IF EXISTS origen CASCADE;
CREATE SCHEMA origen;
IMPORT FOREIGN SCHEMA public
    LIMIT TO (empresas, sucursal, cliente, evento, servicio, evento_servicio)
    FROM SERVER operativa INTO origen;

-- ---------- 2) Tablas del DW (esquema dw) ----------
CREATE SCHEMA IF NOT EXISTS dw;

-- Dimensiones: primero, porque la tabla de hechos las referencia.
-- Cada una tiene su clave sustituta (sk_) generada por el DW y guarda el id original de la base operativa.

-- Una fila por día. sk_fecha = AAAAMMDD (ej. 20261120). No sale de ninguna tabla: se genera.
CREATE TABLE IF NOT EXISTS dw.dim_fecha (
    sk_fecha INT PRIMARY KEY,
    fecha DATE NOT NULL UNIQUE,
    anio INT NOT NULL,
    trimestre INT NOT NULL,
    mes INT NOT NULL,
    nombre_mes VARCHAR(15) NOT NULL,
    dia INT NOT NULL,
    nombre_dia VARCHAR(15) NOT NULL,
    es_fin_de_semana BOOLEAN NOT NULL
);

-- De quién es la reserva.
CREATE TABLE IF NOT EXISTS dw.dim_empresa (
    sk_empresa SERIAL PRIMARY KEY,
    id_empresa INT NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    cuit VARCHAR(13)
);

-- Dónde (el salón). id_empresa se guarda como dato para filtrar los salones de cada empresa.
CREATE TABLE IF NOT EXISTS dw.dim_sucursal (
    sk_sucursal SERIAL PRIMARY KEY,
    id_sucursal INT NOT NULL UNIQUE,
    id_empresa INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(200)
);

-- Quién reservó.
CREATE TABLE IF NOT EXISTS dw.dim_cliente (
    sk_cliente SERIAL PRIMARY KEY,
    id_cliente INT NOT NULL UNIQUE,
    id_empresa INT NOT NULL,
    nombre_completo VARCHAR(201) NOT NULL,
    email VARCHAR(100)
);

-- Qué tipo de evento (Casamiento, Cumpleaños, ...). En la base operativa es un texto del evento.
CREATE TABLE IF NOT EXISTS dw.dim_tipo_evento (
    sk_tipo_evento SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

-- Cómo terminó la reserva. genera_ingreso marca los estados que cuentan como plata que entra.
CREATE TABLE IF NOT EXISTS dw.dim_estado (
    sk_estado SERIAL PRIMARY KEY,
    estado VARCHAR(20) NOT NULL UNIQUE,
    descripcion VARCHAR(60) NOT NULL,
    genera_ingreso BOOLEAN NOT NULL
);

-- Los estados son fijos (los define el CHECK de evento.estado), por eso se cargan acá.
INSERT INTO dw.dim_estado (estado, descripcion, genera_ingreso) VALUES
    ('propuesta', 'Reserva pendiente', false),
    ('confirmado', 'Confirmado', true),
    ('realizado', 'Realizado', true),
    ('rechazado', 'Rechazado', false),
    ('cancelado', 'Cancelado', false)
ON CONFLICT (estado) DO NOTHING;

-- Tabla de hechos: una fila por reserva.
CREATE TABLE IF NOT EXISTS dw.hecho_reservas (
    id_evento INT PRIMARY KEY,              -- id en la base operativa: la misma reserva no se carga dos veces
    sk_fecha INT,                           -- fecha del evento; NULL si la reserva todavía no tiene fecha
    sk_empresa INT NOT NULL,
    sk_sucursal INT,                        -- NULL si el evento no tiene salón
    sk_cliente INT NOT NULL,
    sk_tipo_evento INT NOT NULL,
    sk_estado INT NOT NULL,
    cantidad INT NOT NULL DEFAULT 1,        -- siempre 1: sumarla cuenta reservas
    importe NUMERIC(12,2) NOT NULL DEFAULT 0, -- suma de los servicios elegidos
    cant_servicios INT NOT NULL DEFAULT 0,
    asistentes INT,                         -- estimados; NULL si no se cargó
    FOREIGN KEY (sk_fecha) REFERENCES dw.dim_fecha(sk_fecha),
    FOREIGN KEY (sk_empresa) REFERENCES dw.dim_empresa(sk_empresa),
    FOREIGN KEY (sk_sucursal) REFERENCES dw.dim_sucursal(sk_sucursal),
    FOREIGN KEY (sk_cliente) REFERENCES dw.dim_cliente(sk_cliente),
    FOREIGN KEY (sk_tipo_evento) REFERENCES dw.dim_tipo_evento(sk_tipo_evento),
    FOREIGN KEY (sk_estado) REFERENCES dw.dim_estado(sk_estado)
);

-- Registro de cada carga (la página Reportes muestra la última).
CREATE TABLE IF NOT EXISTS dw.carga_etl (
    id_carga SERIAL PRIMARY KEY,
    fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
    ok BOOLEAN NOT NULL,
    filas JSONB,
    error TEXT
);
