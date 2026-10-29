import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Input, Result, Spin, Table, Typography } from "antd";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import BotonTema from "../components/BotonTema.jsx";
import Estado from "../components/Estado.jsx";
import Logo from "../components/Logo.jsx";
import { fechaCorta, moneda } from "../utils/formato.js";

// Página del enlace único de un evento: la abre el cliente, sin cuenta ni login.
// Usa fetch (y no el cliente axios del panel) para no mandar el token de sesión ni cerrar sesión ante un error.
const URL_API = `${import.meta.env.VITE_API_URL ?? "/api"}/publico/evento`;

// Estado de la propuesta -> color de su etiqueta.
const COLOR_ESTADO = {
  enviada: "var(--cyan)",
  en_negociacion: "var(--amber)",
  aceptada: "var(--lime)",
  rechazada: "var(--red)",
};

// Columnas de la tabla de servicios de la propuesta.
const COLUMNAS_SERVICIOS = [
  { title: "Servicio", dataIndex: "nombre", key: "nombre", className: "col-principal" },
  { title: "Cant.", dataIndex: "cantidad", key: "cantidad", align: "right" },
  { title: "Unitario", dataIndex: "importe_unitario", key: "unitario", align: "right", render: moneda },
  { title: "Subtotal", dataIndex: "subtotal", key: "subtotal", align: "right", render: moneda },
];

// GET (o la opción que se pase) a /publico/evento/:token + ruta. Lanza Error con el mensaje del back.
async function pedir(token, ruta = "", opciones) {
  const respuesta = await fetch(`${URL_API}/${token}${ruta}`, opciones);
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.mensaje ?? "No se pudo completar la acción");
  return datos;
}

export default function EventoPublico() {
  const { token } = useParams();
  const [datos, setDatos] = useState(null); // { evento, propuesta } que devuelve el back
  const [error, setError] = useState("");
  const [rechazando, setRechazando] = useState(false); // true cuando el cliente está escribiendo el motivo
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorRespuesta, setErrorRespuesta] = useState("");

  const cargar = () =>
    pedir(token)
      .then((d) => { setDatos(d); setError(""); })
      .catch((e) => setError(e.message));

  useEffect(() => { cargar(); }, [token]);

  // decision: "aceptar" | "rechazar". Envía la respuesta del cliente y recarga la propuesta.
  const responder = async (decision) => {
    setEnviando(true);
    setErrorRespuesta("");
    try {
      await pedir(token, "/respuesta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, motivo: decision === "rechazar" ? motivo : undefined }),
      });
      setRechazando(false);
      await cargar();
    } catch (e) {
      setErrorRespuesta(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const { evento, propuesta } = datos ?? {};

  return (
    <div className="pub">
      <div className="pub-cabecera">
        <Logo />
        <BotonTema />
      </div>

      {error && (
        <Result
          status="404"
          title="No encontramos este evento"
          subTitle={`${error}. Pedile a la organizadora que te vuelva a enviar el enlace.`}
        />
      )}

      {!error && !datos && (
        <div className="pub-cargando">
          <Spin size="large" tip="Cargando…" />
        </div>
      )}

      {evento && (
        <div className="pub-cuerpo">
          <span className="eyebrow">TU EVENTO{evento.cliente_nombre ? ` · ${evento.cliente_nombre.toUpperCase()}` : ""}</span>
          <h1>{evento.tipo_evento}</h1>

          <Card variant="borderless" className="pub-datos">
            <Descriptions
              column={{ xs: 1, sm: 2, md: 4 }}
              layout="vertical"
              items={[
                { key: "fecha", label: "Fecha", children: evento.fecha ? fechaCorta(evento.fecha) : "A definir" },
                { key: "sede", label: "Sede", children: evento.sede_prevista ?? "A definir" },
                {
                  key: "asistentes",
                  label: "Asistentes",
                  children: evento.cant_asistentes_estimada ? Number(evento.cant_asistentes_estimada).toLocaleString("es-AR") : "A definir",
                },
                ...(evento.organizador_nombre ? [{ key: "organiza", label: "Organiza", children: evento.organizador_nombre }] : []),
              ]}
            />
          </Card>

          {evento.necesidades_preferencias && <Typography.Paragraph type="secondary">{evento.necesidades_preferencias}</Typography.Paragraph>}

          {!propuesta && (
            <Card variant="borderless" className="pub-espera">
              <Result
                status="info"
                title="Todavía no hay una propuesta para vos"
                subTitle="Cuando la organizadora te la envíe, vas a poder verla y responderla desde esta misma página."
              />
            </Card>
          )}

          {propuesta && (
            <Card
              variant="borderless"
              className="pub-propuesta"
              title="Propuesta"
              extra={<Estado estado={propuesta.estado} color={COLOR_ESTADO[propuesta.estado]} />}
            >
              <Table
                rowKey={(_, i) => i}
                columns={COLUMNAS_SERVICIOS}
                dataSource={propuesta.servicios}
                pagination={false}
                scroll={{ x: "max-content" }}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={3} align="right">
                      <b>Total</b>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <b className="pub-total">{moneda(propuesta.total)}</b>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />

              {propuesta.condiciones_comerciales && <Typography.Paragraph type="secondary">{propuesta.condiciones_comerciales}</Typography.Paragraph>}
              {propuesta.condiciones_acordadas && <Typography.Paragraph type="secondary">{propuesta.condiciones_acordadas}</Typography.Paragraph>}
              {propuesta.estado === "rechazada" && propuesta.motivo_rechazo && (
                <Typography.Paragraph type="secondary">Motivo del rechazo: {propuesta.motivo_rechazo}</Typography.Paragraph>
              )}

              {propuesta.estado === "aceptada" && (
                <Alert
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                  title={`Aceptaste esta propuesta${propuesta.fecha_respuesta ? ` el ${fechaCorta(propuesta.fecha_respuesta)}` : ""}. La organizadora se pone en contacto con vos.`}
                />
              )}
              {propuesta.estado === "rechazada" && (
                <Alert
                  type="error"
                  showIcon
                  icon={<CloseCircleOutlined />}
                  title={`Rechazaste esta propuesta${propuesta.fecha_respuesta ? ` el ${fechaCorta(propuesta.fecha_respuesta)}` : ""}.`}
                />
              )}

              {propuesta.puede_responder && (
                <div className="pub-acciones">
                  {errorRespuesta && <Alert type="error" showIcon title={errorRespuesta} />}

                  {!rechazando && (
                    <>
                      <Button type="primary" size="large" block loading={enviando} onClick={() => responder("aceptar")}>
                        Aceptar propuesta
                      </Button>
                      <Button size="large" block disabled={enviando} onClick={() => setRechazando(true)}>
                        Rechazar
                      </Button>
                    </>
                  )}

                  {rechazando && (
                    <>
                      <label htmlFor="motivo">¿Qué no te convenció? (opcional)</label>
                      <Input.TextArea
                        id="motivo"
                        value={motivo}
                        maxLength={500}
                        showCount
                        autoSize={{ minRows: 3, maxRows: 6 }}
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                      <Button danger type="primary" size="large" block loading={enviando} onClick={() => responder("rechazar")}>
                        Confirmar rechazo
                      </Button>
                      <Button size="large" block disabled={enviando} onClick={() => setRechazando(false)}>
                        Volver
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
