import pool from "../data/db.js";
import {ESTADOS_EVENTO_CERRADOS, validarConfirmacion} from "../utils/reglas.js";
import {esDeLaEmpresa} from "../utils/empresa.js";
import {cambiosDelEvento, registrarCambio} from "../utils/cambios.js";

const ID_MAXIMO = 2147483647;
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS = [
    "recibida",
    "en_evaluacion",
    "propuesta_enviada",
    "aceptada",
    "rechazada",
    "confirmado",
    "preparacion",
    "realizado",
    "cancelado",
];
const ESTADOS_SEDE = ["pendiente", "confirmada", "no_disponible"];
// El cliente puede aceptar con la fecha o la sede todavia pendientes; el encargo no se confirma hasta definirlas.
const ESTADOS_QUE_EXIGEN_DATOS = ["confirmado", "preparacion", "realizado"];

// Estados que no se eligen a mano: los define la propuesta o el cierre del evento.
const ESTADOS_POR_PROPUESTA = ["propuesta_enviada", "aceptada", "rechazada"];
const ESTADOS_POR_CIERRE = ["realizado", "cancelado"];
// Cambios de estado que se hacen a mano: el evento avanza y no vuelve atras (salvo entre
// confirmado y preparacion, y mientras la solicitud todavia se evalua).
const CAMBIOS_MANUALES = {
    recibida: ["en_evaluacion"],
    en_evaluacion: ["recibida"],
    propuesta_enviada: [],
    aceptada: ["confirmado"],
    confirmado: ["preparacion"],
    preparacion: ["confirmado"],
};

const parseId = (valor) => {
    if(typeof valor !== "string" || !/^\d+$/.test(valor)){
        return null;
    }

    const id = Number(valor);
    if(id < 1 || id > ID_MAXIMO){
        return null;
    }

    return id;
};

const esFechaValida = (valor) => {
    if(typeof valor !== "string" || !REGEX_FECHA.test(valor)){
        return false;
    }

    const fecha = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor);
};

const validarTexto = (valor, campo, maximo) => {
    if(valor === undefined || valor === null){
        return null;
    }
    if(typeof valor !== "string"){
        return `${campo} no es valido`;
    }
    if(valor.trim().length > maximo){
        return `${campo} no puede superar los ${maximo} caracteres`;
    }
    return null;
};

const validarEvento = (body, {requiereCliente}) => {
    const {
        id_cliente, tipo_evento, fecha, sede_prevista, cant_asistentes_estimada,
        necesidades_preferencias, estado, id_organizador, estado_sede,
    } = body ?? {};

    let idCliente = null;
    if(requiereCliente){
        idCliente = parseId(String(id_cliente ?? ""));
        if(idCliente === null){
            return {error: "el id del cliente no es valido"};
        }
    }

    if(typeof tipo_evento !== "string" || !tipo_evento.trim()){
        return {error: "el tipo de evento es obligatorio"};
    }

    if(fecha !== undefined && fecha !== null && !esFechaValida(fecha)){
        return {error: "la fecha no es valida (AAAA-MM-DD)"};
    }

    if(cant_asistentes_estimada !== undefined && cant_asistentes_estimada !== null){
        if(!Number.isInteger(cant_asistentes_estimada) || cant_asistentes_estimada < 1 || cant_asistentes_estimada > ID_MAXIMO){
            return {error: "la cantidad de asistentes estimada no es valida"};
        }
    }

    let idOrganizador = null;
    if(id_organizador !== undefined && id_organizador !== null){
        idOrganizador = parseId(String(id_organizador));
        if(idOrganizador === null){
            return {error: "el id del organizador no es valido"};
        }
    }

    if(estado !== undefined && !ESTADOS.includes(estado)){
        return {error: `el estado debe ser uno de: ${ESTADOS.join(", ")}`};
    }
    if(estado_sede !== undefined && !ESTADOS_SEDE.includes(estado_sede)){
        return {error: `el estado de la sede debe ser uno de: ${ESTADOS_SEDE.join(", ")}`};
    }

    const errorTexto =
        validarTexto(tipo_evento, "el tipo de evento", 50) ??
        validarTexto(sede_prevista, "la sede prevista", 100) ??
        validarTexto(necesidades_preferencias, "las necesidades y preferencias", 500);
    if(errorTexto){
        return {error: errorTexto};
    }

    const datos = {
        id_cliente: idCliente,
        tipo_evento: tipo_evento.trim(),
        fecha: fecha ?? null,
        sede_prevista: sede_prevista?.trim() || null,
        cant_asistentes_estimada: cant_asistentes_estimada ?? null,
        necesidades_preferencias: necesidades_preferencias?.trim() || null,
        estado: estado ?? "recibida",
        id_organizador: idOrganizador,
        estado_sede: estado_sede ?? "pendiente",
    };

    if(ESTADOS_QUE_EXIGEN_DATOS.includes(datos.estado) && (!datos.fecha || !datos.sede_prevista || !datos.cant_asistentes_estimada)){
        return {error: "para confirmar el encargo se requiere fecha, sede y cantidad estimada de asistentes"};
    }

    return {datos};
};

