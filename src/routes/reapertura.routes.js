import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import { conRol, soloRoles, duenoDelEvento, eventoDeRuta, ORGANIZADOR } from "../middleware/permisos.js";
import { obtenerRechazos, reabrirSolicitud } from "../controllers/reapertura.controller.js";

// Se monta en /api/evento/:idEvento/reapertura
const router = Router({ mergeParams: true });

router.use(verificarToken, conRol);

// Todos ven los rechazos anteriores; reabrir la solicitud es del organizador del evento.
router.get("/", obtenerRechazos);
router.post("/", soloRoles(ORGANIZADOR), duenoDelEvento(eventoDeRuta("idEvento")), reabrirSolicitud);

export default router;
