import pool from "../data/db.js";
import {parseId} from "../utils/validaciones.js";

const ESTADOS_CERRADOS = "('realizado', 'cancelado', 'rechazada')";
const ESTADOS_ENCARGO = "('aceptada', 'confirmado', 'preparacion')";

// Lo que el equipo necesita ver para controlar: tareas pendientes y vencidas, servicios sin confirmar,
// propuestas para revisar y eventos proximos. Con ?evento=ID se limita a un evento.
export const obtenerPendientes = async (req, res) => {
    try{
        let idEvento = null;
        if(req.query.evento !== undefined){
            idEvento = parseId(req.query.evento);
            if(idEvento === null){
                return res.status(400).json({mensaje: "el id del evento no es valido"});
            }
        }

        const [tareas, servicios, propuestas, proximos] = await Promise.all([
            pool.query(
                `select t.*, (t.fecha_prevista < current_date) as vencida,
                        e.tipo_evento, e.fecha::text as fecha_evento, p.nombre as responsable
                 from tarea t
                 join evento e on e.id_evento = t.id_evento
                 join personal p on p.id_personal = t.id_personal
                 where t.estado in ('pendiente', 'en_curso') and e.estado not in ${ESTADOS_CERRADOS}
                   and e.id_empresa = $2 and ($1::int is null or t.id_evento = $1)
                 order by t.fecha_prevista, t.id_tarea`,
                [idEvento, req.usuario.id_empresa]
            ),
            pool.query(
                `select d.id_detalle, d.id_propuesta, d.estado_proveedor, d.cantidad, d.id_proveedor,
                        s.nombre as servicio, pr.nombre as proveedor,
                        e.id_evento, e.tipo_evento, e.fecha::text as fecha_evento
                 from detalle_propuesta d
                 join propuesta p on p.id_propuesta = d.id_propuesta
                 join evento e on e.id_evento = p.id_evento
                 join servicio s on s.id_servicio = d.id_servicio
                 left join proveedor pr on pr.id_proveedor = d.id_proveedor
                 where not d.descartado and d.estado_proveedor <> 'confirmado' and e.estado in ${ESTADOS_ENCARGO}
                   and e.id_empresa = $2 and ($1::int is null or e.id_evento = $1)
                 order by e.fecha nulls last, d.id_detalle`,
                [idEvento, req.usuario.id_empresa]
            ),
            pool.query(
                `select p.id_propuesta, p.total, e.id_evento, e.tipo_evento, e.fecha::text as fecha_evento
                 from propuesta p
                 join evento e on e.id_evento = p.id_evento
                 where p.estado = 'pendiente_aprobacion' and e.estado not in ${ESTADOS_CERRADOS}
                   and e.id_empresa = $2 and ($1::int is null or e.id_evento = $1)
                 order by e.fecha nulls last, p.id_propuesta`,
                [idEvento, req.usuario.id_empresa]
            ),
            pool.query(
                `select e.id_evento, e.tipo_evento, e.fecha::text as fecha, e.sede_prevista, e.estado, e.estado_sede,
                        e.cant_asistentes_estimada
                 from evento e
                 where e.fecha >= current_date and e.estado in ${ESTADOS_ENCARGO}
                   and e.id_empresa = $2 and ($1::int is null or e.id_evento = $1)
                 order by e.fecha, e.id_evento
                 limit 20`,
                [idEvento, req.usuario.id_empresa]
            ),
        ]);

        res.json({
            tareas_vencidas: tareas.rows.filter((t) => t.vencida),
            tareas_pendientes: tareas.rows.filter((t) => !t.vencida),
            servicios_sin_confirmar: servicios.rows,
            propuestas_para_revisar: propuestas.rows,
            eventos_proximos: proximos.rows,
        });

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los pendientes"});
    }
};
