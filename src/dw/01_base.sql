-- =====================================================
-- PASO 0 · Crear la base del Data Warehouse
-- =====================================================
-- Se corre conectado a la base OPERATIVA (eventos). Las dos bases quedan en el MISMO servidor Postgres:
--   eventos    -> base operativa del sistema (la usa la app)
--   noctis_dw  -> Data Warehouse (solo para analizar)
-- El back la crea solo la primera vez (src/dw/etl.js); este archivo es para hacerlo a mano.

CREATE DATABASE noctis_dw;
