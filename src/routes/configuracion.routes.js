import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol } from "../middleware/permisos.js";
import { obtenerConfiguracion, guardarConfiguracion } from "../controllers/configuracion.controller.js";

const router = Router();

// Datos del negocio del admin que inició sesión (siempre su propia empresa).
router.use(verificarToken, conRol);

router.get("/", obtenerConfiguracion);
router.put("/", guardarConfiguracion);

export default router;
