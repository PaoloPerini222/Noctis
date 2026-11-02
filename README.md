# Sistema de eventos (CRUD de empresas)

Sistema para gestionar los eventos de una organizadora: clientes, eventos, propuestas, tareas del personal y empresas.

- **Back:** Node.js + Express 5, PostgreSQL (`pg`), autenticación propia con JWT + bcrypt.
- **Front:** React 19 + Vite + React Router.
- **Base de datos:** PostgreSQL 16 corriendo en Docker.

## Estructura

```
├── src/                      Back (API REST)
│   ├── index.js              Arranque del servidor y registro de rutas
│   ├── data/db.js            Pool de conexión a Postgres
│   ├── middleware/           verificarToken y verificarRol
│   ├── controllers/          Lógica de cada recurso
│   └── routes/               Rutas de cada recurso
├── front/                    Front (React + Vite; en Docker lo sirve nginx)
├── database/                 Scripts SQL (se ejecutan en orden al crear la base)
│   ├── 00_schema.sql         Esquema definitivo: tablas, restricciones, funciones y triggers
│   ├── 01_datos_iniciales.sql  Catálogos necesarios (roles)
│   ├── 02_datos_prueba.sql   Datos de prueba para desarrollo
│   └── migraciones/          Migraciones históricas (Docker no las ejecuta)
├── docker-compose.yml        Levanta db + back + front
└── rebuild.sh                Reconstruye y levanta todo con los últimos cambios
```

## Puesta en marcha

### 1. Variables de entorno

Copiar el ejemplo y completar `JWT_SECRET`:

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # genera un secreto
```

| Variable | Descripción | Valor local |
|---|---|---|
| `PORT` | Puerto del back | `3000` |
| `DB_HOST` / `DB_PORT` | Host y puerto de Postgres | `localhost` / `5432` |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Credenciales de la base | `eventos` / `eventos` / `eventos` |
| `DB_SSL` | `true` solo si la base exige SSL | `false` |
| `JWT_SECRET` | Secreto para firmar los tokens (obligatorio) | — |
| `JWT_EXPIRES_IN` | Duración del token | `8h` |
| `FRONTEND_URL` | Origen permitido por CORS | `http://localhost:5173` |

### 2a. Todo con Docker

```bash
docker compose up -d --build     # o ./rebuild.sh
```

- Front: http://localhost:8081
- Back: http://localhost:3000
- Postgres: `localhost:5432`

`docker-compose.yml` toma `JWT_SECRET` y `JWT_EXPIRES_IN` del `.env`.

### 2b. Desarrollo local (base en Docker, back y front con Node)

```bash
docker compose up -d db          # solo la base
npm install && npm run dev       # back en http://localhost:3000 (se reinicia al guardar)
cd front && npm install && npm run dev   # front en http://localhost:5173
```

En desarrollo Vite redirige `/api` al back, así que no hace falta configurar CORS aparte.

## Base de datos

Al crear el contenedor por primera vez, Postgres ejecuta en orden alfabético los `.sql` de `database/` (00, 01, 02…) e ignora las subcarpetas.

> **Importante:** los scripts solo corren si el volumen está vacío. Después de cambiar algún `.sql` hay que recrear la base (**borra los datos locales**):
>
> ```bash
> docker compose down -v && docker compose up -d
> ```
>
> `rebuild.sh` conserva el volumen, así que no aplica cambios en los `.sql`.

Para agregar cambios al esquema: actualizar `00_schema.sql`. Si hay que cargar más datos, crear un nuevo archivo numerado (`03_...sql`).

Consultar la base:

```bash
docker exec -it eventos-db psql -U eventos -d eventos
```

### Tablas principales

