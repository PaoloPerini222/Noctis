import pool from "../data/db.js";

const ID_MAXIMO = 2147483647;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseId = (valor) => {
    if(typeof valor !== "string" || !/^\d+$/.test(valor)){
        return null;
    }

    const id = Number(valor);
    if(id < 1 || id > ID_MAXIMO){
        return null;
    }

    return id;
};

const validarCliente = (body) => {
    const {nombre, apellido, email, telefono, direccion} = body ?? {};

    if(typeof nombre !== "string" || !nombre.trim()){
        return {error: "el nombre es obligatorio"};
    }
    if(typeof telefono !== "string" || !telefono.trim()){
        return {error: "el telefono es obligatorio"};
    }
    if(email !== undefined && email !== null && typeof email !== "string"){
        return {error: "el email no es valido"};
    }

    for(const [valor, campo] of [[apellido, "el apellido"], [direccion, "la direccion"]]){
        if(valor !== undefined && valor !== null && typeof valor !== "string"){
            return {error: `${campo} no es valido`};
        }
    }
    const apellidoLimpio = apellido?.trim() || null;
    const direccionLimpia = direccion?.trim() || null;
    if(apellidoLimpio && apellidoLimpio.length > 100){
        return {error: "el apellido no puede superar los 100 caracteres"};
    }
    if(direccionLimpia && direccionLimpia.length > 200){
        return {error: "la direccion no puede superar los 200 caracteres"};
    }

    const nombreLimpio = nombre.trim();
    const telefonoLimpio = telefono.trim();
    const emailLimpio = email?.trim() || null;

    if(nombreLimpio.length > 100){
        return {error: "el nombre no puede superar los 100 caracteres"};
    }
    if(telefonoLimpio.length > 30){
        return {error: "el telefono no puede superar los 30 caracteres"};
    }
    if(emailLimpio && (emailLimpio.length > 100 || !REGEX_EMAIL.test(emailLimpio))){
        return {error: "el email no es valido"};
    }

    return {datos: {nombre: nombreLimpio, apellido: apellidoLimpio, telefono: telefonoLimpio, email: emailLimpio, direccion: direccionLimpia}};
};

export const obtenerClientes = async (req, res) => {
    try{
        const clientes = await pool.query(`select * from cliente where id_empresa = $1 order by id_cliente`, [req.usuario.id_empresa]);

        res.json(clientes.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los clientes"});
    }
};

export const obtenerCliente = async (req, res) => {
    try{
        const idCliente = parseId(req.params.id);
        if(idCliente === null){
            return res.status(400).json({mensaje: "el id del cliente no es valido"});
        }

        const unCliente = await pool.query(`select * from cliente where id_cliente = $1 and id_empresa = $2` , [idCliente, req.usuario.id_empresa]);

        if(unCliente.rows.length === 0){
            return res.status(404).json({mensaje: "ese cliente no existe"});
        }

        res.json(unCliente.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener el cliente"});
    }
};

export const crearCliente = async (req, res) => {
    try{
        const {error, datos} = validarCliente(req.body);
        if(error){
            return res.status(400).json({mensaje: error});
        }

        const nuevoCliente = await pool.query(
            `insert into cliente (nombre, apellido, telefono, email, direccion, id_empresa) values ($1, $2, $3, $4, $5, $6) returning *`,
            [datos.nombre, datos.apellido, datos.telefono, datos.email, datos.direccion, req.usuario.id_empresa]
        );

        res.status(201).json(nuevoCliente.rows[0]);

    } catch (error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo crear el cliente"});
    }
};

export const editarCliente = async (req, res) => {
    try{
        const idCliente = parseId(req.params.id);
        if(idCliente === null){
            return res.status(400).json({mensaje: "el id del cliente no es valido"});
        }

        const actual = await pool.query(`select nombre, apellido, telefono, email, direccion from cliente where id_cliente = $1 and id_empresa = $2`, [idCliente, req.usuario.id_empresa]);
        if(actual.rows.length === 0){
            return res.status(404).json({mensaje: "ese cliente no existe"});
        }

        const {error, datos} = validarCliente({...actual.rows[0], ...req.body});
        if(error){
            return res.status(400).json({mensaje: error});
        }

        const clienteEditado = await pool.query(
            `update cliente set nombre = $1, apellido = $2, telefono = $3, email = $4, direccion = $5 where id_cliente = $6 and id_empresa = $7 returning *`,
            [datos.nombre, datos.apellido, datos.telefono, datos.email, datos.direccion, idCliente, req.usuario.id_empresa]
        );

        if(clienteEditado.rows.length === 0){
            return res.status(404).json({mensaje: "ese cliente no existe"});
        }

        res.json(clienteEditado.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo editar el cliente"});
    }
};

export const eliminarCliente = async (req, res) => {
    try{
        const idCliente = parseId(req.params.id);
        if(idCliente === null){
            return res.status(400).json({mensaje: "el id del cliente no es valido"});
        }

        const eliminar = await pool.query(`delete from cliente where id_cliente = $1 and id_empresa = $2 RETURNING *`, [idCliente, req.usuario.id_empresa]);

        if(eliminar.rows.length === 0){
            return res.status(404).json({mensaje: "ese cliente no existe"});
        }

        res.json({mensaje: "cliente eliminado", cliente: eliminar.rows[0]});
    }catch(error){
        console.error(error);

        if(error.code === "23503"){
            return res.status(409).json({mensaje: "no se puede eliminar, el cliente tiene eventos asociados"});
        }

        res.status(500).json({mensaje: "no se pudo eliminar el cliente"});
    }
};
