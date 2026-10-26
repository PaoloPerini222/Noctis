import pool from "../data/db.js";
import {parseId, textoOpcional} from "../utils/validaciones.js";
import {ESTADOS_EVENTO_CERRADOS, sincronizarEventoConPropuesta} from "../utils/reglas.js";
import {esDeLaEmpresa} from "../utils/empresa.js";

const ESTADOS_PROVEEDOR = ["pendiente", "confirmado", "no_disponible"];
const IMPORTE_MAXIMO = 99999999.99;
const CANTIDAD_MAXIMA = 2147483647;

const SELECT_DETALLE = `
    select d.*, s.nombre as servicio, p.nombre as proveedor,
           (d.cantidad * d.importe_unitario) as subtotal
    from detalle_propuesta d
    join servicio s on s.id_servicio = d.id_servicio
    left join proveedor p on p.id_proveedor = d.id_proveedor`;

const validarDetalle = (body) => {
    const {id_servicio, id_proveedor, cantidad, importe_unitario, estado_proveedor, descartado, id_proveedor_anterior, observaciones} = body ?? {};

    const idServicio = parseId(id_servicio);
    if(idServicio === null){
        return {error: "el id del servicio no es valido"};
    }

    let idProveedor = null;
    if(id_proveedor !== undefined && id_proveedor !== null){
        idProveedor = parseId(id_proveedor);
        if(idProveedor === null){
            return {error: "el id del proveedor no es valido"};
        }
    }

    let idProveedorAnterior = null;
    if(id_proveedor_anterior !== undefined && id_proveedor_anterior !== null){
        idProveedorAnterior = parseId(id_proveedor_anterior);
        if(idProveedorAnterior === null){
            return {error: "el id del proveedor anterior no es valido"};
        }
    }

    const cant = cantidad ?? 1;
    if(!Number.isInteger(cant) || cant < 1 || cant > CANTIDAD_MAXIMA){
        return {error: "la cantidad debe ser un entero mayor a 0"};
    }

    const importe = typeof importe_unitario === "string" && importe_unitario.trim() ? Number(importe_unitario) : importe_unitario;
    if(typeof importe !== "number" || !Number.isFinite(importe) || importe < 0 || importe > IMPORTE_MAXIMO){
        return {error: "el importe unitario no es valido"};
    }

    const estado = estado_proveedor ?? "pendiente";
    if(!ESTADOS_PROVEEDOR.includes(estado)){
        return {error: `el estado del proveedor debe ser uno de: ${ESTADOS_PROVEEDOR.join(", ")}`};
    }

    if(descartado !== undefined && typeof descartado !== "boolean"){
        return {error: "descartado debe ser verdadero o falso"};
    }

    const obs = textoOpcional(observaciones, "las observaciones", 500);
    if(obs.error){
        return {error: obs.error};
    }

    return {datos: {
        id_servicio: idServicio,
        id_proveedor: idProveedor,
        cantidad: cant,
        importe_unitario: Math.round(importe * 100) / 100,
        estado_proveedor: estado,
        descartado: descartado ?? false,
        id_proveedor_anterior: idProveedorAnterior,
        observaciones: obs.valor,
    }};
};

// El total de la propuesta es la suma de los servicios no descartados. Si la propuesta estaba
// aprobada o enviada, el trigger la devuelve a pendiente_aprobacion al cambiar el total.
// Si la propuesta estaba en negociacion y cambian los importes, vuelve a revision de la responsable (RN-05).
const recalcularTotal = (db, idPropuesta) =>
    db.query(
        `update propuesta p
         set total = n.total,
             estado = case when p.estado = 'en_negociacion' and p.total <> n.total then 'pendiente_aprobacion' else p.estado end,
             aprobado_por = case when p.estado = 'en_negociacion' and p.total <> n.total then null else p.aprobado_por end,
             fecha_aprobacion = case when p.estado = 'en_negociacion' and p.total <> n.total then null else p.fecha_aprobacion end
         from (select coalesce(sum(cantidad * importe_unitario), 0) as total
               from detalle_propuesta
               where id_propuesta = $1 and not descartado) n
         where p.id_propuesta = $1`,
        [idPropuesta]
    );

