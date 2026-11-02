import { Progress } from "antd";
import { useEffect, useState } from "react";
import useTema from "../hooks/useTema.js";
import { DURACION_RAPIDA, DURACION_REDUCIDA, menosMovimiento, suscribirSplash } from "../utils/splash.js";

// Colores de la barra de progreso de cada tema (de izquierda a derecha).
const DEGRADADO = {
  light: { from: "#e3b324", to: "#b0701a" },
  dark: { from: "#8f1220", to: "#ff5a6a" },
};

// Splash que aparece cada vez que el usuario cambia de modo claro/oscuro.
// Usa Ant Design (barra de progreso con degradado) y los mismos estilos de styles/splash.css que el
// splash inicial de index.html: fondo del tema, logo animado y subtítulo.
// Se monta una sola vez (en App.jsx) y espera la señal de mostrarSplash() (utils/splash.js).
export default function Splash() {
  const [tema] = useTema();
  const [visible, setVisible] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [porcentaje, setPorcentaje] = useState(0);
  const [vuelta, setVuelta] = useState(0); // cambia en cada aparición para reiniciar las animaciones

  // Cuando llega la señal, arranca desde cero.
  useEffect(
    () =>
      suscribirSplash(() => {
        setPorcentaje(0);
        setSaliendo(false);
        setVuelta((v) => v + 1);
        setVisible(true);
      }),
    []
  );

  // Mientras está visible: sube la barra, y al terminar se desvanece y se desmonta.
  useEffect(() => {
    if (!visible) return undefined;
    const total = menosMovimiento() ? DURACION_REDUCIDA : DURACION_RAPIDA;
    const inicio = performance.now();
    const barra = setInterval(() => setPorcentaje(Math.min(100, ((performance.now() - inicio) / (total - 300)) * 100)), 40);
    const salir = setTimeout(() => setSaliendo(true), total);
    const quitar = setTimeout(() => setVisible(false), total + 900);
    return () => {
      clearInterval(barra);
      clearTimeout(salir);
      clearTimeout(quitar);
    };
  }, [visible, vuelta]);

  if (!visible) return null;

  return (
    <div
      key={vuelta}
      className={`splash splash--antd ${saliendo ? "fuera" : ""}`}
      style={{ "--ritmo": 0.6 }}
      role="status"
      aria-live="polite"
    >
      <div className="splash-marca">
        {[..."NOCTIS"].map((letra, i) => (
          <span key={i}>{letra}</span>
        ))}
      </div>
      <p className="splash-sub">Gestor de fiestas</p>
      {/* El contenedor fija el ancho y lo centra; la barra de antd ocupa todo ese ancho. */}
      <div className="splash-progreso">
        <Progress
          percent={porcentaje}
          showInfo={false}
          size={["100%", 6]}
          strokeColor={DEGRADADO[tema]}
          railColor="rgba(128, 128, 128, 0.25)"
        />
      </div>
    </div>
  );
}
