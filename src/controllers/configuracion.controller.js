import pool from "../data/db.js";
import {textoObligatorio, textoOpcional, REGEX_EMAIL} from "../utils/validaciones.js";

// Datos del negocio que el admin puede cambiar. El nombre es el que ve el cliente en el link de reservas.
// El CUIT y el estado de la empresa los administra el superadmin.
const SELECT_EMPRESA = `select nombre, cuit, email, telefono, direccion, token_reservas from empresas where id_empresa = $1`;

export const obtenerConfiguracion = async (req, res) => {
    try{
        const empresa = await pool.query(SELECT_EMPRESA, [req.usuario.id_empresa]);
        if(empresa.rows.length === 0){
            return res.status(404).json({mensaje: "tu empresa no existe"});
        }

        res.json(empresa.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo obtener la configuracion"});
    }
};

export const guardarConfiguracion = async (req, res) => {
    try{
        const nombre = textoObligatorio(req.body?.nombre, "el nombre del negocio", 150);
        const email = textoOpcional(req.body?.email, "el email", 150);
        const telefono = textoOpcional(req.body?.telefono, "el telefono", 30);
        const direccion = textoOpcional(req.body?.direccion, "la direccion", 200);
        const error = nombre.error ?? email.error ?? telefono.error ?? direccion.error;
        if(error){
            return res.status(400).json({mensaje: error});
        }
        if(email.valor && !REGEX_EMAIL.test(email.valor)){
            return res.status(400).json({mensaje: "el email no es valido"});
        }

        await pool.query(
            `update empresas set nombre = $1, email = $2, telefono = $3, direccion = $4 where id_empresa = $5`,
            [nombre.valor, email.valor, telefono.valor, direccion.valor, req.usuario.id_empresa]
        );

        const empresa = await pool.query(SELECT_EMPRESA, [req.usuario.id_empresa]);
        res.json(empresa.rows[0]);

    } catch(error){
        console.error(error);

        res.status(500).json({mensaje: "no se pudo guardar la configuracion"});
    }
};
