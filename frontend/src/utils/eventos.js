// Lo que comparten las pantallas de eventos (tabla, ficha y ventana de Detalles).

// Estado del evento -> color de su etiqueta.
export const ESTADOS = {
  propuesta: "var(--amber)",
  confirmado: "var(--lime)",
  rechazado: "var(--red)",
  realizado: "var(--muted)",
  cancelado: "var(--red)",
};

// Un evento "cerrado" ya no cambia; una reserva en "propuesta" todavía no se aceptó.
export const CERRADOS = ["realizado", "cancelado", "rechazado"];

// Colores que se reparten entre eventos (barra de la tabla, día del calendario).
const PALETA = ["var(--pink)", "var(--cyan)", "var(--violet)", "var(--lime)", "var(--amber)"];
export const colorDe = (e) => PALETA[e.id_evento % PALETA.length];

// Copia un texto al portapapeles; si el navegador no lo permite, lo muestra para copiarlo a mano.
export async function copiar(message, url, exito) {
  try {
    await navigator.clipboard.writeText(url);
    message.success(exito);
  } catch {
    window.prompt("Copiá el link", url);
  }
}

// Número de WhatsApp en formato internacional (wa.me). Los teléfonos se cargan como en Argentina, con o sin 0 y
// código de país: "3536579837", "0353 6579837" o "+54 9 353 657-9837" terminan en "5493536579837".
export function numeroWhatsapp(telefono) {
  let n = String(telefono ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (n.startsWith("54")) n = n.slice(2);
  if (n.startsWith("9")) n = n.slice(1);
  if (n.startsWith("0")) n = n.slice(1);
  return n.length >= 8 ? `549${n}` : null;
}

const fechaEscrita = (fecha) =>
  fecha
    ? new Date(`${String(fecha).slice(0, 10)}T00:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "a confirmar";

// "*Catering*", "*Catering* y *Música*", "*Catering*, *Música* y *Fotografía*"
const listaServicios = (servicios) => {
  const nombres = servicios.map((s) => `*${s.nombre}*`);
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}` : nombres[0];
};

// Consulta prearmada para un proveedor: si puede prestar sus servicios (uno o varios del mismo evento) ese día.
export function mensajeProveedor({ proveedor, servicios, evento, empresa }) {
  const salon = evento.sucursal_nombre
    ? `${evento.sucursal_nombre}${evento.sucursal_direccion ? ` (${evento.sucursal_direccion})` : ""}`
    : evento.sede_prevista ?? "a confirmar";
  return [
    `Hola ${proveedor.contacto || proveedor.nombre}! Te escribo de ${empresa}.`,
    `¿Podrías prestarnos el servicio de ${listaServicios(servicios)} el *${fechaEscrita(evento.fecha)}*?`,
    "",
    `• Evento: ${evento.tipo_evento}`,
    `• Salón: ${salon}`,
    ...(evento.cant_asistentes_estimada ? [`• Invitados: ${evento.cant_asistentes_estimada}`] : []),
    `• Cliente: ${evento.cliente_nombre ?? "—"}`,
    "",
    "¿Nos confirmás si estás disponible ese día? ¡Gracias!",
  ].join("\n");
}

// Respuesta de un proveedor a la consulta -> etiqueta y color.
export const RESPUESTAS = {
  avisado: { texto: "Esperando respuesta", color: "var(--amber)" },
  disponible: { texto: "Disponible", color: "var(--lime)" },
  no_disponible: { texto: "No disponible", color: "var(--red)" },
};

// Agrupa los servicios reservados por proveedor: [{ proveedor, servicios }]. Un proveedor que da varios de los
// servicios elegidos recibe un solo aviso con todos.
export function proveedoresDeLaReserva(servicios) {
  const porProveedor = new Map();
  for (const servicio of servicios) {
    for (const proveedor of servicio.proveedores ?? []) {
      if (!porProveedor.has(proveedor.id_proveedor)) porProveedor.set(proveedor.id_proveedor, { proveedor, servicios: [] });
      porProveedor.get(proveedor.id_proveedor).servicios.push(servicio);
    }
  }
  return [...porProveedor.values()];
}

export const linkWhatsapp = (telefono, texto) => {
  const numero = numeroWhatsapp(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null;
};
