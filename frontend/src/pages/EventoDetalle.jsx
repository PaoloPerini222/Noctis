import { ArrowLeftOutlined, CheckOutlined, CloseCircleOutlined, EditOutlined, FlagOutlined, LinkOutlined } from "@ant-design/icons";
import { Alert, App, Button, Descriptions, Popconfirm, Result, Skeleton, Space, Tabs, Tag } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { cierreApi, eventosApi } from "../api/eventos.js";
import { detalleApi, propuestasApi } from "../api/propuestas.js";
import PanelCambios from "../components/evento/PanelCambios.jsx";
import PanelCierre from "../components/evento/PanelCierre.jsx";
import PanelExclusiones from "../components/evento/PanelExclusiones.jsx";
import PanelPropuesta from "../components/evento/PanelPropuesta.jsx";
import Estado from "../components/Estado.jsx";
import FormModal from "../components/FormModal.jsx";
import TablaTareas from "../components/TablaTareas.jsx";
import useCatalogos from "../hooks/useCatalogos.js";
import usePermisos from "../hooks/usePermisos.js";
import { mensajeError } from "../services/api.js";
import { diasHasta, fechaCorta } from "../utils/formato.js";
import { camposEvento, colorDe, ESTADOS } from "./Eventos.jsx";

const CERRADOS = ["realizado", "cancelado"];

