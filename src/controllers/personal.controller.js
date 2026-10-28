import pool from "../data/db.js";
import {listaDeIds, parseId, textoObligatorio} from "../utils/validaciones.js";
import {RESPONSABLE, SUPERADMIN} from "../middleware/permisos.js";

// Personal con su email (si tiene usuario) y la lista de roles.
const SELECT_PERSONAL = `
    select p.id_personal, p.nombre, p.usuario_id, u.email,
           coalesce(json_agg(json_build_object('id_rol', r.id_rol, 'nombre', r.nombre) order by r.nombre)
                    filter (where r.id_rol is not null), '[]') as roles
    from personal p
    left join usuario u on u.id_usuario = p.usuario_id
    left join personal_rol pr on pr.id_personal = p.id_personal
    left join rol r on r.id_rol = pr.id_rol`;

// El email del personal solo lo ve la responsable (quien gestiona el equipo).
const sinEmailSiNoCorresponde = (req, persona) =>
    req.usuario?.roles?.includes(RESPONSABLE) ? persona : {...persona, email: null};

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

// Crea personal sin usuario (alguien del equipo que no ingresa al sistema).
export const crearPersonal = async (req, res) => {
    try{
        const {error, valor: nombre} = textoObligatorio(req.body?.nombre, "el nombre", 100);
        if(error){
            return res.status(400).json({mensaje: error});
        }

        const creado = await pool.query(`insert into personal (nombre, id_empresa) values ($1, $2) returning id_personal`, [nombre, req.usuario.id_empresa]);

        res.status(201).json(await buscarPersonal(pool, req.usuario.id_empresa, creado.rows[0].id_personal));

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo crear la persona"});
    }
};

export const editarPersonal = async (req, res) => {
    try{
        const idPersonal = parseId(req.params.id);
        if(idPersonal === null){
            return res.status(400).json({mensaje: "el id del personal no es valido"});
        }

        const {error, valor: nombre} = textoObligatorio(req.body?.nombre, "el nombre", 100);
        if(error){
            return res.status(400).json({mensaje: error});
        }

        const editado = await pool.query(`update personal set nombre = $1 where id_personal = $2 and id_empresa = $3 returning id_personal`, [nombre, idPersonal, req.usuario.id_empresa]);
        if(editado.rows.length === 0){
            return res.status(404).json({mensaje: "esa persona no existe"});
        }

        res.json(await buscarPersonal(pool, req.usuario.id_empresa, idPersonal));

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo editar la persona"});
    }
};

export const eliminarPersonal = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const idPersonal = parseId(req.params.id);
        if(idPersonal === null){
            return res.status(400).json({mensaje: "el id del personal no es valido"});
        }

        await cliente.query("begin");
        const propia = await cliente.query(`select 1 from personal where id_personal = $1 and id_empresa = $2 for update`, [idPersonal, req.usuario.id_empresa]);
        if(propia.rows.length === 0){
            await cliente.query("rollback");
            return res.status(404).json({mensaje: "esa persona no existe"});
        }

        await cliente.query(`delete from personal_rol where id_personal = $1`, [idPersonal]);
        const eliminado = await cliente.query(`delete from personal where id_personal = $1 returning *`, [idPersonal]);

        await cliente.query("commit");
        res.json({mensaje: "persona eliminada", personal: eliminado.rows[0]});

    } catch(error){
        await cliente.query("rollback");
        console.error(error);

        if(error.code === "23503"){
            return res.status(409).json({mensaje: "no se puede eliminar, la persona tiene eventos, tareas u otros registros asociados"});
        }

        res.status(500).json({mensaje: "no se pudo eliminar la persona"});
    } finally{
        cliente.release();
    }
};

// Reemplaza todos los roles de la persona por la lista recibida: {roles: [id_rol, ...]}.
export const asignarRoles = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const idPersonal = parseId(req.params.id);
        if(idPersonal === null){
            return res.status(400).json({mensaje: "el id del personal no es valido"});
        }

        const {error, ids} = listaDeIds(req.body?.roles, "roles");
        if(error){
            return res.status(400).json({mensaje: error});
        }

        await cliente.query("begin");

        const existe = await cliente.query(`select 1 from personal where id_personal = $1 and id_empresa = $2 for update`, [idPersonal, req.usuario.id_empresa]);
        if(existe.rows.length === 0){
            await cliente.query("rollback");
            return res.status(404).json({mensaje: "esa persona no existe"});
        }

        // El rol de superadmin es de la plataforma: una empresa no se lo puede dar a nadie.
        const permitidos = await cliente.query(`select count(*)::int as cantidad from rol where id_rol = any($1) and nombre <> $2`, [ids, SUPERADMIN]);
        if(permitidos.rows[0].cantidad !== new Set(ids).size){
            await cliente.query("rollback");
            return res.status(400).json({mensaje: "alguno de los roles indicados no existe"});
        }

        await cliente.query(`delete from personal_rol where id_personal = $1`, [idPersonal]);
        for(const idRol of ids){
            await cliente.query(`insert into personal_rol (id_personal, id_rol) values ($1, $2)`, [idPersonal, idRol]);
        }

        await cliente.query("commit");
        res.json(await buscarPersonal(pool, req.usuario.id_empresa, idPersonal));

    } catch(error){
        await cliente.query("rollback");
        console.error(error);

        if(error.code === "23503"){
            return res.status(400).json({mensaje: "alguno de los roles indicados no existe"});
        }

        res.status(500).json({mensaje: "no se pudieron asignar los roles"});
    } finally{
        cliente.release();
    }
};
