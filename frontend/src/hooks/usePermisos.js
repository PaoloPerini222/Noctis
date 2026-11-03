import { useAuth } from "../context/AuthContext.jsx";

// Qué puede hacer el usuario actual. Solo sirve para mostrar u ocultar botones:
// el back vuelve a verificar todo y es quien decide.
//   Admin      -> quien usa el sistema en la empresa: reservas, eventos, clientes, servicios, proveedores y equipo
//   Superadmin -> los dueños del sistema: administran las empresas de la plataforma
export default function usePermisos() {
  const { usuario } = useAuth();
  const roles = usuario?.roles ?? [];

  const esAdmin = roles.includes("admin");
  const esSuperadmin = roles.includes("superadmin");

  return {
    yo: usuario?.id_personal,
    roles,
    tieneRol: roles.length > 0,
    esAdmin,
    esSuperadmin,
    // El superadmin sin el rol de admin solo administra las empresas (ver soloEmpresas en Layout).
    soloEmpresas: esSuperadmin && !esAdmin,
  };
}
