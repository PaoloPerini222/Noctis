import bcrypt from "bcryptjs";
import pool from "../data/db.js";
import {listaDeIds, parseId, textoObligatorio, textoOpcional, REGEX_EMAIL} from "../utils/validaciones.js";
import {RESPONSABLE, SUPERADMIN} from "../middleware/permisos.js";

// Personal con su email (si tiene usuario) y la lista de roles.
const SELECT_PERSONAL = `
    select p.id_personal, p.nombre, p.apellido, p.nombre_completo, p.telefono, p.email_contacto, p.usuario_id, u.email,
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

const PASSWORD_MINIMA = 8;

// Datos personales: el nombre es obligatorio; apellido, teléfono y email de contacto son opcionales.
const validarDatosPersonales = (body) => {
    const nombre = textoObligatorio(body?.nombre, "el nombre", 100);
    const apellido = textoOpcional(body?.apellido, "el apellido", 100);
    const telefono = textoOpcional(body?.telefono, "el telefono", 30);
    const emailContacto = textoOpcional(body?.email_contacto, "el email de contacto", 150);
    const error = nombre.error ?? apellido.error ?? telefono.error ?? emailContacto.error;
    if(error){
        return {error};
    }
    if(emailContacto.valor && !REGEX_EMAIL.test(emailContacto.valor)){
        return {error: "el email de contacto no es valido"};
    }

    return {datos: {nombre: nombre.valor, apellido: apellido.valor, telefono: telefono.valor, email_contacto: emailContacto.valor}};
};

// Valida los datos de acceso que puede traer el body: {email, password}.
//   - sin ninguno de los dos -> {} (no se toca la cuenta)
//   - con alguno -> el email tiene que ser válido y la contraseña (si viene) de al menos 8 caracteres
// "obligatoriosAmbos" exige los dos (al crear una cuenta nueva).
const validarAcceso = (body, obligatoriosAmbos) => {
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if(!email && !password){
        return {};
    }
    if(obligatoriosAmbos && (!email || !password)){
        return {error: "para que ingrese al sistema hacen falta el email y la contraseña"};
    }
    if(email && !REGEX_EMAIL.test(email)){
        return {error: "el email no es valido"};
    }
    if(email.length > 150){
        return {error: "el email no puede superar los 150 caracteres"};
    }
    if(password && password.length < PASSWORD_MINIMA){
        return {error: `la contraseña debe tener al menos ${PASSWORD_MINIMA} caracteres`};
    }

    return {email: email || null, password: password || null};
};

// Crea una persona de la empresa. Si trae email y contraseña, también crea su usuario para que pueda ingresar
// (todo en una transacción). Sin ellos queda como alguien del equipo que no ingresa al sistema.
export const crearPersonal = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const personales = validarDatosPersonales(req.body);
        if(personales.error){
            return res.status(400).json({mensaje: personales.error});
        }
        const acceso = validarAcceso(req.body, true);
        if(acceso.error){
            return res.status(400).json({mensaje: acceso.error});
        }

        await cliente.query("begin");
        let idUsuario = null;
        if(acceso.email){
            const hash = await bcrypt.hash(acceso.password, 10);
            const usuario = await cliente.query(`insert into usuario (email, password_hash) values ($1, $2) returning id_usuario`, [acceso.email, hash]);
            idUsuario = usuario.rows[0].id_usuario;
        }
        const {nombre, apellido, telefono, email_contacto} = personales.datos;
        const creado = await cliente.query(
            `insert into personal (nombre, apellido, telefono, email_contacto, usuario_id, id_empresa) values ($1, $2, $3, $4, $5, $6) returning id_personal`,
            [nombre, apellido, telefono, email_contacto, idUsuario, req.usuario.id_empresa]);
        await cliente.query("commit");

        res.status(201).json(await buscarPersonal(pool, req.usuario.id_empresa, creado.rows[0].id_personal));

    } catch(error){
        await cliente.query("rollback");
        if(error.code === "23505"){
            return res.status(409).json({mensaje: "ese email ya está registrado"});
        }
        console.error(error);

        res.status(500).json({mensaje: "no se pudo crear la persona"});
    } finally{
        cliente.release();
    }
};

// Edita el nombre y, si se mandan, los datos de acceso: email y/o contraseña.
//   - la persona ya tiene usuario: se actualiza el email y/o se cambia la contraseña
//   - todavía no tiene usuario: hacen falta email y contraseña para crearle uno
export const editarPersonal = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const idPersonal = parseId(req.params.id);
        if(idPersonal === null){
            return res.status(400).json({mensaje: "el id del personal no es valido"});
        }

        const personales = validarDatosPersonales(req.body);
        if(personales.error){
            return res.status(400).json({mensaje: personales.error});
        }
        const acceso = validarAcceso(req.body, false);
        if(acceso.error){
            return res.status(400).json({mensaje: acceso.error});
        }

        await cliente.query("begin");
        const actual = await cliente.query(`select usuario_id from personal where id_personal = $1 and id_empresa = $2 for update`, [idPersonal, req.usuario.id_empresa]);
        if(actual.rows.length === 0){
            await cliente.query("rollback");
            return res.status(404).json({mensaje: "esa persona no existe"});
        }

        let idUsuario = actual.rows[0].usuario_id;
        if(acceso.email || acceso.password){
            if(idUsuario){
                if(acceso.email){
                    await cliente.query(`update usuario set email = $1 where id_usuario = $2`, [acceso.email, idUsuario]);
                }
                if(acceso.password){
                    await cliente.query(`update usuario set password_hash = $1 where id_usuario = $2`, [await bcrypt.hash(acceso.password, 10), idUsuario]);
                }
            } else {
                if(!acceso.email || !acceso.password){
                    await cliente.query("rollback");
                    return res.status(400).json({mensaje: "esa persona todavía no tiene usuario: para que ingrese hacen falta el email y la contraseña"});
                }
                const usuario = await cliente.query(`insert into usuario (email, password_hash) values ($1, $2) returning id_usuario`, [acceso.email, await bcrypt.hash(acceso.password, 10)]);
                idUsuario = usuario.rows[0].id_usuario;
            }
        }

        const {nombre, apellido, telefono, email_contacto} = personales.datos;
        await cliente.query(
            `update personal set nombre = $1, apellido = $2, telefono = $3, email_contacto = $4, usuario_id = $5 where id_personal = $6`,
            [nombre, apellido, telefono, email_contacto, idUsuario, idPersonal]);
        await cliente.query("commit");

        res.json(await buscarPersonal(pool, req.usuario.id_empresa, idPersonal));

    } catch(error){
        await cliente.query("rollback");
        if(error.code === "23505"){
            return res.status(409).json({mensaje: "ese email ya está registrado"});
        }
        console.error(error);

        res.status(500).json({mensaje: "no se pudo editar la persona"});
    } finally{
        cliente.release();
    }
};

export const eliminarPersonal = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const idPersonal = parseId(req.params.id);
        if(idPersonal === null){
            return res.status(400).json({mensaje: "el id del personal no es valido"});
        }

        if(idPersonal === req.usuario.id_personal){
            return res.status(400).json({mensaje: "no podés eliminarte a vos mismo"});
        }

        await cliente.query("begin");
        const propia = await cliente.query(`select usuario_id from personal where id_personal = $1 and id_empresa = $2 for update`, [idPersonal, req.usuario.id_empresa]);
        if(propia.rows.length === 0){
            await cliente.query("rollback");
            return res.status(404).json({mensaje: "esa persona no existe"});
        }

        await cliente.query(`delete from personal_rol where id_personal = $1`, [idPersonal]);
        const eliminado = await cliente.query(`delete from personal where id_personal = $1 returning *`, [idPersonal]);
        // Su cuenta de acceso ya no sirve: se borra para liberar el email.
        if(propia.rows[0].usuario_id){
            await cliente.query(`delete from usuario where id_usuario = $1`, [propia.rows[0].usuario_id]);
        }

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

        // La empresa siempre necesita al menos un responsable: quien aprueba propuestas y gestiona al equipo.
        const rolResponsable = await cliente.query(`select id_rol from rol where nombre = $1`, [RESPONSABLE]);
        const idResponsable = rolResponsable.rows[0]?.id_rol;
        if(idResponsable && !ids.includes(idResponsable)){
            const lo_tenia = await cliente.query(`select 1 from personal_rol where id_personal = $1 and id_rol = $2`, [idPersonal, idResponsable]);
            if(lo_tenia.rows.length > 0){
                const otros = await cliente.query(`
                    select count(*)::int as cantidad from personal_rol pr join personal p on p.id_personal = pr.id_personal
                    where pr.id_rol = $1 and p.id_empresa = $2 and p.id_personal <> $3`, [idResponsable, req.usuario.id_empresa, idPersonal]);
                if(otros.rows[0].cantidad === 0){
                    await cliente.query("rollback");
                    return res.status(400).json({mensaje: "la empresa tiene que tener al menos un responsable: antes de quitarle el rol, dáselo a otra persona"});
                }
            }
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