// Bloquea la propuesta y dice si sus servicios se pueden tocar:
// - con el evento cerrado (realizado, cancelado o rechazado) o la propuesta rechazada, nada;
// - con la propuesta aceptada por el cliente, el precio queda fijo: no se agregan ni quitan servicios
//   y solo se puede reemplazar el proveedor (y sus observaciones).
// Devuelve {propuesta} o {status, mensaje}.
const propuestaModificable = async (db, idPropuesta, idEmpresa) => {
    const propuesta = await db.query(
        `select p.estado, p.id_evento, e.estado as estado_evento
         from propuesta p join evento e on e.id_evento = p.id_evento
         where p.id_propuesta = $1 and e.id_empresa = $2
         for update of p`,
        [idPropuesta, idEmpresa]
    );
    const datos = propuesta.rows[0];
    if(!datos){
        return {status: 404, mensaje: "esa propuesta no existe"};
    }
    if(ESTADOS_EVENTO_CERRADOS.includes(datos.estado_evento)){
        return {status: 409, mensaje: `el evento esta ${datos.estado_evento}: sus servicios ya no se modifican`};
    }
    if(datos.estado === "rechazada"){
        return {status: 409, mensaje: "la propuesta fue rechazada: sus servicios ya no se modifican"};
    }

    return {propuesta: datos};
};

const PRECIO_FIJO = "el cliente ya acepto la propuesta: no se cambian servicios, cantidades ni importes (solo se puede reemplazar el proveedor)";

// Un servicio excluido del evento (el cliente no lo quiere) no puede volver a la propuesta.
const servicioExcluido = async (db, idEvento, idServicio) => {
    const excluido = await db.query(
        `select 1 from servicio_excluido_evento where id_evento = $1 and id_servicio = $2`,
        [idEvento, idServicio]
    );

    return excluido.rows.length > 0;
};

// Un proveedor solo puede asignarse a un servicio que ofrece.
const proveedorOfreceServicio = async (db, idProveedor, idServicio) => {
    const ofrece = await db.query(
        `select 1 from proveedor_servicio where id_proveedor = $1 and id_servicio = $2`,
        [idProveedor, idServicio]
    );

    return ofrece.rows.length > 0;
};

// El servicio y el proveedor del detalle tienen que ser de la empresa: devuelve el mensaje de error o null.
const errorDeEmpresa = async (db, datos, idEmpresa) => {
    if(!await esDeLaEmpresa("servicio", datos.id_servicio, idEmpresa, db)){
        return "el servicio indicado no existe";
    }
    if(datos.id_proveedor !== null && !await esDeLaEmpresa("proveedor", datos.id_proveedor, idEmpresa, db)){
        return "el proveedor indicado no existe";
    }

    return null;
};

const errorBD = (error, res, mensajeGenerico) => {
    if(error.code === "23503"){
        return res.status(400).json({mensaje: "el servicio o el proveedor indicado no existe"});
    }

    res.status(500).json({mensaje: mensajeGenerico});
};

const idsDeRuta = (req) => ({
    idPropuesta: parseId(req.params.idPropuesta),
    idDetalle: req.params.idDetalle === undefined ? undefined : parseId(req.params.idDetalle),
});

export const obtenerDetalles = async (req, res) => {
    try{
        const {idPropuesta} = idsDeRuta(req);
        if(idPropuesta === null){
            return res.status(400).json({mensaje: "el id de la propuesta no es valido"});
        }

        const propuesta = await pool.query(`
            select 1 from propuesta p join evento e on e.id_evento = p.id_evento
            where p.id_propuesta = $1 and e.id_empresa = $2`, [idPropuesta, req.usuario.id_empresa]);
        if(propuesta.rows.length === 0){
            return res.status(404).json({mensaje: "esa propuesta no existe"});
        }

        const detalles = await pool.query(`${SELECT_DETALLE} where d.id_propuesta = $1 order by d.id_detalle`, [idPropuesta]);

        res.json(detalles.rows);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los servicios de la propuesta"});
    }
};

