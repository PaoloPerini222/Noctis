import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, duenoDelEvento, eventoDeBody, eventoDePropuesta, ORGANIZADOR, RESPONSABLE } from "../middleware/permisos.js";
import {
    obtenerPropuestas,
    obtenerPropuesta,
    crearPropuesta,
    editarPropuesta,
    aprobarPropuesta,
    eliminarPropuesta,
} from "../controllers/propuesta.controller.js";

const router = Router();

router.use(verificarToken, conRol);

const duenoDePropuesta = [soloRoles(ORGANIZADOR), duenoDelEvento(eventoDePropuesta("id"))];

router.get("/", obtenerPropuestas);
router.get("/:id", obtenerPropuesta);
router.post("/", soloRoles(ORGANIZADOR), duenoDelEvento(eventoDeBody), crearPropuesta);
router.put("/:id", ...duenoDePropuesta, editarPropuesta);
// Solo la responsable aprueba (o devuelve a borrador) una propuesta pendiente de revisión.
router.put("/:id/aprobacion", soloRoles(RESPONSABLE), aprobarPropuesta);
router.delete("/:id", ...duenoDePropuesta, eliminarPropuesta);

export default router;
