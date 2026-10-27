import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import RutaProtegida from "./components/RutaProtegida.jsx";
import Acceso from "./pages/Acceso.jsx";
import Landing from "./pages/Landing.jsx";
import Splash from "./components/Splash.jsx";

// Las pantallas se cargan recién cuando se visitan (la landing y el acceso, que son lo primero que se ve, van directas).
const Clientes = lazy(() => import("./pages/Clientes.jsx"));
const Empresas = lazy(() => import("./pages/Empresas.jsx"));
const Equipo = lazy(() => import("./pages/Equipo.jsx"));
const EventoDetalle = lazy(() => import("./pages/EventoDetalle.jsx"));
const EventoPublico = lazy(() => import("./pages/EventoPublico.jsx"));
const Eventos = lazy(() => import("./pages/Eventos.jsx"));
const Pendientes = lazy(() => import("./pages/Pendientes.jsx"));
const Propuestas = lazy(() => import("./pages/Propuestas.jsx"));
const Proveedores = lazy(() => import("./pages/Proveedores.jsx"));
const Servicios = lazy(() => import("./pages/Servicios.jsx"));
const Tareas = lazy(() => import("./pages/Tareas.jsx"));

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
      <Suspense fallback={null}>
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
      </Suspense>
    </>
  );
}
