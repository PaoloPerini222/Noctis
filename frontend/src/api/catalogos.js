import api from "../services/api.js";
import { crearApi } from "./client.js";

// Catálogos que gestiona el organizador: servicios y proveedores (con los servicios que ofrece cada uno).
export const serviciosApi = crearApi("/servicio");

export const proveedoresApi = {
  ...crearApi("/proveedor"),
  asignarServicios: (id, servicios) => api.put(`/proveedor/${id}/servicios`, { servicios }).then((res) => res.data),
};
