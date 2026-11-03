import { CopyOutlined, ExportOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Empty, Segmented, Space, Table } from "antd";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { eventosApi } from "../api/eventos.js";
import CalendarioMes from "../components/evento/CalendarioMes.jsx";
import DetalleReserva from "../components/evento/DetalleReserva.jsx";
import EventosDelDia from "../components/evento/EventosDelDia.jsx";
import Estado from "../components/Estado.jsx";
import FormModal from "../components/FormModal.jsx";
import Topbar from "../components/Topbar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useCatalogos from "../hooks/useCatalogos.js";
import usePermisos from "../hooks/usePermisos.js";
import useRecurso from "../hooks/useRecurso.js";
import { CERRADOS, colorDe, copiar, ESTADOS } from "../utils/eventos.js";
import { fechaCorta, fechaLarga, hoyISO, moneda, nombreCompleto, soloFecha } from "../utils/formato.js";

// Pantalla principal del panel: link de reservas, calendario del mes y la tabla de eventos.
// No usa PaginaCrud porque tiene más cosas (filtros, calendario, link público de reservas).

// Pestañas de la tabla. test(evento, hoy) decide si el evento entra en esa pestaña.
const FILTROS = [
  { id: "reservas", label: "Reservas nuevas", test: (e) => e.estado === "propuesta" },
  { id: "proximos", label: "Próximos", test: (e, hoy) => e.estado === "confirmado" && (!e.fecha || soloFecha(e.fecha) >= hoy) },
  { id: "pasados", label: "Pasados", test: (e, hoy) => CERRADOS.includes(e.estado) || (e.estado === "confirmado" && e.fecha && soloFecha(e.fecha) < hoy) },
];

// Campos del formulario del evento. El estado no se elige acá: entra como "propuesta" (igual que una reserva del
// link público) y se acepta, rechaza o cierra desde la ficha del evento.
//   conCliente -> el cliente solo se elige al crear (después el back no lo cambia)
export function camposEvento({ clientes, personal, servicios, sucursales = [], conCliente }) {
  return [
    { name: "tipo_evento", label: "Nombre / tipo de evento", required: true, full: true },
    ...(conCliente
      ? [{
          name: "id_cliente", label: "Cliente", type: "select", required: true, full: true,
          options: clientes.map((c) => ({ value: c.id_cliente, label: nombreCompleto(c) })),
          ayuda: clientes.length ? undefined : "Primero cargá el cliente en la sección Clientes.",
        }]
      : []),
    { name: "fecha", label: "Fecha", type: "date", ayuda: "Una fecha ya reservada en el mismo salón no se puede repetir." },
    {
      name: "id_sucursal", label: "Salón", type: "select",
      options: sucursales.map((s) => ({ value: s.id_sucursal, label: s.nombre })),
      ayuda: sucursales.length ? undefined : "Cargá tus salones en Sucursales.",
    },
    { name: "sede_prevista", label: "Otro lugar (si no es un salón propio)" },
    { name: "cant_asistentes_estimada", label: "Asistentes estimados", type: "number", step: 1 },
    {
      name: "estado_sede", label: "Disponibilidad de la sede", type: "select", required: true, defecto: "pendiente",
      options: [{ value: "pendiente", label: "Pendiente de consulta" }, { value: "confirmada", label: "Confirmada" }, { value: "no_disponible", label: "No disponible" }],
    },
    {
      name: "servicios", label: "Servicios", type: "multiselect", full: true,
      options: servicios.map((s) => ({ value: s.id_servicio, label: s.precio != null ? `${s.nombre} · ${moneda(s.precio)}` : s.nombre })),
      ayuda: "Un servicio que ya tenía el evento conserva el precio con el que se reservó.",
    },
    {
      name: "id_organizador", label: "A cargo", type: "select",
      options: personal
        .filter((p) => p.roles.some((r) => r.nombre === "admin"))
        .map((p) => ({ value: p.id_personal, label: nombreCompleto(p) })),
      ayuda: "Si lo dejás vacío, queda a cargo el admin que acepte la reserva.",
    },
    { name: "necesidades_preferencias", label: "Necesidades y preferencias", type: "textarea" },
  ];
}

