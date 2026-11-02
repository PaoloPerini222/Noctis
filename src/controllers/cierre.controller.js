import pool from "../data/db.js";
import {parseId, textoOpcional} from "../utils/validaciones.js";
import {COORDINADOR, ORGANIZADOR, RESPONSABLE} from "../middleware/permisos.js";

const RESULTADOS = ["realizado", "cancelado"];
const ORIGENES = ["cliente", "organizadora"];
const ESTADOS_AVISO = ["pendiente", "enviado", "confirmado", "fallido"];
const ESTADOS_CERRADOS = ["realizado", "cancelado", "rechazada"];
const ESTADOS_REALIZABLES = ["confirmado", "preparacion"];
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const esFechaValida = (valor) => {
    if(typeof valor !== "string" || !REGEX_FECHA.test(valor)){
        return false;
    }

    const fecha = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor);
};

const SELECT_AVISOS = `
    select a.*, p.nombre as proveedor
    from aviso_proveedor_cancelacion a
    join proveedor p on p.id_proveedor = a.id_proveedor`;

const buscarCierre = async (db, idEmpresa, idEvento) => {
    const cierre = await db.query(`
        select c.*, c.fecha::text as fecha from cierre c join evento e on e.id_evento = c.id_evento
        where c.id_evento = $1 and e.id_empresa = $2`, [idEvento, idEmpresa]);
    if(cierre.rows.length === 0){
        return null;
    }

    const avisos = await db.query(`${SELECT_AVISOS} where a.id_cierre = $1 order by p.nombre`, [cierre.rows[0].id_cierre]);

    return {...cierre.rows[0], avisos: avisos.rows};
};

export const obtenerCierre = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }

        const cierre = await buscarCierre(pool, req.usuario.id_empresa, idEvento);
        if(!cierre){
            return res.status(404).json({mensaje: "ese evento todavia no tiene cierre"});
        }

        res.json(cierre);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener el cierre"});
    }
};

// Cierra el encargo: "realizado" o "cancelado". Cancelar no borra nada: conserva los datos,
// registra el motivo, cancela las tareas abiertas y deja un aviso por cada proveedor confirmado.
export const crearCierre = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const idEvento = parseId(req.params.idEvento);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }

        const {resultado, fecha, origen_cancelacion} = req.body ?? {};
        if(!RESULTADOS.includes(resultado)){
            return res.status(400).json({mensaje: `el resultado debe ser uno de: ${RESULTADOS.join(", ")}`});
        }
        if(fecha !== undefined && fecha !== null && !esFechaValida(fecha)){
            return res.status(400).json({mensaje: "la fecha no es valida (AAAA-MM-DD)"});
        }

        const observaciones = textoOpcional(req.body?.observaciones, "las observaciones", 255);
        let motivo = {valor: null};
        let origen = null;
        if(resultado === "cancelado"){
            if(!ORIGENES.includes(origen_cancelacion)){
                return res.status(400).json({mensaje: `el origen de la cancelacion debe ser uno de: ${ORIGENES.join(", ")}`});
            }
            origen = origen_cancelacion;
            // El motivo se anota cuando se conoce: no se inventa.
            motivo = textoOpcional(req.body?.motivo_cancelacion, "el motivo de la cancelacion", 500);
        }
        const error = observaciones.error ?? motivo.error;
        if(error){
            return res.status(400).json({mensaje: error});
        }

        const registradoPor = req.usuario?.id_personal;
        if(!registradoPor){
            return res.status(400).json({mensaje: "tu usuario no tiene una persona asociada para registrar el cierre"});
        }

        await cliente.query("begin");

        const evento = await cliente.query(`select id_evento, estado, id_organizador from evento where id_evento = $1 and id_empresa = $2 for update`, [idEvento, req.usuario.id_empresa]);
        if(evento.rows.length === 0){
            await cliente.query("rollback");
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        // Permisos: realizado lo registra su organizador; cancelar a pedido del cliente, su organizador o la
        // responsable; si la cancelacion es de la organizadora, decide la responsable.
        const roles = req.usuario.roles;
        const esDueno = roles.includes(ORGANIZADOR) && evento.rows[0].id_organizador === req.usuario.id_personal;
        const esResponsable = roles.includes(RESPONSABLE);
        const permitido = resultado === "realizado" ? esDueno || esResponsable : origen === "cliente" ? esDueno || esResponsable : esResponsable;
        if(!permitido){
            await cliente.query("rollback");
            return res.status(403).json({mensaje: resultado === "cancelado" && origen === "organizadora"
                ? "Si la cancelacion es de la organizadora, la decide la responsable"
                : "No tenes permiso para cerrar este evento"});
        }

        const estado = evento.rows[0].estado;
        if(ESTADOS_CERRADOS.includes(estado)){
            await cliente.query("rollback");
            return res.status(409).json({mensaje: `el evento ya esta ${estado}`});
        }
        if(resultado === "realizado" && !ESTADOS_REALIZABLES.includes(estado)){
            await cliente.query("rollback");
            return res.status(409).json({mensaje: "solo un evento confirmado o en preparacion puede marcarse como realizado"});
        }

        await cliente.query(
            `insert into cierre (id_evento, fecha, resultado, observaciones, motivo_cancelacion, registrado_por, origen_cancelacion)
             values ($1, coalesce($2::date, current_date), $3, $4, $5, $6, $7)`,
            [idEvento, fecha ?? null, resultado, observaciones.valor, motivo.valor, registradoPor, origen]
        );
        const cierre = await cliente.query(`select id_cierre from cierre where id_evento = $1`, [idEvento]);
        await cliente.query(`update evento set estado = $1 where id_evento = $2`, [resultado, idEvento]);

        if(resultado === "cancelado"){
            await cliente.query(
                `update tarea set estado = 'cancelada' where id_evento = $1 and estado in ('pendiente', 'en_curso')`,
                [idEvento]
            );
            // La propuesta que todavia estaba abierta se cierra como rechazada, con el motivo de la cancelacion,
            // para que no quede "para revisar" ni pendiente. Una propuesta aceptada se conserva como estaba.
            await cliente.query(
                `update propuesta
                 set estado = 'rechazada', fecha_respuesta = coalesce(fecha_respuesta, current_date),
                     motivo_rechazo = coalesce(motivo_rechazo, left('Evento cancelado' || coalesce(': ' || $2::text, ''), 500))
                 where id_evento = $1 and estado not in ('aceptada', 'rechazada')`,
                [idEvento, motivo.valor]
            );
            await cliente.query(
                `insert into aviso_proveedor_cancelacion (id_cierre, id_proveedor)
                 select distinct $1::int, d.id_proveedor
                 from detalle_propuesta d
                 join propuesta p on p.id_propuesta = d.id_propuesta
                 where p.id_evento = $2 and d.id_proveedor is not null and d.estado_proveedor = 'confirmado' and not d.descartado`,
                [cierre.rows[0].id_cierre, idEvento]
            );
        }

        await cliente.query("commit");
        res.status(201).json(await buscarCierre(pool, req.usuario.id_empresa, idEvento));

    } catch(error){
        await cliente.query("rollback");
        console.error(error);

        if(error.code === "P0001"){
            return res.status(400).json({mensaje: error.message});
        }
        if(error.code === "23505"){
            return res.status(409).json({mensaje: "ese evento ya tiene un cierre"});
        }

        res.status(500).json({mensaje: "no se pudo registrar el cierre"});
    } finally{
        cliente.release();
    }
};

