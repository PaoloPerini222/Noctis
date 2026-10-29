import pool from "../data/db.js";
import {parseId} from "../utils/validaciones.js";

// Rechazos anteriores de la solicitud: cada vez que el cliente la retomo se guardo el rechazo que habia.
export const obtenerRechazos = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }

        const evento = await pool.query(`select 1 from evento where id_evento = $1 and id_empresa = $2`, [idEvento, req.usuario.id_empresa]);
        if(evento.rows.length === 0){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }

        const rechazos = await pool.query(
            `select r.*, r.fecha_rechazo::text as fecha_rechazo, p.nombre_completo as reabierto_por_nombre
             from rechazo_solicitud r
             join personal p on p.id_personal = r.reabierto_por
             where r.id_evento = $1
             order by r.fecha_reapertura desc, r.id_rechazo desc`,
            [idEvento]
        );

        res.json(rechazos.rows);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los rechazos anteriores"});
    }
};

// El cliente retoma el mismo evento que habia rechazado: se reabre la solicitud existente (no se crea otra),
// se guarda el rechazo anterior y la propuesta vigente vuelve a borrador para actualizarla segun lo que necesite.
// Como los importes pueden cambiar, tiene que pasar de nuevo por la aprobacion de la responsable antes de enviarse.
export const reabrirSolicitud = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const idEvento = parseId(req.params.idEvento);
        if(idEvento === null){
            return res.status(400).json({mensaje: "el id del evento no es valido"});
        }

        const registradoPor = req.usuario?.id_personal;
        if(!registradoPor){
            return res.status(400).json({mensaje: "tu usuario no tiene una persona asociada para reabrir la solicitud"});
        }

        await cliente.query("begin");

        const evento = await cliente.query(`select estado from evento where id_evento = $1 and id_empresa = $2 for update`, [idEvento, req.usuario.id_empresa]);
        if(evento.rows.length === 0){
            await cliente.query("rollback");
            return res.status(404).json({mensaje: "ese evento no existe"});
        }
        if(evento.rows[0].estado !== "rechazada"){
            await cliente.query("rollback");
            return res.status(409).json({mensaje: "solo se reabre una solicitud rechazada por el cliente (un evento cancelado se conserva como esta: para otra celebracion se registra una solicitud nueva)"});
        }

        const propuesta = await cliente.query(
            `select id_propuesta, total, motivo_rechazo, fecha_respuesta from propuesta where id_evento = $1 for update`,
            [idEvento]
        );
        const rechazada = propuesta.rows[0];

        await cliente.query(
            `insert into rechazo_solicitud (id_evento, fecha_rechazo, motivo, total_propuesto, reabierto_por)
             values ($1, $2, $3, $4, $5)`,
            [idEvento, rechazada?.fecha_respuesta ?? null, rechazada?.motivo_rechazo ?? null, rechazada?.total ?? null, registradoPor]
        );

        if(rechazada){
            await cliente.query(
                `update propuesta
                 set estado = 'borrador', motivo_rechazo = null, fecha_respuesta = null, aprobado_por = null, fecha_aprobacion = null
                 where id_propuesta = $1`,
                [rechazada.id_propuesta]
            );
        }
        await cliente.query(`update evento set estado = 'en_evaluacion' where id_evento = $1`, [idEvento]);

        await cliente.query("commit");

        const evento_reabierto = await pool.query(`select * from evento where id_evento = $1`, [idEvento]);
        res.json(evento_reabierto.rows[0]);

    } catch(error){
        await cliente.query("rollback");
        console.error(error);

        res.status(500).json({mensaje: "no se pudo reabrir la solicitud"});
    } finally{
        cliente.release();
    }
};
