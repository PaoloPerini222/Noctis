import pool from "../data/db.js";
import {listaDeIds, parseId, textoObligatorio, textoOpcional, ID_MAXIMO, REGEX_EMAIL} from "../utils/validaciones.js";
import {ESTADOS_QUE_OCUPAN, bloquearAgenda, validarFechaLibre, esFechaRepetida, respuestaFechaRepetida, guardarServiciosDelEvento, serviciosDelEvento, totalDe} from "../utils/reservas.js";

const REGEX_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ENLACE_INVALIDO = {mensaje: "este enlace no es valido"};

const sinCache = (res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex, nofollow");
};

const esFechaValida = (valor) => {
    if(typeof valor !== "string" || !REGEX_FECHA.test(valor)){
        return false;
    }

    const fecha = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor);
};

// Empresa activa dueña del link de reservas, o undefined.
const buscarEmpresa = async (db, token) => {
    const empresa = await db.query(
        `select id_empresa, nombre, email, telefono, direccion from empresas where token_reservas = $1 and activo`,
        [token]
    );

    return empresa.rows[0];
};

// ---------- Link de reservas de la empresa: /reservar/<token> ----------

// Lo que ve cualquiera con el link: los salones, los servicios (con equipamiento y precio) y las fechas que ya no
// se pueden tomar en cada salón (fechas_ocupadas: [{fecha, id_sucursal}]; id_sucursal null = evento sin salón).
export const obtenerReservas = async (req, res) => {
    sinCache(res);

    try{
        const {token} = req.params;
        if(!REGEX_TOKEN.test(token)){
            return res.status(404).json(ENLACE_INVALIDO);
        }

        const empresa = await buscarEmpresa(pool, token);
        if(!empresa){
            return res.status(404).json(ENLACE_INVALIDO);
        }

        const servicios = await pool.query(
            `select id_servicio, nombre, descripcion, equipamiento, precio::float8 as precio
             from servicio where id_empresa = $1 order by nombre`,
            [empresa.id_empresa]
        );
        const sucursales = await pool.query(
            `select id_sucursal, nombre, direccion from sucursal where id_empresa = $1 order by nombre`,
            [empresa.id_empresa]
        );
        const ocupadas = await pool.query(
            `select distinct fecha::text as fecha, id_sucursal from evento
             where id_empresa = $1 and fecha >= current_date and estado = any($2)
             order by 1`,
            [empresa.id_empresa, ESTADOS_QUE_OCUPAN]
        );

        const {id_empresa, ...datosEmpresa} = empresa;
        res.json({
            empresa: datosEmpresa,
            sucursales: sucursales.rows,
            servicios: servicios.rows,
            fechas_ocupadas: ocupadas.rows,
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los servicios"});
    }
};

const validarReserva = (body) => {
    const nombre = textoObligatorio(body?.nombre, "tu nombre", 100);
    const apellido = textoOpcional(body?.apellido, "tu apellido", 100);
    const telefono = textoObligatorio(body?.telefono, "tu telefono", 30);
    const email = textoOpcional(body?.email, "tu email", 100);
    const tipo = textoObligatorio(body?.tipo_evento, "el tipo de evento", 50);
    const sede = textoOpcional(body?.sede_prevista, "el lugar", 100);
    const necesidades = textoOpcional(body?.necesidades_preferencias, "los comentarios", 500);
    const error = nombre.error ?? apellido.error ?? telefono.error ?? email.error ?? tipo.error ?? sede.error ?? necesidades.error;
    if(error){
        return {error};
    }
    if(email.valor && !REGEX_EMAIL.test(email.valor)){
        return {error: "tu email no es valido"};
    }

    if(!esFechaValida(body?.fecha)){
        return {error: "elegí una fecha valida"};
    }

    const asistentes = body?.cant_asistentes_estimada;
    if(asistentes !== undefined && asistentes !== null && (!Number.isInteger(asistentes) || asistentes < 1 || asistentes > ID_MAXIMO)){
        return {error: "la cantidad de invitados no es valida"};
    }

    const servicios = listaDeIds(body?.servicios ?? [], "servicios");
    if(servicios.error){
        return {error: servicios.error};
    }
    if(servicios.ids.length === 0){
        return {error: "elegí al menos un servicio"};
    }

    let idSucursal = null;
    if(body?.id_sucursal !== undefined && body?.id_sucursal !== null){
        idSucursal = parseId(body.id_sucursal);
        if(idSucursal === null){
            return {error: "el salón elegido no es valido"};
        }
    }

    return {
        datos: {
            nombre: nombre.valor, apellido: apellido.valor, telefono: telefono.valor, email: email.valor?.toLowerCase() ?? null,
            tipo_evento: tipo.valor, fecha: body.fecha, sede_prevista: sede.valor, cant_asistentes_estimada: asistentes ?? null,
            necesidades_preferencias: necesidades.valor, servicios: servicios.ids, id_sucursal: idSucursal,
        },
    };
};

// Si el cliente ya reservó antes (mismo email, o mismo teléfono si no dejó email) se reutiliza; si no, se crea.
const clienteDeLaReserva = async (db, idEmpresa, datos) => {
    const existente = datos.email
        ? await db.query(`select id_cliente from cliente where id_empresa = $1 and lower(email) = $2 order by id_cliente limit 1`, [idEmpresa, datos.email])
        : await db.query(`select id_cliente from cliente where id_empresa = $1 and trim(telefono) = $2 order by id_cliente limit 1`, [idEmpresa, datos.telefono]);
    if(existente.rows.length > 0){
        return existente.rows[0].id_cliente;
    }

    const nuevo = await db.query(
        // Todavía no es cliente: pasa a Clientes cuando se acepta su reserva.
        `insert into cliente (nombre, apellido, telefono, email, id_empresa, confirmado) values ($1, $2, $3, $4, $5, false) returning id_cliente`,
        [datos.nombre, datos.apellido, datos.telefono, datos.email, idEmpresa]
    );

    return nuevo.rows[0].id_cliente;
};

// El cliente reserva: queda cargado en Clientes y el evento entra como propuesta, con la fecha y los servicios que eligió.
export const crearReserva = async (req, res) => {
    sinCache(res);

    const {token} = req.params;
    if(!REGEX_TOKEN.test(token)){
        return res.status(404).json(ENLACE_INVALIDO);
    }

    const {error, datos} = validarReserva(req.body);
    if(error){
        return res.status(400).json({mensaje: error});
    }

    const conexion = await pool.connect();
    try{
        await conexion.query("BEGIN");

        const empresa = await buscarEmpresa(conexion, token);
        if(!empresa){
            await conexion.query("ROLLBACK");
            return res.status(404).json(ENLACE_INVALIDO);
        }

        const pasada = await conexion.query(`select $1::date < current_date as pasada`, [datos.fecha]);
        if(pasada.rows[0].pasada){
            await conexion.query("ROLLBACK");
            return res.status(400).json({mensaje: "esa fecha ya pasó, elegí otra"});
        }

        // Si la empresa tiene salones, el cliente tiene que elegir uno de los suyos.
        const salones = await conexion.query(`select id_sucursal from sucursal where id_empresa = $1`, [empresa.id_empresa]);
        if(salones.rows.length > 0 && datos.id_sucursal === null){
            await conexion.query("ROLLBACK");
            return res.status(400).json({mensaje: "elegí el salón"});
        }
        if(datos.id_sucursal !== null && !salones.rows.some((s) => s.id_sucursal === datos.id_sucursal)){
            await conexion.query("ROLLBACK");
            return res.status(400).json({mensaje: "el salón elegido no existe"});
        }

        await bloquearAgenda(conexion, empresa.id_empresa);
        const fechaOcupada = await validarFechaLibre(conexion, empresa.id_empresa, datos.fecha, datos.id_sucursal);
        if(fechaOcupada){
            await conexion.query("ROLLBACK");
            return res.status(409).json({mensaje: fechaOcupada});
        }

        const idCliente = await clienteDeLaReserva(conexion, empresa.id_empresa, datos);
        const evento = await conexion.query(
            `insert into evento (id_cliente, tipo_evento, fecha, sede_prevista, cant_asistentes_estimada, necesidades_preferencias, estado, id_empresa, id_sucursal)
             values ($1, $2, $3, $4, $5, $6, 'propuesta', $7, $8) returning id_evento, token_publico`,
            [idCliente, datos.tipo_evento, datos.fecha, datos.sede_prevista, datos.cant_asistentes_estimada, datos.necesidades_preferencias, empresa.id_empresa, datos.id_sucursal]
        );

        const errorServicios = await guardarServiciosDelEvento(conexion, evento.rows[0].id_evento, empresa.id_empresa, datos.servicios);
        if(errorServicios){
            await conexion.query("ROLLBACK");
            return res.status(400).json({mensaje: errorServicios});
        }

        await conexion.query("COMMIT");
        res.status(201).json({mensaje: "reserva recibida", token: evento.rows[0].token_publico});

    } catch (error) {
        await conexion.query("ROLLBACK");
        console.error(error);

        if(esFechaRepetida(error)){
            return res.status(409).json(respuestaFechaRepetida);
        }

        res.status(500).json({mensaje: "no se pudo registrar la reserva"});
    } finally {
        conexion.release();
    }
};

// ---------- Seguimiento de una reserva: /evento/<token> ----------

// Lo ve quien tenga el link de su reserva: solo datos del propio evento, sin datos internos.
export const obtenerEventoPublico = async (req, res) => {
    sinCache(res);

    try{
        const {token} = req.params;
        if(!REGEX_TOKEN.test(token)){
            return res.status(404).json(ENLACE_INVALIDO);
        }

        // Además de lo que se muestra, va lo necesario para que el cliente corrija su reserva mientras está pendiente:
        // el link de reservas de la empresa, el salón, sus datos de contacto y los ids de los servicios elegidos.
        const evento = await pool.query(
            `select e.id_evento, e.tipo_evento, e.fecha::text as fecha, e.sede_prevista, e.cant_asistentes_estimada,
                    e.necesidades_preferencias, e.estado, c.nombre_completo as cliente_nombre, p.nombre_completo as organizador_nombre,
                    em.nombre as empresa_nombre, em.telefono as empresa_telefono, em.email as empresa_email, em.token_reservas,
                    s.nombre as sucursal_nombre, s.direccion as sucursal_direccion, e.id_sucursal,
                    c.nombre as cliente_nombre_pila, c.apellido as cliente_apellido, c.telefono as cliente_telefono, c.email as cliente_email
             from evento e
             left join cliente c on c.id_cliente = e.id_cliente
             left join personal p on p.id_personal = e.id_organizador
             left join sucursal s on s.id_sucursal = e.id_sucursal
             join empresas em on em.id_empresa = e.id_empresa
             where e.token_publico = $1`,
            [token]
        );
        if(evento.rows.length === 0){
            return res.status(404).json(ENLACE_INVALIDO);
        }

        const {id_evento, ...datosEvento} = evento.rows[0];
        const servicios = (await serviciosDelEvento(pool, id_evento)).map(({id_servicio, nombre, equipamiento, precio}) => ({id_servicio, nombre, equipamiento, precio}));

        res.json({evento: {...datosEvento, se_puede_modificar: datosEvento.estado === "propuesta"}, servicios, total: totalDe(servicios)});

    } catch (error) {
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener el evento"});
    }
};

// El cliente corrige su reserva (salón, servicios, fecha o sus datos) mientras siga pendiente. Una vez aceptada o
// rechazada ya no se toca desde el link: cualquier cambio lo coordina con la organizadora.
export const modificarReserva = async (req, res) => {
    sinCache(res);

    const {token} = req.params;
    if(!REGEX_TOKEN.test(token)){
        return res.status(404).json(ENLACE_INVALIDO);
    }

    const {error, datos} = validarReserva(req.body);
    if(error){
        return res.status(400).json({mensaje: error});
    }

    const conexion = await pool.connect();
    try{
        await conexion.query("BEGIN");

        const encontrado = await conexion.query(
            `select e.id_evento, e.id_cliente, e.estado, e.fecha::text as fecha, e.id_empresa
             from evento e join empresas em on em.id_empresa = e.id_empresa and em.activo
             where e.token_publico = $1 for update of e`,
            [token]
        );
        const evento = encontrado.rows[0];
        if(!evento){
            await conexion.query("ROLLBACK");
            return res.status(404).json(ENLACE_INVALIDO);
        }
        if(evento.estado !== "propuesta"){
            await conexion.query("ROLLBACK");
            return res.status(409).json({mensaje: "tu reserva ya fue revisada y no se puede modificar desde acá; contactá a la organizadora"});
        }

        const pasada = await conexion.query(`select $1::date < current_date as pasada`, [datos.fecha]);
        if(pasada.rows[0].pasada){
            await conexion.query("ROLLBACK");
            return res.status(400).json({mensaje: "esa fecha ya pasó, elegí otra"});
        }

        const salones = await conexion.query(`select id_sucursal from sucursal where id_empresa = $1`, [evento.id_empresa]);
        if(salones.rows.length > 0 && datos.id_sucursal === null){
            await conexion.query("ROLLBACK");
            return res.status(400).json({mensaje: "elegí el salón"});
        }
        if(datos.id_sucursal !== null && !salones.rows.some((s) => s.id_sucursal === datos.id_sucursal)){
            await conexion.query("ROLLBACK");
            return res.status(400).json({mensaje: "el salón elegido no existe"});
        }

        await bloquearAgenda(conexion, evento.id_empresa);
        const fechaOcupada = await validarFechaLibre(conexion, evento.id_empresa, datos.fecha, datos.id_sucursal, evento.id_evento);
        if(fechaOcupada){
            await conexion.query("ROLLBACK");
            return res.status(409).json({mensaje: fechaOcupada});
        }

        if(evento.id_cliente !== null){
            await conexion.query(
                `update cliente set nombre = $1, apellido = $2, telefono = $3, email = $4 where id_cliente = $5`,
                [datos.nombre, datos.apellido, datos.telefono, datos.email, evento.id_cliente]
            );
        }
        await conexion.query(
            `update evento set tipo_evento = $1, fecha = $2, sede_prevista = $3, cant_asistentes_estimada = $4,
                               necesidades_preferencias = $5, id_sucursal = $6
             where id_evento = $7`,
            [datos.tipo_evento, datos.fecha, datos.sede_prevista, datos.cant_asistentes_estimada, datos.necesidades_preferencias, datos.id_sucursal, evento.id_evento]
        );

        const errorServicios = await guardarServiciosDelEvento(conexion, evento.id_evento, evento.id_empresa, datos.servicios);
        if(errorServicios){
            await conexion.query("ROLLBACK");
            return res.status(400).json({mensaje: errorServicios});
        }
        // Las respuestas de los proveedores valen para ese día y esos servicios: si cambió la fecha hay que volver a consultarles.
        await conexion.query(
            `delete from evento_proveedor where id_evento = $1 and ($2 or not (id_servicio = any($3)))`,
            [evento.id_evento, evento.fecha !== datos.fecha, datos.servicios]
        );

        await conexion.query("COMMIT");
        res.json({mensaje: "reserva actualizada", token});

    } catch (error) {
        await conexion.query("ROLLBACK");
        console.error(error);

        if(esFechaRepetida(error)){
            return res.status(409).json(respuestaFechaRepetida);
        }

        res.status(500).json({mensaje: "no se pudo modificar la reserva"});
    } finally {
        conexion.release();
    }
};
