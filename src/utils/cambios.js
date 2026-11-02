// Cambios relevantes del encargo que el sistema deja anotados solo, para que nadie se quede sin enterarse.
// Solo registra el cambio: revisar proveedores, sede y tareas, y anotar su situacion real, lo hace una persona.

const fechaLegible = (fecha) => (fecha ? String(fecha).slice(0, 10).split("-").reverse().join("/") : "sin fecha");
const valorSede = (sede) => sede || "sin definir";

// Que cambio entre el evento guardado y el editado. Solo importa una vez que el encargo esta confirmado:
// antes los datos todavia se estan acordando. Cambia la fecha, cambia la sede o la sede confirmada deja de estarlo.
// La cantidad de asistentes no se anota sola: si el cambio es importante lo decide el organizador.
export const cambiosDelEvento = (antes, despues) => {
    const cambios = [];

    if((antes.fecha ?? null) !== (despues.fecha ?? null)){
        cambios.push({tipo: "Fecha", descripcion: `La fecha pasó de ${fechaLegible(antes.fecha)} a ${fechaLegible(despues.fecha)}.`});
    }

    const detalleSede = [];
    if((antes.sede_prevista ?? null) !== (despues.sede_prevista ?? null)){
        detalleSede.push(`La sede pasó de ${valorSede(antes.sede_prevista)} a ${valorSede(despues.sede_prevista)}.`);
    }
    if(antes.estado_sede === "confirmada" && despues.estado_sede !== "confirmada"){
        detalleSede.push(`La disponibilidad de la sede pasó de confirmada a ${despues.estado_sede.replace("_", " ")}.`);
    }
    if(detalleSede.length > 0){
        cambios.push({tipo: "Sede", descripcion: detalleSede.join(" ")});
    }

    return cambios;
};

export const registrarCambio = (db, {idEvento, tipo, descripcion, registradoPor}) =>
    db.query(
        `insert into cambio_evento (id_evento, tipo_cambio, descripcion, registrado_por) values ($1, $2, $3, $4)`,
        [idEvento, tipo, descripcion.slice(0, 500), registradoPor]
    );
