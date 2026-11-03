import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import RutaProtegida from "./components/RutaProtegida.jsx";
import Acceso from "./pages/Acceso.jsx";
import Landing from "./pages/Landing.jsx";
import Splash from "./components/Splash.jsx";

// Las pantallas se cargan recién cuando se visitan (la landing y el acceso, que son lo primero que se ve, van directas).
const Clientes = lazy(() => import("./pages/Clientes.jsx"));
const Configuracion = lazy(() => import("./pages/Configuracion.jsx"));
const Empresas = lazy(() => import("./pages/Empresas.jsx"));
const EventoDetalle = lazy(() => import("./pages/EventoDetalle.jsx"));
const EventoPublico = lazy(() => import("./pages/EventoPublico.jsx"));
const Eventos = lazy(() => import("./pages/Eventos.jsx"));
const Proveedores = lazy(() => import("./pages/Proveedores.jsx"));
const Reservar = lazy(() => import("./pages/Reservar.jsx"));
const Servicios = lazy(() => import("./pages/Servicios.jsx"));
const Sucursales = lazy(() => import("./pages/Sucursales.jsx"));

// Mapa de rutas de toda la app.
//   Públicas:   /  /login  /registro
//               /reservar/:token (link de reservas de la empresa)  /evento/:token (seguimiento de una reserva)
//   Privadas:   /eventos /eventos/:id (ficha) /clientes /proveedores /servicios /sucursales /configuracion /empresas
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
      <Route path="/reservar/:token" element={<Reservar />} />
      <Route path="/evento/:token" element={<EventoPublico />} />

      <Route
        element={
          <RutaProtegida>
            <Layout />
          </RutaProtegida>
        }
      >
        <Route path="/eventos" element={<Eventos />} />
        <Route path="/eventos/:id" element={<EventoDetalle />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/servicios" element={<Servicios />} />
        <Route path="/sucursales" element={<Sucursales />} />
        <Route path="/configuracion" element={<Configuracion />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}
