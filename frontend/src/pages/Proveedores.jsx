import { Tag } from "antd";
import { useMemo } from "react";
import PaginaCrud from "../components/PaginaCrud.jsx";
import { proveedoresApi } from "../api/catalogos.js";
import useCatalogos from "../hooks/useCatalogos.js";

// Proveedores y los servicios que ofrece cada uno. Los da de alta el organizador que empieza a trabajar
// con ellos; si ya existe uno con el mismo nombre, el back lo avisa para reutilizarlo.
export default function Proveedores() {
  const { servicios } = useCatalogos(["servicios"]);

  const config = useMemo(() => ({
    titulo: "Proveedores",
    singular: "proveedor",
    api: proveedoresApi,
    id: "id_proveedor",
    puedeCrear: (p) => p.esOrganizador,
    puedeEditar: (p) => p.esOrganizador,
    buscar: (p) => `${p.nombre} ${p.contacto ?? ""} ${p.servicios.map((s) => s.nombre).join(" ")}`,
    columnas: [
      { titulo: "Proveedor", render: (p) => p.nombre },
      { titulo: "Contacto", render: (p) => p.contacto ?? "—" },
      { titulo: "Teléfono", render: (p) => p.telefono ?? "—" },
      { titulo: "Email", render: (p) => p.email ?? "—" },
      {
        titulo: "Servicios",
        render: (p) => (p.servicios.length ? p.servicios.map((s) => <Tag key={s.id_servicio}>{s.nombre}</Tag>) : "—"),
      },
    ],
    campos: [
      { name: "nombre", label: "Nombre o empresa", required: true, full: true },
      { name: "contacto", label: "Persona de contacto" },
      { name: "telefono", label: "Teléfono" },
      { name: "email", label: "Email", type: "email", full: true },
      {
        name: "servicios", label: "Servicios que ofrece", type: "multiselect", full: true,
        options: servicios.map((s) => ({ value: s.id_servicio, label: s.nombre })),
        desde: (p) => p.servicios.map((s) => s.id_servicio),
      },
    ],
    // Los datos y los servicios van a endpoints distintos.
    guardar: async (item, { servicios: ids, ...datos }) => {
      const proveedor = item
        ? await proveedoresApi.editar(item.id_proveedor, datos)
        : await proveedoresApi.crear(datos);
      await proveedoresApi.asignarServicios(proveedor.id_proveedor, ids);
    },
  }), [servicios]);

  return <PaginaCrud config={config} />;
}
