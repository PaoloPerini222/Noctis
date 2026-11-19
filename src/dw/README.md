# Data Warehouse del sistema de eventos

Este documento cuenta cómo construimos el Data Warehouse (DW) de nuestro sistema de eventos para el coloquio del 20/11/2026 (Base de datos, Unidad 4). Lo escribimos para que cualquiera pueda entender qué hicimos, por qué lo hicimos así y cómo probarlo: el profesor, un compañero del grupo o alguien que llega al proyecto sin conocerlo.

Para la presentación en vivo hay una guía aparte: [GUIA_DEMO.md](GUIA_DEMO.md).

## Contenido

1. [El punto de partida](#1-el-punto-de-partida)
2. [Arquitectura: dos bases en el mismo servidor](#2-arquitectura-dos-bases-en-el-mismo-servidor)
3. [Paso 1 · Proceso y preguntas](#3-paso-1--proceso-y-preguntas)
4. [Paso 2 · Grano, dimensiones y medidas](#4-paso-2--grano-dimensiones-y-medidas)
5. [Paso 3 · Crear las tablas](#5-paso-3--crear-las-tablas)
6. [Paso 4 · Cargar los datos](#6-paso-4--cargar-los-datos)
7. [Paso 5 · Verificar y responder las preguntas](#7-paso-5--verificar-y-responder-las-preguntas)
8. [Paso 6 · El procedimiento almacenado](#8-paso-6--el-procedimiento-almacenado)
9. [Cómo se conecta con la app](#9-cómo-se-conecta-con-la-app)
10. [Cómo lo probamos](#10-cómo-lo-probamos)
11. [Cómo llegamos a esta versión](#11-cómo-llegamos-a-esta-versión)
12. [Archivos](#12-archivos)
13. [Glosario](#13-glosario)

---

## 1. El punto de partida

**El sistema.** Es una plataforma para empresas organizadoras de eventos. Cada empresa carga sus salones (sucursales), sus servicios con precio (catering, música, fotografía...) y sus clientes. Un cliente reserva un evento desde un link público o la empresa lo carga a mano; la reserva entra como *pendiente* y la empresa la acepta o la rechaza. Un evento aceptado termina *realizado* o *cancelado*.

**El problema.** La base del sistema está pensada para operar: registrar una reserva, aceptarla, ver si una fecha está libre. Cuando queremos preguntas de análisis, como *¿cuánto facturamos por mes?*, aparecen los problemas que explica el apunte:

- Cada pregunta obliga a unir muchas tablas (evento, cliente, sucursal, servicio, evento_servicio...).
- Una consulta que recorre todo el historial compite con la app que están usando las empresas.
- La base guarda el estado actual: si se borra una reserva, se pierde para siempre.

**Lo que pedía la actividad.**

1. Elegir un proceso de negocio y 3 o 4 preguntas que el DW tiene que responder.
2. Definir el grano, las dimensiones y las medidas.
3. Crear las tablas de dimensiones y la tabla de hechos.
4. Cargar los datos (primero dimensiones, después hechos).
5. Verificar los totales contra la base operativa y responder las preguntas con consultas.
6. Guardar la carga en un procedimiento almacenado para poder repetirla.

Con dos condiciones: **dos bases de datos en el mismo servidor**, y la migración **con `INSERT` desde la base operativa hacia la del DW**.

---

## 2. Arquitectura: dos bases en el mismo servidor

```
Servidor Postgres (contenedor Docker paolo-proyecto-bien-db, puerto 5433)
│
├── eventos      BASE OPERATIVA (OLTP)
│                la usa la app · guarda el estado actual · muchas operaciones chicas
│
└── noctis_dw    DATA WAREHOUSE (OLAP)
    │            solo para analizar · guarda la historia · pocas consultas grandes
    ├── origen   las tablas de "eventos" vistas desde acá (no copia nada)
    └── dw       las dimensiones y la tabla de hechos
```

| | `eventos` (OLTP) | `noctis_dw` (OLAP) |
|---|---|---|
| Para qué sirve | Registrar reservas | Analizar lo que pasó |
| Operación típica | `INSERT`, `UPDATE`, `DELETE` | `SELECT` con `SUM`, `COUNT`, `GROUP BY` |
| Diseño | Normalizado | Estrella (desnormalizado) |
| Qué guarda | El estado actual | El historial |
| Quién escribe | La app, todo el tiempo | El procedimiento `dw.cargar()` |

### Cómo una base lee a la otra: postgres_fdw

En el apunte las dos partes son esquemas de la misma base (`public` y `dw`), así que un `SELECT ... FROM public.inscripciones` alcanza. En nuestro caso son **dos bases distintas**, y Postgres no permite escribir `SELECT ... FROM eventos.public.evento` desde otra base.

Para resolverlo usamos **postgres_fdw** (*foreign data wrapper*), una extensión que viene con Postgres. Le decimos a `noctis_dw` dónde está la base operativa y nos muestra sus tablas en un esquema llamado `origen`:

```sql
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- Dónde está la base operativa: en este mismo servidor
CREATE SERVER IF NOT EXISTS operativa
    FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (host 'localhost', port '5432', dbname 'eventos');

-- Con qué usuario se conecta
CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
    SERVER operativa
    OPTIONS (user 'eventos', password 'eventos');

-- Las tablas que necesitamos, visibles en el esquema origen
IMPORT FOREIGN SCHEMA public
    LIMIT TO (empresas, sucursal, cliente, evento, servicio, evento_servicio)
    FROM SERVER operativa INTO origen;
```

`origen.evento` **no es una copia**: cada vez que se lee, Postgres va a buscar las filas a la base `eventos`. Gracias a esto, la carga queda igual que en el apunte: `INSERT INTO dw.tabla SELECT ... FROM origen.tabla`.

### El recorrido de los datos

```
  App  ──escribe──►  eventos  ──CALL dw.cargar()──►  noctis_dw  ──►  Reportes de la app
                    (operativa)   INSERT ... SELECT   (DW)       ──►  Consultas en Adminer
                                  (Extraer, Transformar, Cargar)
```

Los datos viajan en un solo sentido: de la base operativa al DW. Nadie escribe a mano en el DW.

---

## 3. Paso 1 · Proceso y preguntas

**Proceso elegido: las reservas de eventos** que recibe cada empresa.

Lo elegimos porque es el corazón del negocio: de las reservas sale la plata, se ocupan los salones y se mide si los clientes vuelven. El apunte dice que un DW se construye de a un proceso por vez, así que nos quedamos con uno solo.

Las preguntas que el DW tiene que responder:

| # | Pregunta | Medida (lo que se suma) | Dimensiones (lo que va después de "por") |
|---|---|---|---|
| 1 | ¿Cuánto facturó cada empresa por mes? | `importe` | empresa, fecha |
| 2 | ¿Qué tipo de evento deja más ingresos? | `importe` | tipo de evento |
| 3 | ¿Qué salón tiene más eventos y cuánto factura? | `cantidad`, `importe` | sucursal |
| 4 | ¿Qué porcentaje de las reservas se confirma, se rechaza o se cancela? | `cantidad` | estado |

**Ingresos** = el `importe` de las reservas en un estado que genera ingreso: *confirmado* o *realizado*. Una reserva pendiente, rechazada o cancelada no es plata que entra.

---

## 4. Paso 2 · Grano, dimensiones y medidas

### Grano

**Una fila de la tabla de hechos es una reserva** (un evento de la base operativa).

Pensamos tres opciones:

| Grano | Qué se puede responder | Por qué no / por qué sí |
|---|---|---|
| Una fila por servicio vendido dentro de una reserva | Qué servicio se vende más | Una reserva sin servicios no tendría ninguna fila y desaparecería del conteo de reservas. Nuestras preguntas son sobre reservas, no sobre servicios. |
| **Una fila por reserva** | **Todo lo que preguntamos: por día, mes, empresa, salón, tipo, estado o cliente** | **Es el detalle más fino del proceso que elegimos.** |
| Una fila por empresa y mes | Solo totales mensuales | Se pierde quién reservó, en qué salón y de qué tipo. Desde un total no se vuelve al detalle. |

### Dimensiones

Son el contexto de cada reserva: cuándo, de quién, dónde, quién, qué y cómo terminó.

| Dimensión | Responde | De dónde sale |
|---|---|---|
| `dim_fecha` | ¿cuándo es el evento? | Se genera con `generate_series`, un día por fila |
| `dim_empresa` | ¿de qué empresa es? | Tabla `empresas` |
| `dim_sucursal` | ¿en qué salón? | Tabla `sucursal` |
| `dim_cliente` | ¿quién reservó? | Tabla `cliente` |
| `dim_tipo_evento` | ¿qué tipo de evento? | Columna `evento.tipo_evento` (texto repetido → una fila por tipo) |
| `dim_estado` | ¿cómo terminó? | Fija: los 5 estados posibles, con la marca `genera_ingreso` |

### Medidas

Son los números de la tabla de hechos que se suman o se cuentan.

| Medida | Qué es | Transformación en la carga |
|---|---|---|
| `cantidad` | Siempre 1. `SUM(cantidad)` cuenta reservas | — |
| `importe` | Suma de los servicios elegidos | El precio guardado en la reserva o, si no tiene, el de lista. Sin servicios queda 0, no NULL |
| `cant_servicios` | Cuántos servicios eligió | Sin servicios queda 0 |
| `asistentes` | Asistentes estimados | Queda NULL si no se cargó, para no bajar los promedios con ceros falsos |

### El esquema estrella

```
                 dim_fecha            dim_empresa
                         \            /
                          \          /
     dim_tipo_evento ──── hecho_reservas ──── dim_sucursal
                          /          \
                         /            \
                 dim_estado            dim_cliente
```

La tabla de hechos va en el centro y cada reserva apunta, con una clave, a una fila de cada dimensión. Por ejemplo, una fila de `hecho_reservas` se lee así:

> El sábado 13 de junio de 2026 (**dim_fecha**), Ana López (**dim_cliente**) hizo su Casamiento (**dim_tipo_evento**) en el Salón Colón (**dim_sucursal**) de Eventos del Centro (**dim_empresa**). El evento se realizó (**dim_estado**) y dejó $ 700.000 (**importe**).

---

## 5. Paso 3 · Crear las tablas

Archivo: [02_esquema.sql](02_esquema.sql). Primero se crean las dimensiones y al final la tabla de hechos, porque la de hechos las referencia con claves foráneas.

Una dimensión típica:

```sql
CREATE TABLE IF NOT EXISTS dw.dim_empresa (
    sk_empresa SERIAL PRIMARY KEY,       -- clave sustituta, la genera el DW
    id_empresa INT NOT NULL UNIQUE,      -- id en la base operativa
    nombre VARCHAR(150) NOT NULL,
    cuit VARCHAR(13)
);
```

La tabla de hechos:

```sql
CREATE TABLE IF NOT EXISTS dw.hecho_reservas (
    id_evento INT PRIMARY KEY,           -- la misma reserva no se carga dos veces
    sk_fecha INT,                        -- NULL si la reserva todavía no tiene fecha
    sk_empresa INT NOT NULL,
    sk_sucursal INT,                     -- NULL si el evento no tiene salón
    sk_cliente INT NOT NULL,
    sk_tipo_evento INT NOT NULL,
    sk_estado INT NOT NULL,
    cantidad INT NOT NULL DEFAULT 1,
    importe NUMERIC(12,2) NOT NULL DEFAULT 0,
    cant_servicios INT NOT NULL DEFAULT 0,
    asistentes INT,
    FOREIGN KEY (sk_fecha) REFERENCES dw.dim_fecha(sk_fecha),
    -- ... una FOREIGN KEY por cada dimensión
);
```

### Decisiones de diseño

- **Claves sustitutas (`sk_`).** Cada dimensión tiene su propia clave, generada por el DW con `SERIAL`, y además guarda el id original (`id_empresa`, con `UNIQUE`). Así el DW no depende de los ids de la base operativa.
- **La fecha es una tabla.** `dim_fecha` tiene una fila por día con el año, trimestre, mes, nombre del mes, nombre del día y si es fin de semana ya calculados. Agrupar por mes es un JOIN común, sin `EXTRACT` en cada consulta.
- **`sk_fecha` es AAAAMMDD.** El 13/06/2026 es `20260613`. Se calcula con `TO_CHAR(fecha, 'YYYYMMDD')`, sin buscar nada en la tabla.
- **Se desnormaliza a propósito.** `dim_sucursal` y `dim_cliente` guardan `id_empresa` como dato, para filtrar por empresa sin otro JOIN. Repetir datos no genera inconsistencias porque el DW no se edita a mano.
- **Reservas sin fecha o sin salón.** Una reserva pendiente puede no tener fecha y un evento puede hacerse fuera de un salón propio. Por eso `sk_fecha` y `sk_sucursal` aceptan NULL.
- **`dim_estado` es fija.** Los estados son 5 y no cambian (los define un `CHECK` en la base operativa), así que se cargan una sola vez en el mismo archivo. Tiene la columna `genera_ingreso`, que dice qué estados cuentan como plata que entra.

---

## 6. Paso 4 · Cargar los datos

Archivo: [03_carga.sql](03_carga.sql). Cada carga es un `INSERT ... SELECT` que hace las tres etapas del ETL en una sola sentencia:

```sql
INSERT INTO dw.dim_cliente (id_cliente, id_empresa, nombre_completo, email)  -- CARGAR
SELECT id_cliente, id_empresa, nombre_completo, email                        -- TRANSFORMAR
FROM origen.cliente                                                          -- EXTRAER
ON CONFLICT (id_cliente) DO UPDATE
SET nombre_completo = EXCLUDED.nombre_completo,
    email = EXCLUDED.email;
```

**El orden es obligatorio: primero las dimensiones, después los hechos.** Cada reserva necesita que su empresa, su cliente, su salón y su fecha ya existan en el DW, o la clave foránea falla.

### La dimensión fecha se genera

No sale de ninguna tabla. `generate_series` devuelve un día por fila, desde la reserva más vieja hasta la más nueva (y siempre el año actual completo), y de cada día se calculan sus columnas:

```sql
INSERT INTO dw.dim_fecha
SELECT TO_CHAR(d, 'YYYYMMDD')::INT,            -- 20260613
       d::DATE,
       EXTRACT(YEAR FROM d)::INT,
       EXTRACT(QUARTER FROM d)::INT,
       EXTRACT(MONTH FROM d)::INT,
       (ARRAY['Enero', ..., 'Diciembre'])[EXTRACT(MONTH FROM d)::INT],
       EXTRACT(DAY FROM d)::INT,
       (ARRAY['Lunes', ..., 'Domingo'])[EXTRACT(ISODOW FROM d)::INT],
       EXTRACT(ISODOW FROM d) IN (6, 7)        -- sábado o domingo
FROM generate_series(v_desde::TIMESTAMP, v_hasta::TIMESTAMP, INTERVAL '1 day') AS d
ON CONFLICT (sk_fecha) DO NOTHING;
```

### Una transformación de "integración": el tipo de evento

En la app, el tipo de evento es un texto libre. Si alguien escribe `Casamiento` y otro `casamiento ` (en minúscula y con un espacio), en la base operativa son dos textos distintos. En el DW los unificamos: se sacan los espacios y se deja la primera letra en mayúscula y el resto en minúscula.

```sql
INSERT INTO dw.dim_tipo_evento (nombre)
SELECT DISTINCT UPPER(LEFT(TRIM(tipo_evento), 1)) || LOWER(SUBSTRING(TRIM(tipo_evento) FROM 2))
FROM origen.evento
ON CONFLICT (nombre) DO NOTHING;
```

Es la característica **integrado** del apunte ("Cba", "CORDOBA" y "Córdoba" se guardan como "Córdoba").

### Los hechos se cargan al final

Cada JOIN con una dimensión cambia el id de la base operativa por la clave `sk_` del DW:

```sql
INSERT INTO dw.hecho_reservas (id_evento, sk_fecha, sk_empresa, sk_sucursal, sk_cliente,
                               sk_tipo_evento, sk_estado, cantidad, importe, cant_servicios, asistentes)
SELECT e.id_evento,
       TO_CHAR(e.fecha, 'YYYYMMDD')::INT,
       de.sk_empresa, ds.sk_sucursal, dc.sk_cliente, dt.sk_tipo_evento, dx.sk_estado,
       1,
       COALESCE(v.importe, 0),
       COALESCE(v.cant_servicios, 0),
       e.cant_asistentes_estimada
FROM origen.evento e
LEFT JOIN (  -- importe de cada reserva: suma de sus servicios
    SELECT es.id_evento, SUM(COALESCE(es.precio, s.precio, 0)) AS importe, COUNT(*) AS cant_servicios
    FROM origen.evento_servicio es
    INNER JOIN origen.servicio s ON s.id_servicio = es.id_servicio
    GROUP BY es.id_evento
) v ON v.id_evento = e.id_evento
INNER JOIN dw.dim_empresa de     ON de.id_empresa = e.id_empresa
LEFT JOIN  dw.dim_sucursal ds    ON ds.id_sucursal = e.id_sucursal     -- LEFT: hay eventos sin salón
INNER JOIN dw.dim_cliente dc     ON dc.id_cliente = e.id_cliente
INNER JOIN dw.dim_tipo_evento dt ON dt.nombre = <tipo unificado>
INNER JOIN dw.dim_estado dx      ON dx.estado = e.estado
ON CONFLICT (id_evento) DO UPDATE
SET sk_estado = EXCLUDED.sk_estado, importe = EXCLUDED.importe, ...;
```

### Recorrido de una reserva

Así pasa una reserva por el ETL:

| En la base operativa (`origen.evento`) | Transformación | En el DW (`dw.hecho_reservas`) |
|---|---|---|
| `id_evento` 15 | se copia | `id_evento` 15 |
| `fecha` 2026-06-13 | `TO_CHAR(fecha, 'YYYYMMDD')` | `sk_fecha` 20260613 |
| `id_empresa` 1 | JOIN con `dim_empresa` | `sk_empresa` 1 |
| `id_sucursal` 1 | LEFT JOIN con `dim_sucursal` | `sk_sucursal` 1 |
| `id_cliente` 7 | JOIN con `dim_cliente` | `sk_cliente` 1 |
| `tipo_evento` 'casamiento ' | se unifica la escritura y JOIN con `dim_tipo_evento` | `sk_tipo_evento` del tipo 'Casamiento' |
| `estado` 'realizado' | JOIN con `dim_estado` | `sk_estado` 3 |
| Catering 450.000 + Decoración 250.000 | `SUM(COALESCE(...))` | `importe` 700.000,00 |
| (2 servicios) | `COUNT(*)` | `cant_servicios` 2 |
| — | siempre 1 | `cantidad` 1 |

### Por qué se puede repetir

`ON CONFLICT ... DO UPDATE` hace que la carga se pueda correr muchas veces: la primera inserta, las siguientes actualizan lo que cambió (por ejemplo, una reserva que pasó de pendiente a confirmada) y agregan lo nuevo. Nunca duplica.

**La carga nunca borra.** Si una reserva se elimina en el sistema, en el DW queda como registro de lo que pasó. Es la característica **no volátil**.

---

## 7. Paso 5 · Verificar y responder las preguntas

Archivo: [04_consultas.sql](04_consultas.sql).

### Verificación

Antes de confiar en un reporte comparamos los totales del DW con los de la base operativa. Como desde `noctis_dw` vemos las dos (`origen` y `dw`), la comparación es una sola consulta:

```sql
-- Cantidad de reservas
SELECT (SELECT COUNT(*) FROM origen.evento)           AS en_origen,
       (SELECT SUM(cantidad) FROM dw.hecho_reservas)  AS en_warehouse;

-- Importe total
SELECT (SELECT COALESCE(SUM(COALESCE(es.precio, s.precio, 0)), 0)
        FROM origen.evento_servicio es
        INNER JOIN origen.servicio s ON s.id_servicio = es.id_servicio) AS total_origen,
       (SELECT SUM(importe) FROM dw.hecho_reservas)                     AS total_warehouse;
```

También hay una consulta que pone las reservas por estado lado a lado. **Si los números no coinciden, hay un error en la carga.** La única excepción esperada: si se borró una reserva en el sistema, el DW la sigue teniendo y da uno más.

### Las preguntas

Todas tienen la misma forma: la tabla de hechos, un JOIN con la dimensión por la que se agrupa y una suma sobre una medida.

```sql
-- 1) ¿Cuánto facturó cada empresa por mes?
SELECT e.nombre AS empresa, f.anio, f.nombre_mes,
       SUM(h.cantidad) AS reservas,
       SUM(h.importe) AS ingresos
FROM dw.hecho_reservas h
INNER JOIN dw.dim_empresa e ON e.sk_empresa = h.sk_empresa
INNER JOIN dw.dim_fecha f   ON f.sk_fecha = h.sk_fecha
INNER JOIN dw.dim_estado s  ON s.sk_estado = h.sk_estado
WHERE s.genera_ingreso
GROUP BY e.nombre, f.anio, f.mes, f.nombre_mes
ORDER BY e.nombre, f.anio, f.mes;
```

La 2 cambia `dim_fecha` por `dim_tipo_evento`, la 3 por `dim_sucursal` y la 4 cuenta `cantidad` por `dim_estado`. Están completas en [04_consultas.sql](04_consultas.sql), junto con dos consultas extra (clientes que vuelven y reservas por día de la semana).

---

## 8. Paso 6 · El procedimiento almacenado

Un DW que se carga una sola vez queda viejo al día siguiente. Por eso toda la carga del paso 4 está dentro de un procedimiento, en el mismo orden:

```sql
CREATE OR REPLACE PROCEDURE dw.cargar()
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1) Dimensiones: dim_fecha, dim_empresa, dim_sucursal, dim_cliente, dim_tipo_evento
    -- 2) Hechos: hecho_reservas
    -- 3) Registro de la carga en dw.carga_etl
    RAISE NOTICE 'Carga del data warehouse finalizada';
END;
$$;
```

Cada carga es una sola instrucción:

```sql
CALL dw.cargar();
```

El procedimiento corre entero en una transacción: si algo falla en el medio, el DW queda como estaba. Cada carga exitosa deja una fila en `dw.carga_etl` con la fecha y cuántas filas tiene cada tabla.

### Cuándo se repite

El apunte propone programarla para que corra sola todas las noches. Nosotros la hacemos correr más seguido, desde el back de la app ([etl.js](etl.js)):

- A los 2 segundos de cada cambio en la app (crear, editar o borrar algo, o una reserva por el link).
- Al arrancar el back.
- Cada `DW_ETL_HORAS` horas (6 por defecto).
- Con el botón **Actualizar datos** de la página Reportes.
- A mano, con `CALL dw.cargar();` en Adminer o con `npm run etl:docker`.

---

## 9. Cómo se conecta con la app

- **[db.js](db.js):** la conexión al DW usa el mismo servidor, usuario y contraseña que la base operativa y solo cambia el nombre de la base (`DW_DB_NAME=noctis_dw` en `.env.docker`).
- **[etl.js](etl.js):** la primera vez crea la base `noctis_dw` y corre `02_esquema.sql` y `03_carga.sql`. Después cada carga es `CALL dw.cargar()`. Toda la lógica del ETL está en SQL, no en JavaScript.
- **[reporte.controller.js](../controllers/reporte.controller.js):** la página **Reportes** del admin consulta solo el DW, nunca la base operativa. Muestra ingresos por mes, por salón y por tipo de evento, reservas por estado, ocupación de cada salón y clientes que vuelven, filtrados por la empresa del usuario y por año.

---

## 10. Cómo lo probamos

### Levantarlo

```bash
docker compose -f docker-compose.db.yml up -d   # servidor Postgres + Adminer
npm run etl:docker                               # crea noctis_dw (la primera vez) y hace CALL dw.cargar()
```

Para mirar las tablas y correr consultas: **Adminer** en http://localhost:8082

| Campo | Valor |
|---|---|
| Sistema | PostgreSQL |
| Servidor | `db` |
| Usuario | `eventos` |
| Contraseña | `eventos` |
| Base de datos | `noctis_dw` (o `eventos` para ver la operativa) |

### La prueba que hicimos

Cargamos en la base operativa 3 clientes y 6 reservas de Eventos del Centro, con estados, salones, tipos y servicios distintos. A propósito, una la escribimos como `casamiento ` (minúscula y con espacio). Resultados:

| Control | Base operativa | DW |
|---|---|---|
| Reservas | 6 | 6 |
| Importe total | $ 3.550.000 | $ 3.550.000 |
| Tipos de evento distintos | 4 textos | 3 tipos ('casamiento ' se unificó con 'Casamiento') |

Además comprobamos que:

- Las 4 preguntas dan lo que habíamos calculado a mano.
- Correr `CALL dw.cargar()` dos veces seguidas no duplica filas.
- Al aceptar una reserva pendiente y volver a cargar, la misma fila se actualiza y aparece en los ingresos de su mes.
- Una reserva sin fecha y sin salón se carga igual.
- La página Reportes muestra los mismos números.

Después borramos esos datos de prueba.

---

## 11. Cómo llegamos a esta versión

Este DW tuvo una primera versión que adaptamos cuando el profesor pasó la actividad.

**La primera versión** era una base Postgres en **otro contenedor de Docker** (otro servidor), con un ETL escrito en **JavaScript**: el back leía las tablas del sistema, armaba las filas en memoria y las insertaba en el DW. Tenía 4 tablas de hechos (eventos, servicios vendidos, respuestas de proveedores y cambios de eventos) y 8 dimensiones, y las claves de las dimensiones eran los mismos ids de la base operativa.

**Qué no cumplía** con la actividad, y qué cambiamos:

| Pedido de la actividad | Primera versión | Versión actual |
|---|---|---|
| Dos bases en el mismo servidor | Dos servidores (dos contenedores) | Las dos bases en el mismo contenedor |
| Migración con `INSERT` desde la operativa | JavaScript leía y después insertaba | `INSERT INTO dw... SELECT ... FROM origen...` |
| Carga en un procedimiento almacenado | La carga estaba en JavaScript | `dw.cargar()` y `CALL` |
| Un proceso con 3 o 4 preguntas | 4 procesos mezclados | Solo las reservas, con 4 preguntas |
| Claves sustitutas en las dimensiones | Usaba los ids de la fuente | `sk_` propia + id original |

**Lo que mantuvimos:** la dimensión fecha con clave AAAAMMDD, la carga repetible que nunca borra, la carga automática después de cada cambio y la página Reportes. De esa página sacamos las secciones de servicios, proveedores y cambios, porque eran de otros procesos.

---

## 12. Archivos

| Paso de la actividad | Archivo | Qué hace |
|---|---|---|
| — | [01_base.sql](01_base.sql) | `CREATE DATABASE noctis_dw` (el back lo hace solo la primera vez) |
| 3 · Crear las tablas | [02_esquema.sql](02_esquema.sql) | Conexión con postgres_fdw, dimensiones y tabla de hechos |
| 4 y 6 · Cargar y procedimiento | [03_carga.sql](03_carga.sql) | El procedimiento `dw.cargar()` |
| 5 · Verificar y consultar | [04_consultas.sql](04_consultas.sql) | Verificación contra la operativa y las 4 preguntas |
| — | [db.js](db.js), [etl.js](etl.js), [cargar.js](cargar.js) | Conexión y cuándo se corre la carga desde el back |
| — | [GUIA_DEMO.md](GUIA_DEMO.md) | Guía para presentar y practicar la demo |

---

## 13. Glosario

| Término | Significado |
|---|---|
| **Data Warehouse (DW)** | Almacén de datos históricos copiados del sistema y reorganizados para analizar, no para operar |
| **OLTP** | Procesamiento de transacciones: la base del sistema, muchas operaciones chicas |
| **OLAP** | Procesamiento analítico: el DW, pocas consultas grandes que resumen |
| **ETL** | Extraer, Transformar, Cargar: el proceso que lleva los datos de la operativa al DW |
| **Hecho** | Lo que pasó y se puede medir. Para nosotros, una reserva |
| **Dimensión** | El contexto de un hecho: cuándo, quién, dónde, qué |
| **Medida** | Un número del hecho que se suma o se cuenta |
| **Grano** | Qué representa exactamente una fila de la tabla de hechos |
| **Esquema estrella** | La tabla de hechos en el centro y las dimensiones alrededor |
| **Clave sustituta (`sk_`)** | Clave propia de una dimensión, generada por el DW |
| **postgres_fdw** | Extensión de Postgres para leer tablas de otra base como si fueran locales |
| **`ON CONFLICT`** | Qué hacer si la fila ya existe: actualizarla en vez de dar error |
| **Procedimiento almacenado** | Código guardado en la base que se ejecuta con `CALL` |
