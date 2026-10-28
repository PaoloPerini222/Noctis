import pool from "../data/db.js";
import {REGEX_EMAIL, listaDeIds, parseId, textoObligatorio, textoOpcional} from "../utils/validaciones.js";

// Proveedor con la lista de servicios que ofrece.
const SELECT_PROVEEDOR = `
    select p.*,
           coalesce(json_agg(json_build_object('id_servicio', s.id_servicio, 'nombre', s.nombre) order by s.nombre)
                    filter (where s.id_servicio is not null), '[]') as servicios
    from proveedor p
    left join proveedor_servicio ps on ps.id_proveedor = p.id_proveedor
    left join servicio s on s.id_servicio = ps.id_servicio`;

const buscarProveedor = async (db, idEmpresa, idProveedor) => {
    const proveedor = await db.query(`${SELECT_PROVEEDOR} where p.id_proveedor = $1 and p.id_empresa = $2 group by p.id_proveedor`, [idProveedor, idEmpresa]);

    return proveedor.rows[0];
};

const validarProveedor = (body) => {
    const nombre = textoObligatorio(body?.nombre, "el nombre", 100);
    const contacto = textoOpcional(body?.contacto, "el contacto", 100);
    const telefono = textoOpcional(body?.telefono, "el telefono", 30);
    const email = textoOpcional(body?.email, "el email", 100);

    const error = nombre.error ?? contacto.error ?? telefono.error ?? email.error;
    if(error){
        return {error};
    }
    if(email.valor && !REGEX_EMAIL.test(email.valor)){
        return {error: "el email no es valido"};
    }

    return {datos: {nombre: nombre.valor, contacto: contacto.valor, telefono: telefono.valor, email: email.valor}};
};

export const obtenerProveedores = async (req, res) => {
    try{
        const proveedores = await pool.query(`${SELECT_PROVEEDOR} where p.id_empresa = $1 group by p.id_proveedor order by p.nombre`, [req.usuario.id_empresa]);

        res.json(proveedores.rows);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudieron obtener los proveedores"});
    }
};

export const obtenerProveedor = async (req, res) => {
    try{
        const idProveedor = parseId(req.params.id);
        if(idProveedor === null){
            return res.status(400).json({mensaje: "el id del proveedor no es valido"});
        }

        const proveedor = await buscarProveedor(pool, req.usuario.id_empresa, idProveedor);
        if(!proveedor){
            return res.status(404).json({mensaje: "ese proveedor no existe"});
        }

        res.json(proveedor);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener el proveedor"});
    }
};

export const crearProveedor = async (req, res) => {
    try{
        const {error, datos} = validarProveedor(req.body);
        if(error){
            return res.status(400).json({mensaje: error});
        }

        // Si ya existe un proveedor con ese nombre se reutiliza en vez de duplicarlo.
        const existente = await pool.query(`select id_proveedor from proveedor where id_empresa = $2 and lower(nombre) = lower($1)`, [datos.nombre, req.usuario.id_empresa]);
        if(existente.rows.length > 0){
            return res.status(409).json({
                mensaje: "ya existe un proveedor con ese nombre: reutilizalo",
                proveedor: await buscarProveedor(pool, req.usuario.id_empresa, existente.rows[0].id_proveedor),
            });
        }

        const creado = await pool.query(
            `insert into proveedor (nombre, contacto, telefono, email, id_empresa) values ($1, $2, $3, $4, $5) returning id_proveedor`,
            [datos.nombre, datos.contacto, datos.telefono, datos.email, req.usuario.id_empresa]
        );

        res.status(201).json(await buscarProveedor(pool, req.usuario.id_empresa, creado.rows[0].id_proveedor));

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo crear el proveedor"});
    }
};

