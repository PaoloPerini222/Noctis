import { ArrowLeftOutlined, BankOutlined, LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Form, Input, Segmented, Select } from "antd";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import BotonTema from "../components/BotonTema.jsx";
import Logo from "../components/Logo.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { mensajeError } from "../services/api.js";
import { listarEmpresas, registrar } from "../services/authService.js";

// Login y registro comparten pantalla: modo "login" o "registro" según la ruta.
// El formulario es de Ant Design (Form): valida los campos antes de llamar a onFinish.
export default function Acceso({ modo }) {
  const esLogin = modo === "login";
  const { usuario, ingresar } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [empresas, setEmpresas] = useState([]);

  // Al pasar de login a registro (o al revés) se limpia el error anterior.
  useEffect(() => setError(""), [modo]);

  // Al crear la cuenta hay que elegir a qué empresa pertenece quien se registra.
  useEffect(() => {
    if (esLogin) return;
    listarEmpresas()
      .then(setEmpresas)
      .catch((err) => setError(mensajeError(err, "No se pudieron cargar las empresas")));
  }, [esLogin]);

  // Si ya hay sesión no tiene sentido ver esta pantalla.
  if (usuario) return <Navigate to="/eventos" replace />;

  // valores = { nombre?, id_empresa?, email, password } ya validados por antd.
  const enviar = async (valores) => {
    setError("");
    setEnviando(true);
    try {
      if (!esLogin) await registrar(valores);
      await ingresar(valores.email, valores.password);
      navigate("/eventos");
    } catch (err) {
      setError(mensajeError(err, esLogin ? "Error al iniciar sesión" : "Error al crear la cuenta"));
      setEnviando(false);
    }
  };

  return (
    <div className="auth">
      {/* Volver y cambiar de tema: arriba a la derecha de la página. */}
      <div className="auth-acciones">
        <Button shape="round" icon={<ArrowLeftOutlined />} onClick={() => navigate("/")}>
          Volver al inicio
        </Button>
        <BotonTema />
      </div>

      <div className="auth-art">
        <div className="art-top">
          <Logo />
        </div>
        {esLogin ? (
          <h2 key="l">Volvé<br /><span style={{ color: "var(--pink)" }}>a la pista.</span></h2>
        ) : (
          <h2 key="r">Sumate<br /><span style={{ color: "var(--lime)" }}>al equipo.</span></h2>
        )}
      </div>

      <div className="auth-form">
        {/* Cambia entre las rutas /login y /registro. */}
        <Segmented
          size="large"
          value={modo}
          onChange={(valor) => navigate(valor === "login" ? "/login" : "/registro")}
          options={[
            { label: "Ingresar", value: "login" },
            { label: "Crear cuenta", value: "registro" },
          ]}
        />

        {/* key={modo}: reinicia el formulario y su animación al cambiar de modo. */}
        <Form key={modo} className="swap" layout="vertical" requiredMark={false} size="large" onFinish={enviar} disabled={enviando}>
          <div>
            <h1>{esLogin ? "Ingresá a tu cuenta" : "Creá tu cuenta"}</h1>
            {esLogin && <p className="lead">Usá el email con el que te registraste.</p>}
          </div>

          {!esLogin && (
            <Form.Item name="nombre" label="Nombre" rules={[{ required: true, message: "Ingresá tu nombre" }]}>
              <Input prefix={<UserOutlined />} placeholder="Nombre Apellido" autoComplete="name" />
            </Form.Item>
          )}

          {!esLogin && (
            <Form.Item name="id_empresa" label="Empresa" rules={[{ required: true, message: "Elegí tu empresa" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                suffixIcon={<BankOutlined />}
                placeholder="Elegí tu empresa"
                options={empresas.map((e) => ({ value: e.id_empresa, label: e.nombre }))}
              />
            </Form.Item>
          )}

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: "Ingresá tu email" },
              { type: "email", message: "Ingresá un email válido" },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="usuario@gmail.com" autoComplete="email" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Contraseña"
            rules={[
              { required: true, message: "Ingresá tu contraseña" },
              ...(esLogin ? [] : [{ min: 8, message: "Mínimo 8 caracteres" }]),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={esLogin ? "••••••••" : "Mínimo 8 caracteres"}
              autoComplete={esLogin ? "current-password" : "new-password"}
            />
          </Form.Item>

          {error && <Alert type="error" showIcon title={error} />}

          <Button type="primary" size="large" htmlType="submit" block loading={enviando}>
            {esLogin ? "Ingresar" : "Crear cuenta"}
          </Button>
        </Form>
      </div>
    </div>
  );
}
