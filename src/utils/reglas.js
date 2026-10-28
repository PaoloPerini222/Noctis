// Estados en los que el evento ya termino: no se modifican ni su propuesta ni sus servicios.
export const ESTADOS_EVENTO_CERRADOS = ["realizado", "cancelado", "rechazada"];

// Como avanza el estado del evento segun su propuesta (solo mientras el evento es una solicitud).
const ESTADO_EVENTO_POR_PROPUESTA = {
    pendiente_aprobacion: "en_evaluacion",
    enviada: "propuesta_enviada",
    aceptada: "aceptada",
    rechazada: "rechazada",
};
const ESTADOS_SOLICITUD = ["recibida", "en_evaluacion", "propuesta_enviada"];

// Deja el evento en el estado que corresponde a su propuesta. Se llama despues de cualquier cambio
// de la propuesta, incluso los que hace el trigger de la base (por ejemplo, reabrirla al cambiar el total).
export const sincronizarEventoConPropuesta = async (db, idPropuesta) => {
    const propuesta = await db.query(`select estado, id_evento from propuesta where id_propuesta = $1`, [idPropuesta]);
    const datos = propuesta.rows[0];
    const estadoEvento = datos && ESTADO_EVENTO_POR_PROPUESTA[datos.estado];
    if(!estadoEvento){
        return;
    }

    await db.query(
        `update evento set estado = $1 where id_evento = $2 and estado = any($3) and estado <> $1`,
        [estadoEvento, datos.id_evento, ESTADOS_SOLICITUD]
    );
};

// RN-08: un encargo solo se confirma si el cliente acepto y estan registrados servicios, importe y
// condiciones (la fecha, la sede y la cantidad estimada las exige el trigger de la base).
export const validarConfirmacion = async (db, idEvento) => {
    const propuesta = await db.query(
        `select p.estado, p.total, p.condiciones_acordadas,
                (select count(*) from detalle_propuesta d where d.id_propuesta = p.id_propuesta and not d.descartado)::int as servicios
         from propuesta p where p.id_evento = $1`,
        [idEvento]
    );

    const datos = propuesta.rows[0];
    if(!datos || datos.estado !== "aceptada"){
        return "para confirmar el encargo el cliente tiene que haber aceptado la propuesta";
    }
    if(datos.servicios === 0){
        return "para confirmar el encargo la propuesta debe tener al menos un servicio";
    }
    if(!(Number(datos.total) > 0)){
        return "para confirmar el encargo la propuesta debe tener un importe";
    }
    if(!datos.condiciones_acordadas?.trim()){
        return "para confirmar el encargo hay que registrar las condiciones acordadas";
    }

    return null;
};
