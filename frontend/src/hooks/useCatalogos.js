import { useCallback, useEffect, useState } from "react";
import { clientesApi } from "../api/clientes.js";
import { serviciosApi, proveedoresApi } from "../api/catalogos.js";
import { personalApi } from "../api/equipo.js";
import { eventosApi } from "../api/eventos.js";

const FUENTES = {
  eventos: eventosApi,
  clientes: clientesApi,
  personal: personalApi,
  servicios: serviciosApi,
  proveedores: proveedoresApi,
};

// Carga las listas que una pantalla necesita para mostrar nombres en vez de ids y armar los selectores.
//   const { personal, nombrePersona } = useCatalogos(["personal"]);
// Si una lista falla queda vacía: la pantalla sigue andando y muestra el id.
export default function useCatalogos(nombres) {
  const clave = nombres.join(",");
  const [datos, setDatos] = useState(() => Object.fromEntries(nombres.map((n) => [n, []])));

  const recargar = useCallback(async () => {
    const listas = await Promise.all(
      clave.split(",").map((n) => FUENTES[n].obtenerTodos().catch(() => []))
    );
    setDatos(Object.fromEntries(clave.split(",").map((n, i) => [n, Array.isArray(listas[i]) ? listas[i] : []])));
  }, [clave]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const buscar = (lista, campo, id, propiedad, prefijo) => {
    if (id == null) return "—";
    return (datos[lista] ?? []).find((x) => x[campo] === id)?.[propiedad] ?? `${prefijo} #${id}`;
  };

  return {
    ...datos,
    recargarCatalogos: recargar,
    nombreEvento: (id) => buscar("eventos", "id_evento", id, "tipo_evento", "Evento"),
    nombreCliente: (id) => buscar("clientes", "id_cliente", id, "nombre", "Cliente"),
    nombrePersona: (id) => buscar("personal", "id_personal", id, "nombre", "Personal"),
    nombreServicio: (id) => buscar("servicios", "id_servicio", id, "nombre", "Servicio"),
    nombreProveedor: (id) => buscar("proveedores", "id_proveedor", id, "nombre", "Proveedor"),
  };
}
