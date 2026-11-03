import pool from "../data/db.js";
import { parseId, REGEX_EMAIL } from "../utils/validaciones.js";
import { ADMIN } from "../middleware/permisos.js";
import { errorDeUnicidad, insertarAdmin, insertarEmpresa } from "../utils/empresa.js";

// Una empresa nueva necesita su primer admin, que después suma al resto del equipo.
// Valida {nombre, email, password}; devuelve {error} o {valor}.
const validarAdmin = (datos) => {
    const nombre = typeof datos?.nombre === "string" ? datos.nombre.trim() : "";
    const email = typeof datos?.email === "string" ? datos.email.trim().toLowerCase() : "";
    const password = typeof datos?.password === "string" ? datos.password : "";
    if (!nombre || !email || !password) {
        return { error: "El admin necesita nombre, email y contraseña" };
    }
    if (nombre.length > 100) return { error: "El nombre del admin no puede superar los 100 caracteres" };
    if (!REGEX_EMAIL.test(email) || email.length > 150) return { error: "El email del admin no es válido" };
    if (password.length < 8) return { error: "La contraseña del admin debe tener al menos 8 caracteres" };
    const apellido = typeof datos?.apellido === "string" && datos.apellido.trim() ? datos.apellido.trim() : null;
    if (apellido && apellido.length > 100) return { error: "El apellido del admin no puede superar los 100 caracteres" };
    return { valor: { nombre, apellido, email, password } };
};

// Lista de empresas con quiénes son sus admins y cuánta gente tienen.
const SELECT_EMPRESAS = `
    SELECT e.*,
           (SELECT count(*)::int FROM personal p WHERE p.id_empresa = e.id_empresa) AS personal,
           COALESCE((SELECT json_agg(json_build_object('nombre', p.nombre_completo, 'email', u.email) ORDER BY p.nombre)
                     FROM personal p
                     JOIN personal_rol pr ON pr.id_personal = p.id_personal
                     JOIN rol r ON r.id_rol = pr.id_rol AND r.nombre = '${ADMIN}'
                     LEFT JOIN usuario u ON u.id_usuario = p.usuario_id
                     WHERE p.id_empresa = e.id_empresa), '[]') AS admins
    FROM empresas e`;

export const obtenerEmpresas = async (req, res) => {
    try {
        const resultado = await pool.query(`${SELECT_EMPRESAS} ORDER BY e.id_empresa`);
        res.json(resultado.rows);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener las empresas" });
    }
};

export const obtenerEmpresa = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const resultado = await pool.query(`${SELECT_EMPRESAS} WHERE e.id_empresa = $1`, [id]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ Mensaje: "Empresa no encontrada" });
        }
        res.json(resultado.rows[0]);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener la empresa" });
    }
};

// Crea la empresa y, si viene "admin", a su primer admin en el mismo paso: si algo falla no queda nada a medias.
export const crearEmpresa = async (req, res) => {
    const cliente = await pool.connect();
    try {
        const { nombre, cuit, email, telefono, direccion, admin } = req.body ?? {};
        if (!nombre?.trim() || !cuit?.trim()) {
            return res.status(400).json({ mensaje: "El nombre y cuit son obligatorios" });
        }
        let dueno = null;
        if (admin) {
            const validado = validarAdmin(admin);
            if (validado.error) return res.status(400).json({ mensaje: validado.error });
            dueno = validado.valor;
        }

        await cliente.query("BEGIN");
        const idEmpresa = await insertarEmpresa(cliente, { nombre: nombre.trim(), cuit: cuit.trim(), email, telefono, direccion });
        if (dueno) await insertarAdmin(cliente, idEmpresa, dueno);
        await cliente.query("COMMIT");

        const creada = await pool.query(`${SELECT_EMPRESAS} WHERE e.id_empresa = $1`, [idEmpresa]);
        res.status(201).json(creada.rows[0]);
    } catch (error) {
        await cliente.query("ROLLBACK");
        const duplicado = errorDeUnicidad(error);
        if (duplicado) return res.status(409).json({ mensaje: duplicado });
        console.error(error);
        res.status(500).json({ mensaje: "Error al crear la empresa" });
    } finally {
        cliente.release();
    }
};

// Suma otro admin a una empresa existente (por ejemplo si se quedó sin nadie que la administre).
export const agregarAdmin = async (req, res) => {
    const cliente = await pool.connect();
    try {
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ mensaje: "El id de la empresa no es válido" });
        const validado = validarAdmin(req.body);
        if (validado.error) return res.status(400).json({ mensaje: validado.error });

        await cliente.query("BEGIN");
        const empresa = await cliente.query(`SELECT 1 FROM empresas WHERE id_empresa = $1 FOR UPDATE`, [id]);
        if (empresa.rows.length === 0) {
            await cliente.query("ROLLBACK");
            return res.status(404).json({ mensaje: "Empresa no encontrada" });
        }
        await insertarAdmin(cliente, id, validado.valor);
        await cliente.query("COMMIT");

        const actualizada = await pool.query(`${SELECT_EMPRESAS} WHERE e.id_empresa = $1`, [id]);
        res.status(201).json(actualizada.rows[0]);
    } catch (error) {
        await cliente.query("ROLLBACK");
        const duplicado = errorDeUnicidad(error);
        if (duplicado) return res.status(409).json({ mensaje: duplicado });
        console.error(error);
        res.status(500).json({ mensaje: "Error al agregar el admin" });
    } finally {
        cliente.release();
    }
};

export const editarEmpresa = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { nombre, cuit, email, telefono, direccion, activo } = req.body ?? {};
        if (!nombre?.trim() || !cuit?.trim()) {
            return res.status(400).json({ mensaje: "El nombre y cuit son obligatorios" });
        }
        if (activo !== undefined && typeof activo !== "boolean") {
            return res.status(400).json({ mensaje: "activo debe ser verdadero o falso" });
        }

        const resultado = await pool.query(`
            UPDATE empresas
            SET nombre = $1, cuit = $2, email = $3, telefono = $4, direccion = $5, activo = COALESCE($7::boolean, activo)
            WHERE id_empresa = $6
            RETURNING *`,
            [nombre, cuit, email ?? null, telefono ?? null, direccion ?? null, id, activo ?? null]
        );
        if (resultado.rows.length === 0) {
            return res.status(404).json({ mensaje: "Empresa no encontrada" });
        }
        res.json(resultado.rows[0]);
    } catch (error) {
        const duplicado = errorDeUnicidad(error);
        if (duplicado) return res.status(409).json({ mensaje: duplicado });
        res.status(500).json({ mensaje: "Error al editar la empresa" });
    }
};

export const eliminarEmpresa = async (req, res) => {
    try {
        const id = Number(req.params.id);

        const resultado = await pool.query(`DELETE FROM empresas WHERE id_empresa = $1 RETURNING *`, [id]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ Mensaje: "Empresa no encontrada" });
        }
        res.json({ mensaje: "Empresa eliminada", empresa: resultado.rows[0] });
    } catch (error) {
        if (error.code === "23503") {
            return res.status(409).json({ mensaje: "No se puede eliminar, la empresa tiene personal, clientes u otros datos. Desactivala en su lugar" });
        }
        res.status(500).json({ mensaje: "Error al eliminar la empresa" });
    }
};
