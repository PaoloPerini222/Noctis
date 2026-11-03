import { CopyOutlined, SaveOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Col, Form, Input, Row, Skeleton } from "antd";
import { useEffect, useState } from "react";
import { configuracionApi } from "../api/configuracion.js";
import Topbar from "../components/Topbar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { mensajeError } from "../services/api.js";
import { copiar } from "../utils/eventos.js";
import { fechaLarga } from "../utils/formato.js";

// Configuración del negocio: el admin cambia el nombre (el que ve el cliente en el link de reservas) y los datos de
// contacto. El CUIT y si la empresa está activa los administra el superadmin.
export default function Configuracion() {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { refrescar } = useAuth();
  const [empresa, setEmpresa] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    configuracionApi.obtener().then(setEmpresa).catch((e) => setError(mensajeError(e, "No se pudo cargar la configuración")));
  }, []);

  const guardar = async (valores) => {
    setGuardando(true);
    setError("");
    try {
      setEmpresa(await configuracionApi.guardar(valores));
      // El nombre del negocio también aparece arriba en el panel: se actualiza el perfil.
      await refrescar();
      message.success("Configuración guardada");
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar la configuración"));
    } finally {
      setGuardando(false);
    }
  };

  const linkReservas = empresa ? `${window.location.origin}/reservar/${empresa.token_reservas}` : "";

  return (
    <main className="main">
      <Topbar busqueda="" onBusqueda={() => {}} placeholder="Configuración" deshabilitado />

      <div className="page-head">
        <div>
          <div className="eyebrow">{fechaLarga()}</div>
          <h1>Configuración</h1>
        </div>
      </div>

      {!empresa && !error && <Skeleton active paragraph={{ rows: 5 }} />}
      {error && <Alert type="error" showIcon title={error} />}

      {empresa && (
        <Card variant="borderless" className="configuracion" title="Tu negocio">
          <Form form={form} layout="vertical" requiredMark={false} initialValues={empresa} onFinish={guardar}>
            <Row gutter={16}>
              <Col xs={24}>
                <Form.Item
                  name="nombre"
                  label="Nombre del negocio"
                  rules={[{ required: true, whitespace: true, message: "Ingresá el nombre del negocio" }]}
                  extra="Es el nombre que ven tus clientes en el link de reservas."
                >
                  <Input maxLength={150} size="large" placeholder="Ej.: Mica Eventos" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="telefono" label="Teléfono">
                  <Input maxLength={30} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Ingresá un email válido" }]}>
                  <Input maxLength={150} />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item name="direccion" label="Dirección" extra="Los salones donde hacés los eventos se cargan en Sucursales.">
                  <Input maxLength={200} />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item label="CUIT" extra="Lo administran los dueños del sistema.">
                  <Input value={empresa.cuit} disabled />
                </Form.Item>
              </Col>
            </Row>

            <div className="configuracion-pie">
              <Button icon={<CopyOutlined />} onClick={() => copiar(message, linkReservas, "Link de reservas copiado")}>
                Copiar link de reservas
              </Button>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={guardando}>
                Guardar
              </Button>
            </div>
          </Form>
        </Card>
      )}
    </main>
  );
}
