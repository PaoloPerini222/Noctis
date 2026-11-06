import { CheckOutlined, CloseCircleOutlined, CloseOutlined, DeleteOutlined, ExportOutlined, FlagOutlined, LinkOutlined } from "@ant-design/icons";
import { Alert, App, Button, Descriptions, Modal, Popconfirm, Skeleton, Space, Table } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { eventosApi } from "../../api/eventos.js";
import usePermisos from "../../hooks/usePermisos.js";
import { mensajeError } from "../../services/api.js";
import { fechaCorta, moneda } from "../../utils/formato.js";
import { avisarAlCliente, copiar, ESTADOS } from "../../utils/eventos.js";
import { useAuth } from "../../context/AuthContext.jsx";
import Estado from "../Estado.jsx";
import AvisarTodos from "./AvisarTodos.jsx";
import { columnaProveedores } from "./AvisoProveedores.jsx";

const COLUMNAS_SERVICIOS = [
  { title: "Servicio", dataIndex: "nombre", key: "nombre", className: "col-principal" },
  { title: "Equipamiento", dataIndex: "equipamiento", key: "equipamiento", render: (v) => v ?? <span className="muted">—</span> },
  { title: "Precio", dataIndex: "precio", key: "precio", align: "right", render: (v) => (v != null ? moneda(v) : <span className="muted">A consultar</span>) },
];

