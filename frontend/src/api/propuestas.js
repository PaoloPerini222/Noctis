import api from "../services/api.js";
import { crearApi } from "./client.js";

// Cliente HTTP del recurso /propuesta.
//   aprobar(id, true|false) -> la responsable aprueba o devuelve a borrador una propuesta pendiente.
//   detalle(idPropuesta)    -> servicios de la propuesta (/propuesta/:id/detalle); cambiarEstado lo usa el coordinador.
export const propuestasApi = {
  ...crearApi("/propuesta"),
  aprobar: (id, aprobar) => api.put(`/propuesta/${id}/aprobacion`, { aprobar }).then((res) => res.data),
};

export const detalleApi = (idPropuesta) => ({
  ...crearApi(`/propuesta/${idPropuesta}/detalle`),
  cambiarEstado: (idDetalle, estado_proveedor) =>
    api.put(`/propuesta/${idPropuesta}/detalle/${idDetalle}/estado`, { estado_proveedor }).then((res) => res.data),
});
