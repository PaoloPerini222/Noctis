# Frontend — Noctis (gestor de fiestas)

Aplicación React que consume la API del back. Sirve para gestionar eventos, clientes, empresas,
propuestas y tareas, y tiene un enlace público para que el cliente responda su propuesta.

## Cómo correrlo

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # genera dist/
npm run preview   # sirve dist/ para probarlo
```

En desarrollo, las llamadas a `/api/...` se redirigen al back (por defecto `http://localhost:3000`).
Para apuntar a otro back: `VITE_PROXY_TARGET=http://otro-host:3000 npm run dev`.
En Docker lo hace nginx (`nginx.conf`) hacia el servicio `back`.

Variables opcionales: `VITE_API_URL` (URL base de la API, por defecto `/api`).

## Tecnologías

React 19 · React Router 7 · Axios · Vite. Sin librerías de UI: todo el diseño es CSS propio.

## Estructura

```
src/
├── main.jsx            Punto de entrada: monta la app con Router y sesión
├── App.jsx             Mapa de rutas
├── pages/              Una pantalla por ruta
├── components/         Piezas compartidas (layout, formulario modal, tabla CRUD, etc.)
├── api/                Un cliente HTTP por recurso del back
├── services/           Axios configurado y llamadas de autenticación
├── context/            Sesión del usuario (AuthContext)
├── hooks/              Lógica reutilizable (useRecurso, useTema)
├── utils/              Formato de fechas y moneda, tema claro/oscuro (tema.js) y splash (splash.js)
└── styles/             CSS dividido por sección
```

## Rutas

| Ruta | Pantalla | Acceso |
|------|----------|--------|
| `/` | Landing | Pública |
| `/login`, `/registro` | Acceso (misma pantalla, dos modos) | Pública |
| `/evento/:token` | Enlace del cliente: ve y responde su propuesta | Pública |
| `/eventos` | Tablero de eventos | Con sesión |
| `/clientes`, `/empresas`, `/propuestas`, `/tareas` | Listado + alta/edición/baja | Con sesión |

Las rutas con sesión pasan por `RutaProtegida`: sin sesión redirigen a `/login`.

## Flujo de datos

```
Página  ->  useRecurso (carga y guarda)  ->  api/<recurso>.js  ->  services/api.js (axios)  ->  back
```

1. **`services/api.js`** crea el cliente axios. Antes de cada petición agrega el token
   (`Authorization: Bearer ...`). Si el back responde 401 (token vencido) borra la sesión y manda a `/login`.
   También exporta `mensajeError()` para mostrar errores legibles al usuario.
2. **`api/client.js`** tiene `crearApi("/ruta")`, que devuelve `obtenerTodos / obtenerUno / crear / editar / eliminar`.
   Cada archivo de `api/` es una línea que lo usa.
3. **`hooks/useRecurso.js`** usa un cliente de `api/` y entrega `items, cargando, error, guardar, eliminar, recargar`.
   Al guardar o eliminar recarga la lista sola.

## Sesión

`context/AuthContext.jsx` guarda `token` y `usuario` en `localStorage`. Cualquier componente la lee con:

```js
const { usuario, ingresar, salir } = useAuth();
```

## Cómo agregar una sección nueva (CRUD simple)

1. Crear `src/api/cosas.js`:
   ```js
   import { crearApi } from "./client.js";
   export const cosasApi = crearApi("/cosas");
   ```
2. Crear `src/pages/Cosas.jsx` con un objeto `config` (ver `pages/Clientes.jsx`, es el ejemplo más corto):
   ```jsx
   const config = {
     titulo: "Cosas", singular: "cosa", femenino: true,
     api: cosasApi, id: "id_cosa",
     buscar: (c) => `${c.nombre}`,
     columnas: [{ titulo: "Nombre", render: (c) => c.nombre }],
     campos: [{ name: "nombre", label: "Nombre", required: true }],
   };
   export default function Cosas() { return <PaginaCrud config={config} />; }
   ```
3. Registrar la ruta en `App.jsx` y el enlace en `SECCIONES` de `components/Layout.jsx`.

Tipos de campo del formulario: `text`, `number`, `date`, `email`, `textarea`, `select` (ver `components/FormModal.jsx`).

## Estilos

CSS dividido por sección, todo importado desde `styles/index.css`:

| Archivo | Qué contiene |
|---------|--------------|
| `base.css` | Variables de color de ambos temas, reset, tipografía, fondo |
| `components.css` | Botones, campos de formulario, mensajes, botón de tema |
| `landing.css` | Landing pública |
| `auth.css` | Login y registro |
| `animations.css` | Animaciones y transiciones |
| `dashboard.css` | Sidebar, tablas, tarjetas, navegación móvil |
| `modal.css` | Ventana de formularios |
| `tipografia.css` | Títulos grandes, iguales en los dos temas |
| `decoracion.css` | Ilustraciones de fondo de cada tema (griego dorado en claro, griego rojo con Ares en oscuro) |
| `lineas.css` | Solo modo oscuro: líneas, marcos y títulos en mayúsculas |
| `splash.css` | Pantalla de entrada |
| `public.css` | Página pública del evento |

