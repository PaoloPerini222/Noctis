# Guía de la demo del Data Warehouse

Guía para presentar el DW en el coloquio y para practicarlo antes. La explicación completa del diseño está en [README.md](README.md).

**La idea de la demo:** arrancamos con el DW vacío, cargamos reservas en vivo desde la app, corremos la carga y mostramos que los totales coinciden con la base operativa y que las 4 preguntas se responden. Al final cambiamos una reserva y mostramos que la carga se repite.

Duración: entre 10 y 15 minutos.

---

## 1. Antes del coloquio (preparación)

### Checklist

- [ ] Docker Desktop abierto y funcionando.
- [ ] Levantar el servidor Postgres y Adminer:
  ```bash
  docker compose -f docker-compose.db.yml up -d
  ```
- [ ] Levantar el back (en la carpeta del proyecto):
  ```bash
  npm run dev:docker
  ```
- [ ] Levantar el front (en `frontend/`):
  ```bash
  npm run dev:docker
  ```
- [ ] Entrar a la app (http://localhost:5180) con `admin@gmail.com` / `admin321` (empresa Eventos del Centro).
- [ ] Entrar a Adminer (http://localhost:8082): Sistema PostgreSQL, Servidor `db`, Usuario `eventos`, Contraseña `eventos`, Base de datos `noctis_dw`.
- [ ] Tener abiertos en VS Code [README.md](README.md) (`Ctrl+Shift+V` para la vista previa) y [04_consultas.sql](04_consultas.sql).
- [ ] Comprobar que no hay reservas cargadas de una práctica anterior (ver abajo).

### Volver a empezar de cero después de practicar

Cada práctica deja reservas en la base operativa y en el DW. Para dejar todo limpio, **sin tocar las empresas, servicios, salones ni usuarios**, se corre esto en Adminer conectado a la base **`eventos`**:

```sql
DELETE FROM evento;
DELETE FROM cliente;
```

Y después, conectado a la base **`noctis_dw`**:

```sql
TRUNCATE dw.hecho_reservas, dw.dim_cliente, dw.dim_tipo_evento, dw.carga_etl;
```

> Hay que vaciar también el DW porque la carga nunca borra: si no, las reservas de la práctica siguen en el DW aunque ya no estén en la operativa, y la verificación no da igual.

### Repartir las partes

Todos los integrantes tienen que poder explicar el diseño, así que conviene que cada uno presente una parte y que todos practiquen todas.

| Parte | Qué se muestra | Quién |
|---|---|---|
| A | Proceso, preguntas, grano, dimensiones, medidas y esquema estrella | |
| B | Las dos bases, las tablas y el procedimiento | |
| C | Cargar datos en vivo y correr la carga | |
| D | Verificación, las 4 preguntas y que la carga se repite | |

---

## 2. Guion de la demo

### Paso 1 · Explicar el diseño (parte A, 3 min)

Con [README.md](README.md) abierto en vista previa:

1. **Proceso:** las reservas de eventos. Por qué: es de donde sale la plata del negocio.
2. **Las 4 preguntas** (sección 3 del README).
3. **Grano:** una fila por reserva. Contar por qué no elegimos "por servicio vendido" ni "por empresa y mes".
4. **Dimensiones y medidas:** mostrar las dos tablas y el dibujo de la estrella.
5. Leer la oración de ejemplo: *"El sábado 13 de junio de 2026, Ana López hizo su Casamiento en el Salón Colón..."*.

### Paso 2 · Las dos bases y las tablas (parte B, 2 min)

En Adminer:

1. Arriba a la izquierda, en el selector de **base de datos**, mostrar que en el mismo servidor están `eventos` (operativa) y `noctis_dw` (DW).
2. Entrar a `noctis_dw` y elegir el esquema **`dw`**: aparecen las 6 dimensiones, `hecho_reservas` y `carga_etl`.
3. Abrir `hecho_reservas` → **Estructura**: mostrar las columnas `sk_` y las medidas.
4. Cambiar al esquema **`origen`**: son las tablas de la base operativa vistas desde el DW con postgres_fdw. Explicar que no son una copia.
5. En VS Code, mostrar [03_carga.sql](03_carga.sql): primero las dimensiones, después los hechos, y el `ON CONFLICT`.

### Paso 3 · Cargar datos en vivo (parte C, 4 min)

**Primero, los clientes.** En la app, sección **Clientes** → nuevo cliente (el teléfono es obligatorio):

| Cliente | Teléfono |
|---|---|
| Ana López | 3511111111 |
| Julián Torres | 3512222222 |
| Pedro Martínez | 3513333333 |

**Después, las reservas.** Sección **Eventos** → **Nuevo evento**. Todas entran como pendientes; después se abre cada una y se usa el botón que dice la última columna.

| # | Tipo de evento | Cliente | Fecha | Salón | Servicios | Después en la ficha |
|---|---|---|---|---|---|---|
| 1 | Casamiento | Ana López | 13/06/2026 | Salón Colón | Catering + Decoración | Aceptar reserva → Marcar realizado |
| 2 | Cumpleaños | Julián Torres | 18/07/2026 | Salón Cerro | Música + Fotografía | Aceptar reserva → Marcar realizado |
| 3 | `casamiento ` (en minúscula y con un espacio al final, a propósito) | Pedro Martínez | 12/09/2026 | Salón Colón | Catering + Música + Fotografía | Aceptar reserva |
| 4 | Corporativo | Ana López | 03/10/2026 | Salón Cerro | Catering | Aceptar reserva → Cancelar evento |
| 5 | Cumpleaños | Julián Torres | 05/12/2026 | Salón Colón | Decoración | Rechazar |
| 6 | Casamiento | Pedro Martínez | 20/02/2027 | Salón Cerro | Catering + Decoración | Dejarla pendiente (se usa en el paso 6) |

> Al aceptar o rechazar, la app ofrece abrir WhatsApp para avisarle al cliente. En la demo se puede cerrar sin enviar.

> Si el tiempo es corto, se pueden cargar antes los clientes y las reservas 1 a 4, y hacer en vivo solo la 5 y la 6.

### Paso 4 · Correr la carga (parte C, 1 min)

En Adminer, conectado a `noctis_dw`, **Comando SQL**:

```sql
CALL dw.cargar();
```

Aparece el mensaje *"Carga del data warehouse finalizada"*. Después:

```sql
SELECT id_carga, fecha, ok, filas FROM dw.carga_etl ORDER BY id_carga DESC;
```

Muestra cuántas filas tiene cada tabla del DW: `hecho_reservas` = 6, `dim_cliente` = 3, `dim_tipo_evento` = 3.

> Contar que el back también corre esta carga solo, a los 2 segundos de cada cambio en la app. Por eso puede haber varias filas en `carga_etl`. El `CALL` lo hacemos a mano para que se vea.

### Paso 5 · Verificar y responder (parte D, 4 min)

Copiar de [04_consultas.sql](04_consultas.sql) y ejecutar en Adminer.

**Verificación** (sección "VERIFICACIÓN"). Resultado esperado:

| Control | `en_origen` / `total_origen` | `en_warehouse` / `total_warehouse` |
|---|---|---|
| Reservas | 6 | 6 |
| Importe total | 3.550.000,00 | 3.550.000,00 |

**Pregunta 1 · ¿Cuánto facturó cada empresa por mes?**

| Empresa | Mes | Reservas | Ingresos |
|---|---|---|---|
| Eventos del Centro | Junio 2026 | 1 | 700.000 |
| Eventos del Centro | Julio 2026 | 1 | 500.000 |
| Eventos del Centro | Septiembre 2026 | 1 | 950.000 |

Octubre (cancelado) y diciembre (rechazado) no aparecen porque esos estados no generan ingreso.

**Pregunta 2 · ¿Qué tipo de evento deja más ingresos?**

| Tipo | Reservas | Ingresos |
|---|---|---|
| Casamiento | 2 | 1.650.000 |
| Cumpleaños | 1 | 500.000 |

Acá se ve la transformación: la reserva 3 se escribió `casamiento ` y en el DW quedó sumada con `Casamiento`.

**Pregunta 3 · ¿Qué salón tiene más eventos y cuánto factura?**

| Salón | Eventos | Ingresos |
|---|---|---|
| Salón Colón | 2 | 1.650.000 |
| Salón Cerro | 1 | 500.000 |

**Pregunta 4 · ¿Qué porcentaje se confirma, se rechaza o se cancela?**

| Estado | Reservas | % |
|---|---|---|
| Realizado | 2 | 33,3 |
| Confirmado | 1 | 16,7 |
| Cancelado | 1 | 16,7 |
| Rechazado | 1 | 16,7 |
| Reserva pendiente | 1 | 16,7 |

### Paso 6 · La carga se repite (parte D, 1 min)

1. En la app, abrir la reserva 6 (Casamiento de Pedro Martínez, 20/02/2027) y tocar **Aceptar reserva**.
2. En Adminer, `CALL dw.cargar();` otra vez.
3. Volver a correr la **pregunta 1**: aparece una fila nueva, **Febrero 2027 · 700.000**.
4. Volver a correr la **verificación de reservas**: sigue en **6 = 6**. La reserva no se duplicó, se actualizó (`ON CONFLICT ... DO UPDATE`).

### Cierre (opcional, 1 min)

En la app, página **Reportes**: los mismos números, en gráficos, sacados del DW.

---

## 3. Si algo sale mal

| Problema | Qué hacer |
|---|---|
| Docker no responde | Abrir Docker Desktop, esperar a que diga *Running* y repetir `docker compose -f docker-compose.db.yml up -d` |
| En Adminer no aparece `noctis_dw` | La crea el back al arrancar. Correr `npm run etl:docker` en la carpeta del proyecto |
| Al crear una reserva dice que la fecha está ocupada | Ya hay una reserva ese día en ese salón (quedó de una práctica). Elegir otra fecha o limpiar como dice la sección 1 |
| La verificación no da igual | Seguramente se borró una reserva en la app: el DW la sigue guardando (no volátil). Explicarlo así, o limpiar todo antes de la demo |
| Los números no coinciden con las tablas de esta guía | Revisar que los servicios y los salones de cada reserva sean los de la tabla del paso 3 |
| La página Reportes sale vacía | Revisar el filtro de año arriba a la derecha |

---

## 4. Preguntas que nos pueden hacer

**¿Por qué eligieron ese grano?**
Porque es el más fino del proceso: una fila por reserva. Desde ahí podemos sumar por cualquier dimensión. Si guardáramos totales por mes, no podríamos volver al detalle.

**¿Por qué no una fila por servicio vendido, que es todavía más fino?**
Porque nuestras preguntas son sobre reservas. Una reserva sin servicios no tendría ninguna fila y desaparecería del conteo.

**¿Qué es una clave sustituta y para qué sirve?**
Es la clave propia de cada dimensión (`sk_empresa`), generada por el DW. Así el DW no depende de los ids de la base operativa. Igual guardamos el id original (`id_empresa`) para poder hacer el JOIN en la carga.

**¿Por qué la fecha es una tabla y no una columna?**
Porque el año, el mes, el trimestre, el nombre del día y si es fin de semana ya quedan calculados. Agrupar por mes es un JOIN, sin `EXTRACT` en cada consulta.

**¿Por qué `sk_fecha` puede ser NULL?**
Porque una reserva pendiente puede no tener fecha todavía. Esas reservas cuentan en el total y en los estados, pero no aparecen en "por mes".

**¿Cómo hacen un INSERT de una base a otra si Postgres no lo permite?**
Con la extensión postgres_fdw. El esquema `origen` de `noctis_dw` muestra las tablas de `eventos`, y el INSERT lee de ahí.

**¿Qué pasa si corren la carga dos veces?**
No se duplica nada. Por `ON CONFLICT`, la segunda vez actualiza lo que cambió y agrega lo nuevo.

**¿Qué pasa si se borra una reserva en el sistema?**
En el DW queda: la carga nunca borra, porque el DW guarda la historia (no volátil). Por eso en ese caso el DW tiene una reserva más que la operativa.

**¿Qué transformaciones hace el ETL?**
La fecha pasa a clave AAAAMMDD; los ids pasan a claves `sk_`; el importe se calcula sumando los servicios y si no hay queda 0; el tipo de evento se unifica (`casamiento ` → `Casamiento`); los estados se marcan como "genera ingreso" o no.

**¿Por qué el tipo de evento es una dimensión y no un texto en la tabla de hechos?**
Porque es algo por lo que agrupamos ("ingresos **por** tipo de evento"), y así cada tipo está escrito una sola vez y unificado.

**¿Qué diferencia hay con un backup?**
Un backup es una copia idéntica para recuperar datos. El DW es una copia transformada, con otra estructura, pensada para consultar.

**¿Cada cuánto se actualiza?**
El back corre `CALL dw.cargar()` a los 2 segundos de cada cambio en la app, al arrancar, cada 6 horas y con el botón Actualizar datos de Reportes.

**¿Por qué un procedimiento y no un script suelto?**
Porque queda guardado en la base y cada carga es una sola instrucción, `CALL dw.cargar()`, que se puede programar. Además corre en una transacción: si algo falla, el DW queda como estaba.
