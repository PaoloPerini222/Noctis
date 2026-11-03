import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, ADMIN } from "../middleware/permisos.js";
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
router.post("/", soloRoles(ADMIN), crearProveedor);
router.put("/:id", soloRoles(ADMIN), editarProveedor);
router.put("/:id/servicios", soloRoles(ADMIN), asignarServicios);
router.delete("/:id", soloRoles(ADMIN), eliminarProveedor);

export default router;
