import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, App, Button, Empty, Tag, Timeline } from "antd";
import { useState } from "react";
import { cambiosApi } from "../../api/eventos.js";
import useRecurso from "../../hooks/useRecurso.js";
import { mensajeError } from "../../services/api.js";
import { fechaCorta } from "../../utils/formato.js";
import FormModal from "../FormModal.jsx";

const TIPOS = ["Fecha", "Sede", "Cantidad de asistentes", "Servicios", "Proveedor", "Condiciones", "Otro"];

// Cambios relevantes del evento. Quien recibe la novedad (de un cliente o proveedor) la registra; el cambio no
// actualiza solo los compromisos: alguien los revisa y deja escrita su situación real.
export default function PanelCambios({ evento }) {
  const { message } = App.useApp();
  const api = cambiosApi(evento.id_evento);
  const { items, cargando, error, recargar } = useRecurso(api, "id_cambio");
  const [editando, setEditando] = useState(null); // null | "nuevo" | cambio (para registrar la revisión)

  const guardar = async (valores) => {
    try {
      if (editando === "nuevo") await api.crear(valores);
      else await api.editar(editando.id_cambio, valores);
    } catch (e) {
      throw new Error(mensajeError(e, "No se pudo guardar el cambio"));
    }
    message.success(editando === "nuevo" ? "Cambio registrado" : "Revisión registrada");
    recargar();
  };

  const camposNuevo = [
    { name: "tipo_cambio", label: "Qué cambió", type: "select", required: true, options: TIPOS.map((t) => ({ value: t, label: t })) },
    { name: "descripcion", label: "Descripción", type: "textarea", required: true, ayuda: "Registrá la decisión o el acuerdo, no la conversación." },
    { name: "situacion_compromisos", label: "Situación de los compromisos (si ya la revisaste)", type: "textarea" },
  ];
  const camposRevision = [
    { name: "situacion_compromisos", label: "Situación real de proveedores, tareas y condiciones", type: "textarea", required: true },
  ];

  return (
    <div className="panel-evento">
      <div className="panel-bar">
        <span className="muted">Un cambio de fecha, sede o asistentes obliga a revisar proveedores, tareas y condiciones.</span>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditando("nuevo")}>
          Registrar cambio
        </Button>
      </div>

      {error && <Alert type="error" showIcon title={error} />}

      {!cargando && !items.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin cambios registrados." />
      ) : (
        <Timeline
          items={items.map((c) => ({
            key: c.id_cambio,
            color: c.situacion_compromisos ? "green" : "orange",
            content: (
              <div className="cambio">
                <div>
                  <b>{c.tipo_cambio}</b>
                  <span className="muted"> · {fechaCorta(c.fecha_registro)} · {c.registrado_por_nombre}</span>
                </div>
                <p>{c.descripcion}</p>
                {c.situacion_compromisos ? (
                  <p className="muted">Compromisos: {c.situacion_compromisos}</p>
                ) : (
                  <Tag color="orange">Compromisos sin revisar</Tag>
                )}
                <Button size="small" type="link" icon={<EditOutlined />} onClick={() => setEditando(c)}>
                  {c.situacion_compromisos ? "Actualizar revisión" : "Registrar revisión"}
                </Button>
              </div>
            ),
          }))}
        />
      )}

      {editando && (
        <FormModal
          titulo={editando === "nuevo" ? "Registrar cambio relevante" : "Revisión de compromisos"}
          campos={editando === "nuevo" ? camposNuevo : camposRevision}
          item={editando === "nuevo" ? null : editando}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
