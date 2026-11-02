import { Empty, Timeline } from "antd";
import { fechaCorta, moneda } from "../../utils/formato.js";

// Rechazos anteriores de la solicitud: cada vez que el cliente rechazó la propuesta y después retomó el mismo evento
// quedó guardado acá (fecha, motivo si lo explicó e importe que se había propuesto). La propuesta vigente es una sola.
export default function PanelRechazos({ rechazos }) {
  if (!rechazos.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="El cliente no rechazó antes esta solicitud." />;
  }

  return (
    <div className="panel-evento">
      <Timeline
        items={rechazos.map((r) => ({
          key: r.id_rechazo,
          color: "red",
          content: (
            <div className="cambio">
              <div>
                <b>{r.fecha_rechazo ? `Rechazada el ${fechaCorta(r.fecha_rechazo)}` : "Rechazada"}</b>
                <span className="muted"> · reabierta el {fechaCorta(r.fecha_reapertura)} por {r.reabierto_por_nombre}</span>
              </div>
              <p>{r.motivo ?? <span className="muted">El cliente no explicó el motivo.</span>}</p>
              {r.total_propuesto != null && <p className="muted">Se había propuesto {moneda(r.total_propuesto)}.</p>}
            </div>
          ),
        }))}
      />
    </div>
  );
}
