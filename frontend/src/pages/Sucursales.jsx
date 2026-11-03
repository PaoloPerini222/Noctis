import PaginaCrud from "../components/PaginaCrud.jsx";
import { sucursalesApi } from "../api/catalogos.js";

// Salones o lugares donde el negocio brinda sus servicios. El cliente elige uno al reservar desde el link público,
// y cada salón tiene su propia agenda: el mismo día puede haber un evento en cada salón.
const config = {
  titulo: "Sucursales",
  singular: "sucursal",
  femenino: true,
  api: sucursalesApi,
  id: "id_sucursal",
  puedeCrear: (p) => p.esAdmin,
  puedeEditar: (p) => p.esAdmin,
  buscar: (s) => `${s.nombre} ${s.direccion ?? ""}`,
  columnas: [
    { titulo: "Salón / lugar", render: (s) => s.nombre },
    { titulo: "Ubicación", render: (s) => s.direccion ?? <span className="muted">Sin dirección</span> },
  ],
  campos: [
    { name: "nombre", label: "Nombre", required: true, full: true, placeholder: "Ej.: Salón Colón" },
    { name: "direccion", label: "Ubicación", full: true, placeholder: "Ej.: Av. Colón 1200, Córdoba", ayuda: "La ve el cliente al elegir el salón en el link de reservas." },
  ],
};

export default function Sucursales() {
  return <PaginaCrud config={config} />;
}
