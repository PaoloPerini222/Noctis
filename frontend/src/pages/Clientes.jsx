import PaginaCrud from "../components/PaginaCrud.jsx";
import { clientesApi } from "../api/clientes.js";
import { nombreCompleto } from "../utils/formato.js";
import { linkWhatsapp } from "../utils/eventos.js";

// Tocar el teléfono abre WhatsApp con el cliente (si el número no sirve para WhatsApp, llama) y el email abre el correo.
function Telefono({ cliente }) {
  if (!cliente.telefono) return "—";
  const whatsapp = linkWhatsapp(cliente.telefono, `Hola ${cliente.nombre}!`);
  return (
    <a href={whatsapp ?? `tel:${cliente.telefono}`} target={whatsapp ? "_blank" : undefined} rel="noopener noreferrer">
      {cliente.telefono}
    </a>
  );
}

const Email = ({ cliente }) => (cliente.email ? <a href={`mailto:${cliente.email}`}>{cliente.email}</a> : "—");

// Quien contrata el evento (P25: identificarlo y tener una forma de contactarlo).
const config = {
  titulo: "Clientes",
  singular: "cliente",
  api: clientesApi,
  id: "id_cliente",
  // Los datos del cliente los registra el organizador; el resto los consulta.
  puedeCrear: (p) => p.esAdmin,
  puedeEditar: (p) => p.esAdmin,
  buscar: (c) => `${nombreCompleto(c)} ${c.email ?? ""} ${c.telefono ?? ""} ${c.direccion ?? ""}`,
  columnas: [
    { titulo: "Cliente", render: (c) => nombreCompleto(c) },
    { titulo: "Teléfono", render: (c) => <Telefono cliente={c} /> },
    { titulo: "Email", render: (c) => <Email cliente={c} /> },
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
