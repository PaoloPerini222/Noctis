import { ArrowRightOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Segmented, Table } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";
import { propuestasApi } from "../api/propuestas.js";
import Estado from "../components/Estado.jsx";
import Topbar from "../components/Topbar.jsx";
import useCatalogos from "../hooks/useCatalogos.js";
import usePermisos from "../hooks/usePermisos.js";
import useRecurso from "../hooks/useRecurso.js";
import { fechaCorta, fechaLarga, moneda } from "../utils/formato.js";

// Estado de la propuesta -> color de su etiqueta.
export const ESTADOS_PROPUESTA = {
  borrador: "var(--muted)",
  pendiente_aprobacion: "var(--amber)",
  aprobada: "var(--cyan)",
  enviada: "var(--violet)",
  en_negociacion: "var(--pink)",
  aceptada: "var(--lime)",
  rechazada: "var(--red)",
};

const FILTROS = [
  { id: "revisar", label: "Para revisar", test: (p) => p.estado === "pendiente_aprobacion" },
  { id: "curso", label: "En curso", test: (p) => !["aceptada", "rechazada"].includes(p.estado) },
  { id: "cerradas", label: "Aceptadas y rechazadas", test: (p) => ["aceptada", "rechazada"].includes(p.estado) },
  { id: "todas", label: "Todas", test: () => true },
];

// Listado de propuestas para controlar en qué está cada una. La propuesta se arma y se mueve desde la
// ficha de su evento (servicios, aprobación, envío, respuesta del cliente).
export default function Propuestas() {
  const permisos = usePermisos();
  const { items, cargando, error, recargar } = useRecurso(propuestasApi, "id_propuesta");
  const { nombreEvento, nombrePersona } = useCatalogos(["eventos", "personal"]);
  const [filtro, setFiltro] = useState(permisos.esResponsable ? "revisar" : "curso");
  const [busqueda, setBusqueda] = useState("");

  const q = busqueda.trim().toLowerCase();
  const visibles = items
    .filter(FILTROS.find((f) => f.id === filtro).test)
    .filter((p) => !q || `${nombreEvento(p.id_evento)} ${p.estado}`.toLowerCase().includes(q));

  const columnas = [
    {
      title: "Evento",
      key: "evento",
      className: "col-principal",
      render: (_, p) => <Link to={`/eventos/${p.id_evento}`}>{nombreEvento(p.id_evento)}</Link>,
    },
    { title: "Total", key: "total", render: (_, p) => moneda(p.total) },
    { title: "Emisión", key: "emision", render: (_, p) => (p.fecha_emision ? fechaCorta(p.fecha_emision) : "—") },
    { title: "Aprobada por", key: "aprobo", render: (_, p) => (p.aprobado_por ? nombrePersona(p.aprobado_por) : "—") },
    { title: "Estado", key: "estado", render: (_, p) => <Estado estado={p.estado} color={ESTADOS_PROPUESTA[p.estado]} /> },
    {
      key: "abrir",
      align: "right",
      render: (_, p) => (
        <Link to={`/eventos/${p.id_evento}?tab=propuesta`}>
          <Button type="text" icon={<ArrowRightOutlined />}>Abrir</Button>
        </Link>
      ),
    },
  ];

  return (
    <main className="main">
      <Topbar busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Buscar propuestas…" />
      <div className="page-head">
        <div>
          <div className="eyebrow">{fechaLarga()}</div>
          <h1>Propuestas</h1>
        </div>
      </div>

      {error && <Alert type="error" showIcon title={error} action={<Button size="small" onClick={recargar}>Reintentar</Button>} />}

      <div className="table-card">
        <div className="table-bar">
          <Segmented value={filtro} onChange={setFiltro} options={FILTROS.map((f) => ({ label: f.label, value: f.id }))} />
          <span className="muted">{cargando ? "Cargando…" : `${visibles.length} ${visibles.length === 1 ? "propuesta" : "propuestas"}`}</span>
        </div>
        <Table
          rowKey="id_propuesta"
          columns={columnas}
          dataSource={visibles}
          loading={cargando}
          pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No hay propuestas en esta vista. Las propuestas se crean desde la ficha de cada evento."
              />
            ),
          }}
        />
      </div>
    </main>
  );
}
