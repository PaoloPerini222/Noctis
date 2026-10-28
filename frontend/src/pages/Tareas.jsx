import { useState } from "react";
import TablaTareas from "../components/TablaTareas.jsx";
import Topbar from "../components/Topbar.jsx";
import { fechaLarga } from "../utils/formato.js";

// Todas las tareas del equipo. Cada uno arranca viendo las suyas; el organizador asigna tareas en sus
// eventos y quien tiene la tarea (o un coordinador) actualiza su estado.
export default function Tareas() {
  const [busqueda, setBusqueda] = useState("");

  return (
    <main className="main">
      <Topbar busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Buscar tareas…" />
      <div className="page-head">
        <div>
          <div className="eyebrow">{fechaLarga()}</div>
          <h1>Tareas</h1>
        </div>
      </div>
      <TablaTareas busqueda={busqueda} />
    </main>
  );
}
