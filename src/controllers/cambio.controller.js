import pool from "../data/db.js";
import {parseId, textoObligatorio, textoOpcional} from "../utils/validaciones.js";

const SELECT_CAMBIO = `
    select c.*, p.nombre as registrado_por_nombre
    from cambio_evento c
    join personal p on p.id_personal = c.registrado_por`;

const existeEvento = async (idEvento, idEmpresa) => {
    const evento = await pool.query(`select 1 from evento where id_evento = $1 and id_empresa = $2`, [idEvento, idEmpresa]);

    return evento.rows.length > 0;
};

export const obtenerCambios = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }
        if(!(await existeEvento(idEvento, req.usuario.id_empresa))){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        const cambios = await pool.query(`${SELECT_CAMBIO} where c.id_evento = $1 order by c.fecha_registro desc, c.id_cambio desc`, [idEvento]);

        res.json(cambios.rows);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los cambios del evento"});
    }
};

// Quien recibe una novedad (de un cliente o proveedor) la registra; quien la registra sale del token.
export const crearCambio = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }

        const tipo = textoObligatorio(req.body?.tipo_cambio, "el tipo de cambio", 50);
        const descripcion = textoObligatorio(req.body?.descripcion, "la descripcion", 500);
        const situacion = textoOpcional(req.body?.situacion_compromisos, "la situacion de los compromisos", 500);
        const error = tipo.error ?? descripcion.error ?? situacion.error;
        if(error){
            return res.status(400).json({mensaje: error});
        }

        const registradoPor = req.usuario?.id_personal;
        if(!registradoPor){
            return res.status(400).json({mensaje: "tu usuario no tiene una persona asociada para registrar el cambio"});
        }
        if(!(await existeEvento(idEvento, req.usuario.id_empresa))){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        const creado = await pool.query(
            `insert into cambio_evento (id_evento, tipo_cambio, descripcion, registrado_por, situacion_compromisos)
             values ($1, $2, $3, $4, $5) returning id_cambio`,
            [idEvento, tipo.valor, descripcion.valor, registradoPor, situacion.valor]
        );

        const cambio = await pool.query(`${SELECT_CAMBIO} where c.id_cambio = $1`, [creado.rows[0].id_cambio]);
        res.status(201).json(cambio.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo registrar el cambio"});
    }
};

// El cambio no actualiza solo los compromisos: alguien los revisa y deja registrada su situacion real.
export const editarCambio = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        const idCambio = parseId(req.params.idCambio);
        if(idEvento === null || idCambio === null){
            return res.status(400).json({mensaje: "el id del evento o del cambio no es valido"});
        }

        const situacion = textoObligatorio(req.body?.situacion_compromisos, "la situacion de los compromisos", 500);
        if(situacion.error){
            return res.status(400).json({mensaje: situacion.error});
        }

        const editado = await pool.query(
            `update cambio_evento c set situacion_compromisos = $1
             from evento e
             where c.id_evento = $2 and c.id_cambio = $3 and e.id_evento = c.id_evento and e.id_empresa = $4
             returning c.id_cambio`,
            [situacion.valor, idEvento, idCambio, req.usuario.id_empresa]
        );
        if(editado.rows.length === 0){
            return res.status(404).json({mensaje: "ese cambio no existe en el evento"});
        }

        const cambio = await pool.query(`${SELECT_CAMBIO} where c.id_cambio = $1`, [idCambio]);
        res.json(cambio.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo registrar la situacion de los compromisos"});
    }
};
