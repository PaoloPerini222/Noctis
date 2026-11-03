import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol } from "../middleware/permisos.js";
import { obtenerEventos, obtenerEvento, crearEvento, editarEvento, eliminarEvento } from "../controllers/evento.controller.js";

const router = Router();

// Cualquier admin de la empresa trabaja sobre cualquier evento (las reservas entran sin nadie a cargo).
router.use(verificarToken, conRol);

router.get("/", obtenerEventos);
router.get("/:id", obtenerEvento);
router.post("/", crearEvento);
router.put("/:id", editarEvento);
router.delete("/:id", eliminarEvento);

export default router;
