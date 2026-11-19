import { readFile } from "node:fs/promises";
import pool from "../data/db.js";
import dwPool, { DW_NOMBRE, dwConfigurado } from "./db.js";

// ETL del Data Warehouse. Todo el trabajo lo hace Postgres con los .sql de esta carpeta:
//   01_base.sql      -> crea la base noctis_dw en el mismo servidor que la operativa
//   02_esquema.sql   -> conecta noctis_dw con la base operativa (postgres_fdw) y crea dimensiones y hechos
//   03_carga.sql     -> el procedimiento dw.cargar(): INSERT ... SELECT desde la operativa, primero dimensiones y después hechos
// Desde acá solo se prepara una vez y después cada carga es un CALL dw.cargar().

const leer = (archivo) => readFile(new URL(archivo, import.meta.url), "utf8");

let preparado = null;
const preparar = () => {
  preparado ??= (async () => {
    const { rowCount } = await pool.query("select 1 from pg_database where datname = $1", [DW_NOMBRE]);
    if (!rowCount) await pool.query(`create database ${DW_NOMBRE}`); // DW_NOMBRE ya se validó en db.js
    await dwPool.query(await leer("./02_esquema.sql"));
    await dwPool.query(await leer("./03_carga.sql"));
  })().catch((error) => {
    preparado = null; // si falla, el próximo intento vuelve a probar
    throw error;
  });
  return preparado;
};

let cargando = null;

// Corre el ETL completo. Si ya hay una carga en curso devuelve esa misma (no se pisan).
export const cargarDw = () => {
  if (!dwConfigurado) return Promise.reject(new Error("El Data Warehouse no está configurado (falta DW_DB_NAME)"));
  cargando ??= ejecutar().finally(() => {
    cargando = null;
  });
  return cargando;
};

const ejecutar = async () => {
  await preparar();
  try {
    // El CALL corre en una sola transacción: si algo falla, el DW queda como estaba.
    await dwPool.query("CALL dw.cargar()");
    const { rows: [carga] } = await dwPool.query("select id_carga, filas from dw.carga_etl order by id_carga desc limit 1");
    return carga;
  } catch (error) {
    await dwPool.query("insert into dw.carga_etl (ok, error) values (false, $1)", [error.message]).catch(() => {});
    throw error;
  }
};

// Carga el DW unos segundos después de un cambio en el sistema (crear, editar o borrar algo, o una reserva del link).
// Si llegan varios cambios seguidos se hace una sola carga; si ya había una en curso, se espera a que termine y se
// corre otra, así no se pierde el último cambio.
const ESPERA_MS = 2000;
let pendiente = null;
export const cargarPronto = () => {
  if (!dwConfigurado) return;
  clearTimeout(pendiente);
  pendiente = setTimeout(async () => {
    await cargando?.catch(() => {});
    cargarDw().catch((error) => console.error("Error al cargar el DW:", error.message));
  }, ESPERA_MS);
};

// Recarga automática cada DW_ETL_HORAS horas (0 o vacío = solo a mano). La primera corre al levantar el back.
export const programarEtl = () => {
  const horas = Number(process.env.DW_ETL_HORAS ?? 0);
  if (!dwConfigurado || !(horas > 0)) return;
  const correr = () =>
    cargarDw()
      .then(({ filas }) => console.log("DW cargado:", filas))
      .catch((error) => console.error("Error al cargar el DW:", error.message));
  correr();
  setInterval(correr, horas * 60 * 60 * 1000).unref();
};
