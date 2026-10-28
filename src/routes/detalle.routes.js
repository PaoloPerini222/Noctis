import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, duenoDelEvento, eventoDePropuesta, ORGANIZADOR, COORDINADOR } from "../middleware/permisos.js";
import {
    obtenerDetalles,
    obtenerDetalle,
    crearDetalle,
    editarDetalle,
    cambiarEstadoProveedor,
    eliminarDetalle,
} from "../controllers/detalle.controller.js";

// Se monta en /api/propuesta/:idPropuesta/detalle
const router = Router({ mergeParams: true });

router.use(verificarToken, conRol);

const dueno = [soloRoles(ORGANIZADOR), duenoDelEvento(eventoDePropuesta("idPropuesta"))];

router.get("/", obtenerDetalles);
router.get("/:idDetalle", obtenerDetalle);
router.post("/", ...dueno, crearDetalle);
router.put("/:idDetalle", ...dueno, editarDetalle);
// La situación del proveedor la registra el coordinador, que es quien lo contacta.
router.put("/:idDetalle/estado", soloRoles(COORDINADOR), cambiarEstadoProveedor);
router.delete("/:idDetalle", ...dueno, eliminarDetalle);

export default router;
