import pool from "../data/db.js";
import {parseId} from "../utils/validaciones.js";
import {COORDINADOR, ROLES_DE_LA_ORGANIZADORA} from "../middleware/permisos.js";
import {ESTADOS_EVENTO_CERRADOS} from "../utils/reglas.js";

const ESTADOS = ["pendiente", "en_curso", "terminada", "cancelada"];
const ESTADOS_SIN_TAREAS = ESTADOS_EVENTO_CERRADOS;
// Una tarea terminada o cancelada ya no cambia de estado.
const ESTADOS_FINALES_TAREA = ["terminada", "cancelada"];
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const esFechaValida = (valor) => {
    if(typeof valor !== "string" || !REGEX_FECHA.test(valor.slice(0, 10))){
        return false;
    }

    const fecha = new Date(`${valor.slice(0, 10)}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor.slice(0, 10));
};

const manejarErrorDb = (error, res, mensaje) => {
    if (error.code === "23503") {
        return res.status(400).json({ mensaje: "El evento, el personal o el detalle indicado no existe" });
    }
    if (error.code === "23514" && error.constraint === "chk_tarea_estado") {
        return res.status(400).json({ mensaje: "Estado de tarea inválido" });
    }
    if (error.code === "23514" && error.constraint === "chk_tarea_fecha_prevista") {
        return res.status(400).json({ mensaje: "La fecha prevista es obligatoria" });
    }
    res.status(500).json({ mensaje });
};

// Toda tarea tiene responsable, fecha prevista y estado. Si depende de un servicio, ese servicio tiene que
// ser de la propuesta del evento y no estar descartado; y no se crean tareas en eventos cerrados.
const validarTarea = async (datos, idEmpresa) => {
    const idEvento = parseId(datos.id_evento);
    const idPersonal = parseId(datos.id_personal);
    const descripcion = typeof datos.descripcion === "string" ? datos.descripcion.trim() : "";

    if (idEvento === null || idPersonal === null || !descripcion || !datos.fecha_prevista) {
        return {error: "Evento, personal, descripción y fecha prevista son obligatorios"};
    }
    if (descripcion.length > 255) {
        return {error: "La descripción no puede superar los 255 caracteres"};
    }
    if (!esFechaValida(datos.fecha_prevista)) {
        return {error: "La fecha prevista no es válida (AAAA-MM-DD)"};
    }

    let idDetalle = null;
    if (datos.id_detalle !== undefined && datos.id_detalle !== null) {
        idDetalle = parseId(datos.id_detalle);
        if (idDetalle === null) {
            return {error: "El id del detalle no es válido"};
        }
    }

    // Solo recibe tareas alguien del equipo con rol: una persona sin rol no puede entrar a verlas.
    const conRol = await pool.query(`
        SELECT 1 FROM personal_rol pr JOIN rol r ON r.id_rol = pr.id_rol
        JOIN personal pe ON pe.id_personal = pr.id_personal
        WHERE pr.id_personal = $1 AND pe.id_empresa = $3 AND r.nombre = ANY($2) LIMIT 1`, [idPersonal, ROLES_DE_LA_ORGANIZADORA, idEmpresa]);
    if (conRol.rows.length === 0) {
        return {error: "Esa persona no tiene un rol en la organizadora: no puede recibir tareas"};
    }

    const evento = await pool.query(`SELECT estado FROM evento WHERE id_evento = $1 AND id_empresa = $2`, [idEvento, idEmpresa]);
    if (evento.rows.length === 0) {
        return {error: "El evento indicado no existe"};
    }
    if (ESTADOS_SIN_TAREAS.includes(evento.rows[0].estado)) {
        return {error: `No se asignan tareas en un evento ${evento.rows[0].estado}`};
    }

    if (idDetalle !== null) {
        const detalle = await pool.query(`
            SELECT d.descartado
            FROM detalle_propuesta d
            JOIN propuesta p ON p.id_propuesta = d.id_propuesta
            WHERE d.id_detalle = $1 AND p.id_evento = $2`, [idDetalle, idEvento]);
        if (detalle.rows.length === 0) {
            return {error: "Ese servicio no pertenece a la propuesta del evento"};
        }
        if (detalle.rows[0].descartado) {
            return {error: "Ese servicio fue descartado por el cliente: no lleva tareas"};
        }
    }

    return {datos: {
        id_evento: idEvento, id_personal: idPersonal, descripcion,
        fecha_prevista: datos.fecha_prevista.slice(0, 10), id_detalle: idDetalle,
    }};
};

const SELECT_TAREA = `
    SELECT t.*,
        (t.fecha_prevista < CURRENT_DATE AND t.estado NOT IN ('terminada', 'cancelada')) AS vencida
    FROM tarea t
    JOIN evento e ON e.id_evento = t.id_evento`;

export const obtenerTareas = async (req, res) => {
    try {
        const resultado = await pool.query(`${SELECT_TAREA} WHERE e.id_empresa = $1 ORDER BY t.id_tarea`, [req.usuario.id_empresa]);
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: "Error al obtener las tareas" });
    };
};

export const obtenerTarea = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (id === null) {
            return res.status(400).json({ mensaje: "El id de la tarea no es válido" });
        }

        const resultado = await pool.query(`${SELECT_TAREA} WHERE t.id_tarea = $1 AND e.id_empresa = $2`, [id, req.usuario.id_empresa]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ mensaje: "Tarea no encontrada" });
        };
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: "Error al obtener la tarea" });
    }
};

// Asigna el organizador. La tarea siempre nace pendiente: el estado lo mueve su responsable o el coordinador.
export const crearTarea = async (req, res) => {
    try {
        const { error, datos } = await validarTarea(req.body ?? {}, req.usuario.id_empresa);
        if (error) {
            return res.status(400).json({ mensaje: error });
        }

        const resultado = await pool.query(`
            INSERT INTO tarea(id_evento, id_personal, descripcion, fecha_prevista, estado, id_detalle)
            VALUES($1, $2, $3, $4, 'pendiente', $5)
            RETURNING *`,
            [datos.id_evento, datos.id_personal, datos.descripcion, datos.fecha_prevista, datos.id_detalle]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        manejarErrorDb(error, res, "Error al crear la tarea");
    }
};

export const editarTarea = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (id === null) {
            return res.status(400).json({ mensaje: "El id de la tarea no es válido" });
        }

        const actual = await pool.query(`
            SELECT t.id_evento, t.id_personal, t.descripcion, t.fecha_prevista::text AS fecha_prevista, t.id_detalle
            FROM tarea t JOIN evento e ON e.id_evento = t.id_evento
            WHERE t.id_tarea = $1 AND e.id_empresa = $2`, [id, req.usuario.id_empresa]);
        if (actual.rows.length === 0) {
            return res.status(404).json({ mensaje: "Tarea no encontrada" });
        };

        // El estado no se edita acá: tiene su propio endpoint.
        const { estado, ...cambios } = req.body ?? {};
        const { error, datos } = await validarTarea({ ...actual.rows[0], ...cambios }, req.usuario.id_empresa);
        if (error) {
            return res.status(400).json({ mensaje: error });
        }

        const resultado = await pool.query(`
            UPDATE tarea
            SET id_evento = $1, id_personal = $2, descripcion = $3, fecha_prevista = $4, id_detalle = $5
            WHERE id_tarea = $6
            RETURNING *`,
            [datos.id_evento, datos.id_personal, datos.descripcion, datos.fecha_prevista, datos.id_detalle, id]
        );
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        manejarErrorDb(error, res, "Error al editar la tarea");
    }
};

// Cambia el estado quien tiene la tarea asignada o un coordinador.
export const cambiarEstadoTarea = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (id === null) {
            return res.status(400).json({ mensaje: "El id de la tarea no es válido" });
        }

        const { estado } = req.body ?? {};
        if (!ESTADOS.includes(estado)) {
            return res.status(400).json({ mensaje: `El estado debe ser uno de: ${ESTADOS.join(", ")}` });
        }

        const actual = await pool.query(`
            SELECT t.id_personal, t.estado, e.estado AS estado_evento
            FROM tarea t JOIN evento e ON e.id_evento = t.id_evento
            WHERE t.id_tarea = $1 AND e.id_empresa = $2`, [id, req.usuario.id_empresa]);
        if (actual.rows.length === 0) {
            return res.status(404).json({ mensaje: "Tarea no encontrada" });
        }
        const { estado_evento, estado: estadoActual } = actual.rows[0];
        if (ESTADOS_EVENTO_CERRADOS.includes(estado_evento)) {
            return res.status(409).json({ mensaje: `El evento está ${estado_evento}: sus tareas ya no cambian` });
        }
        if (ESTADOS_FINALES_TAREA.includes(estadoActual) && estado !== estadoActual) {
            return res.status(409).json({ mensaje: `La tarea ya está ${estadoActual} y no cambia de estado` });
        }

        const esResponsable = actual.rows[0].id_personal === req.usuario.id_personal;
        if (!esResponsable && !req.usuario.roles.includes(COORDINADOR)) {
            return res.status(403).json({ mensaje: "Solo quien tiene la tarea o un coordinador puede cambiar su estado" });
        }

        await pool.query(`UPDATE tarea SET estado = $1 WHERE id_tarea = $2`, [estado, id]);

        const resultado = await pool.query(`${SELECT_TAREA} WHERE t.id_tarea = $1`, [id]);
        res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        manejarErrorDb(error, res, "Error al cambiar el estado de la tarea");
    }
};

export const eliminarTarea = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (id === null) {
            return res.status(400).json({ mensaje: "El id de la tarea no es válido" });
        }

        const resultado = await pool.query(`
            DELETE FROM tarea t USING evento e
            WHERE t.id_tarea = $1 AND e.id_evento = t.id_evento AND e.id_empresa = $2
            RETURNING t.*`, [id, req.usuario.id_empresa]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ mensaje: "Tarea no encontrada" });
        };
        res.json({ mensaje: "Tarea eliminada", tarea: resultado.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: "Error al eliminar la tarea" });
    }
};
