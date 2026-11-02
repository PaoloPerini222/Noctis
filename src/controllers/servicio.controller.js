import pool from "../data/db.js";
import {parseId, textoObligatorio, textoOpcional} from "../utils/validaciones.js";

const IMPORTE_MAXIMO = 99999999.99;

const validarServicio = (body) => {
    const nombre = textoObligatorio(body?.nombre, "el nombre", 100);
    if(nombre.error){
        return {error: nombre.error};
    }

    const descripcion = textoOpcional(body?.descripcion, "la descripcion", 255);
    if(descripcion.error){
        return {error: descripcion.error};
    }

    // El importe de referencia es opcional y solo orienta: la propuesta no lo calcula.
    let importe = null;
    const bruto = body?.importe_referencia;
    if(bruto !== undefined && bruto !== null && bruto !== ""){
        importe = typeof bruto === "string" && bruto.trim() ? Number(bruto) : bruto;
        if(typeof importe !== "number" || !Number.isFinite(importe) || importe < 0 || importe > IMPORTE_MAXIMO){
            return {error: "el importe de referencia no es valido"};
        }
        importe = Math.round(importe * 100) / 100;
    }

    return {datos: {nombre: nombre.valor, descripcion: descripcion.valor, importe_referencia: importe}};
};

// Dos servicios no pueden llamarse igual (sin distinguir mayusculas ni espacios de mas).
const nombreRepetido = async (idEmpresa, nombre, idServicio = null) => {
    const repetido = await pool.query(
        `select 1 from servicio
         where id_empresa = $3
           and lower(regexp_replace(trim(nombre), '\\s+', ' ', 'g')) = lower(regexp_replace(trim($1), '\\s+', ' ', 'g'))
           and ($2::int is null or id_servicio <> $2)
         limit 1`,
        [nombre, idServicio, idEmpresa]
    );

    return repetido.rows.length > 0;
};

export const obtenerServicios = async (req, res) => {
    try{
        const servicios = await pool.query(`select * from servicio where id_empresa = $1 order by nombre`, [req.usuario.id_empresa]);

        res.json(servicios.rows);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los servicios"});
    }
};

export const obtenerServicio = async (req, res) => {
    try{
        const idServicio = parseId(req.params.id);
        if(idServicio === null){
            return res.status(400).json({mensaje: "el id del servicio no es valido"});
        }

        const servicio = await pool.query(`select * from servicio where id_servicio = $1 and id_empresa = $2`, [idServicio, req.usuario.id_empresa]);
        if(servicio.rows.length === 0){
            return res.status(404).json({mensaje: "ese servicio no existe"});
        }

        res.json(servicio.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener el servicio"});
    }
};

export const crearServicio = async (req, res) => {
    try{
        const {error, datos} = validarServicio(req.body);
        if(error){
            return res.status(400).json({mensaje: error});
        }
        if(await nombreRepetido(req.usuario.id_empresa, datos.nombre)){
            return res.status(409).json({mensaje: "ya existe un servicio con ese nombre"});
        }

        const creado = await pool.query(
            `insert into servicio (nombre, descripcion, importe_referencia, id_empresa) values ($1, $2, $3, $4) returning *`,
            [datos.nombre, datos.descripcion, datos.importe_referencia, req.usuario.id_empresa]
        );

        res.status(201).json(creado.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo crear el servicio"});
    }
};

export const editarServicio = async (req, res) => {
    try{
        const idServicio = parseId(req.params.id);
        if(idServicio === null){
            return res.status(400).json({mensaje: "el id del servicio no es valido"});
        }

        const actual = await pool.query(`select nombre, descripcion, importe_referencia::float8 as importe_referencia from servicio where id_servicio = $1 and id_empresa = $2`, [idServicio, req.usuario.id_empresa]);
        if(actual.rows.length === 0){
            return res.status(404).json({mensaje: "ese servicio no existe"});
        }

        const {error, datos} = validarServicio({...actual.rows[0], ...req.body});
        if(error){
            return res.status(400).json({mensaje: error});
        }
        if(await nombreRepetido(req.usuario.id_empresa, datos.nombre, idServicio)){
            return res.status(409).json({mensaje: "ya existe un servicio con ese nombre"});
        }

        const editado = await pool.query(
            `update servicio set nombre = $1, descripcion = $2, importe_referencia = $3 where id_servicio = $4 and id_empresa = $5 returning *`,
            [datos.nombre, datos.descripcion, datos.importe_referencia, idServicio, req.usuario.id_empresa]
        );

        res.json(editado.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo editar el servicio"});
    }
};

export const eliminarServicio = async (req, res) => {
    try{
        const idServicio = parseId(req.params.id);
        if(idServicio === null){
            return res.status(400).json({mensaje: "el id del servicio no es valido"});
        }

        const eliminado = await pool.query(`delete from servicio where id_servicio = $1 and id_empresa = $2 returning *`, [idServicio, req.usuario.id_empresa]);
        if(eliminado.rows.length === 0){
            return res.status(404).json({mensaje: "ese servicio no existe"});
        }

        res.json({mensaje: "servicio eliminado", servicio: eliminado.rows[0]});

    } catch(error){
        console.error(error);

        if(error.code === "23503"){
            return res.status(409).json({mensaje: "no se puede eliminar, el servicio lo usan proveedores, propuestas o exclusiones"});
        }

        res.status(500).json({mensaje: "no se pudo eliminar el servicio"});
    }
};
