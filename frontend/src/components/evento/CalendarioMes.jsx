import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { Button, Card, Tooltip } from "antd";
import { useState } from "react";
import { hoyISO, soloFecha } from "../../utils/formato.js";

const DIAS = ["L", "M", "M", "J", "V", "S", "D"];
// Eventos que ocupan el día: reservas nuevas, confirmados y realizados (los rechazados y cancelados liberan la fecha).
const OCUPAN = ["propuesta", "confirmado", "realizado"];

const iso = (anio, mes, dia) => `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

// Calendario del mes con los días que tienen un evento marcados en rojo. Se pasa de mes con las flechas;
// al pasar el mouse por un día marcado se ven sus eventos y al hacer clic se listan con su salón.
//   eventos  -> lista de eventos (con fecha y estado)
//   onElegir -> (fecha, eventos) => muestra los eventos de ese día
export default function CalendarioMes({ eventos, onElegir }) {
  const [mes, setMes] = useState(() => {
    const hoy = new Date();
    return { anio: hoy.getFullYear(), mes: hoy.getMonth() };
  });

  const hoy = hoyISO();
  const titulo = `${new Date(mes.anio, mes.mes, 1).toLocaleDateString("es-AR", { month: "long" })} ${mes.anio}`;
  const diasDelMes = new Date(mes.anio, mes.mes + 1, 0).getDate();
  const huecos = (new Date(mes.anio, mes.mes, 1).getDay() + 6) % 7; // la semana arranca el lunes

  const porDia = {};
  for (const e of eventos) {
    if (!e.fecha || !OCUPAN.includes(e.estado)) continue;
    (porDia[soloFecha(e.fecha)] ??= []).push(e);
  }

  const mover = (delta) => setMes(({ anio, mes: m }) => {
    const d = new Date(anio, m + delta, 1);
    return { anio: d.getFullYear(), mes: d.getMonth() };
  });

  return (
    <Card variant="borderless" className="calendario">
      <div className="calendario-cabecera">
        <Button type="text" shape="circle" icon={<LeftOutlined />} aria-label="Mes anterior" onClick={() => mover(-1)} />
        <h2>{titulo}</h2>
        <Button type="text" shape="circle" icon={<RightOutlined />} aria-label="Mes siguiente" onClick={() => mover(1)} />
      </div>

      <div className="calendario-grilla">
        {DIAS.map((d, i) => <span key={i} className="calendario-dia-semana">{d}</span>)}
        {Array.from({ length: huecos }, (_, i) => <span key={`h${i}`} />)}
        {Array.from({ length: diasDelMes }, (_, i) => {
          const fecha = iso(mes.anio, mes.mes, i + 1);
          const delDia = porDia[fecha] ?? [];
          const clases = ["calendario-dia", delDia.length && "con-evento", fecha === hoy && "hoy", fecha < hoy && "pasado"].filter(Boolean).join(" ");
          const dia = delDia.length ? (
            <button type="button" className={clases} onClick={() => onElegir(fecha, delDia)}>{i + 1}</button>
          ) : (
            <span className={clases}>{i + 1}</span>
          );
          return delDia.length ? (
            <Tooltip key={fecha} title={delDia.map((e) => `${e.sucursal_nombre ?? "Sin salón"}: ${e.tipo_evento}`).join(" · ")}>
              {dia}
            </Tooltip>
          ) : (
            <span key={fecha}>{dia}</span>
          );
        })}
      </div>
    </Card>
  );
}
