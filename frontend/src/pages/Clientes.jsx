import PaginaCrud from "../components/PaginaCrud.jsx";
import { clientesApi } from "../api/clientes.js";

const config = {
  titulo: "Clientes",
  singular: "cliente",
  api: clientesApi,
  id: "id_cliente",
  // Los datos del cliente los registra el organizador; el resto los consulta.
  puedeCrear: (p) => p.esOrganizador,
  puedeEditar: (p) => p.esOrganizador,
  buscar: (c) => `${c.nombre} ${c.email ?? ""} ${c.telefono ?? ""}`,
  columnas: [
    { titulo: "Cliente", render: (c) => c.nombre },
    { titulo: "Teléfono", render: (c) => c.telefono ?? "—" },
    { titulo: "Email", render: (c) => c.email ?? "—" },
  ],
  campos: [
    { name: "nombre", label: "Nombre", required: true, full: true },
    { name: "telefono", label: "Teléfono", required: true },
    { name: "email", label: "Email", type: "email" },
  ],
};

export default function Clientes() {
  return <PaginaCrud config={config} />;
}
