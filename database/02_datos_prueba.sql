-- =====================================================
-- DATOS DE PRUEBA
-- Solo para desarrollo local. No cargar en producción.
-- =====================================================

BEGIN;

INSERT INTO public.empresas (nombre, cuit, email, telefono, direccion) VALUES
('Eventos del Centro', '30-71234567-8', 'contacto@eventosdelcentro.com', '351-4001122', 'Av. Colón 1200, Córdoba'),
('Fiestas Norte', '30-70987654-3', 'info@fiestasnorte.com', '351-4553344', 'Rafael Núñez 4500, Córdoba'),
('Producciones Sur', '30-69876543-1', 'hola@produccionessur.com', NULL, NULL);

-- Servicios habituales de cada empresa, con el equipamiento y el precio que ve el cliente al reservar.
INSERT INTO public.servicio (nombre, descripcion, equipamiento, precio, id_empresa)
SELECT h.nombre, h.descripcion, h.equipamiento, h.precio, e.id_empresa
FROM public.empresas e
CROSS JOIN (VALUES
    ('Catering', 'Comida y bebida del evento', 'Vajilla, mantelería y equipo de cocina', 450000.00),
    ('Decoración', 'Ambientación y decoración de la sede', 'Centros de mesa, telas y luces cálidas', 250000.00),
    ('Música', 'Música en vivo, DJ o sonido', 'Equipo de sonido, consola y luces de pista', 300000.00),
    ('Fotografía', 'Fotografía y video del evento', 'Cámara profesional, flash y dron', 200000.00)
) AS h(nombre, descripcion, equipamiento, precio);

-- Salones de "Eventos del Centro": el mismo día puede haber un evento en cada uno.
INSERT INTO public.sucursal (nombre, direccion, id_empresa)
SELECT s.nombre, s.direccion, e.id_empresa
FROM public.empresas e
CROSS JOIN (VALUES
    ('Salón Colón', 'Av. Colón 1200, Córdoba'),
    ('Salón Cerro', 'Av. Rafael Núñez 5200, Córdoba')
) AS s(nombre, direccion)
WHERE e.cuit = '30-71234567-8';

-- Proveedor de catering de "Eventos del Centro": cuando se reserva Catering se le avisa por WhatsApp.
INSERT INTO public.proveedor (nombre, contacto, telefono, id_empresa)
SELECT 'Catering Paolo', 'Paolo', '3536579837', e.id_empresa
FROM public.empresas e
WHERE e.cuit = '30-71234567-8';
INSERT INTO public.proveedor_servicio (id_proveedor, id_servicio)
SELECT p.id_proveedor, s.id_servicio
FROM public.proveedor p
JOIN public.servicio s ON s.id_empresa = p.id_empresa AND s.nombre = 'Catering'
WHERE p.nombre = 'Catering Paolo';

-- Admin de prueba de "Eventos del Centro" (usa el sistema): admin@gmail.com / admin321
-- Superadmin de prueba (dueños del sistema, sin empresa: solo ve Empresas): superadmin@gmail.com / superadmin321
INSERT INTO public.usuario (email, password_hash) VALUES
('admin@gmail.com', '$2b$10$sfl2hXVBV6oKwhxE2VqWZuqWrnCL/UhYPEutsVwLc.M2cWPdEJZC2'),
('superadmin@gmail.com', '$2b$10$iLve13NPFdLE08sfb7hVGu3.L.s3HYCQK0xpVZxuBSjbKZ.3AKlEK');
INSERT INTO public.personal (nombre, usuario_id, id_empresa)
SELECT 'Admin', u.id_usuario, e.id_empresa
FROM public.usuario u, public.empresas e
WHERE u.email = 'admin@gmail.com' AND e.cuit = '30-71234567-8';
INSERT INTO public.personal (nombre, usuario_id, id_empresa)
SELECT 'Superadmin', u.id_usuario, NULL
FROM public.usuario u
WHERE u.email = 'superadmin@gmail.com';
INSERT INTO public.personal_rol (id_personal, id_rol)
SELECT p.id_personal, r.id_rol
FROM public.personal p
JOIN public.usuario u ON u.id_usuario = p.usuario_id
JOIN public.rol r ON r.nombre = CASE u.email WHEN 'admin@gmail.com' THEN 'admin' ELSE 'superadmin' END
WHERE u.email IN ('admin@gmail.com', 'superadmin@gmail.com');

COMMIT;
