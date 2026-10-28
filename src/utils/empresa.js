import pool from "../data/db.js";

// Tablas con id_empresa y su clave primaria: con esto se verifica que un id pertenezca a la empresa.
const CLAVES = {
    cliente: "id_cliente",
    evento: "id_evento",
    personal: "id_personal",
    servicio: "id_servicio",
    proveedor: "id_proveedor",
};

// true si el registro existe y es de la empresa. Un id de otra empresa se trata como inexistente.
export const esDeLaEmpresa = async (tabla, id, idEmpresa, db = pool) => {
    const clave = CLAVES[tabla];
    if(!clave){
        throw new Error(`tabla sin id_empresa: ${tabla}`);
    }

    const resultado = await db.query(`select 1 from ${tabla} where ${clave} = $1 and id_empresa = $2`, [id, idEmpresa]);

    return resultado.rows.length > 0;
};

// Evento (por id) de la empresa, o undefined si no existe o es de otra empresa.
export const buscarEventoDeEmpresa = async (db, idEvento, idEmpresa) => {
    const evento = await db.query(`select * from evento where id_evento = $1 and id_empresa = $2`, [idEvento, idEmpresa]);

    return evento.rows[0];
};
