import { useEffect, useMemo, useState } from "react";
import Estado from "../components/Estado.jsx";
import PaginaCrud from "../components/PaginaCrud.jsx";
import { personalApi, rolesApi } from "../api/equipo.js";
import { etiqueta } from "../utils/formato.js";

// Color de cada rol (variables del tema, así se ven bien en claro y en oscuro).
const COLOR_ROL = { responsable: "var(--amber)", organizador: "var(--pink)", coordinador: "var(--cyan)" };

// Qué hace cada rol: se muestra al elegirlos para que la responsable sepa qué le está dando a cada persona.
const AYUDA_ROLES =
  "Responsable: aprueba propuestas y gestiona el equipo. Organizador: carga clientes, eventos, propuestas y proveedores. " +
  "Coordinador: sigue a los proveedores y las tareas. En un equipo chico una misma persona puede tener varios roles. " +
  "Sin roles no puede entrar al panel, y la empresa siempre necesita al menos un responsable.";

// Equipo de la organizadora. Todos lo consultan; la responsable (la dueña de la empresa) suma personas con su cuenta
// de acceso (email y contraseña) y sus roles, en un solo paso.
// Quien se registra por su cuenta aparece "pendiente de autorizar" hasta que la responsable le asigna un rol.
export default function Equipo() {
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    // El rol de superadmin es de la plataforma: una empresa no lo puede dar.
    rolesApi.obtenerTodos().then((r) => setRoles(r.filter((x) => x.nombre !== "superadmin"))).catch(() => setRoles([]));
  }, []);

  const config = useMemo(() => ({
    titulo: "Equipo",
    singular: "persona",
    femenino: true,
    api: personalApi,
    id: "id_personal",
    puedeCrear: (p) => p.esResponsable,
    puedeEditar: (p) => p.esResponsable,
    buscar: (p) => `${p.nombre} ${p.email ?? ""} ${p.roles.map((r) => r.nombre).join(" ")}`,
    columnas: [
      { titulo: "Nombre", render: (p) => p.nombre },
      { titulo: "Email", render: (p) => p.email ?? <span className="muted">Sin acceso al sistema</span> },
      {
        titulo: "Roles",
        render: (p) =>
          p.roles.length
            ? p.roles.map((r) => <Estado key={r.id_rol} estado={r.nombre} color={COLOR_ROL[r.nombre]} />)
            : <Estado estado="Pendiente de autorizar" color="var(--amber)" />,
      },
    ],
    campos: [
      { name: "nombre", label: "Nombre", required: true, full: true },
      {
        name: "email", label: "Email de acceso", type: "email",
        ayuda: "Con el email y la contraseña la persona puede ingresar al sistema. Si no los cargás, queda solo como parte del equipo.",
      },
      {
        name: "password", label: "Contraseña", type: "password", minimo: 8,
        ayuda: "Mínimo 8 caracteres. Al editar, dejala vacía para no cambiarla.",
      },
      {
        name: "id_roles", label: "Roles", type: "multiselect", full: true,
        options: roles.map((r) => ({ value: r.id_rol, label: etiqueta(r.nombre) })),
        ayuda: AYUDA_ROLES,
        desde: (p) => p.roles.map((r) => r.id_rol),
      },
    ],
    guardar: async (item, { id_roles, ...datos }) => {
      // Los datos de acceso van juntos: con uno solo la persona no podría ingresar.
      if (!item && Boolean(datos.email) !== Boolean(datos.password)) {
        throw new Error("Para que ingrese al sistema cargá el email y la contraseña, o dejá los dos vacíos.");
      }
      const persona = item ? await personalApi.editar(item.id_personal, datos) : await personalApi.crear(datos);
      await personalApi.asignarRoles(persona.id_personal, id_roles);
    },
  }), [roles]);

  return <PaginaCrud config={config} />;
}