export default function Eventos() {
  const permisos = usePermisos();
  const { usuario } = useAuth();
  const { message } = App.useApp();
  const { clientes, personal, servicios, sucursales, nombreCliente, recargarCatalogos } = useCatalogos(["clientes", "personal", "servicios", "sucursales"]);
  const { items, cargando, error, recargar, guardar } = useRecurso(eventosApi, "id_evento");
  const [filtro, setFiltro] = useState("reservas");
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState(null); // null | "nuevo" (los eventos existentes se editan desde su ficha)
  // El evento abierto en Detalles va en la URL (?ver=6): al volver de la ficha completa se reabre la misma card.
  const [params, setParams] = useSearchParams();
  const viendo = items.find((e) => String(e.id_evento) === params.get("ver")) ?? null;
  const setViendo = (e) => setParams(e ? { ver: e.id_evento } : {}, { replace: true });
  const [dia, setDia] = useState(null); // { fecha, eventos } del día tocado en el calendario

  const hoy = hoyISO();
  const linkReservas = usuario?.token_reservas ? `${window.location.origin}/reservar/${usuario.token_reservas}` : null;

  const campos = useMemo(
    () => camposEvento({ clientes, personal, servicios, sucursales, conCliente: editando === "nuevo" }),
    [clientes, personal, servicios, sucursales, editando]
  );

  // Filas de la tabla: búsqueda + pestaña activa, ordenadas por fecha.
  const q = busqueda.trim().toLowerCase();
  const buscados = items.filter((e) => !q || `${e.tipo_evento} ${e.sede_prevista ?? ""} ${e.sucursal_nombre ?? ""} ${e.cliente_nombre ?? ""}`.toLowerCase().includes(q));
  const lista = buscados
    .filter((e) => FILTROS.find((f) => f.id === filtro).test(e, hoy))
    .sort((a, b) => (soloFecha(a.fecha) || "9999").localeCompare(soloFecha(b.fecha) || "9999"));
  const cantidadReservas = items.filter((e) => e.estado === "propuesta").length;

  // La tabla muestra solo quién reservó y para cuándo; el resto (servicios, precio final, contacto) va en Detalles.
  // En Pasados se suma el estado, porque ahí conviven realizados, cancelados y rechazados.
  const columnas = [
    {
      title: "Cliente",
      key: "cliente",
      className: "col-principal",
      render: (_, e) => (
        <span className="bar-name" style={{ "--c": colorDe(e) }}>
          <i />
          {e.cliente_nombre ?? nombreCliente(e.id_cliente)}
        </span>
      ),
    },
    { title: "Fecha", key: "fecha", render: (_, e) => (e.fecha ? fechaCorta(e.fecha) : "Sin fecha") },
    ...(filtro === "pasados" ? [{ title: "Estado", key: "estado", render: (_, e) => <Estado estado={e.estado} color={ESTADOS[e.estado]} /> }] : []),
    {
      key: "acciones",
      align: "right",
      render: (_, e) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => setViendo(e)}>
          Detalles
        </Button>
      ),
    },
  ];

  return (
    <main className="main">
      <Topbar busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Buscar eventos…" />

      <div className="page-head">
        <div>
          <div className="eyebrow">{fechaLarga()}</div>
          <h1>Eventos</h1>
        </div>
        {permisos.esAdmin && (
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => {
              recargarCatalogos();
              setEditando("nuevo");
            }}
          >
            Nuevo evento
          </Button>
        )}
      </div>

      {/* Link público de reservas: el cliente elige servicios y fecha, y la reserva entra acá como propuesta. */}
      {linkReservas && (
        <Card variant="borderless" className="link-reservas">
          <div>
            <span className="eyebrow">LINK DE RESERVAS</span>
            <p>Compartilo con tus clientes: ven tus servicios, el equipamiento y los precios, y reservan su fecha.</p>
            <code>{linkReservas}</code>
          </div>
          <Space wrap>
            <Button type="primary" icon={<CopyOutlined />} onClick={() => copiar(message, linkReservas, "Link de reservas copiado")}>
              Copiar link
            </Button>
            <Button icon={<ExportOutlined />} href={linkReservas} target="_blank" rel="noopener noreferrer">
              Abrir
            </Button>
          </Space>
        </Card>
      )}

      {/* Calendario del mes: los días con un evento van en rojo; clic en uno muestra los eventos de ese día y su salón. */}
      <CalendarioMes eventos={items} onElegir={(fecha, eventos) => setDia({ fecha, eventos })} />

      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={<Button size="small" onClick={recargar}>Reintentar</Button>}
        />
      )}

      <div className="table-card">
        <div className="table-bar">
          <Segmented
            value={filtro}
            onChange={setFiltro}
            options={FILTROS.map((f) => ({ label: f.id === "reservas" && cantidadReservas ? `${f.label} (${cantidadReservas})` : f.label, value: f.id }))}
          />
          <span className="muted">
            {cargando ? "Cargando…" : `${lista.length} ${lista.length === 1 ? "evento" : "eventos"}`}
          </span>
        </div>
        <Table
          rowKey="id_evento"
          columns={columnas}
          dataSource={lista}
          loading={cargando}
          pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={busqueda ? "Sin resultados." : filtro === "reservas" ? "No hay reservas nuevas." : "No hay eventos en esta vista."}
              />
            ),
          }}
        />
      </div>

      {editando && (
        <FormModal
          titulo="Nuevo evento"
          campos={campos}
          item={null}
          onGuardar={async (valores) => {
            await guardar(null, valores);
            message.success("Reserva registrada");
          }}
          onCerrar={() => setEditando(null)}
        />
      )}

      {dia && (
        <EventosDelDia
          fecha={dia.fecha}
          eventos={dia.eventos}
          onElegir={(evento) => {
            setDia(null);
            setViendo(evento);
          }}
          onCerrar={() => setDia(null)}
        />
      )}

      {viendo && (
        <DetalleReserva
          evento={viendo}
          onCerrar={() => setViendo(null)}
          onCambio={() => {
            recargar();
            recargarCatalogos();
          }}
        />
      )}
    </main>
  );
}
