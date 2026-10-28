import api from "../services/api.js";
import { crearApi } from "./client.js";

// Personal de la organizadora y sus roles. Dar de alta personas y asignar roles es tarea de la responsable.
export const personalApi = {
  ...crearApi("/personal"),
  asignarRoles: (id, roles) => api.put(`/personal/${id}/roles`, { roles }).then((res) => res.data),
};

export const rolesApi = crearApi("/rol");

// Tablero de pendientes: tareas pendientes y vencidas, servicios sin confirmar, propuestas para revisar y eventos próximos.
export const pendientesApi = {
  obtener: (idEvento) => api.get("/pendientes", { params: idEvento ? { evento: idEvento } : {} }).then((res) => res.data),
};
