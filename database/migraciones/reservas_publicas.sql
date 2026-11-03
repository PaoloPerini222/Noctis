-- =====================================================
-- Reservas públicas y roles simplificados
--  * Roles: quedan admin (quien usa el sistema en una empresa) y superadmin (los dueños del sistema).
--    Quien era responsable, coordinador u organizador pasa a ser admin.
--  * servicio: importe_referencia pasa a ser el precio que ve el cliente; se suma el equipamiento.
--  * empresas.token_reservas: el link público de reservas de cada empresa (/reservar/<token>).
--  * evento: estados nuevos. La reserva entra como "propuesta"; si se acepta queda "confirmado".
--      recibida, en_evaluacion, propuesta_enviada -> propuesta
--      aceptada, preparacion                      -> confirmado
--      rechazada                                  -> rechazado
--  * evento_servicio: los servicios que eligió el cliente, con el precio del momento de la reserva.
--  * Una fecha ocupada (propuesta, confirmado o realizado) no se puede volver a reservar en la misma empresa.
-- Las tablas de propuestas, tareas, exclusiones y cierre quedan en la base sin usar (no se borran datos).
-- Se puede ejecutar más de una vez.
-- =====================================================

BEGIN;

-- Roles
INSERT INTO public.rol (nombre) VALUES ('admin') ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.personal_rol (id_personal, id_rol)
SELECT DISTINCT pr.id_personal, (SELECT id_rol FROM public.rol WHERE nombre = 'admin')
FROM public.personal_rol pr
JOIN public.rol r ON r.id_rol = pr.id_rol
WHERE r.nombre IN ('responsable', 'coordinador', 'organizador')
ON CONFLICT DO NOTHING;

DELETE FROM public.personal_rol
WHERE id_rol IN (SELECT id_rol FROM public.rol WHERE nombre IN ('responsable', 'coordinador', 'organizador'));
DELETE FROM public.rol WHERE nombre IN ('responsable', 'coordinador', 'organizador');

-- Servicios: precio y equipamiento
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'servicio' AND column_name = 'importe_referencia') THEN
        ALTER TABLE public.servicio RENAME COLUMN importe_referencia TO precio;
    END IF;
END $$;
ALTER TABLE public.servicio DROP CONSTRAINT IF EXISTS chk_servicio_importe_referencia;
ALTER TABLE public.servicio DROP CONSTRAINT IF EXISTS chk_servicio_precio;
ALTER TABLE public.servicio ADD CONSTRAINT chk_servicio_precio CHECK (precio IS NULL OR precio >= 0);
ALTER TABLE public.servicio ADD COLUMN IF NOT EXISTS equipamiento character varying(500);

-- Link público de reservas
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS token_reservas uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_token_reservas_key;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_token_reservas_key UNIQUE (token_reservas);

-- Estados del evento. Para confirmar alcanza con la fecha (la sede y los asistentes son opcionales).
CREATE OR REPLACE FUNCTION public.validar_evento_confirmado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.estado IN ('confirmado', 'realizado') AND NEW.fecha IS NULL THEN
        RAISE EXCEPTION 'Para confirmar el evento se requiere la fecha.';
    END IF;

    RETURN NEW;
END;
$$;

ALTER TABLE public.evento DROP CONSTRAINT IF EXISTS chk_evento_estado;
UPDATE public.evento SET estado = 'propuesta' WHERE estado IN ('recibida', 'en_evaluacion', 'propuesta_enviada');
UPDATE public.evento SET estado = 'confirmado' WHERE estado IN ('aceptada', 'preparacion');
UPDATE public.evento SET estado = 'rechazado' WHERE estado = 'rechazada';
ALTER TABLE public.evento ALTER COLUMN estado SET DEFAULT 'propuesta';
ALTER TABLE public.evento
    ADD CONSTRAINT chk_evento_estado CHECK (estado IN ('propuesta', 'confirmado', 'rechazado', 'realizado', 'cancelado'));

-- Servicios elegidos en cada evento
CREATE TABLE IF NOT EXISTS public.evento_servicio (
    id_evento integer NOT NULL,
    id_servicio integer NOT NULL,
    precio numeric(10,2),
    CONSTRAINT evento_servicio_pkey PRIMARY KEY (id_evento, id_servicio),
    CONSTRAINT evento_servicio_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.evento(id_evento) ON DELETE CASCADE,
    CONSTRAINT evento_servicio_id_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicio(id_servicio)
);

-- Al eliminar una reserva se va con su historial de cambios
ALTER TABLE public.cambio_evento DROP CONSTRAINT IF EXISTS cambio_evento_id_evento_fkey;
ALTER TABLE public.cambio_evento
    ADD CONSTRAINT cambio_evento_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.evento(id_evento) ON DELETE CASCADE;

-- Una reserva por día por empresa
CREATE UNIQUE INDEX IF NOT EXISTS evento_fecha_ocupada_idx ON public.evento (id_empresa, fecha)
    WHERE fecha IS NOT NULL AND estado IN ('propuesta', 'confirmado', 'realizado');

COMMIT;
