import axios from "axios";

// Todas las llamadas salen a /api/... (proxy de Vite en desarrollo, nginx en Docker).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  timeout: 10000,
});

// Antes de cada petición: agrega el token si existe
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si el token venció (o es inválido) cerramos sesión. Un 401 en el login
// son credenciales incorrectas: ahí no hay sesión que cerrar.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const esAuth = error.config?.url?.startsWith("/auth/login");
    if (error.response?.status === 401 && !esAuth) {
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// Mensaje legible para mostrar al usuario a partir de un error de axios.
export function mensajeError(error, porDefecto = "Ocurrió un error") {
  // Un error propio de la app (por ejemplo una validación del formulario) ya trae su mensaje.
  if (!error.isAxiosError && error.message) return error.message;
  const datos = error.response?.data;
  if (datos?.mensaje || datos?.Mensaje) return datos.mensaje || datos.Mensaje;
  if (error.code === "ECONNABORTED") return "El servidor tardó demasiado en responder";
  if (!error.response) return "No se pudo conectar con el servidor";
  return porDefecto;
}

export default api;
