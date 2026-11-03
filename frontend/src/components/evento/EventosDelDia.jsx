import { EnvironmentOutlined, EyeOutlined } from "@ant-design/icons";
import { Button, Modal } from "antd";
import { fechaCorta } from "../../utils/formato.js";
import { ESTADOS } from "../../utils/eventos.js";
import Estado from "../Estado.jsx";

// Eventos de un día del calendario, con su salón (el mismo día puede haber un evento en cada salón).
//   onElegir(evento) -> abre los Detalles de ese evento
export default function EventosDelDia({ fecha, eventos, onElegir, onCerrar }) {
  return (
    <Modal open centered width={520} footer={null} onCancel={onCerrar} title={`Eventos del ${fechaCorta(fecha)}`}>
      <div className="eventos-dia">
        {eventos.map((e) => (
          <div key={e.id_evento} className="eventos-dia-item">
            <div>
              <b>{e.sucursal_nombre ?? e.sede_prevista ?? "Sin salón"}</b>
              <span>{e.tipo_evento}{e.cliente_nombre ? ` · ${e.cliente_nombre}` : ""}</span>
              {e.sucursal_direccion && (
                <span className="muted">
                  <EnvironmentOutlined /> {e.sucursal_direccion}
                </span>
              )}
            </div>
            <div className="eventos-dia-acciones">
              <Estado estado={e.estado === "propuesta" ? "reserva nueva" : e.estado} color={ESTADOS[e.estado]} />
              <Button size="small" icon={<EyeOutlined />} onClick={() => onElegir(e)}>
                Detalles
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