const responderErrorBD = (error, res, mensajeGenerico) => {
    if(error.code === "23503"){
        return res.status(400).json({mensaje: "el cliente o el organizador indicado no existe"});
    }

    res.status(500).json({mensaje: mensajeGenerico});
};

export const obtenerEventos = async (req, res) => {
    try{
        const eventos = await pool.query(`select * from evento where id_empresa = $1 order by id_evento`, [req.usuario.id_empresa]);

        res.json(eventos.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los eventos"});
    }
};

export const obtenerEvento = async (req, res) => {
    try{
        const idEvento = parseId(req.params.id);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }

        const unEvento = await pool.query(`select * from evento where id_evento = $1 and id_empresa = $2`, [idEvento, req.usuario.id_empresa]);

        if(unEvento.rows.length === 0){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        res.json(unEvento.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener el evento"});
    }
};

export const crearEvento = async (req, res) => {
    try{
        // El estado que venga en el body se ignora: toda solicitud nace "recibida".
        const {error, datos} = validarEvento({...req.body, estado: undefined}, {requiereCliente: true});
        if(error){
            return res.status(400).json({mensaje: error});
        }

        if(!await esDeLaEmpresa("cliente", datos.id_cliente, req.usuario.id_empresa)){
            return res.status(400).json({mensaje: "el cliente indicado no existe"});
        }
        if(datos.id_organizador !== null && !await esDeLaEmpresa("personal", datos.id_organizador, req.usuario.id_empresa)){
            return res.status(400).json({mensaje: "el organizador indicado no existe"});
        }

        // Todo evento nace como solicitud recibida; si no se indica organizador, es quien lo carga.
        const nuevoEvento = await pool.query(
            `insert into evento (id_cliente, tipo_evento, fecha, sede_prevista, cant_asistentes_estimada, necesidades_preferencias, estado, id_organizador, estado_sede, id_empresa)
             values ($1, $2, $3, $4, $5, $6, 'recibida', $7, $8, $9) returning *`,
            [datos.id_cliente, datos.tipo_evento, datos.fecha, datos.sede_prevista, datos.cant_asistentes_estimada, datos.necesidades_preferencias, datos.id_organizador ?? req.usuario?.id_personal ?? null, datos.estado_sede, req.usuario.id_empresa]
        );

        res.status(201).json(nuevoEvento.rows[0]);

    } catch (error){
        console.error(error);

        responderErrorBD(error, res, "no se pudo crear el evento");
    }
};

export const editarEvento = async (req, res) => {
    try{
        const idEvento = parseId(req.params.id);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }

        const actual = await pool.query(
            `select tipo_evento, fecha::text as fecha, sede_prevista, cant_asistentes_estimada, necesidades_preferencias, estado, id_organizador, estado_sede
             from evento where id_evento = $1 and id_empresa = $2`,
            [idEvento, req.usuario.id_empresa]
        );
        if(actual.rows.length === 0){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        const estadoActual = actual.rows[0].estado;
        if(ESTADOS_EVENTO_CERRADOS.includes(estadoActual)){
            return res.status(409).json({mensaje: `el evento esta ${estadoActual} y se conserva sin cambios`});
        }

        const {error, datos} = validarEvento({...actual.rows[0], ...req.body}, {requiereCliente: false});
        if(error){
            return res.status(400).json({mensaje: error});
        }

        if(datos.id_organizador !== null && datos.id_organizador !== actual.rows[0].id_organizador
            && !await esDeLaEmpresa("personal", datos.id_organizador, req.usuario.id_empresa)){
            return res.status(400).json({mensaje: "el organizador indicado no existe"});
        }

        if(datos.estado !== estadoActual){
            if(ESTADOS_POR_CIERRE.includes(datos.estado)){
                return res.status(400).json({mensaje: "para cerrar el evento (realizado o cancelado) usa el cierre del evento"});
            }
            if(ESTADOS_POR_PROPUESTA.includes(datos.estado)){
                return res.status(400).json({mensaje: "ese estado lo define la propuesta del evento"});
            }
            if(datos.estado === "confirmado" || datos.estado === "preparacion"){
                const errorConfirmacion = estadoActual === "aceptada" || estadoActual === "confirmado" || estadoActual === "preparacion"
                    ? await validarConfirmacion(pool, idEvento)
                    : "para confirmar el encargo el cliente tiene que haber aceptado la propuesta";
                if(errorConfirmacion){
                    return res.status(400).json({mensaje: errorConfirmacion});
                }
                if(datos.estado_sede === "no_disponible"){
                    return res.status(400).json({mensaje: "la sede figura como no disponible: resolvelo antes de confirmar el encargo"});
                }
            }
            const permitidos = CAMBIOS_MANUALES[estadoActual] ?? [];
            if(!permitidos.includes(datos.estado)){
                return res.status(409).json({mensaje: `desde ${estadoActual} el evento solo puede pasar a: ${permitidos.join(", ") || "ningun estado a mano"}`});
            }
        }

        // Con el encargo confirmado, un cambio de fecha o de sede es un cambio relevante: queda anotado para que
        // alguien revise proveedores, sede y tareas (el sistema no los actualiza solo).
        const esEncargo = estadoActual === "confirmado" || estadoActual === "preparacion";
        const cambios = esEncargo && req.usuario.id_personal ? cambiosDelEvento(actual.rows[0], datos) : [];

        const conexion = await pool.connect();
        try{
            await conexion.query("begin");

            const eventoEditado = await conexion.query(
                `update evento set tipo_evento = $1, fecha = $2, sede_prevista = $3, cant_asistentes_estimada = $4,
                 necesidades_preferencias = $5, estado = $6, id_organizador = $7, estado_sede = $8
                 where id_evento = $9 and id_empresa = $10 returning *`,
                [datos.tipo_evento, datos.fecha, datos.sede_prevista, datos.cant_asistentes_estimada, datos.necesidades_preferencias, datos.estado, datos.id_organizador, datos.estado_sede, idEvento, req.usuario.id_empresa]
            );

            if(eventoEditado.rows.length === 0){
                await conexion.query("rollback");
                return res.status(404).json({mensaje: "ese evento no existe"});
            }

            for(const cambio of cambios){
                await registrarCambio(conexion, {idEvento, tipo: cambio.tipo, descripcion: cambio.descripcion, registradoPor: req.usuario.id_personal});
            }

            await conexion.query("commit");
            res.json(eventoEditado.rows[0]);

        } catch(error){
            await conexion.query("rollback");
            throw error;
        } finally{
            conexion.release();
        }

    } catch(error){
        console.error(error);

        responderErrorBD(error, res, "no se pudo editar el evento");
    }
};

export const eliminarEvento = async (req, res) => {
    try{
        const idEvento = parseId(req.params.id);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }

        const actual = await pool.query(`select estado from evento where id_evento = $1 and id_empresa = $2`, [idEvento, req.usuario.id_empresa]);
        if(actual.rows.length === 0){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }
        if(actual.rows[0].estado !== "recibida"){
            return res.status(409).json({mensaje: "solo se elimina una solicitud recien recibida (error de carga); los demas eventos se conservan y se cierran"});
        }

        const eliminar = await pool.query(`delete from evento where id_evento = $1 and id_empresa = $2 RETURNING *`, [idEvento, req.usuario.id_empresa]);

        if(eliminar.rows.length === 0){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        res.json({mensaje: "evento eliminado", evento: eliminar.rows[0]});
    }catch(error){
        console.error(error);

        if(error.code === "23503"){
            return res.status(409).json({mensaje: "no se puede eliminar, el evento tiene propuesta, tareas u otros registros asociados"});
        }

        res.status(500).json({mensaje: "no se pudo eliminar el evento"});
    }
};