export const obtenerDetalle = async (req, res) => {
    try{
        const {idPropuesta, idDetalle} = idsDeRuta(req);
        if(idPropuesta === null || idDetalle === null){
            return res.status(400).json({mensaje: "el id de la propuesta o del detalle no es valido"});
        }

        const detalle = await pool.query(`
            ${SELECT_DETALLE}
            join propuesta pr on pr.id_propuesta = d.id_propuesta
            join evento e on e.id_evento = pr.id_evento
            where d.id_propuesta = $1 and d.id_detalle = $2 and e.id_empresa = $3`, [idPropuesta, idDetalle, req.usuario.id_empresa]);
        if(detalle.rows.length === 0){
            return res.status(404).json({mensaje: "ese detalle no existe en la propuesta"});
        }

        res.json(detalle.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener el detalle"});
    }
};

export const crearDetalle = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const {idPropuesta} = idsDeRuta(req);
        if(idPropuesta === null){
            return res.status(400).json({mensaje: "el id de la propuesta no es valido"});
        }

        const {error, datos} = validarDetalle(req.body);
        if(error){
            return res.status(400).json({mensaje: error});
        }

        await cliente.query("begin");

        const {propuesta, status, mensaje} = await propuestaModificable(cliente, idPropuesta, req.usuario.id_empresa);
        if(!propuesta){
            await cliente.query("rollback");
            return res.status(status).json({mensaje});
        }
        if(propuesta.estado === "aceptada"){
            await cliente.query("rollback");
            return res.status(409).json({mensaje: PRECIO_FIJO});
        }
        const errorEmpresa = await errorDeEmpresa(cliente, datos, req.usuario.id_empresa);
        if(errorEmpresa){
            await cliente.query("rollback");
            return res.status(400).json({mensaje: errorEmpresa});
        }
        if(await servicioExcluido(cliente, propuesta.id_evento, datos.id_servicio)){
            await cliente.query("rollback");
            return res.status(409).json({mensaje: "ese servicio fue excluido del evento: el cliente no lo quiere"});
        }

        if(datos.id_proveedor !== null && !(await proveedorOfreceServicio(cliente, datos.id_proveedor, datos.id_servicio))){
            await cliente.query("rollback");
            return res.status(400).json({mensaje: "ese proveedor no ofrece ese servicio"});
        }

        const creado = await cliente.query(
            `insert into detalle_propuesta (id_propuesta, id_servicio, id_proveedor, cantidad, importe_unitario,
                                            estado_proveedor, descartado, id_proveedor_anterior, observaciones)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             returning id_detalle`,
            [idPropuesta, datos.id_servicio, datos.id_proveedor, datos.cantidad, datos.importe_unitario,
             "pendiente", datos.descartado, null, datos.observaciones]
        );
        await recalcularTotal(cliente, idPropuesta);
        await sincronizarEventoConPropuesta(cliente, idPropuesta);

        await cliente.query("commit");

        const detalle = await pool.query(`${SELECT_DETALLE} where d.id_detalle = $1`, [creado.rows[0].id_detalle]);
        res.status(201).json(detalle.rows[0]);

    } catch(error){
        await cliente.query("rollback");
        console.error(error);

        errorBD(error, res, "no se pudo agregar el servicio a la propuesta");
    } finally{
        cliente.release();
    }
};