| Área | Tablas |
|---|---|
| Acceso y personal | `usuario`, `personal`, `rol`, `personal_rol` |
| Empresas (multiempresa) | `empresas` |
| Clientes y eventos | `cliente`, `evento`, `cambio_evento`, `rechazo_solicitud` |
| Servicios y proveedores | `servicio`, `proveedor`, `proveedor_servicio`, `servicio_excluido_evento` |
| Propuestas | `propuesta`, `detalle_propuesta` |
| Tareas | `tarea` |
| Cierre | `cierre`, `aviso_proveedor_cancelacion` |

### Multiempresa

Cada empresa (`empresas`) es una organizadora con sus propios datos. `personal`, `cliente`, `evento`, `servicio` y `proveedor` llevan `id_empresa`; todo lo demás (propuestas, tareas, cierres, etc.) pertenece a la empresa de su evento.

- La empresa del usuario sale de `personal.id_empresa` y se lee de la base en cada pedido (no del token). Todas las consultas filtran por ella: un id de otra empresa responde `404`.
- Al crear la cuenta se elige la empresa (`GET /auth/empresas` lista las activas). Quien se registra queda sin rol hasta que la responsable de **su** empresa se lo asigne.
- **Una empresa nace con su responsable.** El superadmin crea la empresa con `POST /empresas` incluyendo `responsable: {nombre, email, password}`: en una sola transacción se crean la empresa, la cuenta de acceso y la persona con rol `responsable` (si algo falla no queda nada a medias). Si una empresa se queda sin responsable, `POST /empresas/:id/responsable` suma otro. `GET /empresas` devuelve también quiénes son sus responsables y cuánta gente tiene.
- **El responsable arma su equipo con cuentas.** `POST /personal` acepta `email` y `password` (se piden juntos): crea a la persona y su usuario para que pueda ingresar, y después se le asignan roles con `PUT /personal/:id/roles`. `PUT /personal/:id` permite cambiar el email o la contraseña. Una persona puede tener varios roles (en un equipo chico alguien cumple varias responsabilidades).
- **La responsable es la dueña de la empresa y puede todo lo de su empresa.** Además de aprobar propuestas y gestionar el equipo, tiene los permisos del organizador (clientes, proveedores, servicios, eventos, propuestas, tareas y cierres, en cualquier evento de la empresa) y del coordinador (confirmaciones de proveedores y avisos). Se aplica en `verificarToken` (se le suman esos roles) y en `duenoDelEvento` (no se le exige ser el organizador del evento). El organizador y el coordinador siguen limitados a lo suyo.
- **Protecciones:** la empresa siempre conserva al menos un responsable (no se le puede quitar el rol al último) y nadie puede eliminarse a sí mismo. Al eliminar a una persona se libera su email.
- El rol `superadmin` es de la plataforma: su `personal.id_empresa` es `NULL`, solo administra `/empresas` y no ve datos de ninguna empresa. Ninguna empresa puede asignarlo (se crea a mano, ver abajo).
- Una empresa desactivada (`activo = false`) no puede ingresar.
- **Datos de contacto y nombre completo.** `personal` suma `apellido`, `telefono` y `email_contacto`; `cliente` suma `apellido` y `direccion`; `proveedor` suma `direccion`. `nombre_completo` (nombre + apellido) es una columna calculada por la base y es lo que se muestra en listas, selectores, fichas y el enlace público. **Bases existentes: ejecutar `database/migraciones/datos_contacto.sql`** (se puede repetir, no pisa datos; el backend nuevo la necesita). Las bases nuevas ya la traen en `00_schema.sql`.
- Bases existentes: ejecutar `database/migraciones/multiempresa.sql`; deja todo lo cargado en la primera empresa.
- **Ajustes al dominio de la organizadora** (ver abajo). **Bases existentes: ejecutar `database/migraciones/dominio_organizadora.sql`** (se puede repetir, no pisa datos; el backend nuevo la necesita). Las bases nuevas ya la traen en `00_schema.sql`.

Crear un superadmin: registrarse y asignar el rol, quitando la empresa a la persona:

