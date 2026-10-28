import { CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined, RollbackOutlined, SendOutlined } from "@ant-design/icons";
import { Alert, App, Button, Descriptions, Empty, Popconfirm, Select, Space, Table, Tag, Tooltip } from "antd";
import { useState } from "react";
import { detalleApi, propuestasApi } from "../../api/propuestas.js";
import useCatalogos from "../../hooks/useCatalogos.js";
import usePermisos from "../../hooks/usePermisos.js";
import { ESTADOS_PROPUESTA } from "../../pages/Propuestas.jsx";
import { mensajeError } from "../../services/api.js";
import { etiqueta, fechaCorta, moneda } from "../../utils/formato.js";
import Estado from "../Estado.jsx";
import FormModal from "../FormModal.jsx";

// Situación del proveedor de cada servicio -> color.
const ESTADOS_PROVEEDOR = {
  pendiente: "var(--amber)",
  confirmado: "var(--lime)",
  no_disponible: "var(--red)",
};

// Qué falta en cada estado, para que el equipo sepa el próximo paso.
const AYUDA = {
  borrador: "Cargá los servicios con sus importes y pedí la aprobación de la responsable.",
  pendiente_aprobacion: "La responsable tiene que revisar los importes antes de enviarla al cliente.",
  aprobada: "Aprobada: ya se puede enviar al cliente (también puede verla con el enlace del evento).",
  enviada: "Esperando la respuesta del cliente. Si pide cambios, pasala a negociación.",
  en_negociacion: "Si cambian los importes, vuelve a la revisión de la responsable antes de reenviarla.",
  aceptada: "El cliente aceptó. Registrá las condiciones acordadas para poder confirmar el encargo.",
  rechazada: "El cliente la rechazó. La solicitud se conserva con su motivo.",
};

