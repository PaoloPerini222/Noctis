import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as authService from "../services/authService";

// Sesión global. Guarda el token y el usuario en localStorage para sobrevivir a recargas.
//   usuario   -> datos del usuario logueado (o null), con sus roles
//   ingresar  -> hace login y guarda la sesión
//   salir     -> borra la sesión
//   refrescar -> vuelve a pedir el perfil al back (los roles pueden cambiar mientras la sesión sigue abierta)
// Uso en cualquier componente: const { usuario, ingresar, salir } = useAuth();
const AuthContext = createContext(null);

// Lee el usuario guardado; si el JSON está roto devuelve null en vez de romper la app.
function leerUsuario() {
  try {
    return JSON.parse(localStorage.getItem("usuario"));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(leerUsuario);

  const guardarUsuario = (datos) => {
    localStorage.setItem("usuario", JSON.stringify(datos));
    setUsuario(datos);
  };

  const ingresar = async (email, password) => {
    const datos = await authService.login(email, password);
    localStorage.setItem("token", datos.token);
    guardarUsuario(datos.usuario);
  };

  const salir = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    setUsuario(null);
  };

  const refrescar = useCallback(async () => {
    if (!localStorage.getItem("token")) return;
    try {
      guardarUsuario(await authService.obtenerPerfil());
    } catch {
      // Sin conexión se sigue con el usuario guardado; un token vencido ya lo maneja services/api.js.
    }
  }, []);

  // Al abrir la app se actualizan los roles: la responsable pudo haberlos cambiado.
  useEffect(() => {
    refrescar();
  }, [refrescar]);

  // La sesión vive en localStorage, que comparten todas las pestañas: si en otra pestaña se entra con
  // otra cuenta o se cierra la sesión, esta pestaña se pone al día. Si no, mostraría un usuario y mandaría
  // el token de otro (por ejemplo, "Admin" en pantalla pero el token del superadmin).
  useEffect(() => {
    const alCambiarEnOtraPestana = (evento) => {
      if (evento.key === null || evento.key === "token" || evento.key === "usuario") {
        setUsuario(localStorage.getItem("token") ? leerUsuario() : null);
      }
    };
    window.addEventListener("storage", alCambiarEnOtraPestana);
    return () => window.removeEventListener("storage", alCambiarEnOtraPestana);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, ingresar, salir, refrescar }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
