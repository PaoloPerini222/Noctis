import { CheckOutlined, CloseOutlined, WhatsAppOutlined } from "@ant-design/icons";
import { App, Button, Space, Tooltip } from "antd";
import { Link } from "react-router-dom";
import { responderProveedor } from "../../api/eventos.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { mensajeError } from "../../services/api.js";
import { CERRADOS, linkWhatsapp, mensajeProveedor, RESPUESTAS } from "../../utils/eventos.js";
import Estado from "../Estado.jsx";

// Un proveedor de la reserva: botón de WhatsApp con la consulta de disponibilidad ya escrita (al abrirlo queda
// "Esperando respuesta"), lo que contestó y los botones para registrar su respuesta (disponible o no).
//   servicios -> los servicios de la reserva que ofrece este proveedor (se le consulta por todos juntos)
//   onCambio  -> se llama después de registrar algo, para recargar la reserva
export function FilaProveedor({ proveedor, servicios, evento, onCambio }) {
  const { usuario } = useAuth();
  const { message } = App.useApp();
  const link = linkWhatsapp(proveedor.telefono, mensajeProveedor({ proveedor, servicios, evento, empresa: usuario?.empresa ?? "la organizadora" }));
  const respuesta = RESPUESTAS[proveedor.respuesta];
  const abierto = !CERRADOS.includes(evento.estado);

  const registrar = async (estado) => {
    try {
      await responderProveedor(evento.id_evento, proveedor.id_proveedor, estado);
      if (estado !== "avisado") message.success(`${proveedor.nombre}: ${RESPUESTAS[estado].texto.toLowerCase()}`);
      onCambio?.();
    } catch (e) {
      message.error(mensajeError(e, "No se pudo registrar la respuesta"));
    }
  };

  return (
    <div className="fila-proveedor">
      <Tooltip title={link ? `Consultarle a ${proveedor.nombre} por WhatsApp` : "El teléfono del proveedor no es válido"}>
        <Button
          size="small"
          className="boton-whatsapp"
          icon={<WhatsAppOutlined />}
          href={link ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          disabled={!link}
          onClick={() => abierto && registrar("avisado")}
        >
          {proveedor.nombre}
        </Button>
      </Tooltip>
      {respuesta && <Estado estado={respuesta.texto} color={respuesta.color} />}
      {abierto && proveedor.respuesta && (
        <Space size={2}>
          <Tooltip title="Contestó que puede">
            <Button size="small" type="text" icon={<CheckOutlined />} aria-label="Disponible" disabled={proveedor.respuesta === "disponible"} onClick={() => registrar("disponible")} />
          </Tooltip>
          <Tooltip title="Contestó que no puede">
            <Button size="small" type="text" danger icon={<CloseOutlined />} aria-label="No disponible" disabled={proveedor.respuesta === "no_disponible"} onClick={() => registrar("no_disponible")} />
          </Tooltip>
        </Space>
      )}
    </div>
  );
}

// Proveedores de un servicio reservado, cada uno con su consulta y su respuesta.
export default function AvisoProveedores({ servicio, evento, onCambio }) {
  const proveedores = servicio.proveedores ?? [];

  if (proveedores.length === 0) {
    return <Link to="/proveedores" className="muted">Sin proveedor (lo presta la organizadora)</Link>;
  }

  return (
    <div className="proveedores-servicio">
      {proveedores.map((p) => (
        <FilaProveedor key={p.id_proveedor} proveedor={p} servicios={[servicio]} evento={evento} onCambio={onCambio} />
      ))}
    </div>
  );
}

// Columna "Proveedor" para las tablas de servicios de una reserva.
export const columnaProveedores = (evento, onCambio) => ({
  title: "Proveedor",
  key: "proveedor",
  render: (_, servicio) => <AvisoProveedores servicio={servicio} evento={evento} onCambio={onCambio} />,
});
