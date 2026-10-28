import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, ORGANIZADOR } from "../middleware/permisos.js";
import {
    obtenerClientes,
    obtenerCliente,
    crearCliente,
    editarCliente,
    eliminarCliente,
} from "../controllers/cliente.controller.js";

const router = Router();

router.use(verificarToken, conRol);

router.get("/", obtenerClientes);
router.get("/:id", obtenerCliente);
router.post("/", soloRoles(ORGANIZADOR), crearCliente);
router.put("/:id", soloRoles(ORGANIZADOR), editarCliente);
router.delete("/:id", soloRoles(ORGANIZADOR), eliminarCliente);

export default router;
