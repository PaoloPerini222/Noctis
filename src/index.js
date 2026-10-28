import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import empresasRoutes from "./routes/empresas.routes.js";
import clienteRoutes from "./routes/cliente.routes.js";
import eventoRoutes from "./routes/evento.routes.js";
import tareaRoutes from "./routes/tarea.routes.js";
import propuestaRoutes from "./routes/propuesta.routes.js";
import publicoRoutes from "./routes/publico.routes.js";
import rolRoutes from "./routes/rol.routes.js";
import personalRoutes from "./routes/personal.routes.js";
import servicioRoutes from "./routes/servicio.routes.js";
import proveedorRoutes from "./routes/proveedor.routes.js";
import detalleRoutes from "./routes/detalle.routes.js";
import exclusionRoutes from "./routes/exclusion.routes.js";
import cambioRoutes from "./routes/cambio.routes.js";
import cierreRoutes from "./routes/cierre.routes.js";
import pendientesRoutes from "./routes/pendientes.routes.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/publico", publicoRoutes);

app.use("/api/empresas", empresasRoutes);
app.use("/api/clientes", clienteRoutes);
app.use("/api/rol", rolRoutes);
app.use("/api/personal", personalRoutes);
app.use("/api/servicio", servicioRoutes);
app.use("/api/proveedor", proveedorRoutes);

app.use("/api/evento/:idEvento/exclusiones", exclusionRoutes);
app.use("/api/evento/:idEvento/cambios", cambioRoutes);
app.use("/api/evento/:idEvento/cierre", cierreRoutes);
app.use("/api/evento", eventoRoutes);
app.use("/api/propuesta/:idPropuesta/detalle", detalleRoutes);
app.use("/api/propuesta", propuestaRoutes);
app.use("/api/tarea", tareaRoutes);
app.use("/api/pendientes", pendientesRoutes);

app.use((req, res) => {
    res.status(404).json({ mensaje: "Ruta no encontrada" });
});

app.listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT}`)
})