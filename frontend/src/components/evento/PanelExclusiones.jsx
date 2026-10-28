import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, App, Button, Empty, Popconfirm, Space, Table, Tooltip } from "antd";
import { useState } from "react";
import { exclusionesApi } from "../../api/eventos.js";
import useCatalogos from "../../hooks/useCatalogos.js";
import usePermisos from "../../hooks/usePermisos.js";
import useRecurso from "../../hooks/useRecurso.js";
import { mensajeError } from "../../services/api.js";
import { fechaCorta } from "../../utils/formato.js";
import FormModal from "../FormModal.jsx";

// Servicios evaluados que el cliente descartó: se registran cuando evitan confusiones en la preparación
// (por ejemplo, "no quiere fotografía"). Los carga el organizador del evento.
export default function PanelExclusiones({ evento }) {
  const { message } = App.useApp();
  const permisos = usePermisos();
  const api = exclusionesApi(evento.id_evento);
  const { items, cargando, error, recargar, eliminar } = useRecurso(api, "id_exclusion");
  const { servicios } = useCatalogos(["servicios"]);
  const [editando, setEditando] = useState(null);

  const puedeGestionar = permisos.esDuenoDe(evento) && !["realizado", "cancelado"].includes(evento.estado);

  const guardar = async (valores) => {
    try {
      if (editando === "nuevo") await api.crear(valores);
      else await api.editar(editando.id_exclusion, { motivo: valores.motivo });
    } catch (e) {
      throw new Error(mensajeError(e, "No se pudo guardar"));
    }
    message.success("Guardado");
    recargar();
  };

  const borrar = async (x) => {
    try {
      await eliminar(x);
      message.success("Exclusión eliminada");
    } catch (e) {
      message.error(e.message);
    }
  };

  const campos = [
    ...(editando === "nuevo"
      ? [{ name: "id_servicio", label: "Servicio descartado", type: "select", required: true, full: true, options: servicios.map((s) => ({ value: s.id_servicio, label: s.nombre })) }]
      : []),
    { name: "motivo", label: "Motivo", type: "textarea" },
  ];

  const columnas = [
    { title: "Servicio", key: "servicio", className: "col-principal", render: (_, x) => x.servicio },
    { title: "Motivo", key: "motivo", render: (_, x) => x.motivo ?? "—" },
    { title: "Registró", key: "registro", render: (_, x) => `${x.registrado_por_nombre} · ${fechaCorta(x.fecha_registro)}` },
    {
      key: "acciones",
      align: "right",
      render: (_, x) =>
        puedeGestionar && (
          <Space size={4} wrap={false}>
            <Tooltip title="Editar motivo">
              <Button type="text" icon={<EditOutlined />} aria-label="Editar" onClick={() => setEditando(x)} />
            </Tooltip>
            <Popconfirm title="¿Eliminar esta exclusión?" okText="Eliminar" cancelText="Cancelar" okButtonProps={{ danger: true }} onConfirm={() => borrar(x)}>
              <Tooltip title="Eliminar">
                <Button type="text" danger icon={<DeleteOutlined />} aria-label="Eliminar" />
              </Tooltip>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <div className="panel-evento">
      {error && <Alert type="error" showIcon title={error} />}
      <div className="table-card">
        <div className="table-bar">
          <span className="muted">Servicios que el cliente no quiere, para que nadie los prepare por error.</span>
          {puedeGestionar && (
            <Button icon={<PlusOutlined />} onClick={() => setEditando("nuevo")}>
              Registrar exclusión
            </Button>
          )}
        </div>
        <Table
          rowKey="id_exclusion"
          columns={columnas}
          dataSource={items}
          loading={cargando}
          pagination={false}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="El cliente no descartó servicios." /> }}
        />
      </div>

      {editando && (
        <FormModal
          titulo={editando === "nuevo" ? "Servicio descartado por el cliente" : "Editar motivo"}
          campos={campos}
          item={editando === "nuevo" ? null : editando}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
