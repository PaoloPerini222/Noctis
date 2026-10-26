-- =====================================================
-- MIGRACIÓN - Sistema multiempresa
-- Cada empresa (tabla empresas) pasa a tener sus propios datos: personal, clientes, eventos,
-- servicios y proveedores llevan id_empresa. Lo que cuelga de ellos (propuestas, tareas, cierres,
-- etc.) pertenece a la empresa de su evento.
-- Los datos que ya existían quedan en una empresa inicial: la primera cargada, o "Empresa inicial"
-- si no hay ninguna. Cambiale el nombre y el CUIT desde el panel del superadmin.
-- El personal con rol superadmin queda sin empresa (es de la plataforma).
-- Se puede ejecutar más de una vez.
-- =====================================================

BEGIN;

INSERT INTO public.rol (nombre) VALUES ('superadmin') ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.empresas (nombre, cuit)
SELECT 'Empresa inicial', '00-00000000-0'
WHERE NOT EXISTS (SELECT 1 FROM public.empresas);

ALTER TABLE public.personal  ADD COLUMN IF NOT EXISTS id_empresa integer;
ALTER TABLE public.cliente   ADD COLUMN IF NOT EXISTS id_empresa integer;
ALTER TABLE public.evento    ADD COLUMN IF NOT EXISTS id_empresa integer;
ALTER TABLE public.servicio  ADD COLUMN IF NOT EXISTS id_empresa integer;
ALTER TABLE public.proveedor ADD COLUMN IF NOT EXISTS id_empresa integer;

UPDATE public.cliente   SET id_empresa = (SELECT min(id_empresa) FROM public.empresas) WHERE id_empresa IS NULL;
UPDATE public.evento    SET id_empresa = (SELECT min(id_empresa) FROM public.empresas) WHERE id_empresa IS NULL;
UPDATE public.servicio  SET id_empresa = (SELECT min(id_empresa) FROM public.empresas) WHERE id_empresa IS NULL;
UPDATE public.proveedor SET id_empresa = (SELECT min(id_empresa) FROM public.empresas) WHERE id_empresa IS NULL;

UPDATE public.personal p
SET id_empresa = (SELECT min(id_empresa) FROM public.empresas)
WHERE p.id_empresa IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.personal_rol pr
      JOIN public.rol r ON r.id_rol = pr.id_rol
      WHERE pr.id_personal = p.id_personal AND r.nombre = 'superadmin'
  );

ALTER TABLE public.cliente   ALTER COLUMN id_empresa SET NOT NULL;
ALTER TABLE public.evento    ALTER COLUMN id_empresa SET NOT NULL;
ALTER TABLE public.servicio  ALTER COLUMN id_empresa SET NOT NULL;
ALTER TABLE public.proveedor ALTER COLUMN id_empresa SET NOT NULL;

DO $$
DECLARE
    tabla text;
BEGIN
    FOREACH tabla IN ARRAY ARRAY['personal', 'cliente', 'evento', 'servicio', 'proveedor'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = tabla || '_id_empresa_fkey') THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (id_empresa) REFERENCES public.empresas(id_empresa)',
                tabla, tabla || '_id_empresa_fkey');
        END IF;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (id_empresa)', tabla || '_id_empresa_idx', tabla);
    END LOOP;
END $$;

COMMIT;
