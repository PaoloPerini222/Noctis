import api from "../services/api.js";
import { crearApi } from "./client.js";

// Catálogos que gestiona el admin: servicios, proveedores (con los servicios que ofrece cada uno) y sucursales.
export const serviciosApi = crearApi("/servicio");

export const proveedoresApi = {
  ...crearApi("/proveedor"),
  asignarServicios: (id, servicios) => api.put(`/proveedor/${id}/servicios`, { servicios }).then((res) => res.data),
};

// Salones o lugares de la empresa donde se hacen los eventos.
export const sucursalesApi = crearApi("/sucursal");
