import pg from "pg";

// Conexión al Data Warehouse: es OTRA base (DW_DB_NAME, ej. noctis_dw) en el MISMO servidor que la base
// operativa, así que usa el mismo host, puerto y usuario (DB_*).
// Sin DW_DB_NAME el DW queda apagado: los reportes avisan que no está configurado y el ETL no corre.
export const DW_NOMBRE = process.env.DW_DB_NAME ?? "";
export const dwConfigurado = /^[a-z_][a-z0-9_]*$/.test(DW_NOMBRE);

const dwPool = dwConfigurado
  ? new pg.Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: DW_NOMBRE,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    })
  : null;

export default dwPool;
