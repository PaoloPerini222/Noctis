import pool from "../data/db.js";

export const obtenerEmpresas = async (req, res) => {
    try {
        const resultado = await pool.query(`SELECT * FROM empresas ORDER BY id_empresa`);
        res.json(resultado.rows);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener las empresas" });
    }
};

export const obtenerEmpresa = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const resultado = await pool.query(`
            SELECT * FROM empresas
            WHERE id_empresa = $1`, [id]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ Mensaje: "Empresa no encontrada" });
        }
        res.json(resultado.rows[0]);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener la empresa" });
    }
};

export const crearEmpresa = async (req, res) => {
    try {
        const { nombre, cuit, email, telefono, direccion } = req.body ?? {};
        if (!nombre?.trim() || !cuit?.trim()) {
            return res.status(400).json({ mensaje: "El nombre y cuit son obligatorios" });
        }

        const resultado = await pool.query(`
            INSERT INTO empresas(nombre, cuit, email, telefono, direccion)
            VALUES($1, $2, $3, $4, $5)
            RETURNING *`,
            [nombre, cuit, email ?? null, telefono ?? null, direccion ?? null]
        );
        if (resultado.rows.length === 0) {
            return res.status(404).json({ mensaje: "Empresa no encontrada" });
        }
        res.status(201).json(resultado.rows[0]);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al crear la empresa" });
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
