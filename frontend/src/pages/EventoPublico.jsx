import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, EditOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Result, Spin, Table, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import BotonTema from "../components/BotonTema.jsx";
import Estado from "../components/Estado.jsx";
import Logo from "../components/Logo.jsx";
import { contacto, fechaCorta, moneda } from "../utils/formato.js";

// Página de seguimiento de una reserva: la abre el cliente con el link que recibió al reservar, sin cuenta ni login.
// Usa fetch (y no el cliente axios del panel) para no mandar el token de sesión ni cerrar sesión ante un error.
const URL_API = `${import.meta.env.VITE_API_URL ?? "/api"}/publico/evento`;

// Estado del evento -> cómo se lo contamos al cliente.
const ESTADOS = {
  propuesta: { texto: "Pendiente de confirmación", color: "var(--amber)", tipo: "info", icono: <ClockCircleOutlined />, aviso: "La organizadora está revisando tu reserva. Te va a contactar para confirmarla." },
  confirmado: { texto: "Confirmada", color: "var(--lime)", tipo: "success", icono: <CheckCircleOutlined />, aviso: "¡Tu evento está confirmado!" },
  realizado: { texto: "Realizado", color: "var(--muted)", tipo: "success", icono: <CheckCircleOutlined />, aviso: "Este evento ya se realizó. ¡Gracias!" },
  rechazado: { texto: "No disponible", color: "var(--red)", tipo: "error", icono: <CloseCircleOutlined />, aviso: "La organizadora no puede tomar esta reserva. Podés contactarla para buscar otra fecha." },
  cancelado: { texto: "Cancelado", color: "var(--red)", tipo: "error", icono: <CloseCircleOutlined />, aviso: "Este evento se canceló." },
};

const COLUMNAS_SERVICIOS = [
  { title: "Servicio", dataIndex: "nombre", key: "nombre", className: "col-principal" },
  { title: "Equipamiento", dataIndex: "equipamiento", key: "equipamiento", render: (v) => v ?? "—" },
  { title: "Precio", dataIndex: "precio", key: "precio", align: "right", render: (v) => (v != null ? moneda(v) : "A consultar") },
];

export default function EventoPublico() {
  const { token } = useParams();
  const [datos, setDatos] = useState(null); // { evento, servicios, total } que devuelve el back
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${URL_API}/${token}`)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) throw new Error(cuerpo.mensaje ?? "No se pudo cargar la reserva");
        setDatos(cuerpo);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const { evento, servicios = [], total } = datos ?? {};
  const estado = evento ? ESTADOS[evento.estado] ?? ESTADOS.propuesta : null;

  return (
    <div className="pub">
      <div className="pub-cabecera">
        <Logo />
        <BotonTema />
      </div>

      {error && (
        <Result
          status="404"
          title="No encontramos esta reserva"
          subTitle={`${error}. Pedile a la organizadora que te vuelva a enviar el link.`}
        />
      )}

      {!error && !datos && (
        <div className="pub-cargando">
          <Spin size="large" description="Cargando…" />
        </div>
      )}

      {evento && (
        <div className="pub-cuerpo">
          <span className="eyebrow">TU RESERVA EN {evento.empresa_nombre.toUpperCase()}{evento.cliente_nombre ? ` · ${evento.cliente_nombre.toUpperCase()}` : ""}</span>
          <h1>{evento.tipo_evento}</h1>

          <Alert type={estado.tipo} showIcon icon={estado.icono} title={estado.aviso} />

          {/* Mientras está pendiente, el cliente puede corregir lo que cargó (vuelve al formulario completo). */}
          {evento.se_puede_modificar && (
            <div>
              <Link to={`/reservar/${evento.token_reservas}?editar=${token}`}>
                <Button icon={<EditOutlined />}>Modificar mi reserva</Button>
              </Link>
            </div>
          )}

          <Card variant="borderless" className="pub-datos">
            <Descriptions
              column={{ xs: 1, sm: 2, md: 4 }}
              layout="vertical"
              items={[
                { key: "estado", label: "Estado", children: <Estado estado={estado.texto} color={estado.color} /> },
                { key: "fecha", label: "Fecha", children: evento.fecha ? fechaCorta(evento.fecha) : "A definir" },
                { key: "salon", label: "Salón", children: evento.sucursal_nombre ? `${evento.sucursal_nombre}${evento.sucursal_direccion ? ` · ${evento.sucursal_direccion}` : ""}` : evento.sede_prevista ?? "A definir" },
                {
                  key: "asistentes",
                  label: "Invitados",
                  children: evento.cant_asistentes_estimada ? Number(evento.cant_asistentes_estimada).toLocaleString("es-AR") : "A definir",
                },
                ...(evento.organizador_nombre ? [{ key: "organiza", label: "Organiza", children: evento.organizador_nombre }] : []),
              ]}
            />
          </Card>

          {evento.necesidades_preferencias && <Typography.Paragraph type="secondary">{evento.necesidades_preferencias}</Typography.Paragraph>}

          <Card variant="borderless" className="pub-propuesta" title="Servicios reservados">
            <Table
              rowKey={(_, i) => i}
              columns={COLUMNAS_SERVICIOS}
              dataSource={servicios}
              pagination={false}
              scroll={{ x: "max-content" }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2} align="right">
                    <b>Total</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <b className="pub-total">{moneda(total)}</b>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>

          {(evento.empresa_telefono || evento.empresa_email) && (
            <Typography.Paragraph type="secondary">
              ¿Dudas? Contactá a {evento.empresa_nombre}: {contacto(evento.empresa_telefono, evento.empresa_email)}
            </Typography.Paragraph>
          )}
        </div>
      )}
    </div>
  );
}
