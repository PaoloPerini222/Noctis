import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, ADMIN } from "../middleware/permisos.js";
import {
    obtenerServicios,
    obtenerServicio,
    crearServicio,
    editarServicio,
    eliminarServicio,
} from "../controllers/servicio.controller.js";

const router = Router();

router.use(verificarToken, conRol);

router.get("/", obtenerServicios);
router.get("/:id", obtenerServicio);
router.post("/", soloRoles(ADMIN), crearServicio);
router.put("/:id", soloRoles(ADMIN), editarServicio);
router.delete("/:id", soloRoles(ADMIN), eliminarServicio);

export default router;