// Ficha de un evento: todo lo del encargo en un solo lugar, para no confundir los compromisos de un evento
// con los de otro. Arriba los datos y las acciones del evento; abajo, pestañas con la propuesta y sus
// servicios, las tareas, los cambios relevantes, los servicios descartados y el cierre.
// La pestaña activa va en la URL (?tab=tareas) para poder enlazar directo desde Pendientes.
export default function EventoDetalle() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { message } = App.useApp();
  const permisos = usePermisos();
  const { clientes, personal, nombreCliente, nombrePersona } = useCatalogos(["clientes", "personal"]);

  const [evento, setEvento] = useState(null);
  const [propuesta, setPropuesta] = useState(null);
  const [detalles, setDetalles] = useState([]);
  const [cierre, setCierre] = useState(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | "editar" | "cancelar"

  // Trae el evento, su propuesta (con los servicios) y su cierre. Se llama de nuevo después de cada acción.
  const cargar = useCallback(async () => {
    setError("");
    try {
      const [ev, propuestas] = await Promise.all([eventosApi.obtenerUno(id), propuestasApi.obtenerTodos()]);
      const prop = propuestas.find((p) => p.id_evento === ev.id_evento) ?? null;
      const [det, cie] = await Promise.all([
        prop ? detalleApi(prop.id_propuesta).obtenerTodos() : [],
        CERRADOS.includes(ev.estado) ? cierreApi(ev.id_evento).obtener().catch(() => null) : null,
      ]);
      setEvento(ev);
      setPropuesta(prop);
      setDetalles(det);
      setCierre(cie);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar el evento"));
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const campos = useMemo(() => camposEvento({ clientes, personal, yo: permisos.yo, conCliente: false }), [clientes, personal, permisos.yo]);

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

  const esDueno = permisos.esDuenoDe(evento);
  const cerrado = CERRADOS.includes(evento.estado);
  const dias = evento.fecha ? diasHasta(evento.fecha) : null;

  // Ejecuta una acción, avisa el resultado (o el motivo por el que el back no la permitió) y recarga.
  const ejecutar = async (accion, exito) => {
    try {
      await accion();
      message.success(exito);
      cargar();
    } catch (e) {
      message.error(mensajeError(e, "No se pudo completar la acción"));
    }
  };

  const copiarLink = async () => {
    const url = `${window.location.origin}/evento/${evento.token_publico}`;
    try {
      await navigator.clipboard.writeText(url);
      message.success("Enlace para el cliente copiado");
    } catch {
      window.prompt("Copiá el enlace del evento", url);
    }
  };

  // Acciones del evento según su estado y quién mira.
  const acciones = [];
  if (esDueno && !cerrado && evento.estado !== "rechazada") {
    acciones.push(<Button key="editar" icon={<EditOutlined />} onClick={() => setModal("editar")}>Editar datos</Button>);
  }
  if (esDueno && evento.estado === "aceptada") {
    acciones.push(
      <Button key="confirmar" type="primary" icon={<CheckOutlined />} onClick={() => ejecutar(() => eventosApi.editar(evento.id_evento, { estado: "confirmado" }), "Encargo confirmado")}>
        Confirmar encargo
      </Button>
    );
  }
  if (esDueno && evento.estado === "confirmado") {
    acciones.push(
      <Button key="preparacion" type="primary" onClick={() => ejecutar(() => eventosApi.editar(evento.id_evento, { estado: "preparacion" }), "Evento en preparación")}>
        Pasar a preparación
      </Button>
    );
  }
  if (esDueno && ["confirmado", "preparacion"].includes(evento.estado)) {
    acciones.push(
      <Popconfirm key="realizado" title="¿Marcar el evento como realizado?" okText="Sí, se realizó" cancelText="Cancelar" onConfirm={() => ejecutar(() => cierreApi(evento.id_evento).cerrar({ resultado: "realizado" }), "Evento cerrado como realizado")}>
        <Button icon={<FlagOutlined />}>Marcar realizado</Button>
      </Popconfirm>
    );
  }
  // Cancela su organizador (a pedido del cliente) o la responsable (también si es por la organizadora).
  if ((esDueno || permisos.esResponsable) && !cerrado && evento.estado !== "rechazada") {
    acciones.push(<Button key="cancelar" danger icon={<CloseCircleOutlined />} onClick={() => setModal("cancelar")}>Cancelar evento</Button>);
  }
  if (evento.token_publico) {
    acciones.push(<Button key="link" type="text" className="boton-enlace" icon={<LinkOutlined />} onClick={copiarLink}>Enlace del cliente</Button>);
  }

  const origenes = [
    ...(esDueno || permisos.esResponsable ? [{ value: "cliente", label: "Lo pidió el cliente" }] : []),
    ...(permisos.esResponsable ? [{ value: "organizadora", label: "La organizadora no puede llevarlo adelante" }] : []),
  ];

  const editarEvento = async (valores) => {
    try {
      await eventosApi.editar(evento.id_evento, valores);
    } catch (e) {
      throw new Error(mensajeError(e, "No se pudo guardar el evento"));
    }
    message.success("Evento actualizado");
    cargar();
  };

  const cancelarEvento = async (valores) => {
    try {
      await cierreApi(evento.id_evento).cerrar({ resultado: "cancelado", ...valores });
    } catch (e) {
      throw new Error(mensajeError(e, "No se pudo cancelar el evento"));
    }
    message.success("Evento cancelado. Las tareas abiertas se cancelaron y quedaron los avisos a proveedores.");
    setParams({ tab: "cierre" });
    cargar();
  };

  const pestanas = [
    {
      key: "propuesta",
      label: "Propuesta y servicios",
      children: <PanelPropuesta evento={evento} propuesta={propuesta} detalles={detalles} onCambio={cargar} />,
    },
    { key: "tareas", label: "Tareas", children: <TablaTareas evento={evento} servicios={detalles} /> },
    { key: "cambios", label: "Cambios", children: <PanelCambios evento={evento} /> },
    { key: "exclusiones", label: "Servicios descartados", children: <PanelExclusiones evento={evento} /> },
    ...(cierre ? [{ key: "cierre", label: "Cierre", children: <PanelCierre evento={evento} cierre={cierre} onCambio={cargar} /> }] : []),
  ];
  const tab = pestanas.some((p) => p.key === params.get("tab")) ? params.get("tab") : "propuesta";

  return (
    <main className="main">
      <Link to="/eventos" className="volver">
        <ArrowLeftOutlined /> Eventos
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
            <Estado estado={evento.estado} color={ESTADOS[evento.estado]} />
            {esDueno && <Tag color="magenta">Lo organizás vos</Tag>}
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
          { key: "cliente", label: "Cliente", children: nombreCliente(evento.id_cliente) },
          { key: "organizador", label: "Organizador", children: evento.id_organizador === permisos.yo ? "Vos" : nombrePersona(evento.id_organizador) },
          { key: "asistentes", label: "Asistentes estimados", children: evento.cant_asistentes_estimada != null ? Number(evento.cant_asistentes_estimada).toLocaleString("es-AR") : <span className="muted">Pendiente de aclaración</span> },
          { key: "sede", label: "Sede", children: evento.sede_prevista ?? <span className="muted">Pendiente de aclaración</span> },
          { key: "estado_sede", label: "Disponibilidad de la sede", children: <Estado estado={evento.estado_sede} color={evento.estado_sede === "confirmada" ? "var(--lime)" : "var(--amber)"} /> },
          { key: "fecha", label: "Fecha", children: evento.fecha ? fechaCorta(evento.fecha) : <span className="muted">Pendiente de aclaración</span> },
          { key: "necesidades", label: "Necesidades y preferencias", span: "filled", children: evento.necesidades_preferencias ?? "—" },
        ]}
      />

      <Tabs activeKey={tab} onChange={(key) => setParams({ tab: key })} items={pestanas} className="evento-tabs" />

      {modal === "editar" && (
        <FormModal titulo="Editar evento" campos={campos} item={evento} onGuardar={editarEvento} onCerrar={() => setModal(null)} />
      )}
      {modal === "cancelar" && (
        <FormModal
          titulo="Cancelar el evento"
          campos={[
            { name: "origen_cancelacion", label: "¿Quién lo cancela?", type: "select", required: true, full: true, options: origenes },
            { name: "motivo_cancelacion", label: "Motivo", type: "textarea", required: true },
            { name: "observaciones", label: "Observaciones", type: "textarea", ayuda: "Ej.: cómo se le comunicó al cliente. Las penalidades y devoluciones quedan fuera del sistema." },
          ]}
          item={null}
          onGuardar={cancelarEvento}
          onCerrar={() => setModal(null)}
        />
      )}
    </main>
  );
}