export const editarProveedor = async (req, res) => {
    try{
        const idProveedor = parseId(req.params.id);
        if(idProveedor === null){
            return res.status(400).json({mensaje: "el id del proveedor no es valido"});
        }

        const actual = await pool.query(`select nombre, contacto, telefono, email from proveedor where id_proveedor = $1 and id_empresa = $2`, [idProveedor, req.usuario.id_empresa]);
        if(actual.rows.length === 0){
            return res.status(404).json({mensaje: "ese proveedor no existe"});
        }

        const {error, datos} = validarProveedor({...actual.rows[0], ...req.body});
        if(error){
            return res.status(400).json({mensaje: error});
        }

        await pool.query(
            `update proveedor set nombre = $1, contacto = $2, telefono = $3, email = $4 where id_proveedor = $5`,
            [datos.nombre, datos.contacto, datos.telefono, datos.email, idProveedor]
        );

        res.json(await buscarProveedor(pool, req.usuario.id_empresa, idProveedor));

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo editar el proveedor"});
    }
};

export const eliminarProveedor = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const idProveedor = parseId(req.params.id);
        if(idProveedor === null){
            return res.status(400).json({mensaje: "el id del proveedor no es valido"});
        }

        await cliente.query("begin");
        const propio = await cliente.query(`select 1 from proveedor where id_proveedor = $1 and id_empresa = $2 for update`, [idProveedor, req.usuario.id_empresa]);
        if(propio.rows.length === 0){
            await cliente.query("rollback");
            return res.status(404).json({mensaje: "ese proveedor no existe"});
        }

        await cliente.query(`delete from proveedor_servicio where id_proveedor = $1`, [idProveedor]);
        const eliminado = await cliente.query(`delete from proveedor where id_proveedor = $1 returning *`, [idProveedor]);

        await cliente.query("commit");
        res.json({mensaje: "proveedor eliminado", proveedor: eliminado.rows[0]});

    } catch(error){
        await cliente.query("rollback");
        console.error(error);

        if(error.code === "23503"){
            return res.status(409).json({mensaje: "no se puede eliminar, el proveedor esta en propuestas o avisos"});
        }

        res.status(500).json({mensaje: "no se pudo eliminar el proveedor"});
    } finally{
        cliente.release();
    }
};

// Reemplaza los servicios que ofrece el proveedor por la lista recibida: {servicios: [id_servicio, ...]}.
export const asignarServicios = async (req, res) => {
    const cliente = await pool.connect();
    try{
        const idProveedor = parseId(req.params.id);
        if(idProveedor === null){
            return res.status(400).json({mensaje: "el id del proveedor no es valido"});
        }

        const {error, ids} = listaDeIds(req.body?.servicios, "servicios");
        if(error){
            return res.status(400).json({mensaje: error});
        }

        await cliente.query("begin");

        const existe = await cliente.query(`select 1 from proveedor where id_proveedor = $1 and id_empresa = $2 for update`, [idProveedor, req.usuario.id_empresa]);
        if(existe.rows.length === 0){
            await cliente.query("rollback");
            return res.status(404).json({mensaje: "ese proveedor no existe"});
        }

        // Los servicios tienen que ser de la misma empresa que el proveedor.
        const propios = await cliente.query(`select count(*)::int as cantidad from servicio where id_servicio = any($1) and id_empresa = $2`, [ids, req.usuario.id_empresa]);
        if(propios.rows[0].cantidad !== new Set(ids).size){
            await cliente.query("rollback");
            return res.status(400).json({mensaje: "alguno de los servicios indicados no existe"});
        }

        await cliente.query(`delete from proveedor_servicio where id_proveedor = $1`, [idProveedor]);
        for(const idServicio of ids){
            await cliente.query(`insert into proveedor_servicio (id_proveedor, id_servicio) values ($1, $2)`, [idProveedor, idServicio]);
        }

        await cliente.query("commit");
        res.json(await buscarProveedor(pool, req.usuario.id_empresa, idProveedor));

    } catch(error){
        await cliente.query("rollback");
        console.error(error);

        if(error.code === "23503"){
            return res.status(400).json({mensaje: "alguno de los servicios indicados no existe"});
        }

        res.status(500).json({mensaje: "no se pudieron asignar los servicios"});
    } finally{
        cliente.release();
    }
};