export const editarDetalle = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const {idPropuesta, idDetalle} = idsDeRuta(req);
        if(idPropuesta === null || idDetalle === null){
            return res.status(400).json({mensaje: "el id de la propuesta o del detalle no es valido"});
        }

        await cliente.query("begin");

        const {propuesta, status, mensaje} = await propuestaModificable(cliente, idPropuesta, req.usuario.id_empresa);
        if(!propuesta){
            await cliente.query("rollback");
            return res.status(status).json({mensaje});
        }
        const actual = await cliente.query(
            `select id_servicio, id_proveedor, cantidad, importe_unitario::float8 as importe_unitario, estado_proveedor,
                    descartado, id_proveedor_anterior, observaciones
             from detalle_propuesta where id_propuesta = $1 and id_detalle = $2`,
            [idPropuesta, idDetalle]
        );
        if(actual.rows.length === 0){
            await cliente.query("rollback");
            return res.status(404).json({mensaje: "ese detalle no existe en la propuesta"});
        }

        // La situacion del proveedor y el proveedor anterior los maneja el sistema.
        const {estado_proveedor, id_proveedor_anterior, ...cambios} = req.body ?? {};
        const {error, datos} = validarDetalle({...actual.rows[0], ...cambios});
        if(error){
            await cliente.query("rollback");
            return res.status(400).json({mensaje: error});
        }

        const errorEmpresa = await errorDeEmpresa(cliente, datos, req.usuario.id_empresa);
        if(errorEmpresa){
            await cliente.query("rollback");
            return res.status(400).json({mensaje: errorEmpresa});
        }

        const anterior = actual.rows[0];
        const cambiaPrecio = datos.id_servicio !== anterior.id_servicio || datos.cantidad !== anterior.cantidad
            || datos.importe_unitario !== Number(anterior.importe_unitario) || datos.descartado !== anterior.descartado;
        if(propuesta.estado === "aceptada" && cambiaPrecio){
            await cliente.query("rollback");
            return res.status(409).json({mensaje: PRECIO_FIJO});
        }
        if(datos.id_servicio !== anterior.id_servicio && await servicioExcluido(cliente, propuesta.id_evento, datos.id_servicio)){
            await cliente.query("rollback");
            return res.status(409).json({mensaje: "ese servicio fue excluido del evento: el cliente no lo quiere"});
        }

        // Cambiar de proveedor: el servicio vuelve a pendiente y queda constancia del reemplazo y su motivo.
        const cambioProveedor = datos.id_proveedor !== actual.rows[0].id_proveedor;
        if(cambioProveedor){
            const motivo = typeof req.body?.observaciones === "string" ? req.body.observaciones.trim() : "";
            if(actual.rows[0].id_proveedor !== null && !motivo){
                await cliente.query("rollback");
                return res.status(400).json({mensaje: "para reemplazar un proveedor hay que dejar una observacion con el cambio y el motivo"});
            }
            datos.estado_proveedor = "pendiente";
            datos.id_proveedor_anterior = actual.rows[0].id_proveedor ?? actual.rows[0].id_proveedor_anterior;
            // El motivo del reemplazo se suma a las observaciones que ya habia, no las pisa.
            const previas = actual.rows[0].observaciones;
            if(previas && motivo && !motivo.includes(previas)){
                datos.observaciones = `${previas} · ${motivo}`.slice(0, 500);
            }
        } else{
            datos.estado_proveedor = actual.rows[0].estado_proveedor;
            datos.id_proveedor_anterior = actual.rows[0].id_proveedor_anterior;
        }

        if(datos.id_proveedor !== null && !(await proveedorOfreceServicio(cliente, datos.id_proveedor, datos.id_servicio))){
            await cliente.query("rollback");
            return res.status(400).json({mensaje: "ese proveedor no ofrece ese servicio"});
        }

        await cliente.query(
            `update detalle_propuesta
             set id_servicio = $1, id_proveedor = $2, cantidad = $3, importe_unitario = $4, estado_proveedor = $5,
                 descartado = $6, id_proveedor_anterior = $7, observaciones = $8
             where id_detalle = $9`,
            [datos.id_servicio, datos.id_proveedor, datos.cantidad, datos.importe_unitario, datos.estado_proveedor,
             datos.descartado, datos.id_proveedor_anterior, datos.observaciones, idDetalle]
        );
        await recalcularTotal(cliente, idPropuesta);
        await sincronizarEventoConPropuesta(cliente, idPropuesta);

        await cliente.query("commit");

        const detalle = await pool.query(`${SELECT_DETALLE} where d.id_detalle = $1`, [idDetalle]);
        res.json(detalle.rows[0]);

    } catch(error){
        await cliente.query("rollback");
        console.error(error);

        errorBD(error, res, "no se pudo editar el detalle");
    } finally{
        cliente.release();
    }
};

