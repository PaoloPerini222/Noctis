import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol } from "../middleware/permisos.js";
import { actualizarReportes, obtenerReportes } from "../controllers/reporte.controller.js";

// Reportes del admin, sacados del Data Warehouse.
const router = Router();

router.use(verificarToken, conRol);

router.get("/", obtenerReportes);
router.post("/actualizar", actualizarReportes);

export default router;
