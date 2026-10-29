import { Tag } from "antd";
import { etiqueta } from "../utils/formato.js";

// Disponibilidad de la sede -> color (pendiente de consulta, confirmada o no disponible).
export const COLORES_SEDE = { pendiente: "var(--amber)", confirmada: "var(--lime)", no_disponible: "var(--red)" };

// Etiqueta de estado con color (evento, propuesta, tarea). "color" es una variable CSS como "var(--lime)":
// el fondo es ese color muy suave y el texto el color pleno, así funciona igual en los dos temas.
export default function Estado({ estado, color = "var(--muted)", className }) {
  return (
    <Tag
      variant="filled"
      className={className}
      style={{ "--c": color, color: "var(--c)", background: "color-mix(in srgb, var(--c) 16%, transparent)", fontWeight: 500, marginInlineEnd: 0 }}
    >
      {etiqueta(estado)}
    </Tag>
  );
}
