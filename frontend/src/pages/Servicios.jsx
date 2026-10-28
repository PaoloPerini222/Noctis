import PaginaCrud from "../components/PaginaCrud.jsx";
import { serviciosApi } from "../api/catalogos.js";

// Catálogo de servicios (catering, sonido, decoración...). Lo mantiene el organizador.
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
  ],
  campos: [
    { name: "nombre", label: "Nombre", required: true, full: true },
    { name: "descripcion", label: "Descripción", type: "textarea" },
  ],
};

export default function Servicios() {
  return <PaginaCrud config={config} />;
}
