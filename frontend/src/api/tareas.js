import api from "../services/api.js";
import { crearApi } from "./client.js";

// Cliente HTTP del recurso /tarea. El estado tiene su propio endpoint: lo cambia quien tiene la tarea o un coordinador.
export const tareasApi = {
  ...crearApi("/tarea"),
  cambiarEstado: (id, estado) => api.put(`/tarea/${id}/estado`, { estado }).then((res) => res.data),
};
