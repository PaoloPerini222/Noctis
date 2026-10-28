import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, COORDINADOR } from "../middleware/permisos.js";
import { obtenerCierre, crearCierre, registrarAviso } from "../controllers/cierre.controller.js";

// Se monta en /api/evento/:idEvento/cierre
const router = Router({ mergeParams: true });

router.use(verificarToken, conRol);

router.get("/", obtenerCierre);
// El permiso depende del resultado y del origen de la cancelación: se verifica en el controller.
router.post("/", crearCierre);
router.put("/avisos/:idAviso", soloRoles(COORDINADOR), registrarAviso);

export default router;