```sql
UPDATE personal SET id_empresa = NULL WHERE usuario_id = (SELECT id_usuario FROM usuario WHERE email = 'admin@ejemplo.com');
INSERT INTO personal_rol (id_personal, id_rol)
SELECT p.id_personal, r.id_rol FROM personal p, rol r
WHERE p.usuario_id = (SELECT id_usuario FROM usuario WHERE email = 'admin@ejemplo.com') AND r.nombre = 'superadmin';
```

Reglas que aplica la base:
- Un evento no puede pasar a `confirmado`, `preparacion` o `realizado` sin fecha, sede y cantidad de asistentes (trigger `trg_validar_evento_confirmado`). El cliente sí puede aceptar con la sede pendiente: la propuesta avanza, pero el encargo no se confirma hasta definirla.
- La disponibilidad de la sede (`evento.estado_sede`) es `pendiente` (de consulta), `confirmada` o `no_disponible`; con la sede no disponible no se confirma el encargo.
- El teléfono de un proveedor es obligatorio (como el del cliente); el email es opcional.
- Si se modifica una propuesta `aprobada` o `enviada`, vuelve a `pendiente_aprobacion` (trigger `trg_reabrir_propuesta_modificada`).

### Ajustes al dominio de la organizadora

Lo que se agregó al comparar el sistema con el dominio descripto al final de este archivo:

- **Servicios.** `servicio.importe_referencia` (opcional) es un punto de partida: se propone al agregar el servicio a una propuesta, pero no calcula nada; el importe real lo define el organizador. Cada empresa nueva (`POST /empresas`) arranca con los servicios habituales (catering, decoración, música y fotografía; ver `src/utils/servicios.js`), que después se editan o borran.
- **Condiciones.** `propuesta.condiciones_comerciales` son las condiciones de la oferta (por ejemplo, que el importe depende de la cantidad de asistentes) y las ve el cliente en su enlace; `condiciones_acordadas` son las condiciones particulares convenidas, que se exigen para confirmar el encargo. Modificar cualquiera de las dos obliga a una nueva aprobación.
- **Aprobación.** Cambiar los importes de una propuesta aprobada, enviada o en negociación la devuelve a revisión de la responsable aunque el total quede igual (por ejemplo, si un importe sube y otro baja). Cambiar solo observaciones o el proveedor no la reabre.
- **Rechazo y reapertura.** El motivo del rechazo y de la cancelación se anota solo si se conoce (no se inventa). Si el cliente retoma un evento rechazado, `POST /evento/:idEvento/reapertura` reabre **la misma solicitud** (pasa a `en_evaluacion`), guarda el rechazo anterior en `rechazo_solicitud` y deja la propuesta vigente en `borrador` con sus servicios para actualizarla y pasar de nuevo por la aprobación. `GET /evento/:idEvento/reapertura` lista los rechazos anteriores. Un evento cancelado no se reabre: otra celebración es una solicitud nueva.
- **Constancia de cambios.** Con el encargo confirmado, el sistema anota solo (en `cambio_evento`, sin revisar) el cambio de fecha, el cambio de sede o que una sede confirmada deje de estarlo, y que un proveedor confirmado pierda la confirmación (aviso de que no puede, o reemplazo). No actualiza compromisos ni tareas: alguien debe revisarlos y registrar su situación real desde la pestaña Cambios. El cambio de asistentes no se anota solo, porque si es importante lo decide el organizador.
- **Pendientes.** `GET /pendientes` devuelve cada evento próximo (aceptado, confirmado o en preparación, del más cercano al más lejano; los de fecha pendiente al final) con el nombre y contacto del cliente, la sede y su disponibilidad, los asistentes estimados, su estado, los servicios sin confirmar y las tareas pendientes o vencidas con responsable y fecha. Las tareas vencidas y los servicios sin confirmar también se listan aparte, aunque el evento esté lejos.

## Autenticación

Auth propio con JWT (no se usa Supabase Auth).

