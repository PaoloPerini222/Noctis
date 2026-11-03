import { SendOutlined, WhatsAppOutlined } from "@ant-design/icons";
import { Alert, App, Button, Modal, Tag } from "antd";
import { useState } from "react";
import { responderProveedor } from "../../api/eventos.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { mensajeError } from "../../services/api.js";
import { linkWhatsapp, mensajeProveedor, proveedoresDeLaReserva } from "../../utils/eventos.js";
import { FilaProveedor } from "./AvisoProveedores.jsx";

// Consultar a todos los proveedores de una reserva si pueden ese día: un mensaje por proveedor, con todos los servicios
// suyos que eligió el cliente. WhatsApp no permite mandar a varios contactos de una vez (y el navegador bloquea abrir
// varias pestañas con un solo clic), así que "Consultar al siguiente" abre los chats de a uno. Las respuestas se
// registran acá mismo; cuando todos confirmaron, la reserva se puede aceptar.
export default function AvisarTodos({ evento, servicios, onCambio }) {
  const { usuario } = useAuth();
  const { message } = App.useApp();
  const [abierto, setAbierto] = useState(false);

  const avisos = proveedoresDeLaReserva(servicios);
  if (avisos.length === 0) return null;

  const respuestaDe = (aviso) => aviso.servicios[0]?.proveedores.find((p) => p.id_proveedor === aviso.proveedor.id_proveedor)?.respuesta ?? null;
  const sinConsultar = avisos.filter((a) => respuestaDe(a) === null);
  const confirmados = avisos.filter((a) => respuestaDe(a) === "disponible").length;
  const faltan = evento.servicios_sin_confirmar ?? [];

  const consultarSiguiente = async () => {
    const { proveedor, servicios: suyos } = sinConsultar[0];
    const link = linkWhatsapp(proveedor.telefono, mensajeProveedor({ proveedor, servicios: suyos, evento, empresa: usuario?.empresa ?? "la organizadora" }));
    if (!link) {
      message.error(`El teléfono de ${proveedor.nombre} no es válido: corregilo en Proveedores.`);
      return;
    }
    window.open(link, "_blank", "noopener");
    try {
      await responderProveedor(evento.id_evento, proveedor.id_proveedor, "avisado");
      onCambio?.();
    } catch (e) {
      message.error(mensajeError(e, "No se pudo registrar la consulta"));
    }
  };

  return (
    <>
      <Button className="boton-whatsapp" icon={<WhatsAppOutlined />} onClick={() => setAbierto(true)}>
        Consultar a los proveedores ({confirmados}/{avisos.length} confirmaron)
      </Button>

      {abierto && (
        <Modal
          open
          centered
          width={620}
          title="Consultar a los proveedores"
          onCancel={() => setAbierto(false)}
          footer={
            <div className="avisar-todos-pie">
              <span className="muted">{confirmados} de {avisos.length} confirmaron</span>
              <Button type="primary" icon={<SendOutlined />} disabled={sinConsultar.length === 0} onClick={consultarSiguiente}>
                {sinConsultar.length === 0 ? "Ya consultaste a todos" : sinConsultar.length === avisos.length ? "Consultar al primero" : "Consultar al siguiente"}
              </Button>
            </div>
          }
        >
          {faltan.length === 0 ? (
            <Alert type="success" showIcon title="Todos los servicios tienen un proveedor disponible: ya podés aceptar la reserva." />
          ) : (
            <Alert
              type="info"
              showIcon
              title={`Falta que confirmen: ${faltan.join(", ")}.`}
              description="Se abre un chat de WhatsApp por proveedor con la consulta lista. Cuando te contesten, marcá ✓ (puede) o ✗ (no puede). Si uno no puede, consultale a otro del mismo servicio. Consultar es opcional: podés aceptar la reserva igual."
            />
          )}
          <div className="avisar-todos-lista">
            {avisos.map((aviso) => (
              <div key={aviso.proveedor.id_proveedor} className="avisar-todos-item">
                <div>
                  <FilaProveedor
                    proveedor={{ ...aviso.proveedor, respuesta: respuestaDe(aviso) }}
                    servicios={aviso.servicios}
                    evento={evento}
                    onCambio={onCambio}
                  />
                  <div>{aviso.servicios.map((s) => <Tag key={s.id_servicio}>{s.nombre}</Tag>)}</div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
