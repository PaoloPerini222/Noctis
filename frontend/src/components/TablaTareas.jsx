import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, App, Button, Empty, Popconfirm, Segmented, Select, Space, Table, Tooltip } from "antd";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { tareasApi } from "../api/tareas.js";
import useCatalogos from "../hooks/useCatalogos.js";
import usePermisos from "../hooks/usePermisos.js";
import useRecurso from "../hooks/useRecurso.js";
import { mensajeError } from "../services/api.js";
import { etiqueta, fechaCorta } from "../utils/formato.js";
import Estado from "./Estado.jsx";
import FormModal from "./FormModal.jsx";

// Estado de la tarea -> color de su etiqueta.
export const ESTADOS_TAREA = {
  pendiente: "var(--amber)",
  en_curso: "var(--cyan)",
  terminada: "var(--lime)",
  cancelada: "var(--red)",
};

const EVENTOS_CERRADOS = ["realizado", "cancelado", "rechazada"];

// Pestañas de la vista general: cada responsable ve primero lo suyo.
const FILTROS = [
  { id: "mias", label: "Mis tareas", test: (t, yo) => t.id_personal === yo },
  { id: "abiertas", label: "Abiertas", test: (t) => t.estado === "pendiente" || t.estado === "en_curso" },
  { id: "vencidas", label: "Vencidas", test: (t) => t.vencida },
  { id: "todas", label: "Todas", test: () => true },
];