export const eliminarDetalle = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const {idPropuesta, idDetalle} = idsDeRuta(req);
        if(idPropuesta === null || idDetalle === null){
            return res.status(400).json({mensaje: "el id de la propuesta o del detalle no es valido"});
        }

        await cliente.query("begin");

        const {propuesta, status, mensaje} = await propuestaModificable(cliente, idPropuesta, req.usuario.id_empresa);
        if(!propuesta){
            await cliente.query("rollback");
            return res.status(status).json({mensaje});
        }
        if(propuesta.estado === "aceptada"){
            await cliente.query("rollback");
            return res.status(409).json({mensaje: PRECIO_FIJO});
        }

        const eliminado = await cliente.query(
            `delete from detalle_propuesta where id_propuesta = $1 and id_detalle = $2 returning *`,
            [idPropuesta, idDetalle]
        );
        if(eliminado.rows.length === 0){
            await cliente.query("rollback");
            return res.status(404).json({mensaje: "ese detalle no existe en la propuesta"});
        }
        await recalcularTotal(cliente, idPropuesta);
        await sincronizarEventoConPropuesta(cliente, idPropuesta);

        await cliente.query("commit");
        res.json({mensaje: "servicio quitado de la propuesta", detalle: eliminado.rows[0]});

    } catch(error){
        await cliente.query("rollback");
        console.error(error);

        if(error.code === "23503"){
            return res.status(409).json({mensaje: "no se puede eliminar, el detalle tiene tareas asociadas"});
        }

        res.status(500).json({mensaje: "no se pudo eliminar el detalle"});
    } finally{
        cliente.release();
    }
};

// El coordinador contacta a los proveedores y registra su situacion: pendiente, confirmado o no disponible.
// Un servicio sin proveedor no puede marcarse confirmado.
export const cambiarEstadoProveedor = async (req, res) => {
    try{
        const {idPropuesta, idDetalle} = idsDeRuta(req);
        if(idPropuesta === null || idDetalle === null){
            return res.status(400).json({mensaje: "el id de la propuesta o del detalle no es valido"});
        }

        const {estado_proveedor} = req.body ?? {};
        if(!ESTADOS_PROVEEDOR.includes(estado_proveedor)){
            return res.status(400).json({mensaje: `el estado del proveedor debe ser uno de: ${ESTADOS_PROVEEDOR.join(", ")}`});
        }

        const actual = await pool.query(
            `select d.id_proveedor, d.descartado, e.estado as estado_evento
             from detalle_propuesta d
             join propuesta p on p.id_propuesta = d.id_propuesta
             join evento e on e.id_evento = p.id_evento
             where d.id_propuesta = $1 and d.id_detalle = $2 and e.id_empresa = $3`,
            [idPropuesta, idDetalle, req.usuario.id_empresa]
        );
        if(actual.rows.length === 0){
            return res.status(404).json({mensaje: "ese detalle no existe en la propuesta"});
        }
        if(ESTADOS_EVENTO_CERRADOS.includes(actual.rows[0].estado_evento)){
            return res.status(409).json({mensaje: `el evento esta ${actual.rows[0].estado_evento}: la situacion de sus proveedores ya no se modifica`});
        }
        if(estado_proveedor === "confirmado" && actual.rows[0].id_proveedor === null){
            return res.status(400).json({mensaje: "no se puede confirmar un servicio que no tiene proveedor"});
        }
        if(estado_proveedor === "confirmado" && actual.rows[0].descartado){
            return res.status(400).json({mensaje: "no se puede confirmar un servicio descartado"});
        }

        await pool.query(`update detalle_propuesta set estado_proveedor = $1 where id_detalle = $2`, [estado_proveedor, idDetalle]);

        const detalle = await pool.query(`${SELECT_DETALLE} where d.id_detalle = $1`, [idDetalle]);
        res.json(detalle.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo cambiar el estado del proveedor"});
    }
};
