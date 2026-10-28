import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, duenoDelEvento, eventoDeRuta, ORGANIZADOR } from "../middleware/permisos.js";
import {
    obtenerExclusiones,
    crearExclusion,
    editarExclusion,
    eliminarExclusion,
} from "../controllers/exclusion.controller.js";

// Se monta en /api/evento/:idEvento/exclusiones
const router = Router({ mergeParams: true });

router.use(verificarToken, conRol);

const dueno = [soloRoles(ORGANIZADOR), duenoDelEvento(eventoDeRuta("idEvento"))];

router.get("/", obtenerExclusiones);
router.post("/", ...dueno, crearExclusion);
router.put("/:idExclusion", ...dueno, editarExclusion);
router.delete("/:idExclusion", ...dueno, eliminarExclusion);

export default router;
