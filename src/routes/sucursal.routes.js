import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol } from "../middleware/permisos.js";
import {
    obtenerSucursales,
    obtenerSucursal,
    crearSucursal,
    editarSucursal,
    eliminarSucursal,
} from "../controllers/sucursal.controller.js";

const router = Router();

router.use(verificarToken, conRol);

router.get("/", obtenerSucursales);
router.get("/:id", obtenerSucursal);
router.post("/", crearSucursal);
router.put("/:id", editarSucursal);
router.delete("/:id", eliminarSucursal);

export default router;