- Las credenciales se guardan en `usuario`; la contraseña nunca se guarda en texto plano, solo su hash bcrypt en `usuario.password_hash`.
- Cada usuario está vinculado a una persona de `personal` (`personal.usuario_id`). Al registrarse se crean los dos registros.
- Los roles salen de `personal_rol` y viajan dentro del token (`roles: [...]`).

Para usar la API: hacer login y mandar el token en cada pedido:

```
Authorization: Bearer <token>
```

Un usuario recién registrado no tiene roles. Por ahora se asignan a mano:

```sql
INSERT INTO personal_rol (id_personal, id_rol)
SELECT 1, id_rol FROM rol WHERE nombre = 'responsable';
```

Para restringir una ruta por rol:

```js
import { verificarToken, verificarRol } from "../middleware/auth.middleware.js";

router.delete("/:id", verificarToken, verificarRol("responsable"), eliminarEmpresa);
```

## API

Todas las rutas empiezan con `/api`. Salvo `register`, `login` y `auth/empresas`, todas requieren token.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/auth/empresas` | Empresas activas para elegir al registrarse (público) |
| POST | `/auth/register` | Registra un usuario. Body: `{ nombre, email, password, id_empresa }` (mín. 8 caracteres) |
| POST | `/auth/login` | Devuelve `{ token, usuario }`. Body: `{ email, password }` |
| GET | `/auth/perfil` | Datos del usuario logueado |

Los recursos `/empresas`, `/clientes`, `/evento`, `/propuesta` y `/tarea` tienen el mismo CRUD:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/<recurso>` | Lista todos |
| GET | `/<recurso>/:id` | Obtiene uno |
| POST | `/<recurso>` | Crea |
| PUT | `/<recurso>/:id` | Edita |
| DELETE | `/<recurso>/:id` | Elimina |

Rutas anidadas de un evento (`/evento/:idEvento/...`):

| Método | Ruta | Descripción |
|---|---|---|
| GET / POST / PUT / DELETE | `/exclusiones` | Servicios que el cliente descartó |
| GET / POST / PUT | `/cambios` | Cambios relevantes y la revisión de sus compromisos |
| GET / POST / PUT | `/cierre` | Evento realizado o cancelado, con los avisos a proveedores |
| GET / POST | `/reapertura` | Rechazos anteriores / reabrir una solicitud rechazada (organizador del evento) |

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@ejemplo.com","password":"secreta123"}'

