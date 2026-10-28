import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol } from "../middleware/permisos.js";
import { obtenerRoles } from "../controllers/rol.controller.js";

const router = Router();

router.use(verificarToken, conRol);

router.get("/", obtenerRoles);

export default router;
