import pool from "../data/db.js";
import {parseId, textoOpcional} from "../utils/validaciones.js";
import {esDeLaEmpresa} from "../utils/empresa.js";

const SELECT_EXCLUSION = `
    select x.*, s.nombre as servicio, p.nombre as registrado_por_nombre
    from servicio_excluido_evento x
    join servicio s on s.id_servicio = x.id_servicio
    join personal p on p.id_personal = x.registrado_por`;

const existeEvento = async (idEvento, idEmpresa) => {
    const evento = await pool.query(`select 1 from evento where id_evento = $1 and id_empresa = $2`, [idEvento, idEmpresa]);

    return evento.rows.length > 0;
};

export const obtenerExclusiones = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }
        if(!(await existeEvento(idEvento, req.usuario.id_empresa))){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        const exclusiones = await pool.query(`${SELECT_EXCLUSION} where x.id_evento = $1 order by x.fecha_registro`, [idEvento]);

        res.json(exclusiones.rows);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los servicios excluidos"});
    }
};

// Marca un servicio como excluido del evento. Quien lo registra sale del token.
export const crearExclusion = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }

        const idServicio = parseId(req.body?.id_servicio);
        if(idServicio === null){
            return res.status(400).json({mensaje: "el id del servicio no es valido"});
        }

        const motivo = textoOpcional(req.body?.motivo, "el motivo", 500);
        if(motivo.error){
            return res.status(400).json({mensaje: motivo.error});
        }

        const registradoPor = req.usuario?.id_personal;
        if(!registradoPor){
            return res.status(400).json({mensaje: "tu usuario no tiene una persona asociada para registrar la exclusion"});
        }

        if(!(await existeEvento(idEvento, req.usuario.id_empresa))){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        if(!(await esDeLaEmpresa("servicio", idServicio, req.usuario.id_empresa))){
            return res.status(400).json({mensaje: "el servicio indicado no existe"});
        }

        const creada = await pool.query(
            `insert into servicio_excluido_evento (id_evento, id_servicio, motivo, registrado_por)
             values ($1, $2, $3, $4) returning id_exclusion`,
            [idEvento, idServicio, motivo.valor, registradoPor]
        );

        const exclusion = await pool.query(`${SELECT_EXCLUSION} where x.id_exclusion = $1`, [creada.rows[0].id_exclusion]);
        res.status(201).json(exclusion.rows[0]);

    } catch(error){
        console.error(error);

        if(error.code === "23505"){
            return res.status(409).json({mensaje: "ese servicio ya esta excluido del evento"});
        }
        if(error.code === "23503"){
            return res.status(400).json({mensaje: "el servicio indicado no existe"});
        }

        res.status(500).json({mensaje: "no se pudo registrar la exclusion"});
    }
};

export const editarExclusion = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        const idExclusion = parseId(req.params.idExclusion);
        if(idEvento === null || idExclusion === null){
            return res.status(400).json({mensaje: "el id del evento o de la exclusion no es valido"});
        }

        const motivo = textoOpcional(req.body?.motivo, "el motivo", 500);
        if(motivo.error){
            return res.status(400).json({mensaje: motivo.error});
        }

        const editada = await pool.query(
            `update servicio_excluido_evento x set motivo = $1
             from evento e
             where x.id_evento = $2 and x.id_exclusion = $3 and e.id_evento = x.id_evento and e.id_empresa = $4
             returning x.id_exclusion`,
            [motivo.valor, idEvento, idExclusion, req.usuario.id_empresa]
        );
        if(editada.rows.length === 0){
            return res.status(404).json({mensaje: "esa exclusion no existe en el evento"});
        }

        const exclusion = await pool.query(`${SELECT_EXCLUSION} where x.id_exclusion = $1`, [idExclusion]);
        res.json(exclusion.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo editar la exclusion"});
    }
};

export const eliminarExclusion = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        const idExclusion = parseId(req.params.idExclusion);
        if(idEvento === null || idExclusion === null){
            return res.status(400).json({mensaje: "el id del evento o de la exclusion no es valido"});
        }

        const eliminada = await pool.query(
            `delete from servicio_excluido_evento x using evento e
             where x.id_evento = $1 and x.id_exclusion = $2 and e.id_evento = x.id_evento and e.id_empresa = $3
             returning x.*`,
            [idEvento, idExclusion, req.usuario.id_empresa]
        );
        if(eliminada.rows.length === 0){
            return res.status(404).json({mensaje: "esa exclusion no existe en el evento"});
        }

        res.json({mensaje: "exclusion eliminada", exclusion: eliminada.rows[0]});

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo eliminar la exclusion"});
    }
};
