import { Tag } from "antd";
import { useMemo } from "react";
import PaginaCrud from "../components/PaginaCrud.jsx";
import { proveedoresApi } from "../api/catalogos.js";
import useCatalogos from "../hooks/useCatalogos.js";

// Proveedores y los servicios que ofrece cada uno. Cuando se reserva uno de esos servicios, desde los Detalles de la
// reserva se le escribe por WhatsApp con un mensaje armado (por eso el teléfono y los servicios son obligatorios).
export default function Proveedores() {
  const { servicios } = useCatalogos(["servicios"]);

  const config = useMemo(() => ({
    titulo: "Proveedores",
    singular: "proveedor",
    api: proveedoresApi,
    id: "id_proveedor",
    puedeCrear: (p) => p.esAdmin,
    puedeEditar: (p) => p.esAdmin,
    buscar: (p) => `${p.nombre} ${p.contacto ?? ""} ${p.telefono ?? ""} ${p.email ?? ""} ${p.servicios.map((s) => s.nombre).join(" ")}`,
    columnas: [
      { titulo: "Proveedor", render: (p) => p.nombre },
      {
        titulo: "Servicio",
        render: (p) => (p.servicios.length ? p.servicios.map((s) => <Tag key={s.id_servicio}>{s.nombre}</Tag>) : <span className="muted">Sin servicio</span>),
      },
      { titulo: "Contacto", render: (p) => p.contacto ?? "—" },
      { titulo: "Teléfono", render: (p) => p.telefono ?? "—" },
      { titulo: "Email", render: (p) => p.email ?? "—" },
      { titulo: "Dirección", render: (p) => p.direccion ?? "—" },
    ],
    campos: [
      { name: "nombre", label: "Nombre o empresa", required: true, full: true },
      {
        name: "servicios", label: "¿De qué servicio es proveedor?", type: "multiselect", full: true, required: true,
        placeholder: "Ej.: Catering",
        options: servicios.map((s) => ({ value: s.id_servicio, label: s.nombre })),
        desde: (p) => p.servicios.map((s) => s.id_servicio),
        ayuda: servicios.length
          ? "Cuando un cliente reserve ese servicio, vas a poder avisarle a este proveedor por WhatsApp. Si da más de uno, elegilos todos."
          : "Primero cargá tus servicios en la sección Servicios.",
      },
      { name: "contacto", label: "Persona de contacto (nombre y apellido)" },
      { name: "telefono", label: "Teléfono (WhatsApp)", required: true, placeholder: "Ej.: 3536579837", ayuda: "Con característica, sin 0 ni 15. Se usa para mandarle el aviso de cada reserva." },
      { name: "email", label: "Email (opcional)", type: "email" },
      { name: "direccion", label: "Dirección" },
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
