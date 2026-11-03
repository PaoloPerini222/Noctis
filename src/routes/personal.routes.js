import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol } from "../middleware/permisos.js";
import { obtenerPersonales, obtenerPersonal } from "../controllers/personal.controller.js";

const router = Router();

router.use(verificarToken, conRol);

// Solo lectura: el panel lo usa para mostrar quién está a cargo de cada evento.
// Los admins de cada empresa los da de alta el superadmin desde Empresas.
router.get("/", obtenerPersonales);
router.get("/:id", obtenerPersonal);

export default router;
