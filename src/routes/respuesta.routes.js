import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol } from "../middleware/permisos.js";
import { registrarRespuesta } from "../controllers/respuesta.controller.js";

// Se monta en /api/evento/:idEvento/proveedores
const router = Router({ mergeParams: true });

router.use(verificarToken, conRol);

router.put("/:idProveedor", registrarRespuesta);

export default router;
