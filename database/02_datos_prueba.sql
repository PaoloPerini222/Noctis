-- =====================================================
-- DATOS DE PRUEBA
-- Solo para desarrollo local. No cargar en producción.
-- =====================================================

BEGIN;

INSERT INTO public.empresas (nombre, cuit, email, telefono, direccion) VALUES
('Eventos del Centro', '30-71234567-8', 'contacto@eventosdelcentro.com', '351-4001122', 'Av. Colón 1200, Córdoba'),
('Fiestas Norte', '30-70987654-3', 'info@fiestasnorte.com', '351-4553344', 'Rafael Núñez 4500, Córdoba'),
('Producciones Sur', '30-69876543-1', 'hola@produccionessur.com', NULL, NULL);

-- Servicios habituales de cada empresa (punto de partida; los importes de referencia se cargan cuando se conocen).
INSERT INTO public.servicio (nombre, descripcion, id_empresa)
SELECT h.nombre, h.descripcion, e.id_empresa
FROM public.empresas e
CROSS JOIN (VALUES
    ('Catering', 'Comida y bebida del evento'),
    ('Decoración', 'Ambientación y decoración de la sede'),
    ('Música', 'Música en vivo, DJ o sonido'),
    ('Fotografía', 'Fotografía y video del evento')
) AS h(nombre, descripcion);

COMMIT;
