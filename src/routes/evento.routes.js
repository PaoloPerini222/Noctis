import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, duenoDelEvento, eventoDeRuta, ORGANIZADOR } from "../middleware/permisos.js";
import { obtenerEventos, obtenerEvento, crearEvento, editarEvento, eliminarEvento } from "../controllers/evento.controller.js";

const router = Router();

router.use(verificarToken, conRol);

const dueno = [soloRoles(ORGANIZADOR), duenoDelEvento(eventoDeRuta("id"))];

router.get("/", obtenerEventos);
router.get("/:id", obtenerEvento);
router.post("/", soloRoles(ORGANIZADOR), crearEvento);
router.put("/:id", ...dueno, editarEvento);
router.delete("/:id", ...dueno, eliminarEvento);

export default router;
