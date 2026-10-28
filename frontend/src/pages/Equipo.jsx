import { Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import PaginaCrud from "../components/PaginaCrud.jsx";
import { personalApi, rolesApi } from "../api/equipo.js";
import { etiqueta } from "../utils/formato.js";

const COLOR_ROL = { responsable: "gold", organizador: "magenta", coordinador: "cyan" };

// Personal de la organizadora. Todos lo consultan; la responsable da de alta personas y asigna roles.
// Quien se registra aparece "pendiente de autorizar" hasta que la responsable le asigna un rol.
export default function Equipo() {
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    rolesApi.obtenerTodos().then(setRoles).catch(() => setRoles([]));
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
      { titulo: "Email", render: (p) => p.email ?? <span className="muted">Sin usuario</span> },
      {
        titulo: "Roles",
        render: (p) =>
          p.roles.length
            ? p.roles.map((r) => <Tag key={r.id_rol} color={COLOR_ROL[r.nombre]}>{etiqueta(r.nombre)}</Tag>)
            : <Tag color="orange">Pendiente de autorizar</Tag>,
      },
    ],
    campos: [
      { name: "nombre", label: "Nombre", required: true, full: true },
      {
        name: "id_roles", label: "Roles", type: "multiselect", full: true,
        options: roles.map((r) => ({ value: r.id_rol, label: etiqueta(r.nombre) })),
        ayuda: "Sin roles la persona no puede ingresar al panel.",
        desde: (p) => p.roles.map((r) => r.id_rol),
      },
    ],
    guardar: async (item, { id_roles, ...datos }) => {
      const persona = item ? await personalApi.editar(item.id_personal, datos) : await personalApi.crear(datos);
      await personalApi.asignarRoles(persona.id_personal, id_roles);
    },
  }), [roles]);

  return <PaginaCrud config={config} />;
}
