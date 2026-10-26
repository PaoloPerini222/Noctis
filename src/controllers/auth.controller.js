import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../data/db.js";
import {parseId} from "../utils/validaciones.js";

const normalizarEmail = (email) => String(email).trim().toLowerCase();

// Devuelve el usuario con su personal asociado y la lista de nombres de rol.
const buscarUsuario = async (campo, valor) => {
  const resultado = await pool.query(`
    SELECT u.id_usuario, u.email, u.password_hash, p.id_personal, p.nombre, p.id_empresa, em.nombre AS empresa, em.activo AS empresa_activa,
           COALESCE(array_agg(r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles
    FROM usuario u
    LEFT JOIN personal p ON p.usuario_id = u.id_usuario
    LEFT JOIN empresas em ON em.id_empresa = p.id_empresa
    LEFT JOIN personal_rol pr ON pr.id_personal = p.id_personal
    LEFT JOIN rol r ON r.id_rol = pr.id_rol
    WHERE u.${campo} = $1
    GROUP BY u.id_usuario, p.id_personal, em.id_empresa`, [valor]);
  return resultado.rows[0];
};

const datosPublicos = (usuario) => ({
  id: usuario.id_usuario,
  id_personal: usuario.id_personal,
  nombre: usuario.nombre,
  email: usuario.email,
  roles: usuario.roles,
  id_empresa: usuario.id_empresa,
  empresa: usuario.empresa
});

// Empresas entre las que se puede elegir al registrarse (solo el nombre, nada interno).
export const empresasParaRegistro = async (req, res) => {
  try {
    const empresas = await pool.query(`SELECT id_empresa, nombre FROM empresas WHERE activo ORDER BY nombre`);
    res.json(empresas.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al obtener las empresas" });
  }
};

export const registrar = async (req, res) => {
  const { nombre, email, password } = req.body ?? {};

  if (!nombre?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ mensaje: "Faltan datos" });
  }
  const idEmpresa = parseId(req.body.id_empresa);
  if (idEmpresa === null) {
    return res.status(400).json({ mensaje: "Elegí la empresa a la que pertenecés" });
  }
  if (password.length < 8) {
    return res.status(400).json({ mensaje: "La contraseña debe tener al menos 8 caracteres" });
  }

  const cliente = await pool.connect();
  try {
    const passwordHash = await bcrypt.hash(password, 10);

    await cliente.query("BEGIN");
    const empresa = await cliente.query(`SELECT 1 FROM empresas WHERE id_empresa = $1 AND activo`, [idEmpresa]);
    if (empresa.rows.length === 0) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({ mensaje: "La empresa indicada no existe" });
    }
    const usuario = await cliente.query(`
      INSERT INTO usuario (email, password_hash)
      VALUES ($1, $2)
      RETURNING id_usuario, email`, [normalizarEmail(email), passwordHash]);
    const { id_usuario } = usuario.rows[0];
    const personal = await cliente.query(`
      INSERT INTO personal (nombre, usuario_id, id_empresa)
      VALUES ($1, $2, $3)
      RETURNING id_personal`, [nombre.trim(), id_usuario, idEmpresa]);
    await cliente.query("COMMIT");

    res.status(201).json({
      id: id_usuario,
      id_personal: personal.rows[0].id_personal,
      nombre: nombre.trim(),
      email: usuario.rows[0].email,
      id_empresa: idEmpresa
    });
  } catch (error) {
    await cliente.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(409).json({ mensaje: "El email ya está registrado" });
    }
    res.status(500).json({ mensaje: "Error al registrar el usuario" });
  } finally {
    cliente.release();
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email?.trim() || !password) {
    return res.status(400).json({ mensaje: "Faltan datos" });
  }

  try {
    const usuario = await buscarUsuario("email", normalizarEmail(email));
    if (!usuario) {
      return res.status(401).json({ mensaje: "Credenciales inválidas" });
    }

    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ mensaje: "Credenciales inválidas" });
    }

    if (usuario.id_empresa && !usuario.empresa_activa) {
      return res.status(403).json({ mensaje: "Tu empresa está desactivada" });
    }

    const token = jwt.sign(
      { id: usuario.id_usuario, id_personal: usuario.id_personal, id_empresa: usuario.id_empresa, email: usuario.email, roles: usuario.roles },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.json({ token, usuario: datosPublicos(usuario) });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al iniciar sesión" });
  }
};

export const perfil = async (req, res) => {
  try {
    const usuario = await buscarUsuario("id_usuario", req.usuario.id);

    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    res.json(datosPublicos(usuario));
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener el perfil" });
  }
};
