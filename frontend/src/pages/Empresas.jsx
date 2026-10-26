import PaginaCrud from "../components/PaginaCrud.jsx";
import { empresasApi } from "../api/empresas.js";

const config = {
  titulo: "Empresas",
  singular: "empresa",
  femenino: true,
  api: empresasApi,
  id: "id_empresa",
  buscar: (e) => `${e.nombre} ${e.cuit} ${e.email ?? ""}`,
  puedeCrear: (p) => p.esSuperadmin,
  puedeEditar: (p) => p.esSuperadmin,
  columnas: [
    { titulo: "Empresa", render: (e) => e.nombre },
    { titulo: "CUIT", render: (e) => e.cuit },
    { titulo: "Email", render: (e) => e.email ?? "—" },
    { titulo: "Teléfono", render: (e) => e.telefono ?? "—" },
    { titulo: "Dirección", render: (e) => e.direccion ?? "—" },
    { titulo: "Estado", render: (e) => (e.activo ? "Activa" : "Desactivada") },
  ],
  campos: [
    { name: "nombre", label: "Nombre", required: true, full: true },
    { name: "cuit", label: "CUIT", required: true },
    { name: "telefono", label: "Teléfono" },
    { name: "email", label: "Email", type: "email", full: true },
    { name: "direccion", label: "Dirección", full: true },
    {
      name: "activo", label: "Estado", type: "select", required: true, defecto: true,
      options: [{ value: true, label: "Activa" }, { value: false, label: "Desactivada" }],
      ayuda: "Una empresa desactivada no puede ingresar ni aparece al crear una cuenta.",
    },
  ],
};

export default function Empresas() {
  return <PaginaCrud config={config} />;
}
