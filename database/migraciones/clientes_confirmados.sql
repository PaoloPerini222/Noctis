-- =====================================================
-- Clientes confirmados
--  * cliente.confirmado: quien reserva por el link público entra en false y recién pasa a Clientes (true)
--    cuando se acepta su reserva. Los clientes cargados a mano quedan en true.
--  * Los que ya existen y solo tienen reservas pendientes o rechazadas quedan en false.
-- Se puede ejecutar más de una vez.
-- =====================================================

BEGIN;

ALTER TABLE public.cliente ADD COLUMN IF NOT EXISTS confirmado boolean NOT NULL DEFAULT true;

UPDATE public.cliente c SET confirmado = false
WHERE EXISTS (SELECT 1 FROM public.evento e WHERE e.id_cliente = c.id_cliente)
  AND NOT EXISTS (
      SELECT 1 FROM public.evento e
      WHERE e.id_cliente = c.id_cliente AND e.estado NOT IN ('propuesta', 'rechazado')
  );

COMMIT;
