import { EditOutlined } from "@ant-design/icons";
import { Alert, App, Button, Descriptions, Empty, Table, Tooltip } from "antd";
import { useState } from "react";
import { cierreApi } from "../../api/eventos.js";
import usePermisos from "../../hooks/usePermisos.js";
import { mensajeError } from "../../services/api.js";
import { etiqueta, fechaCorta } from "../../utils/formato.js";
import Estado from "../Estado.jsx";
import FormModal from "../FormModal.jsx";

const ESTADOS_AVISO = {
  pendiente: "var(--amber)",
  enviado: "var(--cyan)",
  confirmado: "var(--lime)",
  fallido: "var(--red)",
};

// Cierre del evento: realizado o cancelado. En una cancelación se ve el motivo, quién la originó y el aviso a
// cada proveedor que estaba confirmado. Los avisos se hacen fuera del sistema: el coordinador registra el resultado.
export default function PanelCierre({ evento, cierre, onCambio }) {
  const { message } = App.useApp();
  const permisos = usePermisos();
  const [aviso, setAviso] = useState(null);

  if (!cierre) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="El evento sigue abierto." />;
  }

  const guardarAviso = async (valores) => {
    try {
      await cierreApi(evento.id_evento).registrarAviso(aviso.id_aviso, valores);
    } catch (e) {
      throw new Error(mensajeError(e, "No se pudo registrar el aviso"));
    }
    message.success("Aviso registrado");
    onCambio();
  };

  const columnas = [
    { title: "Proveedor", key: "proveedor", className: "col-principal", render: (_, a) => a.proveedor },
    { title: "Estado", key: "estado", render: (_, a) => <Estado estado={a.estado} color={ESTADOS_AVISO[a.estado]} /> },
    { title: "Medio", key: "medio", render: (_, a) => a.medio ?? "—" },
    { title: "Fecha", key: "fecha", render: (_, a) => (a.fecha_aviso ? fechaCorta(a.fecha_aviso) : "—") },
    { title: "Observaciones", key: "obs", render: (_, a) => a.observaciones ?? "—" },
    {
      key: "acciones",
      align: "right",
      render: (_, a) =>
        permisos.esCoordinador && (
          <Tooltip title="Registrar el aviso">
            <Button type="text" icon={<EditOutlined />} aria-label="Registrar aviso" onClick={() => setAviso(a)} />
          </Tooltip>
        ),
    },
  ];

  return (
    <div className="panel-evento">
      <Descriptions size="small" column={{ xs: 1, md: 2 }} className="ficha-datos">
        <Descriptions.Item label="Resultado">
          <Estado estado={cierre.resultado} color={cierre.resultado === "realizado" ? "var(--lime)" : "var(--red)"} />
        </Descriptions.Item>
        <Descriptions.Item label="Fecha">{fechaCorta(cierre.fecha)}</Descriptions.Item>
        {cierre.resultado === "cancelado" && (
          <>
            <Descriptions.Item label="Origen">{cierre.origen_cancelacion === "cliente" ? "Pedido del cliente" : "Decisión de la organizadora"}</Descriptions.Item>
            <Descriptions.Item label="Motivo">{cierre.motivo_cancelacion}</Descriptions.Item>
          </>
        )}
        <Descriptions.Item label="Observaciones" span="filled">{cierre.observaciones ?? "—"}</Descriptions.Item>
      </Descriptions>

      {cierre.resultado === "cancelado" && (
        <>
          {cierre.avisos.some((a) => a.estado === "pendiente") && (
            <Alert type="warning" showIcon title="Hay proveedores confirmados a los que todavía no se avisó la cancelación." />
          )}
          <div className="table-card">
            <div className="table-bar">
              <b>Avisos a proveedores confirmados</b>
            </div>
            <Table
              rowKey="id_aviso"
              columns={columnas}
              dataSource={cierre.avisos}
              pagination={false}
              scroll={{ x: "max-content" }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No había proveedores confirmados." /> }}
            />
          </div>
        </>
      )}

      {aviso && (
        <FormModal
          titulo={`Aviso a ${aviso.proveedor}`}
          campos={[
            { name: "estado", label: "Resultado", type: "select", required: true, options: Object.keys(ESTADOS_AVISO).map((e) => ({ value: e, label: etiqueta(e) })) },
            { name: "medio", label: "Medio", placeholder: "Teléfono, email, WhatsApp…" },
            { name: "observaciones", label: "Observaciones", type: "textarea" },
          ]}
          item={aviso}
          onGuardar={guardarAviso}
          onCerrar={() => setAviso(null)}
        />
      )}
    </div>
  );
}
