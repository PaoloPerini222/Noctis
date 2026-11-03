import pool from "../data/db.js";
import {esDeLaEmpresa} from "../utils/empresa.js";
import {cambiosDelEvento, registrarCambio} from "../utils/cambios.js";
import {listaDeIds, parseId, ID_MAXIMO} from "../utils/validaciones.js";
import {
    ESTADOS_CERRADOS, ESTADOS_QUE_OCUPAN, bloquearAgenda, validarFechaLibre, esFechaRepetida, respuestaFechaRepetida,
    guardarServiciosDelEvento, serviciosDelEvento, serviciosSinConfirmar, totalDe,
} from "../utils/reservas.js";

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS = ["propuesta", "confirmado", "rechazado", "realizado", "cancelado"];
const ESTADOS_SEDE = ["pendiente", "confirmada", "no_disponible"];

// Cómo avanza un evento: la reserva entra como propuesta y la organizadora la acepta (confirmado) o la rechaza.
// Un evento confirmado termina realizado o cancelado. Los estados cerrados no vuelven atrás.
const TRANSICIONES = {
    propuesta: ["confirmado", "rechazado", "cancelado"],
    confirmado: ["realizado", "cancelado"],
};
const DESCRIPCION_ESTADO = {
    confirmado: "La reserva se aceptó: el evento quedó confirmado.",
    rechazado: "La reserva se rechazó.",
    realizado: "El evento se realizó.",
    cancelado: "El evento se canceló.",
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
        necesidades_preferencias, estado, id_organizador, estado_sede, servicios, id_sucursal,
    } = body ?? {};

    let idCliente = null;
    if(requiereCliente){
        idCliente = parseId(id_cliente);
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
        idOrganizador = parseId(id_organizador);
        if(idOrganizador === null){
            return {error: "el id del organizador no es valido"};
        }
    }

    // El salón es opcional: un evento sin salón cuenta como un mismo lugar para la agenda.
    let idSucursal = null;
    if(id_sucursal !== undefined && id_sucursal !== null){
        idSucursal = parseId(id_sucursal);
        if(idSucursal === null){
            return {error: "el id del salón no es valido"};
        }
    }

    if(estado !== undefined && !ESTADOS.includes(estado)){
        return {error: `el estado debe ser uno de: ${ESTADOS.join(", ")}`};
    }
    if(estado_sede !== undefined && !ESTADOS_SEDE.includes(estado_sede)){
        return {error: `el estado de la sede debe ser uno de: ${ESTADOS_SEDE.join(", ")}`};
    }

    // Los servicios son opcionales: si no vienen, el evento conserva los que tenía.
    let idsServicios = null;
    if(servicios !== undefined && servicios !== null){
        const lista = listaDeIds(servicios, "servicios");
        if(lista.error){
            return {error: lista.error};
        }
        idsServicios = lista.ids;
    }

    const errorTexto =
        validarTexto(tipo_evento, "el tipo de evento", 50) ??
        validarTexto(sede_prevista, "la sede prevista", 100) ??
        validarTexto(necesidades_preferencias, "las necesidades y preferencias", 500);
    if(errorTexto){
        return {error: errorTexto};
    }

    return {
        datos: {
            id_cliente: idCliente,
            tipo_evento: tipo_evento.trim(),
            fecha: fecha ?? null,
            sede_prevista: sede_prevista?.trim() || null,
            cant_asistentes_estimada: cant_asistentes_estimada ?? null,
            necesidades_preferencias: necesidades_preferencias?.trim() || null,
            estado: estado ?? "propuesta",
            id_organizador: idOrganizador,
            estado_sede: estado_sede ?? "pendiente",
            servicios: idsServicios,
            id_sucursal: idSucursal,
        },
    };
};

const responderErrorBD = (error, res, mensajeGenerico) => {
    if(esFechaRepetida(error)){
        return res.status(409).json(respuestaFechaRepetida);
    }
    if(error.code === "23503"){
        return res.status(400).json({mensaje: "el cliente o el organizador indicado no existe"});
    }
    // El trigger del evento exige la fecha para confirmarlo.
    if(error.code === "P0001"){
        return res.status(400).json({mensaje: "para confirmar el evento se requiere la fecha"});
    }

    res.status(500).json({mensaje: mensajeGenerico});
};

// Cada evento con quién lo reservó (nombre y contacto), los ids de sus servicios y el total, para listar sin otra consulta.
const SELECT_EVENTO = `
    select e.*, c.nombre_completo as cliente_nombre, c.telefono as cliente_telefono, c.email as cliente_email,
           s.nombre as sucursal_nombre, s.direccion as sucursal_direccion,
           coalesce((select array_agg(es.id_servicio order by es.id_servicio) from evento_servicio es where es.id_evento = e.id_evento), '{}') as servicios,
           coalesce((select sum(es.precio) from evento_servicio es where es.id_evento = e.id_evento), 0)::float8 as total
    from evento e
    left join cliente c on c.id_cliente = e.id_cliente
    left join sucursal s on s.id_sucursal = e.id_sucursal`;

