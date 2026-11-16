import pg from "pg";

// Conexión al Data Warehouse: una base APARTE de la del sistema (ver docker-compose.dw.yml).
// Sin DW_DB_HOST el DW queda apagado: los reportes avisan que no está configurado y el ETL no corre.
export const dwConfigurado = Boolean(process.env.DW_DB_HOST);

const dwPool = dwConfigurado
  ? new pg.Pool({
      host: process.env.DW_DB_HOST,
      port: process.env.DW_DB_PORT,
      user: process.env.DW_DB_USER,
      password: process.env.DW_DB_PASSWORD,
      database: process.env.DW_DB_NAME,
      ssl: process.env.DW_DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    })
  : null;

export default dwPool;
