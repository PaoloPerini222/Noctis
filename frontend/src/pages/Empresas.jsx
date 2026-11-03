import Estado from "../components/Estado.jsx";
import PaginaCrud from "../components/PaginaCrud.jsx";
import { empresasApi } from "../api/empresas.js";

// Empresas de la plataforma (solo el superadmin). Cada empresa nace con su primer admin, que después suma
// al resto del equipo y asigna los roles. Sin admin nadie podría administrarla.
const config = {
  titulo: "Empresas",
  singular: "empresa",
  femenino: true,
  api: empresasApi,
  id: "id_empresa",
  buscar: (e) => `${e.nombre} ${e.cuit} ${e.email ?? ""} ${e.admins.map((r) => `${r.nombre} ${r.email ?? ""}`).join(" ")}`,
  puedeCrear: (p) => p.esSuperadmin,
  puedeEditar: (p) => p.esSuperadmin,
  columnas: [
    { titulo: "Empresa", render: (e) => e.nombre },
    { titulo: "CUIT", render: (e) => e.cuit },
    {
      titulo: "Admins",
      render: (e) =>
        e.admins.length
          ? e.admins.map((r) => r.nombre).join(", ")
          : <Estado estado="Sin admin" color="var(--red)" />,
    },
    { titulo: "Personal", render: (e) => e.personal },
    { titulo: "Email", render: (e) => e.email ?? "—" },
    { titulo: "Estado", render: (e) => <Estado estado={e.activo ? "Activa" : "Desactivada"} color={e.activo ? "var(--lime)" : "var(--muted)"} /> },
  ],
  campos: [
    { name: "nombre", label: "Nombre", required: true, full: true },
    { name: "cuit", label: "CUIT", required: true },
    { name: "telefono", label: "Teléfono" },
    { name: "email", label: "Email de la empresa", type: "email" },
    { name: "direccion", label: "Dirección" },
    {
      name: "activo", label: "Estado", type: "select", required: true, defecto: true,
      options: [{ value: true, label: "Activa" }, { value: false, label: "Desactivada" }],
      ayuda: "Una empresa desactivada no puede ingresar ni aparece al crear una cuenta.",
    },
    // El admin es obligatorio al crear la empresa; al editar sirve para sumar otro.
    { name: "admin_nombre", label: "Admin: nombre", ayuda: "Quien administra la empresa. Al crear la empresa es obligatorio; al editarla, completalo para sumar otro admin." },
    { name: "admin_apellido", label: "Admin: apellido" },
    { name: "admin_email", label: "Admin: email de acceso", type: "email" },
    { name: "admin_password", label: "Admin: contraseña", type: "password", minimo: 8, ayuda: "Mínimo 8 caracteres." },
  ],
  guardar: async (item, { admin_nombre, admin_apellido, admin_email, admin_password, ...datos }) => {
    const hayAdmin = Boolean(admin_nombre || admin_email || admin_password);
    const completo = Boolean(admin_nombre && admin_email && admin_password);
    if (hayAdmin && !completo) {
      throw new Error("Para el admin completá el nombre, el email y la contraseña.");
    }
    const admin = { nombre: admin_nombre, apellido: admin_apellido, email: admin_email, password: admin_password };

    if (!item) {
      if (!completo) throw new Error("Una empresa necesita su admin: completá nombre, email y contraseña.");
      await empresasApi.crear({ ...datos, admin });
      return;
    }
    await empresasApi.editar(item.id_empresa, datos);
    if (completo) await empresasApi.agregarAdmin(item.id_empresa, admin);
  },
};

export default function Empresas() {
  return <PaginaCrud config={config} />;
}
