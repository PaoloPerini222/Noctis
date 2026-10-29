import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Badge, Button, Card, Empty } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { pendientesApi } from "../api/equipo.js";
import Estado, { COLORES_SEDE } from "../components/Estado.jsx";
import usePermisos from "../hooks/usePermisos.js";
import { mensajeError } from "../services/api.js";
import { contacto, diasHasta, etiqueta, fechaCorta, fechaLarga, moneda } from "../utils/formato.js";
import { ESTADOS } from "./Eventos.jsx";

// Tablero para controlar y priorizar: lo pendiente y lo vencido de todos los eventos en curso.
// Cada bloque lleva a la ficha del evento, donde se resuelve.
export default function Pendientes() {
  const permisos = usePermisos();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setDatos(await pendientesApi.obtener());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los pendientes"));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enlace = (idEvento, tab) => `/eventos/${idEvento}${tab ? `?tab=${tab}` : ""}`;

  // Cada bloque: título, lista, cómo se dibuja cada fila y texto cuando está vacío.
  // El orden pone primero lo que le toca decidir a cada rol.
  const bloques = [
    {
      id: "revisar",
      titulo: "Propuestas para revisar",
      items: datos?.propuestas_para_revisar ?? [],
      fila: (p) => (
        <Link to={enlace(p.id_evento, "propuesta")}>
          <b>{p.tipo_evento}</b> · {moneda(p.total)} {p.fecha_evento && <span className="muted">· {fechaCorta(p.fecha_evento)}</span>}
        </Link>
      ),
      vacio: "No hay propuestas esperando aprobación.",
      prioridad: permisos.esResponsable,
    },
    {
      id: "vencidas",
      titulo: "Tareas vencidas",
      color: "var(--red)",
      items: datos?.tareas_vencidas ?? [],
      fila: (t) => (
        <Link to={enlace(t.id_evento, "tareas")}>
          <b>{t.descripcion}</b> · {t.tipo_evento}
          <span className="muted"> · {t.id_personal === permisos.yo ? "vos" : t.responsable} · venció {fechaCorta(t.fecha_prevista)}</span>
        </Link>
      ),
      vacio: "Ninguna tarea vencida.",
    },
    {
      id: "sinconfirmar",
      titulo: "Servicios sin confirmar",
      items: datos?.servicios_sin_confirmar ?? [],
      fila: (s) => (
        <Link to={enlace(s.id_evento, "propuesta")}>
          <b>{s.servicio}</b> · {s.tipo_evento}
          <span className="muted"> · {s.proveedor ?? "sin proveedor"} · </span>
          <Estado estado={s.estado_proveedor} color={s.estado_proveedor === "no_disponible" ? "var(--red)" : "var(--amber)"} />
        </Link>
      ),
      vacio: "Todos los servicios de los encargos tienen proveedor confirmado.",
      prioridad: permisos.esCoordinador,
    },
    {
      id: "pendientes",
      titulo: "Tareas pendientes",
      items: datos?.tareas_pendientes ?? [],
      fila: (t) => (
        <Link to={enlace(t.id_evento, "tareas")}>
          <b>{t.descripcion}</b> · {t.tipo_evento}
          <span className="muted"> · {t.id_personal === permisos.yo ? "vos" : t.responsable} · {fechaCorta(t.fecha_prevista)} · {etiqueta(t.estado)}</span>
        </Link>
      ),
      vacio: "No hay tareas pendientes.",
    },
    {
      id: "proximos",
      titulo: "Próximos eventos",
      ancho: true,
      items: datos?.eventos_proximos ?? [],
      // Por evento, del más próximo al más lejano: qué es, de quién, dónde, en qué estado está y qué falta resolver.
      fila: (e) => {
        const dias = e.fecha ? diasHasta(e.fecha) : null;
        const vencidas = e.tareas.filter((t) => t.vencida).length;
        return (
          <div className="proximo">
            <Link to={enlace(e.id_evento)}>
              <b>{e.tipo_evento}</b> · {e.fecha ? fechaCorta(e.fecha) : <span className="muted">Fecha pendiente de aclaración</span>}
              {dias != null && <span className="muted"> · {dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`}</span>}
            </Link>
            <div className="muted">
              {e.cliente}
              {contacto(e.cliente_telefono, e.cliente_email) && ` · ${contacto(e.cliente_telefono, e.cliente_email)}`}
            </div>
            <div className="proximo-estados">
              <span className="muted">Sede: {e.sede_prevista ?? "pendiente de aclaración"}</span>
              <Estado estado={e.estado_sede === "pendiente" ? "pendiente de consulta" : e.estado_sede} color={COLORES_SEDE[e.estado_sede]} />
              <span className="muted">
                · {e.cant_asistentes_estimada != null ? `${Number(e.cant_asistentes_estimada).toLocaleString("es-AR")} asistentes estimados` : "asistentes pendientes de aclaración"} ·
              </span>
              <Estado estado={e.estado} color={ESTADOS[e.estado]} />
              {vencidas > 0 && <Estado estado={`${vencidas} ${vencidas === 1 ? "tarea vencida" : "tareas vencidas"}`} color="var(--red)" />}
            </div>
            {e.servicios_sin_confirmar.length > 0 && (
              <ul className="proximo-detalle">
                {e.servicios_sin_confirmar.map((s) => (
                  <li key={s.id_detalle}>
                    Sin confirmar: <b>{s.servicio}</b> <span className="muted">({s.proveedor ?? "sin proveedor"})</span>{" "}
                    <Estado estado={s.estado_proveedor} color={s.estado_proveedor === "no_disponible" ? "var(--red)" : "var(--amber)"} />
                  </li>
                ))}
              </ul>
            )}
            {e.tareas.length > 0 && (
              <ul className="proximo-detalle">
                {e.tareas.map((t) => (
                  <li key={t.id_tarea} className={t.vencida ? "vencida" : undefined}>
                    {t.vencida ? "Vencida" : etiqueta(t.estado)}: <b>{t.descripcion}</b>
                    <span className="muted"> · {t.id_personal === permisos.yo ? "vos" : t.responsable} · {fechaCorta(t.fecha_prevista)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      },
      vacio: "No hay encargos con fecha próxima.",
    },
  ].sort((a, b) => Number(!!b.prioridad) - Number(!!a.prioridad));

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <div className="eyebrow">{fechaLarga()}</div>
          <h1>Pendientes</h1>
        </div>
        <Button icon={<ReloadOutlined />} onClick={cargar} loading={cargando}>
          Actualizar
        </Button>
      </div>

      {error && <Alert type="error" showIcon title={error} />}

      <div className="pendientes-grid">
        {bloques.map((b) => (
          <Card
            key={b.id}
            variant="borderless"
            className={b.ancho ? "pendientes-card pendientes-ancho" : "pendientes-card"}
            loading={cargando && !datos}
            title={
              <span>
                {b.titulo} <Badge count={b.items.length} showZero color={b.items.length ? b.color ?? "var(--amber)" : "var(--faint)"} />
              </span>
            }
          >
            {b.items.length ? (
              <ul className="pendientes-lista">
                {b.items.map((item, i) => (
                  <li key={i}>{b.fila(item)}</li>
                ))}
              </ul>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={b.vacio} />
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
