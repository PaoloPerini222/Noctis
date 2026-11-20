import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import empresasRoutes from "./routes/empresas.routes.js";
import clienteRoutes from "./routes/cliente.routes.js";
import eventoRoutes from "./routes/evento.routes.js";
import publicoRoutes from "./routes/publico.routes.js";
import personalRoutes from "./routes/personal.routes.js";
import servicioRoutes from "./routes/servicio.routes.js";
import proveedorRoutes from "./routes/proveedor.routes.js";
import cambioRoutes from "./routes/cambio.routes.js";
import sucursalRoutes from "./routes/sucursal.routes.js";
import configuracionRoutes from "./routes/configuracion.routes.js";
import respuestaRoutes from "./routes/respuesta.routes.js";
import reporteRoutes from "./routes/reporte.routes.js";
import { cargarPronto, programarEtl } from "./dw/etl.js";

const app = express();
const PORT = process.env.PORT || 3000;

// FRONTEND_URL puede tener varias direcciones separadas por coma (ej. el front local y el de Vercel).
app.use(cors({ origin: (process.env.FRONTEND_URL ?? "").split(",").map((u) => u.trim()).filter(Boolean) }));
app.use(express.json());

// Cada cambio que sale bien (alta, edición, baja o reserva del link) dispara el ETL, así el Data Warehouse
// queda al día a los pocos segundos. Los inicios de sesión y los propios reportes no cuentan como cambios.
app.use("/api", (req, res, next) => {
    if (req.method !== "GET" && !req.path.startsWith("/auth") && !req.path.startsWith("/reportes")) {
        res.on("finish", () => {
            if (res.statusCode < 400) cargarPronto();
        });
    }
    next();
});

app.use("/api/auth", authRoutes);
app.use("/api/publico", publicoRoutes);

app.use("/api/empresas", empresasRoutes);
app.use("/api/clientes", clienteRoutes);
app.use("/api/personal", personalRoutes);
app.use("/api/servicio", servicioRoutes);
app.use("/api/proveedor", proveedorRoutes);
app.use("/api/sucursal", sucursalRoutes);
app.use("/api/configuracion", configuracionRoutes);
app.use("/api/reportes", reporteRoutes);

app.use("/api/evento/:idEvento/cambios", cambioRoutes);
app.use("/api/evento/:idEvento/proveedores", respuestaRoutes);
app.use("/api/evento", eventoRoutes);

app.use((req, res) => {
    res.status(404).json({ mensaje: "Ruta no encontrada" });
});

app.listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT}`)
    programarEtl();
})
