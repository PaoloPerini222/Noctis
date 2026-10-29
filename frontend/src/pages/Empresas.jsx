import Estado from "../components/Estado.jsx";
import PaginaCrud from "../components/PaginaCrud.jsx";
import { empresasApi } from "../api/empresas.js";

// Empresas de la plataforma (solo el superadmin). Cada empresa nace con su responsable: la primera persona de la
// empresa, que después suma al resto del equipo y asigna los roles. Sin responsable nadie podría administrarla.
const config = {
  titulo: "Empresas",
  singular: "empresa",
  femenino: true,
  api: empresasApi,
  id: "id_empresa",
  buscar: (e) => `${e.nombre} ${e.cuit} ${e.email ?? ""} ${e.responsables.map((r) => `${r.nombre} ${r.email ?? ""}`).join(" ")}`,
  puedeCrear: (p) => p.esSuperadmin,
  puedeEditar: (p) => p.esSuperadmin,
  columnas: [
    { titulo: "Empresa", render: (e) => e.nombre },
    { titulo: "CUIT", render: (e) => e.cuit },
    {
      titulo: "Responsable",
      render: (e) =>
        e.responsables.length
          ? e.responsables.map((r) => r.nombre).join(", ")
          : <Estado estado="Sin responsable" color="var(--red)" />,
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
    // El responsable es obligatorio al crear la empresa; al editar sirve para sumar otro.
    { name: "responsable_nombre", label: "Responsable: nombre", ayuda: "La dueña o el dueño de la empresa. Al crear la empresa es obligatorio; al editarla, completalo para sumar otro responsable." },
    { name: "responsable_apellido", label: "Responsable: apellido" },
    { name: "responsable_email", label: "Responsable: email de acceso", type: "email" },
    { name: "responsable_password", label: "Responsable: contraseña", type: "password", minimo: 8, ayuda: "Mínimo 8 caracteres." },
  ],
  guardar: async (item, { responsable_nombre, responsable_apellido, responsable_email, responsable_password, ...datos }) => {
    const hayResponsable = Boolean(responsable_nombre || responsable_email || responsable_password);
    const completo = Boolean(responsable_nombre && responsable_email && responsable_password);
    if (hayResponsable && !completo) {
      throw new Error("Para el responsable completá el nombre, el email y la contraseña.");
    }
    const responsable = { nombre: responsable_nombre, apellido: responsable_apellido, email: responsable_email, password: responsable_password };

    if (!item) {
      if (!completo) throw new Error("Una empresa necesita su responsable: completá nombre, email y contraseña.");
      await empresasApi.crear({ ...datos, responsable });
      return;
    }
    await empresasApi.editar(item.id_empresa, datos);
    if (completo) await empresasApi.agregarResponsable(item.id_empresa, responsable);
  },
};

export default function Empresas() {
  return <PaginaCrud config={config} />;
}
