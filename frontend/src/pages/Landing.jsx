import { ArrowRightOutlined, LoginOutlined } from "@ant-design/icons";
import { Button, Collapse } from "antd";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import BotonTema from "../components/BotonTema.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// Landing pública: presentación del producto. Los textos están en estas listas (FUNCIONES, PASOS, FAQ).
// Los botones y el FAQ (acordeón) son de Ant Design.
const FUNCIONES = [
  { titulo: "Eventos", texto: "Fecha, sede, asistentes y estado de cada fiesta.", color: "var(--pink)" },
  { titulo: "Salones", texto: "Cada salón con su propia agenda: un evento por salón y por día.", color: "var(--amber)" },
  { titulo: "Calendario", texto: "Toda la temporada, semana por semana.", color: "var(--lime)" },
  { titulo: "Proveedores", texto: "Avisales por WhatsApp cuando reservan su servicio.", color: "var(--cyan)" },
];

const PASOS = [
  { n: 1, titulo: "Creá tu cuenta", texto: "Elegí tu empresa y entrá al panel.", color: "var(--pink)" },
  { n: 2, titulo: "Armá tu oferta", texto: "Salones, servicios y proveedores.", color: "var(--amber)" },
  { n: 3, titulo: "Publicá la fiesta", texto: "Compartí tu link y aceptá reservas.", color: "var(--cyan)" },
];

const FAQ = [
  {
    pregunta: "¿Quién usa el panel?",
    respuesta: "El admin de tu empresa gestiona las reservas, los eventos, los servicios y el equipo. Tus clientes reservan solos desde tu link público.",
  },
  {
    pregunta: "¿Puedo manejar varias salas?",
    respuesta: "Sí. Cada evento tiene su propia sala o sede y su estado, así que podés organizar fiestas en distintos espacios a la vez y verlas juntas en el calendario.",
  },
  {
    pregunta: "¿Funciona desde el celular?",
    respuesta: "Sí. El panel se adapta a la pantalla del teléfono, con menú inferior y tablas en formato de tarjetas, y el enlace que recibe el cliente también se ve bien en el celular.",
  },
  {
    pregunta: "¿Cuánto cuesta?",
    respuesta: "Crear tu cuenta es gratis. Podés registrarte y empezar a cargar tus servicios y recibir reservas sin costo.",
  },
];

// Efecto de aparición: marca con la clase "in" los elementos .reveal cuando entran en pantalla.
// Marca con la clase "in" los elementos .reveal cuando entran en pantalla.
function useReveal(ref) {
  useEffect(() => {
    if (!ref.current) return;
    const els = ref.current.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entradas) => entradas.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ref]);
}

export default function Landing() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false); // true cuando se bajó un poco: la barra pasa a ser de cristal
  const raiz = useRef(null);

  useEffect(() => {
    const alScroll = () => setScrolled(window.scrollY > 24);
    alScroll();
    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  useReveal(raiz);

  // Quien ya tiene sesión va directo al panel.
  if (usuario) return <Navigate to="/eventos" replace />;

  return (
    <div className="landing" ref={raiz}>
      <header className={`land-nav ${scrolled ? "scrolled" : ""}`}>
        <span>NOCTIS / GESTOR DE FIESTAS</span>
        <nav>
          <Button shape="round" href="#funcionalidades">Funcionalidades</Button>
          <Button shape="round" href="#como-funciona">Cómo funciona</Button>
          <Button shape="round" href="#faq">FAQ</Button>
          <BotonTema />
          <Button type="primary" shape="round" icon={<LoginOutlined />} onClick={() => navigate("/login")}>
            Ingresar
          </Button>
        </nav>
      </header>

      <section className="land-hero">
        <h1 className="land-title">NOC<br /><span>TIS</span></h1>
        <div className="land-sub">
          <p className="reveal d1">El gestor de fiestas para boliches.</p>
          <ul className="reveal d2">
            <li>RESERVAS</li>
            <li>SERVICIOS</li>
            <li>ADMINS</li>
          </ul>
          <div className="end reveal d3">
            <Button type="primary" size="large" shape="round" onClick={() => navigate("/registro")}>
              Crear cuenta gratis <ArrowRightOutlined />
            </Button>
          </div>
        </div>
      </section>

      <section className="lineup" id="funcionalidades">
        <div className="lineup-head reveal">
          <span>LINE-UP DE FUNCIONALIDADES</span>
          <span>{String(FUNCIONES.length).padStart(2, "0")} ACTOS</span>
        </div>
        {FUNCIONES.map((f) => (
          <div key={f.titulo} className="lineup-row reveal">
            <b style={{ color: f.color }}>{f.titulo}</b>
            <span>{f.texto}</span>
          </div>
        ))}
      </section>

      <section className="steps" id="como-funciona">
        {PASOS.map((p) => (
          <div key={p.n} className="step reveal" style={{ "--c": p.color }}>
            <span className="n">{p.n}</span>
            <h3>{p.titulo}</h3>
            <p>{p.texto}</p>
          </div>
        ))}
      </section>

      {/* Preguntas frecuentes: acordeón de Ant Design (se abre una sola a la vez). */}
      <section className="faq" id="faq">
        <h2 className="reveal">FAQ</h2>
        <Collapse
          className="reveal"
          accordion
          ghost
          size="large"
          defaultActiveKey={["0"]}
          items={FAQ.map((f, i) => ({ key: String(i), label: f.pregunta, children: <p>{f.respuesta}</p> }))}
        />
      </section>

      <footer className="land-foot">
        <span>NOCTIS</span>
        <Button type="link" onClick={() => navigate("/login")}>Ingresar</Button>
      </footer>
    </div>
  );
}
