import pool from "../data/db.js";
import {parseId} from "../utils/validaciones.js";
import {ESTADOS_CERRADOS} from "../utils/reservas.js";

// avisado = se le mandó la consulta por WhatsApp y falta su respuesta; disponible / no_disponible = lo que contestó.
const ESTADOS = ["avisado", "disponible", "no_disponible"];

// Registra la consulta o la respuesta de un proveedor para una reserva. Vale para todos los servicios de la reserva
// que ofrece ese proveedor (se le consulta una sola vez por todos). Volver a mandarle la consulta no borra lo que
// ya había contestado. Body: {estado}.
export const registrarRespuesta = async (req, res) => {
    try{
        const idEvento = parseId(req.params.idEvento);
        const idProveedor = parseId(req.params.idProveedor);
        if(idEvento === null || idProveedor === null){
            return res.status(400).json({mensaje: "el id del evento o del proveedor no es valido"});
        }

        const estado = req.body?.estado;
        if(!ESTADOS.includes(estado)){
            return res.status(400).json({mensaje: `el estado debe ser uno de: ${ESTADOS.join(", ")}`});
        }

        const evento = await pool.query(`select estado from evento where id_evento = $1 and id_empresa = $2`, [idEvento, req.usuario.id_empresa]);
        if(evento.rows.length === 0){
            return res.status(404).json({mensaje: "ese evento no existe"});
        }
        if(ESTADOS_CERRADOS.includes(evento.rows[0].estado)){
            return res.status(409).json({mensaje: `el evento esta ${evento.rows[0].estado} y se conserva sin cambios`});
        }

        const guardadas = await pool.query(
            `insert into evento_proveedor (id_evento, id_servicio, id_proveedor, estado, respondido_en)
             select es.id_evento, es.id_servicio, ps.id_proveedor, $3::varchar, case when $3::varchar = 'avisado' then null else now() end
             from evento_servicio es
             join proveedor_servicio ps on ps.id_servicio = es.id_servicio
             join proveedor p on p.id_proveedor = ps.id_proveedor and p.id_empresa = $4
             where es.id_evento = $1 and ps.id_proveedor = $2
             on conflict (id_evento, id_servicio, id_proveedor) do update set
                 estado = case when excluded.estado = 'avisado' then evento_proveedor.estado else excluded.estado end,
                 avisado_en = case when excluded.estado = 'avisado' then now() else evento_proveedor.avisado_en end,
                 respondido_en = case when excluded.estado = 'avisado' then evento_proveedor.respondido_en else now() end
             returning id_servicio, estado`,
            [idEvento, idProveedor, estado, req.usuario.id_empresa]
        );
        if(guardadas.rows.length === 0){
            return res.status(400).json({mensaje: "ese proveedor no ofrece ninguno de los servicios de la reserva"});
        }

        res.json({mensaje: "respuesta registrada", servicios: guardadas.rows});

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo registrar la respuesta del proveedor"});
    }
};
