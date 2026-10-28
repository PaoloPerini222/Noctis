import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { soloRoles, SUPERADMIN } from "../middleware/permisos.js";
import { obtenerEmpresas,
    obtenerEmpresa,
    crearEmpresa,
    editarEmpresa,
    eliminarEmpresa } from "../controllers/empresas.controller.js";

const router = Router();

// Las empresas son de la plataforma: solo el superadmin las ve y las administra.
router.use(verificarToken, soloRoles(SUPERADMIN));

router.get("/", obtenerEmpresas);
router.get("/:id", obtenerEmpresa);
router.post("/", crearEmpresa);
router.put("/:id", editarEmpresa);
router.delete("/:id", eliminarEmpresa);

export default router;
