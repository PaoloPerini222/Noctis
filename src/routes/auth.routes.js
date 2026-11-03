import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { registrar, login, perfil } from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", registrar);
router.post("/login", login);
router.get("/perfil", verificarToken, perfil);

export default router;