// Propuesta del evento y sus servicios.
//   Organizador del evento -> arma la propuesta, la mueve de estado y registra la respuesta del cliente
//   Responsable            -> aprueba o devuelve la propuesta pendiente
//   Coordinador            -> registra la situación del proveedor de cada servicio
export default function PanelPropuesta({ evento, propuesta, detalles, onCambio }) {
  const { message, modal } = App.useApp();
  const permisos = usePermisos();
  const { servicios, proveedores, nombrePersona } = useCatalogos(["servicios", "proveedores", "personal"]);
  const [editando, setEditando] = useState(null); // null | "datos" | "rechazo" | "nuevo" | detalle

  const esDueno = permisos.esDuenoDe(evento);
  const cerrado = ["realizado", "cancelado", "rechazada"].includes(evento.estado);
  const puedeArmar = esDueno && !cerrado && propuesta?.estado !== "rechazada";
  // Aceptada por el cliente, el precio queda fijo: solo se reemplaza el proveedor de un servicio.
  const precioFijo = propuesta?.estado === "aceptada";

  // Ejecuta una acción contra el back, avisa el resultado y recarga la ficha.
  const ejecutar = async (accion, exito) => {
    try {
      await accion();
      message.success(exito);
      onCambio();
    } catch (e) {
      message.error(mensajeError(e, "No se pudo completar la acción"));
    }
  };

  const mover = (estado, exito, extra = {}) => ejecutar(() => propuestasApi.editar(propuesta.id_propuesta, { estado, ...extra }), exito);

  if (!propuesta) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Este evento todavía no tiene propuesta."
      >
        {esDueno && !cerrado && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => ejecutar(() => propuestasApi.crear({ id_evento: evento.id_evento }), "Propuesta creada en borrador")}
          >
            Crear propuesta
          </Button>
        )}
      </Empty>
    );
  }

  const estado = propuesta.estado;
  const api = detalleApi(propuesta.id_propuesta);

  // Botones del flujo según el estado y el rol.
  const acciones = [];
  if (esDueno && !cerrado) {
    if (estado === "borrador") acciones.push(<Button key="pedir" type="primary" icon={<SendOutlined />} onClick={() => mover("pendiente_aprobacion", "Aprobación pedida")}>Pedir aprobación</Button>);
    if (estado === "pendiente_aprobacion") acciones.push(<Button key="retirar" icon={<RollbackOutlined />} onClick={() => mover("borrador", "Volvió a borrador")}>Volver a borrador</Button>);
    if (estado === "aprobada") acciones.push(<Button key="enviar" type="primary" icon={<SendOutlined />} onClick={() => mover("enviada", "Propuesta enviada")}>Marcar como enviada</Button>);
    if (estado === "enviada") acciones.push(<Button key="negociar" onClick={() => mover("en_negociacion", "En negociación")}>El cliente pidió cambios</Button>);
    if (estado === "en_negociacion") acciones.push(<Button key="reaprobar" type="primary" icon={<SendOutlined />} onClick={() => mover("pendiente_aprobacion", "Aprobación pedida")}>Pedir nueva aprobación</Button>);
    if (estado === "enviada" || estado === "en_negociacion") {
      acciones.push(
        <Popconfirm key="acepta" title="¿El cliente aceptó la propuesta?" okText="Sí, aceptó" cancelText="Cancelar" onConfirm={() => mover("aceptada", "Aceptación registrada")}>
          <Button icon={<CheckOutlined />}>El cliente aceptó</Button>
        </Popconfirm>,
        <Button key="rechaza" danger onClick={() => setEditando("rechazo")}>El cliente rechazó</Button>
      );
    }
    if (estado !== "rechazada") acciones.push(<Button key="datos" icon={<EditOutlined />} onClick={() => setEditando("datos")}>Editar datos</Button>);
    if (estado === "borrador") {
      acciones.push(
        <Popconfirm key="borrar" title="¿Eliminar la propuesta?" description="Se borran también sus servicios." okText="Eliminar" cancelText="Cancelar" okButtonProps={{ danger: true }} onConfirm={() => ejecutar(() => propuestasApi.eliminar(propuesta.id_propuesta), "Propuesta eliminada")}>
          <Button danger type="text" icon={<DeleteOutlined />}>Eliminar</Button>
        </Popconfirm>
      );
    }
  }
  if (permisos.esResponsable && estado === "pendiente_aprobacion") {
    acciones.unshift(
      <Button key="aprobar" type="primary" icon={<CheckOutlined />} onClick={() => ejecutar(() => propuestasApi.aprobar(propuesta.id_propuesta, true), "Propuesta aprobada")}>
        Aprobar
      </Button>,
      <Button
        key="devolver"
        icon={<RollbackOutlined />}
        onClick={() =>
          modal.confirm({
            title: "¿Devolver la propuesta para corregir?",
            content: "Vuelve a borrador y el organizador tiene que pedir la aprobación otra vez.",
            okText: "Devolver",
            cancelText: "Cancelar",
            onOk: () => ejecutar(() => propuestasApi.aprobar(propuesta.id_propuesta, false), "Propuesta devuelta"),
          })
        }
      >
        Devolver para corregir
      </Button>
    );
  }

  const columnas = [
    {
      title: "Servicio",
      key: "servicio",
      className: "col-principal",
      render: (_, d) => (
        <span>
          {d.servicio} {d.descartado && <Tag color="default">Descartado por el cliente</Tag>}
        </span>
      ),
    },
    {
      title: "Proveedor",
      key: "proveedor",
      render: (_, d) =>
        d.proveedor ? (
          <Tooltip title={d.id_proveedor_anterior ? `Reemplazó a: ${proveedores.find((p) => p.id_proveedor === d.id_proveedor_anterior)?.nombre ?? "otro proveedor"}` : undefined}>
            {d.proveedor}
            {d.id_proveedor_anterior ? " ↺" : ""}
          </Tooltip>
        ) : (
          <span className="muted">Sin proveedor</span>
        ),
    },
    { title: "Cant.", key: "cantidad", align: "right", render: (_, d) => d.cantidad },
    { title: "Unitario", key: "unitario", align: "right", render: (_, d) => moneda(d.importe_unitario) },
    { title: "Subtotal", key: "subtotal", align: "right", render: (_, d) => (d.descartado ? <s className="muted">{moneda(d.subtotal)}</s> : moneda(d.subtotal)) },
    {
      title: "Situación",
      key: "situacion",
      render: (_, d) =>
        permisos.esCoordinador && !d.descartado && !cerrado ? (
          <Select
            size="small"
            value={d.estado_proveedor}
            style={{ minWidth: 140 }}
            onChange={(nuevo) => ejecutar(() => api.cambiarEstado(d.id_detalle, nuevo), "Situación del proveedor actualizada")}
            options={Object.keys(ESTADOS_PROVEEDOR).map((e) => ({ value: e, label: etiqueta(e), disabled: e === "confirmado" && !d.id_proveedor }))}
          />
        ) : (
          <Estado estado={d.estado_proveedor} color={ESTADOS_PROVEEDOR[d.estado_proveedor]} />
        ),
    },
    { title: "Observaciones", key: "obs", render: (_, d) => d.observaciones ?? "—" },
    {
      key: "acciones",
      align: "right",
      render: (_, d) =>
        puedeArmar && (
          <Space size={4} wrap={false}>
            <Tooltip title={precioFijo ? "Reemplazar proveedor" : "Editar"}>
              <Button type="text" icon={<EditOutlined />} aria-label="Editar" onClick={() => setEditando(d)} />
            </Tooltip>
            {!precioFijo && (
              <Popconfirm title="¿Quitar este servicio de la propuesta?" okText="Quitar" cancelText="Cancelar" okButtonProps={{ danger: true }} onConfirm={() => ejecutar(() => api.eliminar(d.id_detalle), "Servicio quitado")}>
                <Tooltip title="Quitar">
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label="Quitar" />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        ),
    },
  ];

  // Formulario de un servicio de la propuesta. El proveedor tiene que ofrecer ese servicio (lo valida el back).
  const camposDetalle = [
    {
      name: "id_servicio", label: "Servicio", type: "select", required: true, full: true,
      options: servicios.map((s) => ({ value: s.id_servicio, label: s.nombre })),
      ayuda: servicios.length ? undefined : "Primero cargá servicios en la sección Servicios.",
    },
    {
      name: "id_proveedor", label: "Proveedor", type: "select", full: true, placeholder: "Sin proveedor todavía",
      options: proveedores.map((p) => ({
        value: p.id_proveedor,
        label: p.servicios.length ? `${p.nombre} — ${p.servicios.map((s) => s.nombre).join(", ")}` : p.nombre,
      })),
    },
    { name: "cantidad", label: "Cantidad", type: "number", required: true, defecto: 1 },
    { name: "importe_unitario", label: "Importe unitario", type: "number", required: true, step: 0.01 },
    {
      name: "descartado", label: "¿El cliente lo descartó?", type: "select", required: true, defecto: false,
      options: [{ value: false, label: "No, está incluido" }, { value: true, label: "Sí, lo descartó" }],
    },
    {
      name: "observaciones", label: "Observaciones", type: "textarea",
      ayuda: "Si cambiás el proveedor, contá el cambio y el motivo: queda registrado y el servicio vuelve a pendiente.",
    },
  ];

  const camposDatos = [
    { name: "fecha_emision", label: "Fecha de emisión", type: "date" },
    { name: "condiciones_acordadas", label: "Condiciones acordadas", type: "textarea", ayuda: "Necesarias para confirmar el encargo." },
  ];

  const guardarDetalle = async (valores) => {
    try {
      if (editando === "nuevo") await api.crear(valores);
      else await api.editar(editando.id_detalle, valores);
    } catch (e) {
      throw new Error(mensajeError(e, "No se pudo guardar el servicio"));
    }
    message.success("Servicio guardado");
    onCambio();
  };

  const guardarDatos = async (valores) => {
    try {
      await propuestasApi.editar(propuesta.id_propuesta, valores);
    } catch (e) {
      throw new Error(mensajeError(e, "No se pudo guardar la propuesta"));
    }
    message.success("Propuesta actualizada");
    onCambio();
  };

  const registrarRechazo = async ({ motivo_rechazo }) => {
    try {
      await propuestasApi.editar(propuesta.id_propuesta, { estado: "rechazada", motivo_rechazo });
    } catch (e) {
      throw new Error(mensajeError(e, "No se pudo registrar el rechazo"));
    }
    message.success("Rechazo registrado");
    onCambio();
  };

  return (
    <div className="panel-evento">
      <div className="propuesta-head">
        <div>
          <Space size={8} align="center">
            <Estado estado={estado} color={ESTADOS_PROPUESTA[estado]} />
            <span className="propuesta-total">{moneda(propuesta.total)}</span>
          </Space>
          <p className="muted propuesta-ayuda">
            {estado === "aceptada" && propuesta.condiciones_acordadas
              ? evento.estado === "aceptada"
                ? "El cliente aceptó y las condiciones están registradas: ya se puede confirmar el encargo."
                : "Propuesta aceptada."
              : AYUDA[estado]}
          </p>
        </div>
        {acciones.length > 0 && <Space wrap>{acciones}</Space>}
      </div>

      <Descriptions size="small" column={{ xs: 1, md: 3 }} className="ficha-datos">
        <Descriptions.Item label="Emisión">{propuesta.fecha_emision ? fechaCorta(propuesta.fecha_emision) : "—"}</Descriptions.Item>
        <Descriptions.Item label="Aprobada por">
          {propuesta.aprobado_por ? `${nombrePersona(propuesta.aprobado_por)} · ${fechaCorta(propuesta.fecha_aprobacion)}` : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Respuesta del cliente">{propuesta.fecha_respuesta ? fechaCorta(propuesta.fecha_respuesta) : "—"}</Descriptions.Item>
        <Descriptions.Item label="Condiciones acordadas" span="filled">{propuesta.condiciones_acordadas ?? <span className="muted">Pendiente de aclaración</span>}</Descriptions.Item>
        {propuesta.motivo_rechazo && <Descriptions.Item label="Motivo de rechazo" span="filled">{propuesta.motivo_rechazo}</Descriptions.Item>}
      </Descriptions>

      {estado === "aceptada" && !cerrado && detalles.some((d) => !d.descartado && d.estado_proveedor !== "confirmado") && (
        <Alert
          type="warning"
          showIcon
          title="Hay servicios sin proveedor confirmado"
          description={
            evento.estado === "aceptada"
              ? "El encargo se puede confirmar igual, pero estos compromisos siguen pendientes."
              : "Estos compromisos siguen pendientes y no deben darse por resueltos."
          }
        />
      )}

      <div className="table-card">
        <div className="table-bar">
          <b>Servicios</b>
          {puedeArmar && !precioFijo && (
            <Button icon={<PlusOutlined />} onClick={() => setEditando("nuevo")}>
              Agregar servicio
            </Button>
          )}
        </div>
        <Table
          rowKey="id_detalle"
          columns={columnas}
          dataSource={detalles}
          pagination={false}
          scroll={{ x: "max-content" }}
          rowClassName={(d) => (d.descartado ? "fila-descartada" : "")}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Todavía no hay servicios en la propuesta." /> }}
        />
      </div>

      {editando === "datos" && (
        <FormModal titulo="Datos de la propuesta" campos={camposDatos} item={propuesta} onGuardar={guardarDatos} onCerrar={() => setEditando(null)} />
      )}
      {editando === "rechazo" && (
        <FormModal
          titulo="Registrar el rechazo del cliente"
          campos={[{ name: "motivo_rechazo", label: "Motivo del rechazo", type: "textarea", required: true, ayuda: "Pedir cambios no es rechazar: para eso pasala a negociación." }]}
          item={null}
          onGuardar={registrarRechazo}
          onCerrar={() => setEditando(null)}
        />
      )}
      {(editando === "nuevo" || editando?.id_detalle) && (
        <FormModal
          titulo={editando === "nuevo" ? "Agregar servicio" : "Editar servicio"}
          campos={camposDetalle}
          item={editando === "nuevo" ? null : { ...editando, importe_unitario: Number(editando.importe_unitario) }}
          onGuardar={guardarDetalle}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
