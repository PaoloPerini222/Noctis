-- =====================================================
-- Datos de contacto y nombre completo
-- Personal: apellido, teléfono y email de contacto.
-- Cliente: apellido y dirección.
-- Proveedor: dirección.
-- nombre_completo (nombre + apellido) lo calcula la base, así se muestra igual en todo el sistema.
-- Se puede ejecutar más de una vez (no pisa nada). Requiere PostgreSQL 12 o superior.
-- =====================================================

BEGIN;

ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS apellido character varying(100),
    ADD COLUMN IF NOT EXISTS telefono character varying(30),
    ADD COLUMN IF NOT EXISTS email_contacto character varying(150);
ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS nombre_completo character varying(201)
    GENERATED ALWAYS AS (nombre || COALESCE(' ' || apellido, '')) STORED;

ALTER TABLE public.cliente
    ADD COLUMN IF NOT EXISTS apellido character varying(100),
    ADD COLUMN IF NOT EXISTS direccion character varying(200);
ALTER TABLE public.cliente
    ADD COLUMN IF NOT EXISTS nombre_completo character varying(201)
    GENERATED ALWAYS AS (nombre || COALESCE(' ' || apellido, '')) STORED;

ALTER TABLE public.proveedor
    ADD COLUMN IF NOT EXISTS direccion character varying(200);

COMMIT;
