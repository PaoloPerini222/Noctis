import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, ORGANIZADOR } from "../middleware/permisos.js";
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
router.post("/", soloRoles(ORGANIZADOR), crearServicio);
router.put("/:id", soloRoles(ORGANIZADOR), editarServicio);
router.delete("/:id", soloRoles(ORGANIZADOR), eliminarServicio);

export default router;
