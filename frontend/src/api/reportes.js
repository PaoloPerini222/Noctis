import api from "../services/api.js";

// Reportes del admin (salen del Data Warehouse, no de la base del sistema).
export const reportesApi = {
  obtener: (anio) => api.get("/reportes", { params: anio ? { anio } : {} }).then((res) => res.data),
  // Corre el ETL: copia los datos actuales del sistema al Data Warehouse.
  actualizar: () => api.post("/reportes/actualizar").then((res) => res.data),
};