curl http://localhost:3000/api/empresas -H "Authorization: Bearer <token>"
```
dominio:
Dominio de la organizadora de eventos
28 oct 2026 · @Gianluca
La organizadora de eventos asume el encargo de celebraciones de una sola jornada y en una sola sede, cada una para un único cliente contratante. El proceso comienza con una solicitud del cliente, cuyos datos mínimos son su identificación, una forma de contacto y el tipo de evento. Los demás datos, como la fecha, la sede, la cantidad estimada de asistentes y las necesidades, se registran en la medida en que se conocen; lo que aún no está definido se deja identificado como pendiente de aclaración y nunca se inventa. La cantidad de asistentes es una estimación actualizable y no una nómina de invitados.
Sobre la base de la solicitud, el organizador elabora una propuesta a medida, integrada por los servicios ofrecidos, el importe de cada uno y un total. Existen servicios habituales, como catering, decoración, música y fotografía, y se manejan importes de referencia cuando se conocen, pero esa lista es solo un punto de partida y no un catálogo de precios fijos que calcule la propuesta, pues el importe varía según la cantidad de asistentes, las características del evento y las condiciones del proveedor. Junto al presupuesto se anotan las condiciones comerciales que correspondan, como la dependencia del importe respecto de la cantidad de asistentes.
Antes de enviarse, la propuesta debe ser aprobada por la responsable de la organizadora, y debe aprobarse nuevamente si se modifican los importes. Se registra quién la aprobó y en qué fecha, para poder comprobar que pasó por la revisión correspondiente. En un equipo tan pequeño una misma persona puede ser a la vez organizador y responsable, y en ese caso puede preparar y aprobar su propio presupuesto, siempre que todos se revisen antes de llegar al cliente. Un presupuesto aprobado no puede modificarse sin respetar esa revisión.
Para cada solicitud existe una única propuesta vigente, que se actualiza durante la negociación sin conservar historial de versiones. Pedir cambios no equivale a rechazar: la propuesta vigente se modifica y se presenta de nuevo. Si el cliente la rechaza, la solicitud no se elimina, sino que se conserva junto con el motivo, cuando este fue explicado. Si el cliente retoma más adelante el mismo evento, se reabre la solicitud existente, se actualiza la propuesta vigente según lo que necesite y se mantiene el registro del rechazo anterior; si en cambio solicita organizar otra celebración, aun siendo el mismo cliente, se registra una solicitud nueva.
Cuando el cliente acepta la propuesta y el personal registra esa aceptación, queda confirmado el encargo, siempre que la sede esté definida: la propuesta puede avanzar mientras la sede está pendiente, pero el encargo no se da por confirmado hasta resolver ese punto. El encargo conserva los servicios acordados y los que quedaron excluidos, los importes y el total, la fecha, la sede y la cantidad estimada previstas, y las condiciones particulares convenidas con el cliente. Confirmar el encargo no significa que todo esté resuelto: puede confirmarse con compromisos de proveedores todavía pendientes, que no deben presentarse como resueltos y que siguen consultándose después de la confirmación.
Confirmado el encargo comienza la preparación. Cada servicio acordado se cubre con el compromiso de un proveedor, que se registra como pendiente de consulta o confirmación, confirmado, o no disponible o no confirmado. De cada proveedor se guardan los datos necesarios para identificarlo y contactarlo: el nombre del proveedor o de su empresa, el de la persona de contacto cuando corresponde, el teléfono, que es obligatorio, el correo electrónico, que es opcional, y el tipo de servicio que ofrece. Para cada evento se registra además qué servicio prestará, si confirmó su participación y las condiciones relevantes que se acordaron. Como un mismo proveedor puede prestar varios servicios y participar en distintos eventos, sus datos generales se distinguen de la participación que tiene en cada celebración. La sede no es un servicio más de la propuesta sino un dato fundamental del evento, pero también se registra su disponibilidad, que puede estar pendiente de consulta, confirmada o no disponible; si cambia después de haberse confirmado, se actualiza la información y se revisa cómo afecta al evento.
El servicio propio de la organizadora es la organización y coordinación del evento, que comprende coordinar a los proveedores, comunicarse con el cliente, revisar los acuerdos y hacer el seguimiento de la preparación. Ese trabajo se traduce en tareas internas, mientras que servicios como el catering, la decoración y la música suelen estar a cargo de proveedores externos. Al confirmar el encargo se identifican las actividades necesarias y el organizador las distribuye; a la persona designada se le avisa por WhatsApp o por teléfono y la asignación se registra. Toda tarea tiene un responsable, una fecha prevista y un estado, y se considera vencida cuando llega su fecha sin haberse terminado. Ante una tarea vencida, el responsable la revisa, se comunica con quien corresponda, coordina una nueva fecha o la reasigna, y evalúa si el atraso afecta otros compromisos. No toda tarea vencida representa un riesgo inmediato, pero siempre debe poder detectarse. La urgencia no se mide con una escala rígida: la determina la persona responsable según la situación, atendiendo a la cercanía de la fecha del evento, a la importancia del compromiso y a si su demora puede afectar un servicio acordado. Confirmar el catering a pocos días del evento, por ejemplo, es más urgente que terminar un detalle decorativo que todavía tiene margen.
Durante toda la preparación se hace seguimiento de los compromisos y las tareas, con mayor atención a lo próximo a vencer o ya vencido y con mayor intensidad a medida que se acerca la fecha, sin una frecuencia fija. Cada responsable de tarea revisa su avance, y el organizador supervisa que no queden compromisos sin resolver.
Cuando ocurre un cambio relevante, quien recibe la información lo registra y avisa al organizador responsable del evento. Son cambios relevantes la modificación de la fecha o de la sede; el aumento o la disminución importante de asistentes, entendiendo que no existe un porcentaje ni una cantidad fija y que la importancia la determina el organizador según cómo el cambio afecte a los servicios acordados, como la cantidad de comida del catering o la capacidad de la sede; el agregado, la supresión o la modificación de un servicio; el cambio de un importe o de una condición acordada; y la pérdida de confirmación de un proveedor. Ante cualquiera de ellos se revisa si los proveedores y la sede siguen disponibles, si los servicios siguen siendo adecuados y si las tareas necesitan nuevas fechas o responsables; y si cambia lo acordado, se conversa con el cliente y se registra el nuevo acuerdo. El cambio no actualiza por sí solo los compromisos ni las tareas: alguien debe revisarlos y registrar su situación real.
Si un proveedor ya confirmado avisa que no puede prestar el servicio, se actualiza su situación y se deja constancia. El servicio queda sin participación confirmada y el organizador responsable evalúa cómo resolverlo. Si la alternativa modifica el importe o las condiciones, se conversa con el cliente antes de darla por acordada, y mientras tanto el servicio sigue pendiente.
El proceso concluye con la realización del evento o con su cancelación. Al realizarse, la persona que lleva el encargo registra que se realizó y agrega las observaciones relevantes, para dejar constancia de que el encargo se completó y poder consultar luego lo ocurrido; no se hace evaluación estadística ni liquidación económica. La cancelación puede originarse en el cliente, cuya comunicación se registra, o en la propia organizadora, caso en que la responsable decide cómo proceder. Normalmente la registra la persona responsable del encargo, es decir, quien coordina ese evento, o, si no está disponible, otro integrante autorizado que reciba la comunicación. Se anota el motivo cuando se conoce, se conservan los datos del cliente, la propuesta, los servicios acordados y la preparación, se actualizan las tareas que perdieron sentido, la organizadora informa a los proveedores y se registra el resultado, y se deja constancia de la situación de los servicios que estaban confirmados. Las penalidades y las devoluciones quedan fuera.
La organización es un equipo pequeño en el que una misma persona puede asumir más de una responsabilidad, por lo que se describen roles y no personas. La responsable de la organizadora supervisa los encargos, revisa los presupuestos y registra su aprobación. El organizador del evento recibe la solicitud, conversa con el cliente, elabora la propuesta, registra la aceptación y los acuerdos, distribuye las tareas y supervisa que no queden compromisos sin resolver. El coordinador de proveedores y preparación contacta a los proveedores, registra sus confirmaciones y organiza las tareas necesarias para llegar a tiempo. El responsable de una tarea revisa su avance y actualiza su estado. Son actores externos el cliente contratante, que solicita, acepta o rechaza y puede pedir cambios, y los proveedores, que prestan los servicios y confirman o no su participación.
Todos los roles consultan la totalidad de la información de cada evento, porque no hay datos que deban ocultarse, y cada uno modifica la que le es propia: el organizador, los datos del cliente, la solicitud, la propuesta, los acuerdos y la asignación de tareas; la responsable, la aprobación del presupuesto; el coordinador, las confirmaciones de los proveedores; y cada responsable de tarea, el estado de la suya. Quien recibe novedades de un cliente o de un proveedor debe registrarlas para que todo el equipo cuente con información actualizada. Para el funcionamiento inicial se estiman tres personas usuarias; la responsable incorpora a quienes se suman al equipo y revisa sus responsabilidades cuando cambian, y quien cumple varias funciones debe poder realizar las tareas de todas ellas. Lo que se busca evitar son las modificaciones accidentales y, sobre todo, que se cambie un presupuesto sin la revisión correspondiente.
El vocabulario del dominio se fija de modo que cada término designe un único concepto. La aprobación es el visto bueno interno de la responsable, mientras que la aceptación o el rechazo son la respuesta del cliente, que el personal registra. Los servicios acordados son las prestaciones que el cliente aceptó contratar, y las condiciones particulares son las preferencias o compromisos específicos convenidos con él. El término "servicio" admite tres sentidos que se distinguen expresamente: el servicio ofrecido, incluido en la propuesta con su importe; el servicio acordado, aceptado por el cliente; y el compromiso, que es la participación de un proveedor en la prestación y tiene su propio estado. De igual modo, la confirmación del cliente se denomina aceptación, y la del proveedor o la sede, confirmación del compromiso. "Evento" designa la celebración y "encargo" lo acordado respecto de ella; "presupuesto" y "propuesta" son sinónimos para el cliente, y aquí se emplea "propuesta", reservando "presupuesto" para su total.
El término "pendiente" abarca tres situaciones que se nombran por separado: el compromiso pendiente, la tarea pendiente y el dato pendiente de aclaración. Se distingue también el dato estimativo del dato confirmado. La cancelación es el registro de que el evento no se realizará, con su motivo, y no elimina el encargo; el cierre es el registro de que el evento se realizó o se canceló, con las observaciones pertinentes.
Cada concepto tiene su propio ciclo de vida. La solicitud pasa por los estados de recibida, en evaluación y preparación de propuesta, propuesta enviada y, finalmente, aceptada o rechazada. La propuesta carece de un ciclo propio, porque su avance se expresa en el estado de la solicitud, y la aprobación de la responsable es una regla de la etapa de preparación y no un estado aparte. El encargo está confirmado cuando el cliente aceptó la propuesta, se registraron los servicios y las condiciones acordadas y la sede está definida. Mientras el equipo coordina los servicios, realiza las tareas y resuelve los pendientes, el encargo está además en preparación, una situación distinta del acuerdo con el cliente: una fiesta de quince años puede tener su propuesta aceptada y su sede definida y seguir esperando la confirmación del proveedor de música. El encargo termina como realizado o como cancelado. Los compromisos y la sede están pendientes de consulta o confirmación, confirmados, o no disponibles; las tareas, pendientes, en curso o terminadas, y vencidas cuando así corresponde por su fecha; y los datos, estimativos, confirmados o pendientes de aclaración.
Desde el diseño estratégico, el subdominio central, el que otorga mayor valor a la organizadora, es el seguimiento de lo acordado y de lo pendiente. El cliente lo señaló como el área que más le complica: las conversaciones con clientes y proveedores se dan por WhatsApp o por teléfono, a veces queda una confirmación pendiente o alguien no se entera de un cambio, y aunque la información esté registrada necesita identificar rápidamente qué falta resolver y quién se ocupa. Son subdominios de apoyo la solicitud y propuesta, que produce el acuerdo sujeto a aprobación interna sin que se haya pedido automatizarlo; los proveedores y la sede, con sus datos básicos y el estado de cada compromiso; y la consulta y el cierre. Es subdominio genérico la identificación de las personas y sus permisos, un problema común para el que se pide una solución sencilla.
El dominio se organiza en tres Bounded Contexts, dentro de cada uno de los cuales el lenguaje conserva un único significado. Solicitud y propuesta contiene al cliente, la solicitud con sus estados, la propuesta vigente, los servicios ofrecidos, los importes, las condiciones comerciales, la aprobación interna y la aceptación o el rechazo; allí "servicio" es una oferta con importe y los datos pueden ser todavía estimativos. Encargo contiene la confirmación, los servicios acordados y los excluidos, las condiciones del evento y las particulares, los cambios relevantes, la cancelación y el cierre; allí "servicio" es lo que el cliente aceptó, y se distingue lo acordado de lo efectivamente resuelto. Coordinación del evento contiene a los proveedores, la disponibilidad de la sede, los compromisos con sus estados, las tareas con responsable y fecha, y los pendientes y vencidos; allí "servicio" es lo que un proveedor se compromete a prestar, y el estado de una tarea es distinto del de un encargo. Compromisos y tareas se unificaron en un mismo contexto porque el cliente los trata como parte de una misma actividad de seguimiento.
Los contextos se relacionan así: la propuesta aceptada origina el encargo; los servicios acordados se cubren en Coordinación del evento mediante compromisos y tareas; y lo que allí queda pendiente o se pierde vuelve al encargo. Que un proveedor pierda su confirmación es un cambio relevante del encargo, y todo cambio relevante del encargo obliga a revisar los compromisos y las tareas de la coordinación, por lo que la relación entre ambos contextos es bidireccional. La identificación y los permisos no forman un contexto de negocio, sino un servicio genérico que los tres utilizan.
Las reglas de negocio que rigen el dominio se resumen así. Cada evento corresponde a un único cliente contratante y se desarrolla en una jornada y una sede. Existe una única propuesta vigente por solicitud, sus importes los define el organizador y la responsable la aprueba antes de enviarla y de nuevo si los importes cambian, registrando quién y cuándo. La aceptación corresponde al cliente y el personal la registra. Un encargo solo está confirmado cuando el cliente aceptó y están registrados los servicios, los importes, la fecha, la cantidad estimada y las condiciones particulares, y además la sede está definida; puede confirmarse con compromisos pendientes, que no deben presentarse como resueltos. Se distingue el dato estimativo del confirmado, y lo no definido se marca como pendiente de aclaración sin inventarse. Todo proveedor o sede se registra como pendiente, confirmado o no disponible, y el proveedor que pierde su confirmación deja de figurar como confirmado y su servicio queda pendiente. Toda tarea tiene responsable, fecha prevista y estado. Un cambio relevante se registra y obliga a revisar compromisos y tareas, sin actualizarlos automáticamente. Un rechazo conserva la solicitud y su motivo, y la cancelación conserva el encargo con sus datos y registra el motivo. Se registran las decisiones, los acuerdos y los pendientes, y no las conversaciones. Los permisos son sencillos: todos consultan y cada rol modifica lo suyo. No existen un plazo mínimo para aceptar solicitudes ni una cantidad máxima fija de asistentes, por lo que no corresponde implementarlos como validaciones.
Finalmente, el software y la actividad humana se reparten el trabajo. Las conversaciones con clientes y proveedores, que se realizan por WhatsApp, teléfono o correo, la consulta de disponibilidad, la decisión de qué ofrecer y a qué importe, la aprobación del presupuesto, el aviso a quienes tienen tareas asignadas, la búsqueda de un reemplazo cuando un proveedor falla, la negociación con el cliente y la comunicación de una cancelación a los proveedores se hacen fuera del software, que se limita a registrar sus resultados. El cliente no requiere que el sistema envíe notificaciones ni asigne tareas por sí mismo. También quedan fuera los pagos, los anticipos, las penalidades y las devoluciones. El software soporta el registro de la solicitud, la propuesta con su total, la aprobación, la aceptación y el encargo; el registro de los compromisos y de las tareas con sus estados; el registro de los cambios relevantes, de la cancelación y del cierre; el control de quién puede modificar cada información; y, como función principal, la presentación clara de lo pendiente y lo vencido, de los servicios sin confirmar y de los eventos próximos. Para cada evento próximo se muestran la fecha y el tipo de celebración, el nombre del cliente y un contacto, la sede prevista o confirmada, la cantidad estimada de asistentes, el estado general del encargo y de la preparación, los servicios aún sin confirmar, y las tareas pendientes o vencidas con su responsable y su fecha prevista. La lista se ordena por la fecha del evento, del más próximo al más lejano, y destaca los compromisos vencidos y los servicios sin confirmar aunque el evento esté lejos, de modo que el equipo sepa en todo momento qué está resuelto, qué falta y quién debe actuar. Las personas conversan y deciden; el sistema registra, ordena y muestra.