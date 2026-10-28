import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, ORGANIZADOR } from "../middleware/permisos.js";
import {
    obtenerProveedores,
    obtenerProveedor,
    crearProveedor,
    editarProveedor,
    eliminarProveedor,
    asignarServicios,
} from "../controllers/proveedor.controller.js";

const router = Router();

router.use(verificarToken, conRol);

router.get("/", obtenerProveedores);
router.get("/:id", obtenerProveedor);
router.post("/", soloRoles(ORGANIZADOR), crearProveedor);
router.put("/:id", soloRoles(ORGANIZADOR), editarProveedor);
router.put("/:id/servicios", soloRoles(ORGANIZADOR), asignarServicios);
router.delete("/:id", soloRoles(ORGANIZADOR), eliminarProveedor);

export default router;
