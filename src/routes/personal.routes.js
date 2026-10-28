import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, RESPONSABLE } from "../middleware/permisos.js";
import {
    obtenerPersonales,
    obtenerPersonal,
    crearPersonal,
    editarPersonal,
    eliminarPersonal,
    asignarRoles,
} from "../controllers/personal.controller.js";

const router = Router();

router.use(verificarToken, conRol);

router.get("/", obtenerPersonales);
router.get("/:id", obtenerPersonal);
router.post("/", soloRoles(RESPONSABLE), crearPersonal);
router.put("/:id", soloRoles(RESPONSABLE), editarPersonal);
router.put("/:id/roles", soloRoles(RESPONSABLE), asignarRoles);
router.delete("/:id", soloRoles(RESPONSABLE), eliminarPersonal);

export default router;
