import pool from "../data/db.js";
import {parseId, textoObligatorio, textoOpcional} from "../utils/validaciones.js";

// Salones o lugares de la empresa donde brinda sus servicios. El cliente elige uno al reservar.
const validarSucursal = (body) => {
    const nombre = textoObligatorio(body?.nombre, "el nombre", 100);
    if(nombre.error){
        return {error: nombre.error};
    }

    const direccion = textoOpcional(body?.direccion, "la direccion", 200);
    if(direccion.error){
        return {error: direccion.error};
    }

    return {datos: {nombre: nombre.valor, direccion: direccion.valor}};
};

// Dos salones de la misma empresa no pueden llamarse igual (sin distinguir mayusculas ni espacios de mas).
const nombreRepetido = async (idEmpresa, nombre, idSucursal = null) => {
    const repetido = await pool.query(
        `select 1 from sucursal
         where id_empresa = $3
           and lower(regexp_replace(trim(nombre), '\\s+', ' ', 'g')) = lower(regexp_replace(trim($1), '\\s+', ' ', 'g'))
           and ($2::int is null or id_sucursal <> $2)
         limit 1`,
        [nombre, idSucursal, idEmpresa]
    );

    return repetido.rows.length > 0;
};

export const obtenerSucursales = async (req, res) => {
    try{
        const sucursales = await pool.query(`select * from sucursal where id_empresa = $1 order by nombre`, [req.usuario.id_empresa]);

        res.json(sucursales.rows);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener las sucursales"});
    }
};

export const obtenerSucursal = async (req, res) => {
    try{
        const idSucursal = parseId(req.params.id);
        if(idSucursal === null){
            return res.status(400).json({mensaje: "el id de la sucursal no es valido"});
        }

        const sucursal = await pool.query(`select * from sucursal where id_sucursal = $1 and id_empresa = $2`, [idSucursal, req.usuario.id_empresa]);
        if(sucursal.rows.length === 0){
            return res.status(404).json({mensaje: "esa sucursal no existe"});
        }

        res.json(sucursal.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener la sucursal"});
    }
};

export const crearSucursal = async (req, res) => {
    try{
        const {error, datos} = validarSucursal(req.body);
        if(error){
            return res.status(400).json({mensaje: error});
        }
        if(await nombreRepetido(req.usuario.id_empresa, datos.nombre)){
            return res.status(409).json({mensaje: "ya existe una sucursal con ese nombre"});
        }

        const creada = await pool.query(
            `insert into sucursal (nombre, direccion, id_empresa) values ($1, $2, $3) returning *`,
            [datos.nombre, datos.direccion, req.usuario.id_empresa]
        );

        res.status(201).json(creada.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo crear la sucursal"});
    }
};

export const editarSucursal = async (req, res) => {
    try{
        const idSucursal = parseId(req.params.id);
        if(idSucursal === null){
            return res.status(400).json({mensaje: "el id de la sucursal no es valido"});
        }

        const actual = await pool.query(`select nombre, direccion from sucursal where id_sucursal = $1 and id_empresa = $2`, [idSucursal, req.usuario.id_empresa]);
        if(actual.rows.length === 0){
            return res.status(404).json({mensaje: "esa sucursal no existe"});
        }

        const {error, datos} = validarSucursal({...actual.rows[0], ...req.body});
        if(error){
            return res.status(400).json({mensaje: error});
        }
        if(await nombreRepetido(req.usuario.id_empresa, datos.nombre, idSucursal)){
            return res.status(409).json({mensaje: "ya existe una sucursal con ese nombre"});
        }

        const editada = await pool.query(
            `update sucursal set nombre = $1, direccion = $2 where id_sucursal = $3 and id_empresa = $4 returning *`,
            [datos.nombre, datos.direccion, idSucursal, req.usuario.id_empresa]
        );

        res.json(editada.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo editar la sucursal"});
    }
};

export const eliminarSucursal = async (req, res) => {
    try{
        const idSucursal = parseId(req.params.id);
        if(idSucursal === null){
            return res.status(400).json({mensaje: "el id de la sucursal no es valido"});
        }

        const eliminada = await pool.query(`delete from sucursal where id_sucursal = $1 and id_empresa = $2 returning *`, [idSucursal, req.usuario.id_empresa]);
        if(eliminada.rows.length === 0){
            return res.status(404).json({mensaje: "esa sucursal no existe"});
        }

        res.json({mensaje: "sucursal eliminada", sucursal: eliminada.rows[0]});

    } catch(error){
        console.error(error);

        if(error.code === "23503"){
            return res.status(409).json({mensaje: "no se puede eliminar, la sucursal tiene eventos"});
        }

        res.status(500).json({mensaje: "no se pudo eliminar la sucursal"});
    }
};
