import { SyncOutlined } from "@ant-design/icons";
import { Alert, App, Button, Progress, Select, Skeleton, Table, Tooltip } from "antd";
import { useCallback, useEffect, useState } from "react";
import { reportesApi } from "../api/reportes.js";
import Estado from "../components/Estado.jsx";
import Topbar from "../components/Topbar.jsx";
import { mensajeError } from "../services/api.js";
import { ESTADOS } from "../utils/eventos.js";
import { etiqueta, moneda } from "../utils/formato.js";

// Reportes del negocio. Los datos salen del Data Warehouse (base noctis_dw, modelo estrella de las reservas):
// el back lo recarga con CALL dw.cargar() después de cada cambio, cada algunas horas o al tocar "Actualizar datos".
// Ingresos = reservas confirmadas o realizadas.

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);
const fechaHora = (valor) =>
  new Date(valor).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Una tarjeta por pregunta: la pregunta de título, la respuesta en una frase y el detalle (gráfico o tabla).
function Bloque({ titulo, detalle, respuesta, children, ancho = false }) {
  return (
    <section className={`table-card reporte${ancho ? " reporte--ancho" : ""}`}>
      <div className="table-bar">
        <b>{titulo}</b>
        {detalle && <span className="muted">{detalle}</span>}
      </div>
      <div className="reporte-cuerpo">
        {respuesta && <p className="reporte-respuesta">{respuesta}</p>}
        {children}
      </div>
    </section>
  );
}

const plural = (n, palabra) => `${n} ${palabra}${n === 1 ? "" : "s"}`;

// La respuesta corta a cada pregunta, armada con los datos del período.
function respuestas(d) {
  const sinDatos = "Todavía no hay datos en este período.";
  const [mejorMes] = [...d.ingresosPorMes].sort((a, b) => b.ingresos - a.ingresos);
  const [sucursal] = d.ingresosPorSucursal;
  const [tipo] = d.ingresosPorTipo;
  const cuenta = (...estados) => d.estados.filter((e) => estados.includes(e.estado)).reduce((t, e) => t + e.eventos, 0);
  const confirmados = cuenta("confirmado", "realizado");
  const cancelados = cuenta("cancelado", "rechazado");
  const total = d.resumen.eventos;
  const [salon] = d.ocupacion;
  const [cliente] = d.clientes;

  return {
    meses: mejorMes ? `Tu mejor mes fue ${mejorMes.nombre_mes} con ${moneda(mejorMes.ingresos)}.` : sinDatos,
    sucursales: sucursal ? `${etiqueta(sucursal.nombre)} es la que más factura: ${moneda(sucursal.ingresos)}.` : sinDatos,
    tipos: tipo ? `Los eventos de tipo "${etiqueta(tipo.nombre)}" son los que más dejan: ${moneda(tipo.ingresos)}.` : sinDatos,
    estados: total
      ? `De ${plural(total, "evento")}, se confirmaron ${confirmados} (${porcentaje(confirmados, total)}%) y se cancelaron o rechazaron ${cancelados} (${porcentaje(cancelados, total)}%).`
      : sinDatos,
    ocupacion: salon
      ? `${etiqueta(salon.nombre)} es el salón más ocupado: ${plural(salon.dias_reservados, "día")} reservados y ${plural(salon.dias_periodo - salon.dias_reservados, "día")} libres.`
      : "Todavía no cargaste salones.",
    clientes: cliente
      ? `Volvieron ${d.resumen.clientes_que_vuelven} de ${plural(d.resumen.clientes, "cliente")}. El que más gastó es ${etiqueta(cliente.nombre)}: ${moneda(cliente.gastado)}.`
      : sinDatos,
  };
}

