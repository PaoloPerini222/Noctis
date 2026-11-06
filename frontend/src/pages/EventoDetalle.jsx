import { ArrowLeftOutlined, CheckOutlined, CloseCircleOutlined, CloseOutlined, EditOutlined, FlagOutlined, LinkOutlined } from "@ant-design/icons";
import { Alert, App, Button, Descriptions, Empty, Popconfirm, Result, Skeleton, Space, Table, Tabs } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { eventosApi } from "../api/eventos.js";
import AvisarTodos from "../components/evento/AvisarTodos.jsx";
import { columnaProveedores } from "../components/evento/AvisoProveedores.jsx";
import PanelCambios from "../components/evento/PanelCambios.jsx";
import Estado, { COLORES_SEDE } from "../components/Estado.jsx";
import FormModal from "../components/FormModal.jsx";
import useCatalogos from "../hooks/useCatalogos.js";
import usePermisos from "../hooks/usePermisos.js";
import { mensajeError } from "../services/api.js";
import { contacto, diasHasta, fechaCorta, moneda } from "../utils/formato.js";
import { avisarAlCliente, CERRADOS, colorDe, copiar, ESTADOS } from "../utils/eventos.js";
import { useAuth } from "../context/AuthContext.jsx";
import { camposEvento } from "./Eventos.jsx";

// Columnas de la tabla de servicios elegidos en la reserva.
const COLUMNAS_SERVICIOS = [
  { title: "Servicio", dataIndex: "nombre", key: "nombre", className: "col-principal" },
  { title: "Equipamiento", dataIndex: "equipamiento", key: "equipamiento", render: (v) => v ?? <span className="muted">—</span> },
  { title: "Precio", dataIndex: "precio", key: "precio", align: "right", render: (v) => (v != null ? moneda(v) : <span className="muted">A consultar</span>) },
];

