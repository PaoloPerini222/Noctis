import pool from "../data/db.js";

const REGEX_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// La propuesta solo se muestra al cliente una vez enviada; antes es trabajo interno.
const ESTADOS_VISIBLES = ["enviada", "en_negociacion", "aceptada", "rechazada"];
const ESTADOS_QUE_ADMITEN_RESPUESTA = ["enviada", "en_negociacion"];
const MOTIVO_MAXIMO = 500;

const sinCache = (res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex, nofollow");
};

// Todo lo que sale de acá lo ve quien tenga el link: solo datos del propio evento, sin proveedores ni datos internos.
const buscarEvento = async (cliente, token, {bloquear}) => {
    const evento = await cliente.query(
        `select e.id_evento, e.tipo_evento, e.fecha::text as fecha, e.sede_prevista, e.cant_asistentes_estimada,
                e.necesidades_preferencias, e.estado, c.nombre_completo as cliente_nombre, p.nombre_completo as organizador_nombre
         from evento e
         left join cliente c on c.id_cliente = e.id_cliente
         left join personal p on p.id_personal = e.id_organizador
         where e.token_publico = $1${bloquear ? " for update of e" : ""}`,
        [token]
    );

    return evento.rows[0];
};

const buscarPropuesta = async (cliente, idEvento, {bloquear}) => {
    const propuesta = await cliente.query(
        `select id_propuesta, fecha_emision::text as fecha_emision, total, estado,
                fecha_respuesta::text as fecha_respuesta, condiciones_comerciales, condiciones_acordadas, motivo_rechazo
         from propuesta
         where id_evento = $1${bloquear ? " for update" : ""}`,
        [idEvento]
    );

    return propuesta.rows[0];
};

export const obtenerEventoPublico = async (req, res) => {
    sinCache(res);

    try{
        const {token} = req.params;
        if(!REGEX_TOKEN.test(token)){
            return res.status(404).json({mensaje: "este enlace no es valido"});
        }

        const evento = await buscarEvento(pool, token, {bloquear: false});
        if(!evento){
            return res.status(404).json({mensaje: "este enlace no es valido"});
        }

        const {id_evento, ...datosEvento} = evento;
        let propuesta = null;

        const unaPropuesta = await buscarPropuesta(pool, id_evento, {bloquear: false});
        if(unaPropuesta && ESTADOS_VISIBLES.includes(unaPropuesta.estado)){
            const servicios = await pool.query(
                `select s.nombre, d.cantidad, d.importe_unitario, d.cantidad * d.importe_unitario as subtotal
                 from detalle_propuesta d
                 join servicio s on s.id_servicio = d.id_servicio
                 where d.id_propuesta = $1 and d.descartado = false
                 order by d.id_detalle`,
                [unaPropuesta.id_propuesta]
            );

            const {id_propuesta, ...datosPropuesta} = unaPropuesta;
            propuesta = {
                ...datosPropuesta,
                servicios: servicios.rows,
                puede_responder: ESTADOS_QUE_ADMITEN_RESPUESTA.includes(unaPropuesta.estado),
            };
        }

        res.json({evento: datosEvento, propuesta});

    } catch (error) {
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener el evento"});
    }
};

export const responderPropuestaPublica = async (req, res) => {
    sinCache(res);

    const {token} = req.params;
    if(!REGEX_TOKEN.test(token)){
        return res.status(404).json({mensaje: "este enlace no es valido"});
    }

    const {decision, motivo} = req.body ?? {};
    if(decision !== "aceptar" && decision !== "rechazar"){
        return res.status(400).json({mensaje: "la decision debe ser aceptar o rechazar"});
    }
    if(motivo !== undefined && motivo !== null && (typeof motivo !== "string" || motivo.trim().length > MOTIVO_MAXIMO)){
        return res.status(400).json({mensaje: `el motivo no puede superar los ${MOTIVO_MAXIMO} caracteres`});
    }

    const cliente = await pool.connect();
    try{
        await cliente.query("BEGIN");

        const evento = await buscarEvento(cliente, token, {bloquear: true});
        if(!evento){
            await cliente.query("ROLLBACK");
            return res.status(404).json({mensaje: "este enlace no es valido"});
        }

        const propuesta = await buscarPropuesta(cliente, evento.id_evento, {bloquear: true});
        if(!propuesta || !ESTADOS_QUE_ADMITEN_RESPUESTA.includes(propuesta.estado)){
            await cliente.query("ROLLBACK");
            return res.status(409).json({mensaje: "esta propuesta ya no admite respuesta"});
        }

        const acepta = decision === "aceptar";
        const estado = acepta ? "aceptada" : "rechazada";

        await cliente.query(
            `update propuesta set estado = $1, fecha_respuesta = current_date, motivo_rechazo = $2
             where id_propuesta = $3`,
            [estado, acepta ? null : motivo?.trim() || null, propuesta.id_propuesta]
        );
        await cliente.query(`update evento set estado = $1 where id_evento = $2`, [estado, evento.id_evento]);

        await cliente.query("COMMIT");

        res.json({mensaje: acepta ? "propuesta aceptada" : "propuesta rechazada", estado});

    } catch (error) {
        await cliente.query("ROLLBACK");
        console.error(error);

        // El trigger del evento exige fecha, sede y asistentes para poder aceptarlo.
        if(error.code === "P0001"){
            return res.status(409).json({mensaje: "el evento todavia no tiene fecha, sede y cantidad de asistentes definidas, contacta a la organizadora"});
        }

        res.status(500).json({mensaje: "no se pudo registrar la respuesta"});
    } finally {
        cliente.release();
    }
};
