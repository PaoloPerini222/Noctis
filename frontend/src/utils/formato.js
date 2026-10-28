// Las fechas de Postgres llegan como "2026-10-24T00:00:00.000Z"; nos quedamos con el día.
export const soloFecha = (valor) => (valor ? String(valor).slice(0, 10) : "");

const aFecha = (valor) => {
  const f = soloFecha(valor);
  return f ? new Date(`${f}T00:00:00`) : null;
};

export const hoyISO = () => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const cap = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

// "Vie 24 Oct" (este año) o "Mié 10 Mar 2027" (otro año, para que no sea ambigua)
export const fechaCorta = (valor) => {
  const d = aFecha(valor);
  if (!d) return "Sin fecha";
  const dia = cap(d.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", ""));
  const mes = cap(d.toLocaleDateString("es-AR", { month: "short" }).replace(".", ""));
  const anio = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${dia} ${d.getDate()} ${mes}${anio}`;
};

// "MIÉ 22 OCT 2026"
export const fechaLarga = (d = new Date()) =>
  d
    .toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .replace(/\./g, "")
    .replace(/,/g, "")
    .replace(/ de /g, " ")
    .toUpperCase();

export const diasHasta = (valor) => {
  const d = aFecha(valor);
  if (!d) return null;
  const hoy = aFecha(hoyISO());
  return Math.round((d - hoy) / 86400000);
};

export const iniciales = (nombre = "") =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";

export const etiqueta = (texto = "") => cap(String(texto).replace(/_/g, " "));

export const moneda = (valor) =>
  Number(valor ?? 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
