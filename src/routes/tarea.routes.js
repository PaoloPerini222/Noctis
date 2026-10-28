import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, duenoDelEvento, eventoDeBody, eventoDeTarea, ORGANIZADOR } from "../middleware/permisos.js";
import {
    obtenerTareas,
    obtenerTarea,
    crearTarea,
    editarTarea,
    cambiarEstadoTarea,
    eliminarTarea,
} from "../controllers/tarea.controller.js";

const router = Router();

router.use(verificarToken, conRol);

const duenoDeTarea = [soloRoles(ORGANIZADOR), duenoDelEvento(eventoDeTarea("id"))];

router.get("/", obtenerTareas);
router.get("/:id", obtenerTarea);
router.post("/", soloRoles(ORGANIZADOR), duenoDelEvento(eventoDeBody), crearTarea);
router.put("/:id", ...duenoDeTarea, editarTarea);
// El estado lo cambia quien tiene la tarea o un coordinador (se verifica en el controller).
router.put("/:id/estado", cambiarEstadoTarea);
router.delete("/:id", ...duenoDeTarea, eliminarTarea);

export default router;
