import api from "../services/api.js";
import { crearApi } from "./client.js";

// Cliente HTTP del recurso /empresas (solo lo usa el superadmin de la plataforma).
export const empresasApi = {
  ...crearApi("/empresas"),
  // Suma un responsable (dueño/a) a una empresa: crea su cuenta de acceso y le da el rol.
  agregarResponsable: (id, datos) => api.post(`/empresas/${id}/responsable`, datos).then((res) => res.data),
};
