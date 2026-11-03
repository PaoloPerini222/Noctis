import pool from "../data/db.js";
import {parseId} from "../utils/validaciones.js";
import {ADMIN} from "../middleware/permisos.js";

// Personal con su email (si tiene usuario) y la lista de roles.
const SELECT_PERSONAL = `
    select p.id_personal, p.nombre, p.apellido, p.nombre_completo, p.telefono, p.email_contacto, p.usuario_id, u.email,
           coalesce(json_agg(json_build_object('id_rol', r.id_rol, 'nombre', r.nombre) order by r.nombre)
                    filter (where r.id_rol is not null), '[]') as roles
    from personal p
    left join usuario u on u.id_usuario = p.usuario_id
    left join personal_rol pr on pr.id_personal = p.id_personal
    left join rol r on r.id_rol = pr.id_rol`;

// El email de acceso del personal solo lo ve un admin (quien gestiona el equipo).
const sinEmailSiNoCorresponde = (req, persona) =>
    req.usuario?.roles?.includes(ADMIN) ? persona : {...persona, email: null};

const buscarPersonal = async (db, idEmpresa, idPersonal) => {
    const personal = await db.query(`${SELECT_PERSONAL} where p.id_personal = $1 and p.id_empresa = $2 group by p.id_personal, u.email`, [idPersonal, idEmpresa]);

    return personal.rows[0];
};

export const obtenerPersonales = async (req, res) => {
    try{
        const personal = await pool.query(`${SELECT_PERSONAL} where p.id_empresa = $1 group by p.id_personal, u.email order by p.nombre`, [req.usuario.id_empresa]);

        res.json(personal.rows.map((persona) => sinEmailSiNoCorresponde(req, persona)));

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener el personal"});
    }
};

export const obtenerPersonal = async (req, res) => {
    try{
        const idPersonal = parseId(req.params.id);
        if(idPersonal === null){
            return res.status(400).json({mensaje: "el id del personal no es valido"});
        }

        const personal = await buscarPersonal(pool, req.usuario.id_empresa, idPersonal);
        if(!personal){
            return res.status(404).json({mensaje: "esa persona no existe"});
        }

        res.json(sinEmailSiNoCorresponde(req, personal));

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener la persona"});
    }
};
