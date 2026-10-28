import { Alert, Button, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { soloFecha } from "../utils/formato.js";

// Formulario modal genérico para crear/editar, hecho con Ant Design (Modal + Form).
// Se arma solo a partir de la lista "campos":
//   name -> clave del dato | label -> texto visible
//   type -> text (por defecto), number, date, email, textarea, select o multiselect (lista de valores)
//   required, full (ocupa todo el ancho), step (solo number), options [{ value, label }] (solo select)
//   defecto -> valor inicial al crear
//   desde   -> (item) => valor inicial al editar, cuando el dato del registro no tiene la forma del campo
//   ayuda   -> texto de ayuda debajo del campo
// onGuardar(valores) debe devolver una promesa; si falla, el mensaje se muestra dentro del modal.

const FORMATO_BACK = "YYYY-MM-DD"; // así espera las fechas el back

// Valor con el que arranca cada campo: el del registro si se edita, o el "defecto".
// Las fechas se convierten a dayjs porque el DatePicker de antd trabaja con ese tipo.
function valorInicial(campo, item) {
  const v = item && campo.desde ? campo.desde(item) : item?.[campo.name] ?? campo.defecto;
  if (v === undefined || v === null || v === "") return undefined;
  if (campo.type === "date") return dayjs(soloFecha(v));
  if (campo.type === "number") return Number(v);
  if (campo.type === "multiselect") return Array.isArray(v) ? v : [];
  return v;
}

// Convierte lo escrito en el formulario a lo que espera el back (vacío -> null, fechas "YYYY-MM-DD").
function limpiar(campos, valores) {
  const salida = {};
  for (const c of campos) {
    const v = valores[c.name];
    if (c.type === "multiselect") salida[c.name] = v ?? [];
    else if (v === undefined || v === null || v === "") salida[c.name] = null;
    else salida[c.name] = c.type === "date" ? v.format(FORMATO_BACK) : v;
  }
  return salida;
}

// El control de antd que corresponde a cada tipo de campo.
// Form.Item le pasa value, onChange e id a su hijo directo: hay que reenviarlos al control real,
// si no el formulario nunca se entera de lo que se escribe.
function Control({ campo, ...props }) {
  switch (campo.type) {
    case "textarea":
      return <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} {...props} />;
    case "select":
      return (
        <Select
          options={campo.options}
          allowClear={!campo.required}
          showSearch
          optionFilterProp="label"
          placeholder={campo.placeholder ?? "Elegí una opción"}
          {...props}
        />
      );
    case "multiselect":
      return <Select mode="multiple" options={campo.options} allowClear optionFilterProp="label" placeholder={campo.placeholder ?? "Elegí una o más"} {...props} />;
    case "number":
      return <InputNumber min={0} step={campo.step ?? 1} style={{ width: "100%" }} {...props} />;
    case "date":
      return <DatePicker format="DD/MM/YYYY" placeholder="dd/mm/aaaa" style={{ width: "100%" }} {...props} />;
    case "email":
      return <Input type="email" autoComplete="off" {...props} />;
    default:
      return <Input autoComplete="off" placeholder={campo.placeholder} {...props} />;
  }
}

export default function FormModal({ titulo, campos, item, onGuardar, onCerrar }) {
  const [form] = Form.useForm();
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const valoresIniciales = Object.fromEntries(campos.map((c) => [c.name, valorInicial(c, item)]));

  // antd ya validó los campos obligatorios y el formato de email antes de llamar a esta función.
  const enviar = async (valores) => {
    setEnviando(true);
    setError("");
    try {
      await onGuardar(limpiar(campos, valores));
      onCerrar();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  };

  return (
    <Modal
      open
      centered
      destroyOnHidden
      width={640}
      title={titulo}
      footer={null}
      mask={{ closable: !enviando }}
      onCancel={onCerrar}
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={valoresIniciales} onFinish={enviar}>
        <Row gutter={16}>
          {campos.map((c) => (
            <Col key={c.name} xs={24} md={c.full || c.type === "textarea" ? 24 : 12}>
              <Form.Item
                name={c.name}
                label={c.label}
                extra={c.ayuda}
                rules={[
                  { required: !!c.required, message: "Este campo es obligatorio" },
                  ...(c.type === "email" ? [{ type: "email", message: "Ingresá un email válido" }] : []),
                ]}
              >
                <Control campo={c} />
              </Form.Item>
            </Col>
          ))}
        </Row>

        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}

        <div className="modal-actions">
          <Button onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="primary" htmlType="submit" loading={enviando}>
            Guardar
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
