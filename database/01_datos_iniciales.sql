-- =====================================================
-- DATOS INICIALES
-- Catálogos que el sistema necesita para funcionar (no son datos de prueba).
-- =====================================================

BEGIN;

INSERT INTO public.rol (nombre)
VALUES ('admin'), ('superadmin')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
