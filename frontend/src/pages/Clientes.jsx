import PaginaCrud from "../components/PaginaCrud.jsx";
import { clientesApi } from "../api/clientes.js";
import { nombreCompleto } from "../utils/formato.js";

// Quien contrata el evento (P25: identificarlo y tener una forma de contactarlo).
const config = {
  titulo: "Clientes",
  singular: "cliente",
  api: clientesApi,
  id: "id_cliente",
  // Los datos del cliente los registra el organizador; el resto los consulta.
  puedeCrear: (p) => p.esOrganizador,
  puedeEditar: (p) => p.esOrganizador,
  buscar: (c) => `${nombreCompleto(c)} ${c.email ?? ""} ${c.telefono ?? ""} ${c.direccion ?? ""}`,
  columnas: [
    { titulo: "Cliente", render: (c) => nombreCompleto(c) },
    { titulo: "Teléfono", render: (c) => c.telefono ?? "—" },
    { titulo: "Email", render: (c) => c.email ?? "—" },
    { titulo: "Dirección", render: (c) => c.direccion ?? "—" },
  ],
  campos: [
    { name: "nombre", label: "Nombre", required: true },
    { name: "apellido", label: "Apellido" },
    { name: "telefono", label: "Teléfono de contacto", required: true },
    { name: "email", label: "Email", type: "email" },
    { name: "direccion", label: "Dirección", full: true },
  ],
};

export default function Clientes() {
  return <PaginaCrud config={config} />;
}
