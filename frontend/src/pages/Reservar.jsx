import { ArrowLeftOutlined, CheckCircleFilled, EnvironmentOutlined, ToolOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, Result, Row, Spin } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import BotonTema from "../components/BotonTema.jsx";
import Logo from "../components/Logo.jsx";
import { moneda } from "../utils/formato.js";

// Link público de reservas de una empresa: lo abre el cliente, sin cuenta ni login.
// Ve los servicios (con su equipamiento y precio), elige los que quiere, el salón y una fecha libre en ese salón, y deja sus datos.
// La reserva entra al panel como "propuesta"; el cliente queda en Clientes y recibe un link para seguirla.
// Con ?editar=<token de la reserva> el formulario se abre completo con esa reserva para corregirla (mientras esté pendiente).
// Usa fetch (y no el cliente axios del panel) para no mandar el token de sesión ni cerrar sesión ante un error.
const URL_PUBLICO = `${import.meta.env.VITE_API_URL ?? "/api"}/publico`;

// ruta: "reservas/<token de la empresa>" o "evento/<token de la reserva>".
async function pedir(ruta, opciones) {
  const respuesta = await fetch(`${URL_PUBLICO}/${ruta}`, opciones);
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.mensaje ?? "No se pudo completar la acción");
  return datos;
}

