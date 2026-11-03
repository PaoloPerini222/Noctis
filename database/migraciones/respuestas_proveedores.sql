-- =====================================================
-- Respuestas de los proveedores a cada reserva
--  * evento_proveedor: a qué proveedor se le consultó por cada servicio de la reserva y qué contestó
--    (avisado = se le mandó la consulta y falta su respuesta; disponible; no_disponible).
--  * La reserva solo se acepta cuando cada servicio que tiene proveedores cuenta con uno disponible.
-- Va después de sucursales.sql. Se puede ejecutar más de una vez.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.evento_proveedor (
    id_evento integer NOT NULL,
    id_servicio integer NOT NULL,
    id_proveedor integer NOT NULL,
    estado character varying(15) NOT NULL DEFAULT 'avisado',
    avisado_en timestamp with time zone NOT NULL DEFAULT now(),
    respondido_en timestamp with time zone,
    CONSTRAINT evento_proveedor_pkey PRIMARY KEY (id_evento, id_servicio, id_proveedor),
    CONSTRAINT evento_proveedor_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.evento(id_evento) ON DELETE CASCADE,
    CONSTRAINT evento_proveedor_id_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicio(id_servicio),
    CONSTRAINT evento_proveedor_id_proveedor_fkey FOREIGN KEY (id_proveedor) REFERENCES public.proveedor(id_proveedor) ON DELETE CASCADE,
    CONSTRAINT chk_evento_proveedor_estado CHECK (estado IN ('avisado', 'disponible', 'no_disponible'))
);

COMMIT;