// El coordinador contacta a los proveedores fuera del sistema y aca registra el resultado del aviso.
export const registrarAviso = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        const idAviso = parseId(req.params.idAviso);
        if(idEvento === null || idAviso === null){
            return res.status(400).json({mensaje: "el id del evento o del aviso no es valido"});
        }
        if(!req.usuario.roles.includes(COORDINADOR)){
            return res.status(403).json({mensaje: "Solo el coordinador registra el aviso a los proveedores"});
        }

        const {estado, fecha_aviso} = req.body ?? {};
        if(!ESTADOS_AVISO.includes(estado)){
            return res.status(400).json({mensaje: `el estado debe ser uno de: ${ESTADOS_AVISO.join(", ")}`});
        }
        if(fecha_aviso !== undefined && fecha_aviso !== null && Number.isNaN(Date.parse(fecha_aviso))){
            return res.status(400).json({mensaje: "la fecha del aviso no es valida"});
        }

        const medio = textoOpcional(req.body?.medio, "el medio", 30);
        const observaciones = textoOpcional(req.body?.observaciones, "las observaciones", 500);
        const error = medio.error ?? observaciones.error;
        if(error){
            return res.status(400).json({mensaje: error});
        }

        const editado = await pool.query(
            `update aviso_proveedor_cancelacion a
             set estado = $1::text, medio = $2, observaciones = $3, registrado_por = $4,
                 fecha_aviso = case when $1::text = 'pendiente' then null else coalesce($5::timestamptz, a.fecha_aviso, now()) end
             from cierre c
             where a.id_aviso = $6 and a.id_cierre = c.id_cierre and c.id_evento = $7
               and exists (select 1 from evento e where e.id_evento = c.id_evento and e.id_empresa = $8)
             returning a.id_aviso`,
            [estado, medio.valor, observaciones.valor, req.usuario.id_personal, fecha_aviso ?? null, idAviso, idEvento, req.usuario.id_empresa]
        );
        if(editado.rows.length === 0){
            return res.status(404).json({mensaje: "ese aviso no existe en el evento"});
        }

        const aviso = await pool.query(`${SELECT_AVISOS} where a.id_aviso = $1`, [idAviso]);
        res.json(aviso.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo registrar el aviso"});
    }
};
