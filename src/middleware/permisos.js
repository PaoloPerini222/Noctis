import { verificarRol } from "./auth.middleware.js";

// El admin es quien usa el sistema en una empresa: gestiona eventos, reservas, clientes, servicios, proveedores y el equipo.
export const ADMIN = "admin";
// El superadmin son los dueños del sistema: gestionan las empresas de la plataforma.
export const SUPERADMIN = "superadmin";

// Quien no es admin no ve ni modifica los datos de la empresa (eventos, clientes, personal, etc.).
export const conRol = (req, res, next) => {
    const roles = req.usuario?.roles ?? [];
    if (!roles.includes(ADMIN)) {
        const mensaje = roles.includes(SUPERADMIN)
            ? "El superadmin solo administra las empresas"
            : "Tu cuenta todavía no tiene un rol asignado. Pedile a los dueños del sistema que te autoricen";
        return res.status(403).json({ mensaje });
    }
    // Los datos son de una empresa: sin empresa asignada no hay nada que ver.
    if (!req.usuario.id_empresa) {
        return res.status(403).json({ mensaje: "Tu cuenta no está asociada a ninguna empresa" });
    }
    next();
};

export const soloRoles = verificarRol;
