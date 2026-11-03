import { Router } from "express";
import { obtenerReservas, crearReserva, obtenerEventoPublico } from "../controllers/publico.controller.js";

const router = Router();

// Sin verificarToken: el acceso es el token que va en la URL.
//   /reservas/:token -> link de reservas de la empresa (servicios, fechas ocupadas y reservar)
//   /evento/:token   -> seguimiento de una reserva ya hecha
router.get("/reservas/:token", obtenerReservas);
router.post("/reservas/:token", crearReserva);
router.get("/evento/:token", obtenerEventoPublico);

export default router;
