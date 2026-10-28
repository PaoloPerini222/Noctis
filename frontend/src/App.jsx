import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import RutaProtegida from "./components/RutaProtegida.jsx";
import Acceso from "./pages/Acceso.jsx";
import Clientes from "./pages/Clientes.jsx";
import Empresas from "./pages/Empresas.jsx";
import Equipo from "./pages/Equipo.jsx";
import EventoDetalle from "./pages/EventoDetalle.jsx";
import EventoPublico from "./pages/EventoPublico.jsx";
import Eventos from "./pages/Eventos.jsx";
import Landing from "./pages/Landing.jsx";
import Pendientes from "./pages/Pendientes.jsx";
import Propuestas from "./pages/Propuestas.jsx";
import Proveedores from "./pages/Proveedores.jsx";
import Servicios from "./pages/Servicios.jsx";
import Tareas from "./pages/Tareas.jsx";
import Splash from "./components/Splash.jsx";

// Mapa de rutas de toda la app.
//   Públicas:   /  /login  /registro  /evento/:token (enlace que abre el cliente)
//   Privadas:   /pendientes /eventos /eventos/:id (ficha) /propuestas /tareas /clientes
//               /proveedores /servicios /equipo /empresas
//               Van dentro de RutaProtegida (exige sesión) y de Layout (sidebar + barra móvil).
//   Cualquier otra URL vuelve a la landing.
// <Splash /> es la pantalla que aparece al cambiar de modo claro/oscuro (siempre montado, se muestra por evento).
export default function App() {
  return (
    <>
      <Splash />
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Acceso modo="login" />} />
      <Route path="/registro" element={<Acceso modo="registro" />} />
      <Route path="/evento/:token" element={<EventoPublico />} />

      <Route
        element={
          <RutaProtegida>
            <Layout />
          </RutaProtegida>
        }
      >
        <Route path="/pendientes" element={<Pendientes />} />
        <Route path="/eventos" element={<Eventos />} />
        <Route path="/eventos/:id" element={<EventoDetalle />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/propuestas" element={<Propuestas />} />
        <Route path="/tareas" element={<Tareas />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/servicios" element={<Servicios />} />
        <Route path="/equipo" element={<Equipo />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
