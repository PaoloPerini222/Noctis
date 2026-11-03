import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, ADMIN } from "../middleware/permisos.js";
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
router.post("/", soloRoles(ADMIN), crearCliente);
router.put("/:id", soloRoles(ADMIN), editarCliente);
router.delete("/:id", soloRoles(ADMIN), eliminarCliente);

export default router;
