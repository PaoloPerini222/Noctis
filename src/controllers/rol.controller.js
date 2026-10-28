import pool from "../data/db.js";
import {SUPERADMIN} from "../middleware/permisos.js";

export const obtenerRoles = async (req, res) => {
    try{
        const roles = await pool.query(`select * from rol where nombre <> $1 order by nombre`, [SUPERADMIN]);

        res.json(roles.rows);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los roles"});
    }
};
