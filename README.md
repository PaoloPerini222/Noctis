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
| Clientes y eventos | `cliente`, `evento`, `cambio_evento` |
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
- Bases existentes: ejecutar `database/migraciones/multiempresa.sql`; deja todo lo cargado en la primera empresa.

Crear un superadmin: registrarse y asignar el rol, quitando la empresa a la persona:

```sql
UPDATE personal SET id_empresa = NULL WHERE usuario_id = (SELECT id_usuario FROM usuario WHERE email = 'admin@ejemplo.com');
INSERT INTO personal_rol (id_personal, id_rol)
SELECT p.id_personal, r.id_rol FROM personal p, rol r
WHERE p.usuario_id = (SELECT id_usuario FROM usuario WHERE email = 'admin@ejemplo.com') AND r.nombre = 'superadmin';
```

Reglas que aplica la base:
- Un evento no puede pasar a `aceptada`, `confirmado`, `preparacion` o `realizado` sin fecha, sede y cantidad de asistentes (trigger `trg_validar_evento_confirmado`).
- Si se modifica una propuesta `aprobada` o `enviada`, vuelve a `pendiente_aprobacion` (trigger `trg_reabrir_propuesta_modificada`).

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

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@ejemplo.com","password":"secreta123"}'

curl http://localhost:3000/api/empresas -H "Authorization: Bearer <token>"
```