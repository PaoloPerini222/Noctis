import jwt from "jsonwebtoken";
import pool from "../data/db.js";

// Verifica el token y carga los roles y la empresa actuales desde la base (no los del token),
// para que quitar o dar un rol, o desactivar una empresa, valga al instante.
export const verificarToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ mensaje: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  let datos;
  try {
    datos = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ mensaje: "El token expiró" });
    }
    return res.status(401).json({ mensaje: "Token inválido" });
  }

  try {
    const persona = await pool.query(`
      SELECT p.id_empresa, e.activo
      FROM personal p
      LEFT JOIN empresas e ON e.id_empresa = p.id_empresa
      WHERE p.id_personal = $1`, [datos.id_personal ?? null]);
    const { id_empresa = null, activo = true } = persona.rows[0] ?? {};
    if (id_empresa !== null && !activo) {
      return res.status(403).json({ mensaje: "Tu empresa está desactivada" });
    }

    const roles = await pool.query(`
      SELECT r.nombre
      FROM personal_rol pr
      JOIN rol r ON r.id_rol = pr.id_rol
      WHERE pr.id_personal = $1`, [datos.id_personal ?? null]);

    req.usuario = { ...datos, id_empresa, roles: roles.rows.map((fila) => fila.nombre) };
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al verificar los permisos" });
  }
};

// Usar después de verificarToken: permite el paso si el usuario tiene al menos uno de los roles.
export const verificarRol = (...rolesPermitidos) => {
  return (req, res, next) => {
    const roles = req.usuario?.roles ?? [];
    if (!roles.some((rol) => rolesPermitidos.includes(rol))) {
      return res.status(403).json({ mensaje: "No tenés permiso para esta acción" });
    }
    next();
  };
};
