import bcrypt from "bcryptjs";
import pool from "../data/db.js";
import { ADMIN } from "../middleware/permisos.js";
import { SERVICIOS_HABITUALES } from "./servicios.js";

// Tablas con id_empresa y su clave primaria: con esto se verifica que un id pertenezca a la empresa.
const CLAVES = {
    cliente: "id_cliente",
    evento: "id_evento",
    personal: "id_personal",
    servicio: "id_servicio",
    proveedor: "id_proveedor",
    sucursal: "id_sucursal",
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

// Crea la empresa con los servicios habituales como punto de partida (después se editan a gusto).
// Va dentro de la transacción de quien llama; devuelve el id de la empresa.
export const insertarEmpresa = async (db, { nombre, cuit, email, telefono, direccion }) => {
    const resultado = await db.query(`
        INSERT INTO empresas(nombre, cuit, email, telefono, direccion)
        VALUES($1, $2, $3, $4, $5)
        RETURNING id_empresa`,
        [nombre, cuit, email ?? null, telefono ?? null, direccion ?? null]
    );
    const idEmpresa = resultado.rows[0].id_empresa;
    for (const { nombre: servicio, descripcion, equipamiento } of SERVICIOS_HABITUALES) {
        await db.query(`INSERT INTO servicio (nombre, descripcion, equipamiento, id_empresa) VALUES ($1, $2, $3, $4)`, [servicio, descripcion, equipamiento, idEmpresa]);
    }
    return idEmpresa;
};

// Crea el usuario, la persona de la empresa y le da el rol de admin (dentro de la transacción de quien llama).
export const insertarAdmin = async (db, idEmpresa, { nombre, apellido, email, password }) => {
    const usuario = await db.query(`INSERT INTO usuario (email, password_hash) VALUES ($1, $2) RETURNING id_usuario`, [email, await bcrypt.hash(password, 10)]);
    const personal = await db.query(`INSERT INTO personal (nombre, apellido, usuario_id, id_empresa) VALUES ($1, $2, $3, $4) RETURNING id_personal`, [nombre, apellido, usuario.rows[0].id_usuario, idEmpresa]);
    await db.query(`INSERT INTO personal_rol (id_personal, id_rol) SELECT $1, id_rol FROM rol WHERE nombre = $2`, [personal.rows[0].id_personal, ADMIN]);
    return personal.rows[0].id_personal;
};

// Errores de unicidad: el cuit de la empresa o el email del admin.
export const errorDeUnicidad = (error) => {
    if (error.code !== "23505") return null;
    return error.constraint?.includes("cuit") ? "Ya existe una empresa con ese CUIT" : "Ese email ya está registrado";
};

// Evento (por id) de la empresa, o undefined si no existe o es de otra empresa.
export const buscarEventoDeEmpresa = async (db, idEvento, idEmpresa) => {
    const evento = await db.query(`select * from evento where id_evento = $1 and id_empresa = $2`, [idEvento, idEmpresa]);

    return evento.rows[0];
};
