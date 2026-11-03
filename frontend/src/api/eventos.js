import api from "../services/api.js";
import { crearApi } from "./client.js";

// Cliente HTTP del recurso /evento (singular, así lo expone el back).
// El estado del evento (aceptar o rechazar la reserva, realizado, cancelado) se cambia con editar(id, { estado }).
export const eventosApi = crearApi("/evento");

// Cambios relevantes del evento y la revisión de sus compromisos (/evento/:id/cambios).
export const cambiosApi = (idEvento) => crearApi(`/evento/${idEvento}/cambios`);

// Consulta y respuesta de un proveedor para una reserva: estado = "avisado" | "disponible" | "no_disponible".
export const responderProveedor = (idEvento, idProveedor, estado) =>
  api.put(`/evento/${idEvento}/proveedores/${idProveedor}`, { estado }).then((res) => res.data);
