import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol } from "../middleware/permisos.js";
import { obtenerPendientes } from "../controllers/pendientes.controller.js";

const router = Router();

router.use(verificarToken, conRol);

router.get("/", obtenerPendientes);

export default router;
