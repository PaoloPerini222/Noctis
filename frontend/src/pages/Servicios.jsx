import PaginaCrud from "../components/PaginaCrud.jsx";
import { serviciosApi } from "../api/catalogos.js";
import { moneda } from "../utils/formato.js";

// Servicios que ofrece la organizadora (catering, decoración, música, fotografía...). Lo mantiene el admin.
// Es lo que ve el cliente en el link público de reservas: descripción, equipamiento con el que se presta y precio.
const config = {
  titulo: "Servicios",
  singular: "servicio",
  api: serviciosApi,
  id: "id_servicio",
  puedeCrear: (p) => p.esAdmin,
  puedeEditar: (p) => p.esAdmin,
  buscar: (s) => `${s.nombre} ${s.descripcion ?? ""} ${s.equipamiento ?? ""}`,
  columnas: [
    { titulo: "Servicio", render: (s) => s.nombre },
    { titulo: "Descripción", render: (s) => s.descripcion ?? "—" },
    { titulo: "Equipamiento", render: (s) => s.equipamiento ?? <span className="muted">Sin detallar</span> },
    { titulo: "Precio", render: (s) => (s.precio != null ? moneda(s.precio) : <span className="muted">A consultar</span>) },
  ],
  campos: [
    { name: "nombre", label: "Nombre", required: true },
    { name: "precio", label: "Precio", type: "number", step: 0.01, ayuda: "El que ve el cliente al reservar. Si lo dejás vacío figura \"a consultar\"." },
    { name: "descripcion", label: "Descripción", type: "textarea" },
    { name: "equipamiento", label: "Equipamiento", type: "textarea", ayuda: "Con qué equipos se presta el servicio, ej.: equipo de sonido, consola y luces de pista." },
  ],
};

export default function Servicios() {
  return <PaginaCrud config={config} />;
}