const eventoCompleto = async (db, idEvento, idEmpresa) => {
    const evento = await db.query(`${SELECT_EVENTO} where e.id_evento = $1 and e.id_empresa = $2`, [idEvento, idEmpresa]);
    if(evento.rows.length === 0){
        return undefined;
    }

    const servicios = await serviciosDelEvento(db, idEvento);
    return {...evento.rows[0], detalle_servicios: servicios, total: totalDe(servicios), servicios_sin_confirmar: serviciosSinConfirmar(servicios)};
};

export const obtenerEventos = async (req, res) => {
    try{
        const eventos = await pool.query(`${SELECT_EVENTO} where e.id_empresa = $1 order by e.id_evento`, [req.usuario.id_empresa]);

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

        const evento = await eventoCompleto(pool, idEvento, req.usuario.id_empresa);
        if(!evento){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        res.json(evento);

    } catch (error) {
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener el evento"});
    }
};

// Un evento cargado desde el panel entra igual que una reserva del link público: como propuesta.
export const crearEvento = async (req, res) => {
    const {error, datos} = validarEvento({...req.body, estado: undefined}, {requiereCliente: true});
    if(error){
        return res.status(400).json({mensaje: error});
    }

    const conexion = await pool.connect();
    try{
        const idEmpresa = req.usuario.id_empresa;
        if(!await esDeLaEmpresa("cliente", datos.id_cliente, idEmpresa, conexion)){
            return res.status(400).json({mensaje: "el cliente indicado no existe"});
        }
        if(datos.id_organizador !== null && !await esDeLaEmpresa("personal", datos.id_organizador, idEmpresa, conexion)){
            return res.status(400).json({mensaje: "el organizador indicado no existe"});
        }
        if(datos.id_sucursal !== null && !await esDeLaEmpresa("sucursal", datos.id_sucursal, idEmpresa, conexion)){
            return res.status(400).json({mensaje: "el salón indicado no existe"});
        }

        await conexion.query("begin");
        await bloquearAgenda(conexion, idEmpresa);

        const fechaOcupada = await validarFechaLibre(conexion, idEmpresa, datos.fecha, datos.id_sucursal);
        if(fechaOcupada){
            await conexion.query("rollback");
            return res.status(409).json({mensaje: fechaOcupada});
        }

        const nuevo = await conexion.query(
            `insert into evento (id_cliente, tipo_evento, fecha, sede_prevista, cant_asistentes_estimada, necesidades_preferencias, estado, id_organizador, estado_sede, id_empresa, id_sucursal)
             values ($1, $2, $3, $4, $5, $6, 'propuesta', $7, $8, $9, $10) returning id_evento`,
            [datos.id_cliente, datos.tipo_evento, datos.fecha, datos.sede_prevista, datos.cant_asistentes_estimada, datos.necesidades_preferencias, datos.id_organizador ?? req.usuario.id_personal ?? null, datos.estado_sede, idEmpresa, datos.id_sucursal]
        );
        const idEvento = nuevo.rows[0].id_evento;

        if(datos.servicios?.length){
            const errorServicios = await guardarServiciosDelEvento(conexion, idEvento, idEmpresa, datos.servicios);
            if(errorServicios){
                await conexion.query("rollback");
                return res.status(400).json({mensaje: errorServicios});
            }
        }

        await conexion.query("commit");
        res.status(201).json(await eventoCompleto(pool, idEvento, idEmpresa));

    } catch (error){
        await conexion.query("rollback");
        console.error(error);

        responderErrorBD(error, res, "no se pudo crear el evento");
    } finally{
        conexion.release();
    }
};

export const editarEvento = async (req, res) => {
    const idEvento = parseId(req.params.id);
    if(idEvento === null){
        return res.status(400).json({mensaje: "el id del evento no es valido"});
    }

    const idEmpresa = req.usuario.id_empresa;
    const conexion = await pool.connect();
    try{
        await conexion.query("begin");
        await bloquearAgenda(conexion, idEmpresa);

        const actual = await conexion.query(
            `select tipo_evento, fecha::text as fecha, sede_prevista, cant_asistentes_estimada, necesidades_preferencias, estado, id_organizador, estado_sede, id_sucursal
             from evento where id_evento = $1 and id_empresa = $2 for update`,
            [idEvento, idEmpresa]
        );
        if(actual.rows.length === 0){
            await conexion.query("rollback");
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        const antes = actual.rows[0];
        if(ESTADOS_CERRADOS.includes(antes.estado)){
            await conexion.query("rollback");
            return res.status(409).json({mensaje: `el evento esta ${antes.estado} y se conserva sin cambios`});
        }

        const {error, datos} = validarEvento({...antes, ...req.body}, {requiereCliente: false});
        if(error){
            await conexion.query("rollback");
            return res.status(400).json({mensaje: error});
        }

        if(datos.estado !== antes.estado){
            const permitidos = TRANSICIONES[antes.estado] ?? [];
            if(!permitidos.includes(datos.estado)){
                await conexion.query("rollback");
                return res.status(409).json({mensaje: `desde ${antes.estado} el evento solo puede pasar a: ${permitidos.join(", ") || "ningun estado"}`});
            }
            if(datos.estado === "confirmado" && !datos.fecha){
                await conexion.query("rollback");
                return res.status(400).json({mensaje: "para confirmar el evento se requiere la fecha"});
            }
            // Una reserva se acepta cuando los proveedores de todos sus servicios confirmaron que pueden ese día.
            if(antes.estado === "propuesta" && datos.estado === "confirmado"){
                const faltan = serviciosSinConfirmar(await serviciosDelEvento(conexion, idEvento));
                if(faltan.length > 0){
                    await conexion.query("rollback");
                    return res.status(409).json({mensaje: `falta que un proveedor confirme que está disponible para: ${faltan.join(", ")}`});
                }
            }
        }

        // Quien acepta una reserva que entró sin organizador queda como su organizador.
        if(datos.estado === "confirmado" && datos.id_organizador === null){
            datos.id_organizador = req.usuario.id_personal ?? null;
        }
        if(datos.id_organizador !== null && datos.id_organizador !== antes.id_organizador
            && !await esDeLaEmpresa("personal", datos.id_organizador, idEmpresa, conexion)){
            await conexion.query("rollback");
            return res.status(400).json({mensaje: "el organizador indicado no existe"});
        }
        if(datos.id_sucursal !== null && datos.id_sucursal !== antes.id_sucursal
            && !await esDeLaEmpresa("sucursal", datos.id_sucursal, idEmpresa, conexion)){
            await conexion.query("rollback");
            return res.status(400).json({mensaje: "el salón indicado no existe"});
        }

        if(ESTADOS_QUE_OCUPAN.includes(datos.estado)){
            const fechaOcupada = await validarFechaLibre(conexion, idEmpresa, datos.fecha, datos.id_sucursal, idEvento);
            if(fechaOcupada){
                await conexion.query("rollback");
                return res.status(409).json({mensaje: fechaOcupada});
            }
        }

        await conexion.query(
            `update evento set tipo_evento = $1, fecha = $2, sede_prevista = $3, cant_asistentes_estimada = $4,
             necesidades_preferencias = $5, estado = $6, id_organizador = $7, estado_sede = $8, id_sucursal = $9
             where id_evento = $10 and id_empresa = $11`,
            [datos.tipo_evento, datos.fecha, datos.sede_prevista, datos.cant_asistentes_estimada, datos.necesidades_preferencias, datos.estado, datos.id_organizador, datos.estado_sede, datos.id_sucursal, idEvento, idEmpresa]
        );

        if(datos.servicios !== null){
            const errorServicios = await guardarServiciosDelEvento(conexion, idEvento, idEmpresa, datos.servicios);
            if(errorServicios){
                await conexion.query("rollback");
                return res.status(400).json({mensaje: errorServicios});
            }
        }

        // Queda anotado en el historial: el cambio de estado y, con el evento confirmado, los cambios de fecha o sede.
        if(req.usuario.id_personal){
            const cambios = antes.estado === "confirmado" ? cambiosDelEvento(antes, datos) : [];
            if(datos.estado !== antes.estado){
                cambios.push({tipo: "Estado", descripcion: DESCRIPCION_ESTADO[datos.estado]});
            }
            for(const cambio of cambios){
                await registrarCambio(conexion, {idEvento, tipo: cambio.tipo, descripcion: cambio.descripcion, registradoPor: req.usuario.id_personal});
            }
        }

        await conexion.query("commit");
        res.json(await eventoCompleto(pool, idEvento, idEmpresa));

    } catch(error){
        await conexion.query("rollback");
        console.error(error);

        responderErrorBD(error, res, "no se pudo editar el evento");
    } finally{
        conexion.release();
    }
};

// Solo se elimina una reserva que no llegó a ser evento (pendiente o rechazada); los demás se conservan.
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
        if(!["propuesta", "rechazado"].includes(actual.rows[0].estado)){
            return res.status(409).json({mensaje: "solo se elimina una reserva pendiente o rechazada; los eventos confirmados se conservan y se cierran"});
        }

        const eliminar = await pool.query(`delete from evento where id_evento = $1 and id_empresa = $2 RETURNING *`, [idEvento, req.usuario.id_empresa]);
        if(eliminar.rows.length === 0){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        res.json({mensaje: "evento eliminado", evento: eliminar.rows[0]});
    }catch(error){
        console.error(error);

        if(error.code === "23503"){
            return res.status(409).json({mensaje: "no se puede eliminar, el evento tiene registros anteriores asociados"});
        }

        res.status(500).json({mensaje: "no se pudo eliminar el evento"});
    }
};