// Columnas verticales por mes. Una sola serie: no lleva leyenda, el título la nombra.
function GraficoMeses({ filas }) {
  const porMes = MESES.map((nombre, i) => ({ nombre, ...(filas.find((f) => f.mes === i + 1) ?? { ingresos: 0, eventos: 0 }) }));
  const maximo = Math.max(...porMes.map((m) => m.ingresos), 1);
  return (
    <div className="grafico-meses" role="img" aria-label="Ingresos por mes">
      {porMes.map((m) => (
        <Tooltip key={m.nombre} title={`${m.nombre}: ${moneda(m.ingresos)} · ${m.eventos} evento${m.eventos === 1 ? "" : "s"}`}>
          <div className="grafico-meses__col">
            <div className="grafico-meses__pista">
              <div className="grafico-meses__barra" style={{ height: `${(m.ingresos / maximo) * 100}%` }} />
            </div>
            <span>{m.nombre}</span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

// Lista de barras horizontales: nombre, barra proporcional y valor.
function Barras({ filas, valor, texto, vacio = "Sin datos en este período" }) {
  if (!filas.length) return <p className="muted reporte-vacio">{vacio}</p>;
  const maximo = Math.max(...filas.map(valor), 1);
  return (
    <ul className="barras">
      {filas.map((f) => (
        <li key={f.nombre ?? f.estado}>
          <span className="barras__nombre">{f.etiqueta ?? etiqueta(f.nombre)}</span>
          <div className="barras__pista">
            <div className="barras__barra" style={{ width: `${(valor(f) / maximo) * 100}%` }} />
          </div>
          <span className="barras__valor">{texto(f)}</span>
        </li>
      ))}
    </ul>
  );
}

const tabla = { size: "small", pagination: false, rowKey: (f) => f.nombre, scroll: { x: true }, locale: { emptyText: "Sin datos en este período" } };

export default function Reportes() {
  const { message } = App.useApp();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [actualizando, setActualizando] = useState(false);

  const cargar = useCallback(async () => {
    setError("");
    try {
      setDatos(await reportesApi.obtener(anio));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los reportes"));
    }
  }, [anio]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const actualizar = async () => {
    setActualizando(true);
    try {
      await reportesApi.actualizar();
      await cargar();
      message.success("Datos actualizados");
    } catch (e) {
      message.error(mensajeError(e, "No se pudieron actualizar los datos"));
    } finally {
      setActualizando(false);
    }
  };

  const anioActual = new Date().getFullYear();
  const anios = [...new Set([anioActual, ...(datos?.anios ?? [])])].sort((a, b) => b - a);
  const r = datos?.resumen;
  const resp = datos ? respuestas(datos) : null;

  return (
    <main className="main">
      <Topbar busqueda="" onBusqueda={() => {}} placeholder="Reportes" deshabilitado />

      <div className="page-head">
        <div>
          <div className="eyebrow">
            Data Warehouse{datos?.ultima_carga ? ` · actualizado ${fechaHora(datos.ultima_carga)}` : ""}
          </div>
          <h1>Reportes</h1>
        </div>
        <div className="reportes-acciones">
          <Select
            value={anio ?? "todos"}
            onChange={(v) => setAnio(v === "todos" ? null : v)}
            options={[...anios.map((a) => ({ value: a, label: String(a) })), { value: "todos", label: "Todos los años" }]}
            style={{ minWidth: 150 }}
            aria-label="Año"
          />
          <Button icon={<SyncOutlined spin={actualizando} />} loading={actualizando} onClick={actualizar}>
            Actualizar datos
          </Button>
        </div>
      </div>

      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      {!datos && !error && <Skeleton active paragraph={{ rows: 8 }} />}

      {datos && (
        <div className="reportes">
          <div className="reportes-kpis">
            <div className="table-card kpi">
              <span className="eyebrow">Ingresos</span>
              <b>{moneda(r.ingresos)}</b>
              <span className="muted">Eventos confirmados y realizados</span>
            </div>
            <div className="table-card kpi">
              <span className="eyebrow">Eventos</span>
              <b>{r.eventos}</b>
              <span className="muted">En todos los estados</span>
            </div>
            <div className="table-card kpi">
              <span className="eyebrow">Ticket promedio</span>
              <b>{moneda(r.ticket_promedio)}</b>
              <span className="muted">Por evento con ingreso</span>
            </div>
            <div className="table-card kpi">
              <span className="eyebrow">Clientes que vuelven</span>
              <b>{Math.round(r.porcentaje_vuelven)}%</b>
              <span className="muted">
                {r.clientes_que_vuelven} de {r.clientes} cliente{r.clientes === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="reportes-grid">
            <Bloque titulo="¿Cuánto facturé cada mes?" detalle={anio ?? "Todos los años"} respuesta={resp.meses} ancho>
              <GraficoMeses filas={datos.ingresosPorMes} />
            </Bloque>

            <Bloque titulo="¿Qué sucursal factura más?" respuesta={resp.sucursales}>
              <Barras filas={datos.ingresosPorSucursal} valor={(f) => f.ingresos} texto={(f) => moneda(f.ingresos)} />
            </Bloque>

            <Bloque titulo="¿Qué tipo de evento deja más?" respuesta={resp.tipos}>
              <Barras filas={datos.ingresosPorTipo} valor={(f) => f.ingresos} texto={(f) => moneda(f.ingresos)} />
            </Bloque>

            <Bloque titulo="¿Cuántos eventos se confirman y cuántos se cancelan?" respuesta={resp.estados}>
              <ul className="estados-lista">
                {datos.estados.map((e) => (
                  <li key={e.estado}>
                    <Estado estado={e.descripcion} color={ESTADOS[e.estado]} />
                    <span className="barras__pista">
                      <span
                        className="barras__barra"
                        style={{ width: `${porcentaje(e.eventos, r.eventos)}%`, background: ESTADOS[e.estado] }}
                      />
                    </span>
                    <span className="barras__valor">
                      {e.eventos} <span className="muted">({porcentaje(e.eventos, r.eventos)}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Bloque>

            <Bloque titulo="¿Qué tan ocupado está cada salón?" detalle="Días reservados contra días libres" respuesta={resp.ocupacion}>
              <Table
                {...tabla}
                dataSource={datos.ocupacion}
                columns={[
                  { title: "Salón", dataIndex: "nombre", render: etiqueta },
                  { title: "Reservados", dataIndex: "dias_reservados", align: "right" },
                  { title: "Libres", align: "right", render: (_, f) => f.dias_periodo - f.dias_reservados },
                  {
                    title: "Ocupación",
                    width: 160,
                    render: (_, f) => (
                      <Progress
                        percent={Math.round(((f.dias_reservados / f.dias_periodo) * 100) * 10) / 10}
                        size="small"
                        strokeColor="var(--pink)"
                      />
                    ),
                  },
                ]}
              />
            </Bloque>

            <Bloque titulo="¿Qué clientes vuelven y cuánto gastó cada uno?" respuesta={resp.clientes}>
              <Table
                {...tabla}
                dataSource={datos.clientes}
                columns={[
                  { title: "Cliente", dataIndex: "nombre", render: etiqueta },
                  { title: "Eventos", dataIndex: "eventos", align: "right" },
                  { title: "Gastado", dataIndex: "gastado", align: "right", render: moneda },
                  {
                    title: "",
                    dataIndex: "vuelve",
                    render: (vuelve) => (vuelve ? <Estado estado="Volvió" color="var(--lime)" /> : <span className="muted">1 vez</span>),
                  },
                ]}
              />
            </Bloque>
          </div>
        </div>
      )}
    </main>
  );
}