// Detalles de una reserva o evento, desde la tabla de Eventos: datos del cliente, lo que pidió, los servicios con el total
// y las acciones según el estado (aceptar o rechazar la reserva; marcar realizado o cancelar un evento confirmado).
//   evento   -> fila de la tabla (se vuelve a pedir al back para traer los servicios con su precio)
//            (trae el nombre y el contacto del cliente: cliente_nombre, cliente_telefono, cliente_email)
//   onCambio -> se llama después de cambiar el estado o eliminar, para recargar la tabla
export default function DetalleReserva({ evento, onCerrar, onCambio }) {
  const { message } = App.useApp();
  const permisos = usePermisos();
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState("");

  // Se vuelve a pedir después de registrar la respuesta de un proveedor.
  const cargar = useCallback(
    () => eventosApi.obtenerUno(evento.id_evento).then(setDetalle).catch((e) => setError(mensajeError(e, "No se pudo cargar la reserva"))),
    [evento.id_evento]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Devuelve true si salió bien.
  const ejecutar = async (accion, exito) => {
    try {
      await accion();
      message.success(exito);
      onCambio();
      onCerrar();
      return true;
    } catch (e) {
      message.error(mensajeError(e, "No se pudo completar la acción"));
      return false;
    }
  };
  const cambiarEstado = (estado, exito) => ejecutar(() => eventosApi.editar(evento.id_evento, { estado }), exito);

  const ev = detalle ?? evento;
  // Aceptar o rechazar la reserva y abrir WhatsApp con el cliente para avisarle.
  const responder = (estado, exito) =>
    avisarAlCliente({ evento: ev, empresa: usuario?.empresa ?? "la organizadora", estado, accion: () => cambiarEstado(estado, exito) });
  const avisoWhatsapp = ev.cliente_telefono ? " Se abre WhatsApp para avisarle al cliente." : "";
  const servicios = detalle?.detalle_servicios ?? [];
  // Se puede aceptar aunque algún proveedor no haya confirmado: solo se avisa en la confirmación.
  const faltan = detalle?.servicios_sin_confirmar ?? [];

  const acciones = [];
  if (permisos.esAdmin && ev.estado === "propuesta") {
    acciones.push(
      <Popconfirm key="rechazar" title="¿Rechazar esta reserva?" description={`La fecha vuelve a quedar libre.${avisoWhatsapp}`} okText="Sí, rechazar" cancelText="Volver" okButtonProps={{ danger: true }} onConfirm={() => responder("rechazado", "Reserva rechazada")}>
        <Button danger icon={<CloseOutlined />}>Rechazar</Button>
      </Popconfirm>,
      !detalle ? (
        <Button key="aceptar" type="primary" icon={<CheckOutlined />} disabled>Aceptar</Button>
      ) : (
        <Popconfirm
          key="aceptar"
          title="¿Aceptar esta reserva?"
          description={`${faltan.length ? `Todavía no confirmaron: ${faltan.join(", ")}. Pasa igual a Próximos como evento confirmado.` : "Pasa a Próximos como evento confirmado."}${avisoWhatsapp}`}
          okText="Sí, aceptar"
          cancelText="Volver"
          onConfirm={() => responder("confirmado", "Reserva aceptada: pasó a Próximos")}
        >
          <Button type="primary" icon={<CheckOutlined />}>Aceptar</Button>
        </Popconfirm>
      )
    );
  }
  if (permisos.esAdmin && ev.estado === "confirmado") {
    acciones.push(
      <Popconfirm key="cancelar" title="¿Cancelar el evento?" description="La fecha vuelve a quedar libre." okText="Sí, cancelar" cancelText="Volver" okButtonProps={{ danger: true }} onConfirm={() => cambiarEstado("cancelado", "Evento cancelado")}>
        <Button danger icon={<CloseCircleOutlined />}>Cancelar evento</Button>
      </Popconfirm>,
      <Popconfirm key="realizado" title="¿Marcar el evento como realizado?" okText="Sí, se realizó" cancelText="Volver" onConfirm={() => cambiarEstado("realizado", "Evento cerrado como realizado")}>
        <Button type="primary" icon={<FlagOutlined />}>Marcar realizado</Button>
      </Popconfirm>
    );
  }
  if (permisos.esAdmin && ["propuesta", "rechazado"].includes(ev.estado)) {
    acciones.unshift(
      <Popconfirm key="eliminar" title="¿Eliminar esta reserva?" okText="Eliminar" cancelText="Volver" okButtonProps={{ danger: true }} onConfirm={() => ejecutar(() => eventosApi.eliminar(evento.id_evento), "Reserva eliminada")}>
        <Button type="text" danger icon={<DeleteOutlined />}>Eliminar</Button>
      </Popconfirm>
    );
  }

  return (
    <Modal
      open
      centered
      width={880}
      title={
        <Space size={10} wrap>
          <span>{ev.tipo_evento}</span>
          <Estado estado={ev.estado === "propuesta" ? "reserva nueva" : ev.estado} color={ESTADOS[ev.estado]} />
        </Space>
      }
      onCancel={onCerrar}
      footer={
        <div className="detalle-reserva-pie">
          <Space wrap>
            {ev.token_publico && (
              <Button type="text" icon={<LinkOutlined />} onClick={() => copiar(message, `${window.location.origin}/evento/${ev.token_publico}`, "Link de seguimiento copiado")}>
                Link del cliente
              </Button>
            )}
            <Button type="text" icon={<ExportOutlined />} onClick={() => navigate(`/eventos/${evento.id_evento}`, { state: { desdeDetalle: true } })}>
              Ficha completa
            </Button>
          </Space>
          {acciones.length > 0 && <Space wrap>{acciones}</Space>}
        </div>
      }
    >
      {error && <Alert type="error" showIcon title={error} />}

      <Descriptions
        size="small"
        layout="vertical"
        column={{ xs: 1, sm: 2, md: 3 }}
        className="ficha-datos"
        items={[
          { key: "cliente", label: "Cliente", children: ev.cliente_nombre ?? "—" },
          { key: "telefono", label: "Teléfono", children: ev.cliente_telefono ?? "—" },
          { key: "email", label: "Email", children: ev.cliente_email ?? <span className="muted">No lo dejó</span> },
          { key: "fecha", label: "Fecha", children: ev.fecha ? fechaCorta(ev.fecha) : "Sin fecha" },
          { key: "invitados", label: "Invitados", children: ev.cant_asistentes_estimada != null ? Number(ev.cant_asistentes_estimada).toLocaleString("es-AR") : <span className="muted">Sin indicar</span> },
          { key: "salon", label: "Salón", children: ev.sucursal_nombre ?? ev.sede_prevista ?? <span className="muted">Sin indicar</span> },
          { key: "comentarios", label: "Comentarios", span: "filled", children: ev.necesidades_preferencias ?? <span className="muted">Sin comentarios</span> },
        ]}
      />

      {!detalle && !error ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <>
        <div className="servicios-reserva-bar">
          <AvisarTodos evento={ev} servicios={servicios} onCambio={cargar} />
        </div>
        <Table
          rowKey="id_servicio"
          size="small"
          columns={[...COLUMNAS_SERVICIOS.slice(0, -1), columnaProveedores(ev, cargar), COLUMNAS_SERVICIOS.at(-1)]}
          dataSource={servicios}
          pagination={false}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "Sin servicios elegidos." }}
          summary={() =>
            servicios.length > 0 && (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3} align="right"><b>Precio final</b></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><b className="pub-total">{moneda(detalle.total)}</b></Table.Summary.Cell>
              </Table.Summary.Row>
            )
          }
        />
        </>
      )}
    </Modal>
  );
}