// Tabla de tareas con alta/edición (organizador del evento) y cambio de estado
// (quien tiene la tarea o un coordinador).
//   evento    -> si viene, muestra solo las tareas de ese evento (ficha del evento)
//   servicios -> servicios de la propuesta del evento, para ligar la tarea a uno
//   busqueda  -> texto del buscador de la página
export default function TablaTareas({ evento, servicios = [], busqueda = "" }) {
  const { message } = App.useApp();
  const permisos = usePermisos();
  const { items, cargando, error, recargar, eliminar } = useRecurso(tareasApi, "id_tarea");
  const { eventos, personal, nombreEvento, nombrePersona } = useCatalogos(["eventos", "personal"]);
  const [filtro, setFiltro] = useState("mias");
  const [editando, setEditando] = useState(null); // null | "nuevo" | tarea

  const eventoDe = (t) => evento ?? eventos.find((e) => e.id_evento === t.id_evento);
  const puedeGestionar = (t) => permisos.esDuenoDe(eventoDe(t));
  const eventoCerrado = evento && EVENTOS_CERRADOS.includes(evento.estado);

  // Eventos donde el usuario puede asignar tareas: los suyos que siguen abiertos.
  const misEventos = eventos.filter((e) => permisos.esDuenoDe(e) && !EVENTOS_CERRADOS.includes(e.estado));
  const puedeCrear = evento ? permisos.esDuenoDe(evento) && !eventoCerrado : permisos.esOrganizador && misEventos.length > 0;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items
      .filter((t) => (evento ? t.id_evento === evento.id_evento : FILTROS.find((f) => f.id === filtro).test(t, permisos.yo)))
      .filter((t) => !q || `${t.descripcion} ${nombreEvento(t.id_evento)}`.toLowerCase().includes(q))
      .sort((a, b) => String(a.fecha_prevista).localeCompare(String(b.fecha_prevista)));
  }, [items, evento, filtro, busqueda, permisos.yo, nombreEvento]);

  const cambiarEstado = async (tarea, estado) => {
    try {
      await tareasApi.cambiarEstado(tarea.id_tarea, estado);
      message.success("Estado actualizado");
      recargar();
    } catch (e) {
      message.error(mensajeError(e, "No se pudo cambiar el estado"));
    }
  };

  const borrar = async (tarea) => {
    try {
      await eliminar(tarea);
      message.success("Tarea eliminada");
    } catch (e) {
      message.error(e.message);
    }
  };

  const guardar = async (valores) => {
    try {
      if (editando === "nuevo") await tareasApi.crear({ ...valores, id_evento: evento?.id_evento ?? valores.id_evento });
      else await tareasApi.editar(editando.id_tarea, valores);
    } catch (e) {
      throw new Error(mensajeError(e, "No se pudo guardar la tarea"));
    }
    message.success("Tarea guardada");
    recargar();
  };

  const campos = [
    { name: "descripcion", label: "Tarea", required: true, full: true },
    ...(evento
      ? []
      : [{
          name: "id_evento", label: "Evento", type: "select", required: true, full: true,
          options: misEventos.map((e) => ({ value: e.id_evento, label: e.tipo_evento })),
        }]),
    {
      name: "id_personal", label: "Responsable", type: "select", required: true,
      options: personal.filter((p) => p.roles.length).map((p) => ({ value: p.id_personal, label: p.nombre })),
    },
    { name: "fecha_prevista", label: "Fecha prevista", type: "date", required: true },
    ...(evento
      ? [{
          name: "id_detalle", label: "Servicio relacionado", type: "select", full: true,
          placeholder: "Ninguno (tarea general)",
          options: servicios.filter((d) => !d.descartado).map((d) => ({ value: d.id_detalle, label: d.servicio })),
          ayuda: "Si la tarea es de un servicio contratado (ej. coordinar el catering).",
        }]
      : []),
  ];

  const columnas = [
    {
      title: "Tarea",
      key: "tarea",
      className: "col-principal",
      render: (_, t) => t.descripcion,
    },
    ...(evento
      ? []
      : [{
          title: "Evento",
          key: "evento",
          render: (_, t) => <Link to={`/eventos/${t.id_evento}`}>{nombreEvento(t.id_evento)}</Link>,
        }]),
    {
      title: "Responsable",
      key: "responsable",
      render: (_, t) => (t.id_personal === permisos.yo ? "Vos" : nombrePersona(t.id_personal)),
    },
    {
      title: "Fecha prevista",
      key: "fecha",
      render: (_, t) => (
        <span style={t.vencida ? { color: "var(--red)" } : undefined}>
          {fechaCorta(t.fecha_prevista)}
          {t.vencida ? " · vencida" : ""}
        </span>
      ),
    },
    {
      title: "Estado",
      key: "estado",
      render: (_, t) =>
        permisos.puedeCambiarEstadoTarea(t) && !EVENTOS_CERRADOS.includes(eventoDe(t)?.estado) ? (
          <Select
            size="small"
            value={t.estado}
            style={{ minWidth: 130 }}
            onChange={(estado) => cambiarEstado(t, estado)}
            options={Object.keys(ESTADOS_TAREA).map((e) => ({ value: e, label: etiqueta(e) }))}
          />
        ) : (
          <Estado estado={t.estado} color={ESTADOS_TAREA[t.estado]} />
        ),
    },
    {
      key: "acciones",
      align: "right",
      render: (_, t) =>
        puedeGestionar(t) && (
          <Space size={4} wrap={false}>
            <Tooltip title="Editar">
              <Button type="text" icon={<EditOutlined />} aria-label="Editar" onClick={() => setEditando(t)} />
            </Tooltip>
            <Popconfirm
              title="¿Eliminar esta tarea?"
              okText="Eliminar"
              cancelText="Cancelar"
              okButtonProps={{ danger: true }}
              onConfirm={() => borrar(t)}
            >
              <Tooltip title="Eliminar">
                <Button type="text" danger icon={<DeleteOutlined />} aria-label="Eliminar" />
              </Tooltip>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <>
      {error && <Alert type="error" showIcon title={error} action={<Button size="small" onClick={recargar}>Reintentar</Button>} />}

      <div className="table-card">
        <div className="table-bar">
          {evento ? (
            <span className="muted">{cargando ? "Cargando…" : `${visibles.length} ${visibles.length === 1 ? "tarea" : "tareas"}`}</span>
          ) : (
            <Segmented value={filtro} onChange={setFiltro} options={FILTROS.map((f) => ({ label: f.label, value: f.id }))} />
          )}
          {puedeCrear && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditando("nuevo")}>
              Nueva tarea
            </Button>
          )}
        </div>
        <Table
          rowKey="id_tarea"
          columns={columnas}
          dataSource={visibles}
          loading={cargando}
          pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No hay tareas en esta vista." /> }}
        />
      </div>

      {editando && (
        <FormModal
          titulo={editando === "nuevo" ? "Nueva tarea" : "Editar tarea"}
          campos={campos}
          item={editando === "nuevo" ? null : editando}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}
