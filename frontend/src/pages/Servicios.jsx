import PaginaCrud from "../components/PaginaCrud.jsx";
import { serviciosApi } from "../api/catalogos.js";
import { moneda } from "../utils/formato.js";

// Servicios que ofrece la organizadora (catering, decoración, música, fotografía...). Lo mantiene el organizador.
// El importe de referencia es solo un punto de partida al armar una propuesta: el importe real varía según los
// asistentes, el evento y el proveedor, y lo define el organizador en cada propuesta.
const config = {
  titulo: "Servicios",
  singular: "servicio",
  api: serviciosApi,
  id: "id_servicio",
  puedeCrear: (p) => p.esOrganizador,
  puedeEditar: (p) => p.esOrganizador,
  buscar: (s) => `${s.nombre} ${s.descripcion ?? ""}`,
  columnas: [
    { titulo: "Servicio", render: (s) => s.nombre },
    { titulo: "Descripción", render: (s) => s.descripcion ?? "—" },
    { titulo: "Importe de referencia", render: (s) => (s.importe_referencia != null ? moneda(s.importe_referencia) : <span className="muted">Sin referencia</span>) },
  ],
  campos: [
    { name: "nombre", label: "Nombre", required: true, full: true },
    { name: "descripcion", label: "Descripción", type: "textarea" },
    { name: "importe_referencia", label: "Importe de referencia", type: "number", step: 0.01, ayuda: "Opcional. Solo orienta al armar la propuesta; no es un precio fijo." },
  ],
};

export default function Servicios() {
  return <PaginaCrud config={config} />;
}