// Tarjetas para elegir el salón o lugar del evento. Form.Item le pasa value y onChange.
function SelectorUbicacion({ sucursales, value, onChange }) {
  return (
    <div className="reservar-servicios">
      {sucursales.map((s) => {
        const activo = value === s.id_sucursal;
        return (
          <button
            key={s.id_sucursal}
            type="button"
            className={`reservar-servicio${activo ? " on" : ""}`}
            aria-pressed={activo}
            onClick={() => onChange?.(s.id_sucursal)}
          >
            <div className="reservar-servicio-top">
              <b>{s.nombre}</b>
              {activo && <CheckCircleFilled className="reservar-check" />}
            </div>
            <p className="reservar-equipo">
              <EnvironmentOutlined /> {s.direccion ?? "Dirección a confirmar"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

export default function Reservar() {
  const { token } = useParams();
  const [form] = Form.useForm();
  const [datos, setDatos] = useState(null); // { empresa, sucursales, servicios, fechas_ocupadas: [{ fecha, id_sucursal }] }
  const [error, setError] = useState("");
  const [elegidos, setElegidos] = useState([]); // ids de servicio
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [hecha, setHecha] = useState(null); // token de seguimiento de la reserva recién hecha (o recién modificada)
  const [parametros, setParametros] = useSearchParams();
  const editar = parametros.get("editar"); // token de la reserva que se está corrigiendo
  const [original, setOriginal] = useState(null); // la reserva que se corrige, tal como está guardada

  const cargar = () =>
    pedir(`reservas/${token}`)
      .then((d) => { setDatos(d); setError(""); })
      .catch((e) => setError(e.message));

  useEffect(() => { cargar(); }, [token]);

  // Al corregir una reserva se trae lo que tiene guardado para completar el formulario (cada vez que se vuelve a él,
  // así una segunda corrección arranca de la versión ya modificada).
  useEffect(() => {
    setOriginal(null);
    if (!editar || hecha) return;
    pedir(`evento/${editar}`)
      .then(({ evento, servicios }) => {
        if (!evento.se_puede_modificar) throw new Error("Tu reserva ya fue revisada y no se puede modificar desde acá. Contactá a la organizadora");
        setOriginal(evento);
        setElegidos(servicios.map((s) => s.id_servicio));
      })
      .catch((e) => setError(e.message));
  }, [editar, hecha]);

  // El formulario se completa cuando ya está en pantalla (después de cargar los datos de la empresa y la reserva).
  useEffect(() => {
    if (!datos || !original || hecha) return;
    form.setFieldsValue({
      id_sucursal: original.id_sucursal ?? undefined,
      fecha: original.fecha ? dayjs(original.fecha) : undefined,
      tipo_evento: original.tipo_evento,
      cant_asistentes_estimada: original.cant_asistentes_estimada ?? undefined,
      sede_prevista: original.sede_prevista ?? undefined,
      nombre: original.cliente_nombre_pila,
      apellido: original.cliente_apellido ?? undefined,
      telefono: original.cliente_telefono,
      email: original.cliente_email ?? undefined,
      necesidades_preferencias: original.necesidades_preferencias ?? undefined,
    });
  }, [datos, original, hecha, form]);

  // Cada salón tiene su agenda: solo se bloquean las fechas ocupadas en el salón elegido.
  // La fecha de la reserva que se está corrigiendo no cuenta como ocupada (es la propia).
  const sucursales = datos?.sucursales ?? [];
  const salon = Form.useWatch("id_sucursal", form) ?? null;
  const ocupadas = useMemo(
    () => new Set((datos?.fechas_ocupadas ?? [])
      .filter((o) => (o.id_sucursal ?? null) === salon)
      .filter((o) => !(original && o.fecha === original.fecha && (o.id_sucursal ?? null) === (original.id_sucursal ?? null)))
      .map((o) => o.fecha)),
    [datos, salon, original]
  );
  const falteSalon = sucursales.length > 0 && salon === null;
  // Con salones cargados, elegir la ubicación es el primer paso; si no hay, los pasos arrancan en los servicios.
  const base = sucursales.length > 0 ? 1 : 0;
  const paso = { ubicacion: 1, servicios: base + 1, fecha: base + 2, datos: base + 3 };

  // Con un solo salón no hay nada que elegir: queda elegido.
  useEffect(() => {
    if (sucursales.length === 1 && form.getFieldValue("id_sucursal") == null) form.setFieldValue("id_sucursal", sucursales[0].id_sucursal);
  }, [sucursales, form]);
  const servicios = datos?.servicios ?? [];
  const seleccion = servicios.filter((s) => elegidos.includes(s.id_servicio));
  const total = seleccion.reduce((suma, s) => suma + Number(s.precio ?? 0), 0);
  const hayAConsultar = seleccion.some((s) => s.precio == null);

  const alternar = (id) => setElegidos((actual) => (actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]));

  // No se pueden elegir días pasados ni fechas que ya tienen una reserva en ese salón.
  const fechaDeshabilitada = (d) => d.isBefore(dayjs(), "day") || ocupadas.has(d.format("YYYY-MM-DD"));

  // Si cambia el salón y la fecha elegida está ocupada en el nuevo, se borra la fecha para que elija otra.
  const alCambiar = (cambiados) => {
    if (!("id_sucursal" in cambiados)) return;
    const fecha = form.getFieldValue("fecha");
    const ocupadasDelNuevo = (datos?.fechas_ocupadas ?? []).filter((o) => (o.id_sucursal ?? null) === (cambiados.id_sucursal ?? null));
    if (fecha && ocupadasDelNuevo.some((o) => o.fecha === fecha.format("YYYY-MM-DD"))) form.setFieldValue("fecha", undefined);
  };

  const reservar = async (valores) => {
    if (elegidos.length === 0) {
      setErrorEnvio("Elegí al menos un servicio.");
      return;
    }
    setEnviando(true);
    setErrorEnvio("");
    try {
      const respuesta = await pedir(editar ? `evento/${editar}` : `reservas/${token}`, {
        method: editar ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...valores, fecha: valores.fecha.format("YYYY-MM-DD"), servicios: elegidos }),
      });
      setHecha(respuesta.token);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErrorEnvio(e.message);
      // Si otro cliente tomó la fecha mientras tanto, se actualizan las fechas ocupadas.
      cargar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pub">
      <div className="pub-cabecera">
        <Logo />
        <BotonTema />
      </div>

      {error && (
        <Result
          status="404"
          title="No encontramos esta página de reservas"
          subTitle={`${error}. Pedile a la organizadora que te vuelva a enviar el link.`}
        />
      )}

      {!error && !datos && (
        <div className="pub-cargando">
          <Spin size="large" description="Cargando…" />
        </div>
      )}

      {datos && hecha && (
        <div className="pub-cuerpo">
          <Card variant="borderless">
            <Result
              status="success"
              title={editar ? "¡Actualizamos tu reserva!" : "¡Recibimos tu reserva!"}
              subTitle={`${datos.empresa.nombre} la va a revisar y te va a confirmar. Guardá este link para ver en qué estado está.`}
              extra={[
                // Volver al formulario con lo que cargó, por si se equivocó en algo.
                <Button key="modificar" size="large" icon={<ArrowLeftOutlined />} onClick={() => { setHecha(null); setParametros({ editar: hecha }); cargar(); }}>
                  Modificar mi reserva
                </Button>,
                <Link key="ver" to={`/evento/${hecha}`}>
                  <Button type="primary" size="large">Ver mi reserva</Button>
                </Link>,
              ]}
            />
          </Card>
        </div>
      )}

      {datos && !hecha && (
        <div className="pub-cuerpo reservar">
          <div>
            <span className="eyebrow">{editar ? "MODIFICÁ TU RESERVA" : "RESERVÁ TU EVENTO"}</span>
            <h1>{datos.empresa.nombre}</h1>
            {(datos.empresa.direccion || datos.empresa.telefono) && (
              <p className="muted">{[datos.empresa.direccion, datos.empresa.telefono].filter(Boolean).join(" · ")}</p>
            )}
          </div>

          <Form form={form} layout="vertical" requiredMark={false} onFinish={reservar} onValuesChange={alCambiar}>
          {sucursales.length > 0 && (
            <section>
              <h2 className="reservar-paso"><span>{paso.ubicacion}</span> Elegí la ubicación</h2>
              <Form.Item name="id_sucursal" rules={[{ required: true, message: "Elegí dónde querés hacer tu evento" }]}>
                <SelectorUbicacion sucursales={sucursales} />
              </Form.Item>
            </section>
          )}

          <section>
            <h2 className="reservar-paso"><span>{paso.servicios}</span> Elegí los servicios</h2>
            {servicios.length === 0 ? (
              <Empty description="Esta organizadora todavía no publicó servicios." />
            ) : (
              <div className="reservar-servicios">
                {servicios.map((s) => {
                  const activo = elegidos.includes(s.id_servicio);
                  return (
                    <button
                      key={s.id_servicio}
                      type="button"
                      className={`reservar-servicio${activo ? " on" : ""}`}
                      aria-pressed={activo}
                      onClick={() => alternar(s.id_servicio)}
                    >
                      <div className="reservar-servicio-top">
                        <b>{s.nombre}</b>
                        {activo && <CheckCircleFilled className="reservar-check" />}
                      </div>
                      <span className="reservar-precio">{s.precio != null ? moneda(s.precio) : "A consultar"}</span>
                      {s.descripcion && <p>{s.descripcion}</p>}
                      {s.equipamiento && (
                        <p className="reservar-equipo">
                          <ToolOutlined /> {s.equipamiento}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

            <section>
              <h2 className="reservar-paso"><span>{paso.fecha}</span> Elegí la fecha</h2>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="fecha"
                    label="Fecha del evento"
                    rules={[{ required: true, message: "Elegí una fecha" }]}
                    extra={falteSalon ? "Primero elegí la ubicación." : sucursales.length ? "Los días ya reservados en esta ubicación no se pueden elegir." : "Los días ya reservados no se pueden elegir."}
                  >
                    <DatePicker format="DD/MM/YYYY" placeholder="dd/mm/aaaa" style={{ width: "100%" }} disabledDate={fechaDeshabilitada} disabled={falteSalon} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="tipo_evento" label="¿Qué vas a festejar?" rules={[{ required: true, message: "Contanos qué evento es" }]}>
                    <Input maxLength={50} placeholder="Ej.: cumpleaños de 15, casamiento" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="cant_asistentes_estimada" label="Invitados (aprox.)">
                    <InputNumber min={1} precision={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                {sucursales.length === 0 && (
                  <Col xs={24} md={12}>
                    <Form.Item name="sede_prevista" label="Lugar (si ya lo tenés)">
                      <Input maxLength={100} />
                    </Form.Item>
                  </Col>
                )}
              </Row>
            </section>

            <section>
              <h2 className="reservar-paso"><span>{paso.datos}</span> Tus datos</h2>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="nombre" label="Nombre" rules={[{ required: true, message: "Ingresá tu nombre" }]}>
                    <Input maxLength={100} autoComplete="given-name" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="apellido" label="Apellido">
                    <Input maxLength={100} autoComplete="family-name" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="telefono" label="Teléfono" rules={[{ required: true, message: "Ingresá un teléfono para contactarte" }]}>
                    <Input maxLength={30} autoComplete="tel" inputMode="tel" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Ingresá un email válido" }]}>
                    <Input maxLength={100} autoComplete="email" inputMode="email" />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item name="necesidades_preferencias" label="Comentarios">
                    <Input.TextArea maxLength={500} showCount autoSize={{ minRows: 3, maxRows: 6 }} />
                  </Form.Item>
                </Col>
              </Row>
            </section>

            <Card variant="borderless" className="reservar-resumen">
              <div>
                <span className="eyebrow">{seleccion.length === 0 ? "SIN SERVICIOS ELEGIDOS" : `${seleccion.length} ${seleccion.length === 1 ? "SERVICIO" : "SERVICIOS"}`}</span>
                <b className="pub-total">{moneda(total)}</b>
                {hayAConsultar && <span className="muted">+ servicios a consultar</span>}
              </div>
              <Button type="primary" size="large" htmlType="submit" loading={enviando}>
                {editar ? "Guardar cambios" : "Reservar"}
              </Button>
            </Card>
            {errorEnvio && <Alert type="error" showIcon title={errorEnvio} />}
          </Form>
        </div>
      )}
    </div>
  );
}
