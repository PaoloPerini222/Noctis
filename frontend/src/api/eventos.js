import api from "../services/api.js";
import { crearApi } from "./client.js";

// Cliente HTTP del recurso /evento (singular, así lo expone el back).
export const eventosApi = crearApi("/evento");

// Lo que cuelga de un evento:
//   exclusiones -> servicios que el cliente descartó (/evento/:id/exclusiones)
//   cambios     -> cambios relevantes y la revisión de sus compromisos (/evento/:id/cambios)
//   cierre      -> realizado o cancelado, con los avisos a proveedores (/evento/:id/cierre)
export const exclusionesApi = (idEvento) => crearApi(`/evento/${idEvento}/exclusiones`);

export const cambiosApi = (idEvento) => crearApi(`/evento/${idEvento}/cambios`);

export const cierreApi = (idEvento) => ({
  obtener: () => api.get(`/evento/${idEvento}/cierre`).then((res) => res.data),
  cerrar: (datos) => api.post(`/evento/${idEvento}/cierre`, datos).then((res) => res.data),
  registrarAviso: (idAviso, datos) => api.put(`/evento/${idEvento}/cierre/avisos/${idAviso}`, datos).then((res) => res.data),
});
