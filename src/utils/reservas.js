// Reglas de la agenda de reservas, compartidas entre el panel (eventos) y el link público.

// Estados que ocupan la fecha: una reserva pendiente, un evento confirmado o uno ya realizado.
export const ESTADOS_QUE_OCUPAN = ["propuesta", "confirmado", "realizado"];
export const ESTADOS_CERRADOS = ["rechazado", "realizado", "cancelado"];

const MENSAJE_FECHA_OCUPADA = "esa fecha ya está reservada en ese salón, elegí otra fecha u otro salón";

// Serializa las reservas de una empresa dentro de la transacción: dos clientes no pueden tomar la misma fecha a la vez.
export const bloquearAgenda = (db, idEmpresa) => db.query(`select pg_advisory_xact_lock(4242, $1)`, [idEmpresa]);

// Devuelve el mensaje de error si la fecha ya la tiene otro evento en el mismo salón, o null si está libre.
// El mismo día puede haber eventos en salones distintos; los eventos sin salón cuentan como un mismo lugar.
export const validarFechaLibre = async (db, idEmpresa, fecha, idSucursal = null, idEventoPropio = null) => {
    if(!fecha){
        return null;
    }

    const ocupada = await db.query(
        `select 1 from evento
         where id_empresa = $1 and fecha = $2 and estado = any($3) and coalesce(id_sucursal, 0) = coalesce($4::int, 0)
           and ($5::int is null or id_evento <> $5)
         limit 1`,
        [idEmpresa, fecha, ESTADOS_QUE_OCUPAN, idSucursal, idEventoPropio]
    );

    return ocupada.rows.length > 0 ? MENSAJE_FECHA_OCUPADA : null;
};

// Error de la base cuando el índice único de la agenda frena una fecha repetida.
export const esFechaRepetida = (error) => error.code === "23505" && error.constraint === "evento_fecha_ocupada_idx";
export const respuestaFechaRepetida = {mensaje: MENSAJE_FECHA_OCUPADA};

// Deja el evento con exactamente esos servicios. Los que ya tenía conservan el precio de la reserva;
// los nuevos toman el precio actual del servicio. Devuelve un mensaje de error si algún servicio no es de la empresa.
export const guardarServiciosDelEvento = async (db, idEvento, idEmpresa, ids) => {
    const propios = await db.query(`select count(*)::int as cantidad from servicio where id_servicio = any($1) and id_empresa = $2`, [ids, idEmpresa]);
    if(propios.rows[0].cantidad !== ids.length){
        return "alguno de los servicios indicados no existe";
    }

    await db.query(`delete from evento_servicio where id_evento = $1 and not (id_servicio = any($2))`, [idEvento, ids]);
    await db.query(
        `insert into evento_servicio (id_evento, id_servicio, precio)
         select $1, id_servicio, precio from servicio where id_servicio = any($2)
         on conflict (id_evento, id_servicio) do nothing`,
        [idEvento, ids]
    );

    return null;
};

// Servicios elegidos en un evento con su precio, en el orden del catálogo, y los proveedores que ofrecen cada uno
// con su respuesta a la consulta (null = todavía no se le consultó; avisado, disponible o no_disponible).
// El link público solo toma nombre, equipamiento y precio.
export const serviciosDelEvento = async (db, idEvento) => {
    const servicios = await db.query(
        `select s.id_servicio, s.nombre, s.descripcion, s.equipamiento, es.precio,
                coalesce((select json_agg(json_build_object('id_proveedor', p.id_proveedor, 'nombre', p.nombre, 'contacto', p.contacto,
                                                            'telefono', p.telefono, 'respuesta', ep.estado) order by p.nombre)
                          from proveedor_servicio ps
                          join proveedor p on p.id_proveedor = ps.id_proveedor
                          left join evento_proveedor ep on ep.id_evento = es.id_evento and ep.id_servicio = s.id_servicio and ep.id_proveedor = p.id_proveedor
                          where ps.id_servicio = s.id_servicio), '[]') as proveedores
         from evento_servicio es
         join servicio s on s.id_servicio = es.id_servicio
         where es.id_evento = $1
         order by s.nombre`,
        [idEvento]
    );

    return servicios.rows;
};

// Servicios de la reserva que tienen proveedores pero ninguno confirmó que está disponible. Mientras haya alguno,
// la reserva no se acepta. Los servicios sin proveedores cargados los presta la propia organizadora.
export const serviciosSinConfirmar = (servicios) =>
    servicios
        .filter((s) => s.proveedores.length > 0 && !s.proveedores.some((p) => p.respuesta === "disponible"))
        .map((s) => s.nombre);

export const totalDe = (servicios) => servicios.reduce((suma, s) => suma + Number(s.precio ?? 0), 0);
