import pool from "../data/db.js";
import { verificarRol } from "./auth.middleware.js";
import { parseId } from "../utils/validaciones.js";

export const RESPONSABLE = "responsable";
export const COORDINADOR = "coordinador";
export const ORGANIZADOR = "organizador";
// El superadmin es el equipo que administra la plataforma: solo gestiona las empresas, no los datos de la organizadora.
export const SUPERADMIN = "superadmin";
export const ROLES_DE_LA_ORGANIZADORA = [RESPONSABLE, COORDINADOR, ORGANIZADOR];

// Quien no tiene un rol de la organizadora no ve ni modifica sus datos (eventos, clientes, personal, etc.).
export const conRol = (req, res, next) => {
    const roles = req.usuario?.roles ?? [];
    if (!roles.some((rol) => ROLES_DE_LA_ORGANIZADORA.includes(rol))) {
        const mensaje = roles.includes(SUPERADMIN)
            ? "El superadmin solo administra las empresas"
            : "Tu cuenta todavía no tiene un rol asignado. Pedile a la responsable que te autorice";
        return res.status(403).json({ mensaje });
    }
    // Los datos son de una empresa: sin empresa asignada no hay nada que ver.
    if (!req.usuario.id_empresa) {
        return res.status(403).json({ mensaje: "Tu cuenta no está asociada a ninguna empresa" });
    }
    next();
};

export const soloRoles = verificarRol;

// "Solo en sus eventos": el usuario debe ser el organizador (id_organizador) de todos los
// eventos que devuelva el resolver (salvo la responsable, que puede con todos los de su empresa). El resolver recibe req y devuelve ids de evento
// (o null si el id de la ruta no es válido).
export const duenoDelEvento = (resolver) => async (req, res, next) => {
    try {
        const ids = await resolver(req);
        if (ids === null || ids.some((id) => id === null)) {
            return res.status(400).json({ mensaje: "el id indicado no es valido" });
        }
        if (ids.length === 0) {
            return next();
        }

        const eventos = await pool.query(`select id_evento, id_organizador from evento where id_evento = any($1) and id_empresa = $2`, [ids, req.usuario.id_empresa]);
        if (eventos.rows.length !== new Set(ids).size) {
            return res.status(404).json({ mensaje: "ese evento no existe" });
        }
        // La responsable (dueña de la empresa) puede trabajar sobre cualquier evento; el organizador, solo sobre los suyos.
        const esResponsable = req.usuario.roles.includes(RESPONSABLE);
        if (!esResponsable && eventos.rows.some((evento) => evento.id_organizador !== req.usuario.id_personal)) {
            return res.status(403).json({ mensaje: "Solo el organizador de este evento puede hacer esto" });
        }

        next();
    } catch (error) {
        console.error(error);

        res.status(500).json({ mensaje: "no se pudieron verificar los permisos" });
    }
};

const idsDeEventoEnBody = (req) => {
    const id = req.body?.id_evento;
    return id === undefined || id === null ? [] : [parseId(id)];
};

// Resolvers: de dónde sale el evento al que pertenece lo que se quiere tocar.
export const eventoDeRuta = (param) => (req) => [parseId(req.params[param])];

export const eventoDeBody = (req) => idsDeEventoEnBody(req);

// Propuesta (por id de ruta) -> su evento. Si el body trae otro id_evento, también debe ser propio.
export const eventoDePropuesta = (param) => async (req) => {
    const id = parseId(req.params[param]);
    if (id === null) return null;

    const propuesta = await pool.query(`
        select p.id_evento from propuesta p join evento e on e.id_evento = p.id_evento
        where p.id_propuesta = $1 and e.id_empresa = $2`, [id, req.usuario.id_empresa]);
    if (propuesta.rows.length === 0) return [-1]; // id inexistente: el middleware responde 404

    return [propuesta.rows[0].id_evento, ...idsDeEventoEnBody(req)];
};

export const eventoDeTarea = (param) => async (req) => {
    const id = parseId(req.params[param]);
    if (id === null) return null;

    const tarea = await pool.query(`
        select t.id_evento from tarea t join evento e on e.id_evento = t.id_evento
        where t.id_tarea = $1 and e.id_empresa = $2`, [id, req.usuario.id_empresa]);
    if (tarea.rows.length === 0) return [-1];

    return [tarea.rows[0].id_evento, ...idsDeEventoEnBody(req)];
};