// Ficha de un evento. Una reserva entra como "propuesta": un admin la acepta (queda confirmada) o la rechaza.
// Un evento confirmado termina realizado o cancelado. Abajo, pestañas con los servicios elegidos y los cambios.
// La pestaña activa va en la URL (?tab=cambios) para poder enlazarla directo.
export default function EventoDetalle() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  // Si se llegó desde la card de Detalles, volver reabre esa card en vez de la lista.
  const desdeDetalle = useLocation().state?.desdeDetalle;
  const { message } = App.useApp();
  const permisos = usePermisos();
  const { usuario } = useAuth();
  const { clientes, personal, servicios, sucursales, nombreCliente, nombrePersona, cliente: datosCliente, persona: datosPersona } = useCatalogos(["clientes", "personal", "servicios", "sucursales"]);

  const [evento, setEvento] = useState(null);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(false);

  // Trae el evento con sus servicios. Se llama de nuevo después de cada acción.
  const cargar = useCallback(async () => {
    setError("");
    try {
      setEvento(await eventosApi.obtenerUno(id));
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar el evento"));
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const campos = useMemo(() => camposEvento({ clientes, personal, servicios, sucursales, conCliente: false }), [clientes, personal, servicios, sucursales]);

  if (error && !evento) {
    return (
      <main className="main">
        <Result status="warning" title={error} extra={<Link to="/eventos"><Button>Volver a eventos</Button></Link>} />
      </main>
    );
  }
  if (!evento) {
    return (
      <main className="main">
        <Skeleton active paragraph={{ rows: 6 }} />
      </main>
    );
  }

  const puede = permisos.esAdmin;
  const cerrado = CERRADOS.includes(evento.estado);
  const dias = evento.fecha ? diasHasta(evento.fecha) : null;

  // Cambia el estado del evento, avisa el resultado (o el motivo por el que el back no lo permitió) y recarga.
  // Devuelve true si salió bien.
  const cambiarEstado = async (estado, exito) => {
    try {
      setEvento(await eventosApi.editar(evento.id_evento, { estado }));
      message.success(exito);
      return true;
    } catch (e) {
      message.error(mensajeError(e, "No se pudo cambiar el estado"));
      return false;
    }
  };
  // Aceptar o rechazar la reserva y abrir WhatsApp con el cliente para avisarle.
  const responder = (estado, exito) =>
    avisarAlCliente({ evento, empresa: usuario?.empresa ?? "la organizadora", estado, accion: () => cambiarEstado(estado, exito) });
  const avisoWhatsapp = evento.cliente_telefono ? " Se abre WhatsApp para avisarle al cliente." : "";

  // Acciones del evento según su estado.
  const acciones = [];
  if (puede && evento.estado === "propuesta") {
    acciones.push(
      // Se puede aceptar aunque algún proveedor no haya confirmado: solo se avisa en la confirmación.
      <Popconfirm
        key="aceptar"
        title="¿Aceptar esta reserva?"
        description={`${evento.servicios_sin_confirmar?.length
          ? `Todavía no confirmaron: ${evento.servicios_sin_confirmar.join(", ")}. El evento queda igual confirmado para esa fecha.`
          : "El evento queda confirmado para esa fecha."}${avisoWhatsapp}`}
        okText="Sí, aceptar"
        cancelText="Volver"
        onConfirm={() => responder("confirmado", "Reserva aceptada: el evento quedó confirmado")}
      >
        <Button type="primary" icon={<CheckOutlined />}>Aceptar reserva</Button>
      </Popconfirm>,
      <Popconfirm key="rechazar" title="¿Rechazar esta reserva?" description={`La fecha vuelve a quedar libre.${avisoWhatsapp}`} okText="Sí, rechazar" cancelText="Volver" okButtonProps={{ danger: true }} onConfirm={() => responder("rechazado", "Reserva rechazada")}>
        <Button danger icon={<CloseOutlined />}>Rechazar</Button>
      </Popconfirm>
    );
  }
  if (puede && evento.estado === "confirmado") {
    acciones.push(
      <Popconfirm key="realizado" title="¿Marcar el evento como realizado?" okText="Sí, se realizó" cancelText="Volver" onConfirm={() => cambiarEstado("realizado", "Evento cerrado como realizado")}>
        <Button type="primary" icon={<FlagOutlined />}>Marcar realizado</Button>
      </Popconfirm>,
      <Popconfirm key="cancelar" title="¿Cancelar el evento?" description="La fecha vuelve a quedar libre." okText="Sí, cancelar" cancelText="Volver" okButtonProps={{ danger: true }} onConfirm={() => cambiarEstado("cancelado", "Evento cancelado")}>
        <Button danger icon={<CloseCircleOutlined />}>Cancelar evento</Button>
      </Popconfirm>
    );
  }
  if (puede && !cerrado) {
    acciones.push(<Button key="editar" icon={<EditOutlined />} onClick={() => setEditando(true)}>Editar datos</Button>);
  }
  if (evento.token_publico) {
    acciones.push(
      <Button
        key="link"
        type="text"
        className="boton-enlace"
        icon={<LinkOutlined />}
        onClick={() => copiar(message, `${window.location.origin}/evento/${evento.token_publico}`, "Link de seguimiento copiado")}
      >
        Link del cliente
      </Button>
    );
  }

  const editarEvento = async (valores) => {
    try {
      setEvento(await eventosApi.editar(evento.id_evento, valores));
    } catch (e) {
      throw new Error(mensajeError(e, "No se pudo guardar el evento"));
    }
    message.success("Evento actualizado");
  };

  const detalle = evento.detalle_servicios ?? [];
  const pestanas = [
    {
      key: "servicios",
      label: `Servicios (${detalle.length})`,
      children: (
        <>
        <div className="servicios-reserva-bar">
          <AvisarTodos evento={evento} servicios={detalle} onCambio={cargar} />
        </div>
        <Table
          rowKey="id_servicio"
          columns={[...COLUMNAS_SERVICIOS.slice(0, -1), columnaProveedores(evento, cargar), COLUMNAS_SERVICIOS.at(-1)]}
          dataSource={detalle}
          pagination={false}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="La reserva no tiene servicios." /> }}
          summary={() =>
            detalle.length > 0 && (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3} align="right"><b>Total</b></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><b>{moneda(evento.total)}</b></Table.Summary.Cell>
              </Table.Summary.Row>
            )
          }
        />
        </>
      ),
    },
    // key: al cambiar de estado se vuelve a cargar el historial (el cambio de estado queda anotado solo).
    { key: "cambios", label: "Cambios", children: <PanelCambios key={evento.estado} evento={evento} /> },
  ];
  const tab = pestanas.some((p) => p.key === params.get("tab")) ? params.get("tab") : "servicios";

  return (
    <main className="main">
      <Link to={desdeDetalle ? `/eventos?ver=${evento.id_evento}` : "/eventos"} className="volver">
        <ArrowLeftOutlined /> {desdeDetalle ? "Volver a la reserva" : "Eventos"}
      </Link>

      <div className="page-head evento-head">
        <div>
          <div className="eyebrow">
            {evento.fecha ? fechaCorta(evento.fecha).toUpperCase() : "SIN FECHA"}
            {dias != null && dias >= 0 && !cerrado ? ` · ${dias === 0 ? "HOY" : dias === 1 ? "MAÑANA" : `EN ${dias} DÍAS`}` : ""}
          </div>
          <h1 className="bar-name" style={{ "--c": colorDe(evento) }}>
            <i />
            {evento.tipo_evento}
          </h1>
          <Space size={6} wrap>
            <Estado estado={evento.estado === "propuesta" ? "reserva por aceptar" : evento.estado} color={ESTADOS[evento.estado]} />
          </Space>
        </div>
        {acciones.length > 0 && <Space wrap className="evento-acciones">{acciones}</Space>}
      </div>

      {error && <Alert type="error" showIcon title={error} />}

      <Descriptions
        size="small"
        layout="vertical"
        column={{ xs: 1, sm: 2, lg: 3 }}
        className="ficha-datos ficha-evento"
        items={[
          {
            key: "cliente", label: "Cliente",
            children: (
              <div className="dato-contacto">
                <span>{nombreCliente(evento.id_cliente)}</span>
                <span className="muted">{contacto(datosCliente(evento.id_cliente)?.telefono, datosCliente(evento.id_cliente)?.email)}</span>
              </div>
            ),
          },
          {
            key: "organizador", label: "A cargo",
            children: evento.id_organizador == null ? (
              <span className="muted">Sin asignar (queda a cargo el admin que acepte la reserva)</span>
            ) : (
              <div className="dato-contacto">
                <span>{evento.id_organizador === permisos.yo ? "Vos" : nombrePersona(evento.id_organizador)}</span>
                <span className="muted">{contacto(datosPersona(evento.id_organizador)?.telefono, datosPersona(evento.id_organizador)?.email_contacto)}</span>
              </div>
            ),
          },
          { key: "total", label: "Total de la reserva", children: detalle.length ? moneda(evento.total) : <span className="muted">Sin servicios</span> },
          { key: "fecha", label: "Fecha", children: evento.fecha ? fechaCorta(evento.fecha) : <span className="muted">Pendiente</span> },
          { key: "asistentes", label: "Asistentes estimados", children: evento.cant_asistentes_estimada != null ? Number(evento.cant_asistentes_estimada).toLocaleString("es-AR") : <span className="muted">Sin indicar</span> },
          { key: "salon", label: "Salón", children: evento.sucursal_nombre ? `${evento.sucursal_nombre}${evento.sucursal_direccion ? ` · ${evento.sucursal_direccion}` : ""}` : evento.sede_prevista ?? <span className="muted">Sin indicar</span> },
          { key: "estado_sede", label: "Disponibilidad de la sede", children: <Estado estado={evento.estado_sede === "pendiente" ? "pendiente de consulta" : evento.estado_sede} color={COLORES_SEDE[evento.estado_sede]} /> },
          { key: "necesidades", label: "Comentarios del cliente", span: "filled", children: evento.necesidades_preferencias ?? "—" },
        ]}
      />

      <Tabs activeKey={tab} onChange={(key) => setParams({ tab: key })} items={pestanas} className="evento-tabs" />

      {editando && (
        <FormModal titulo="Editar evento" campos={campos} item={evento} onGuardar={editarEvento} onCerrar={() => setEditando(false)} />
      )}
    </main>
  );
}
