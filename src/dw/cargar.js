import "dotenv/config";
import pool from "../data/db.js";
import dwPool from "./db.js";
import { cargarDw } from "./etl.js";

// Carga el Data Warehouse a mano desde la terminal: npm run etl
try {
  const { id_carga, filas } = await cargarDw();
  console.log(`Carga ${id_carga} terminada. Filas por tabla:`);
  console.table(filas);
} catch (error) {
  console.error("No se pudo cargar el DW:", error.message);
  process.exitCode = 1;
} finally {
  await Promise.all([pool.end(), dwPool?.end()]);
}