Reglas del proyecto:

- **Un estilo por línea**: cada regla CSS lleva una declaración por línea.
- **Colores solo con variables** (`var(--text)`, `var(--panel)`, etc.): así funcionan en los dos temas.
  Para cambiar la paleta se editan las variables en `base.css`.
- **Estilo glassmorphism**: superficies translúcidas con `backdrop-filter` (variables `--glass-blur` y `--glass-shadow`).
- **Responsive**: el corte móvil es 960px; cada archivo tiene su bloque `@media` al final.

### Temas claro y oscuro

- El tema vive en `utils/tema.js` (un solo estado compartido) y se lee en los componentes con `useTema` (`hooks/useTema.js`).
  Se aplica como `data-theme="light"` o `"dark"` en `<html>` y se guarda en `localStorage` (clave `noctis-tema`);
  si no hay preferencia guardada, se usa la del dispositivo.
- `index.html` aplica el tema antes de que cargue React (evita el parpadeo).
- `--primary` y `--on-primary` son el color de los botones y elementos activos (verde hoja en oscuro, amarillo en claro).

**Modo claro: mármol y estilo griego** (`src/assets/griego/`)
- Fondo de **mármol hueso, amarillo y gris**, dibujado por un SVG con ruido (`--marmol` en `base.css`);
  para cambiarlo se tocan sus `tableValues` y `--bg`.
- `columnas.svg` rellena el espacio vacío de la landing y del login; `greca.svg` es una cenefa que se repite.
- `sol.svg` (arriba a la derecha) y `luna.svg` (abajo a la izquierda) dan el aire astrológico.
- `pensador.webp` es una foto real de *El Pensador* de Rodin (The Metropolitan Museum of Art, Open Access / CC0, vía Wikimedia Commons),
  recortada del fondo y teñida en tonos hueso; se muestra tenue y levemente difuminada abajo a la derecha.

**Modo oscuro: Ares, dios de la guerra** (`src/assets/ares/`)
- Negro y rojo (más rojo que negro), también de estilo griego. Texto claro de alto contraste: los colores secundarios
  (`--soft`, `--muted`, `--faint`) son opacos y legibles; no se usan transparencias en las letras.
- `columnas-rojas.svg` y `greca-roja.svg`: las mismas piezas del modo claro, en rojo.
- `vergina.svg`: estrella de Vergina (arriba a la derecha). `escudo.svg`: escudo con lambda y lanzas (abajo a la izquierda).
- `ares.webp`: foto real de una estatua de Marte/Ares (Neustrelitz, dominio público, vía Wikimedia Commons), recortada del
  fondo y teñida de rojo, con un halo rojo; va de fondo abajo a la derecha.
- `lineas.css` aplica solo en oscuro el estilo griego a la tipografía y los bordes: títulos en mayúsculas espaciadas,
  línea roja bajo cada título y marcos de doble línea en tarjetas, tablas y ventanas.

Cada tema define sus imágenes en `base.css` (variables `--arte`, `--cenefa`, `--follaje`, `--follaje-2`, `--figura`) y
`decoracion.css` decide dónde se ponen. Todo son SVG, así que escalan sin perder calidad.

### Splash (pantalla de entrada)

- El HTML está en `index.html`, así que se ve apenas se abre la página, antes de que cargue React. `utils/splash.js` controla
  cuánto dura (unos 3 s; menos de medio segundo si el dispositivo pide reducir animaciones), espera a las fuentes y lo desvanece.
- Toma el tema del dispositivo (o el guardado): muestra las columnas y el sol (claro) o la estrella de Vergina (oscuro) con la barra de carga centrada.
- **También se muestra cada vez que se cambia de modo**, en versión más rápida (`alternarTema()` en `utils/tema.js` llama a `mostrarSplash`).

## Responsive

- Hasta 960px: sidebar oculto, barra inferior, una sola columna.
- Hasta 600px: cabeceras que pasan a varias líneas y **tablas convertidas en tarjetas apiladas**.
  Cada celda lleva `data-label="Título"` para mostrar su encabezado; si agregás una tabla nueva, ponele `data-label` a cada `<td>`.
- Cuidado con los espacios (padding/gap) entre secciones: se achicaron en móvil para no dejar huecos vacíos.

### Tipografía

Una sola familia, **Space Grotesk**, en toda la app y en los dos temas (cargada desde Google Fonts en `index.html`).
Los textos secundarios (párrafos, subtítulos, etiquetas, menú) comparten el mismo grosor (500); los títulos y botones van en 700.
Si se quiere más claro un texto secundario, se cambia su **color** (`--soft`, `--muted`), no su grosor.

## Despliegue

`Dockerfile` en dos etapas: compila con Node y sirve `dist/` con nginx.
`nginx.conf` reenvía `/api/` al servicio `back` y devuelve `index.html` para cualquier otra ruta (necesario para React Router).
