import api from "../services/api.js";

// Datos del negocio del admin (nombre, teléfono, email, dirección). El nombre es el que ve el cliente al reservar.
export const configuracionApi = {
  obtener: () => api.get("/configuracion").then((res) => res.data),
  guardar: (datos) => api.put("/configuracion", datos).then((res) => res.data),
};
