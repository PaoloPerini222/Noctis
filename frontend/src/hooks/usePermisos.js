import { useAuth } from "../context/AuthContext.jsx";

// Qué puede hacer el usuario actual. Solo sirve para mostrar u ocultar botones:
// el back vuelve a verificar todo y es quien decide.
//   Organizador  -> clientes, eventos propios (propuesta, servicios, tareas, exclusiones), proveedores y servicios
//   Responsable  -> la dueña de la empresa: aprueba propuestas, gestiona el personal y sus roles, decide cancelaciones
//                   de la organizadora y además puede todo lo del organizador (en cualquier evento) y del coordinador
//   Coordinador  -> situación de cada proveedor, estado de cualquier tarea y avisos de cancelación
//   Todos        -> consultan todo y registran cambios relevantes
export default function usePermisos() {
  const { usuario } = useAuth();
  const roles = usuario?.roles ?? [];
  const yo = usuario?.id_personal;

  const esResponsable = roles.includes("responsable");
  // La responsable (dueña de la empresa) puede hacer todo lo del organizador y del coordinador (el back lo aplica igual).
  const esOrganizador = roles.includes("organizador") || esResponsable;
  const esCoordinador = roles.includes("coordinador") || esResponsable;
  const esSuperadmin = roles.includes("superadmin");
  // "Dueño" de un evento: su organizador. La responsable puede trabajar sobre todos los eventos de la empresa.
  const esDuenoDe = (evento) =>
    esResponsable || (roles.includes("organizador") && evento?.id_organizador != null && evento.id_organizador === yo);

  return {
    yo,
    roles,
    tieneRol: roles.length > 0,
    esOrganizador,
    esResponsable,
    esCoordinador,
    esSuperadmin,
    // El superadmin sin un rol de la organizadora solo administra las empresas (ver soloEmpresas en Layout).
    soloEmpresas: esSuperadmin && !esOrganizador && !esResponsable && !esCoordinador,
    esDuenoDe,
    puedeCambiarEstadoTarea: (tarea) => esCoordinador || tarea?.id_personal === yo,
  };
}
