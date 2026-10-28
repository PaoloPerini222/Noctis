import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol } from "../middleware/permisos.js";
import { obtenerCambios, crearCambio, editarCambio } from "../controllers/cambio.controller.js";

// Se monta en /api/evento/:idEvento/cambios
const router = Router({ mergeParams: true });

router.use(verificarToken, conRol);

// Cualquier rol registra lo que le informan; la revisión de compromisos también.
router.get("/", obtenerCambios);
router.post("/", crearCambio);
router.put("/:idCambio", editarCambio);

export default router;
