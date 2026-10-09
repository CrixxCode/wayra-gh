# Guia visual de operaciones - Wayra

Fecha: 8 de octubre de 2026

Esta guia acompana el uso diario de Wayra con capturas reales del sistema sobre un hotel demo local.
El texto se mantiene corto a proposito: la referencia principal debe ser la imagen de cada paso.

> Nota para quien actualice esta guia: las imagenes viven en
> `docs/imagenes/guia-operaciones/`. Use datos de prueba y oculte informacion sensible antes de
> versionar capturas.

## Indice visual

| Operacion | Imagen clave |
|---|---|
| Ingresar y revisar el turno | [01-login](#1-ingresar-al-sistema), [02-dashboard](#2-revisar-el-dashboard) |
| Crear clientes | [04-clientes-listado](#4-crear-o-editar-un-cliente), [05-clientes-formulario](#4-crear-o-editar-un-cliente) |
| Crear y confirmar reservas | [06-reservas-listado](#5-crear-una-reserva), [07-reservas-formulario](#5-crear-una-reserva), [08-reservas-detalle](#6-confirmar-o-consultar-una-reserva) |
| Check-in y check-out | [09-check-in](#7-registrar-check-in), [12-check-out-inventario](#10-registrar-check-out) |
| Habitaciones | [10-habitaciones-tablero](#8-operar-el-tablero-de-habitaciones), [11-habitacion-modal](#9-gestionar-una-habitacion) |
| Facturacion y pagos | [13-factura-detalle](#11-revisar-una-factura), [14-factura-cargo](#12-agregar-cargos-o-consumos), [15-factura-pago](#13-registrar-pagos) |
| Inventario | [16-items-listado](#14-crear-y-consultar-items), [18-movimiento-inventario](#15-registrar-movimientos-de-inventario) |
| Operacion interna | [19-limpieza-listado](#16-gestionar-limpieza), [20-mantenimiento-listado](#17-gestionar-mantenimiento) |
| Administracion | [21-egresos-formulario](#18-registrar-egresos), [22-reportes](#19-consultar-reportes), [23-usuarios-formulario](#20-crear-usuarios), [24-roles-recursos](#21-asignar-roles-y-recursos), [25-hotel-config](#22-configurar-el-hotel) |

## 1. Ingresar al sistema

![Ingreso al sistema](imagenes/guia-operaciones/01-login.png)

1. Escriba usuario y contrasena.
2. Use "Recordarme" solo en un equipo seguro.
3. Presione "Ingresar".

Si olvido la contrasena, use el enlace de recuperacion de la misma pantalla.

## 2. Revisar el Dashboard

![Dashboard operativo](imagenes/guia-operaciones/02-dashboard.png)

1. Revise ocupacion, ingresos y alertas.
2. Abra check-ins y check-outs de hoy antes de iniciar recepcion.
3. Use "Actualizar" si acaba de entrar otro usuario o si hay cambios recientes.

## 3. Ubicar menu, hotel activo y notificaciones

![Menu lateral, selector de hotel y campana](imagenes/guia-operaciones/03-menu-notificaciones.png)

1. El menu lateral muestra solo los modulos permitidos por el rol.
2. El selector de hotel aparece para administradores con acceso a mas de un hotel.
3. La campana concentra avisos de reservas, limpieza, salidas y reportes diarios.
4. El menu de usuario permite ir al perfil, cambiar tema o cerrar sesion.

## 4. Crear o editar un cliente

![Listado de clientes](imagenes/guia-operaciones/04-clientes-listado.png)

1. Entre a "Clientes y Huespedes".
2. Busque primero por nombre, correo o documento para evitar duplicados.
3. Presione "Nuevo cliente" o el icono de editar.

![Formulario de cliente](imagenes/guia-operaciones/05-clientes-formulario.png)

1. Complete nombres, apellidos, correo, tipo de documento y numero de documento.
2. Agregue telefono, pais y preferencias si aplica.
3. Guarde y verifique que el cliente aparezca en el listado.

## 5. Crear una reserva

![Listado de reservas](imagenes/guia-operaciones/06-reservas-listado.png)

1. Entre a "Reservas".
2. Use filtros o calendario para revisar disponibilidad.
3. Presione "Nueva reserva".

![Formulario de nueva reserva](imagenes/guia-operaciones/07-reservas-formulario.png)

1. Seleccione o cree el cliente.
2. Defina origen, fechas de check-in y check-out.
3. Agregue habitacion, huespedes, politicas y abono inicial si aplica.
4. Guarde la reserva.

## 6. Confirmar o consultar una reserva

![Detalle de reserva](imagenes/guia-operaciones/08-reservas-detalle.png)

1. Abra la reserva desde tabla, tarjetas o calendario.
2. Revise cliente, fechas, habitacion, huespedes y estado de pago.
3. Use la accion disponible: confirmar, editar, check-in, check-out o cancelar.

## 7. Registrar check-in

![Confirmacion de check-in](imagenes/guia-operaciones/09-check-in.png)

1. Busque la reserva del huesped.
2. Confirme documento, habitacion y pagos o abonos.
3. Presione la accion de check-in.
4. Verifique que la reserva quede en curso y la habitacion quede ocupada.

## 8. Operar el tablero de habitaciones

![Tablero de habitaciones](imagenes/guia-operaciones/10-habitaciones-tablero.png)

1. Use los filtros de prioridad para ver check-in listo, salida proxima, limpieza o mantenimiento.
2. Revise la senal operativa de cada tarjeta.
3. Ejecute la accion rapida cuando aparezca.
4. Abra "Gestionar" para ver toda la informacion de la habitacion.

## 9. Gestionar una habitacion

![Modal de habitacion](imagenes/guia-operaciones/11-habitacion-modal.png)

1. En "General", revise numero, piso, tipo, tarifa y estado.
2. En "Amenidades", active o retire amenidades disponibles.
3. En "Reserva", consulte huesped o reserva vigente.
4. En "Limpieza y mantenimiento", cree o revise tareas operativas.
5. En "Inventario", ajuste dotacion de la habitacion.

## 10. Registrar check-out

![Revision de inventario durante check-out](imagenes/guia-operaciones/12-check-out-inventario.png)

1. Abra la reserva o habitacion ocupada.
2. Revise factura, cargos y pagos pendientes.
3. Inicie check-out.
4. Si aparece inventario, registre cantidades revisadas y novedades.
5. Confirme check-out y cree tarea de limpieza si corresponde.

## 11. Revisar una factura

![Detalle de factura](imagenes/guia-operaciones/13-factura-detalle.png)

1. Entre a "Facturas" y abra el detalle.
2. Revise saldo pendiente, cargos, pagos y notas credito.
3. Descargue PDF cuando el huesped lo solicite.

## 12. Agregar cargos o consumos

![Agregar cargo a factura](imagenes/guia-operaciones/14-factura-cargo.png)

1. En el detalle de factura, presione "Agregar cargo" o "Bar / Mini tienda".
2. Seleccione categoria, servicio, paquete o cargo manual.
3. Indique cantidad y valor cuando aplique.
4. Registre el cargo y confirme que el total se actualice.

## 13. Registrar pagos

![Registrar pago](imagenes/guia-operaciones/15-factura-pago.png)

1. En el detalle de factura, presione "Agregar pago".
2. Seleccione metodo de pago.
3. Ingrese monto, referencia y notas si aplica.
4. Registre el pago y revise el nuevo saldo.

## 14. Crear y consultar items

![Listado de items](imagenes/guia-operaciones/16-items-listado.png)

1. Entre a "Items".
2. Busque por nombre, SKU o categoria.
3. Presione "Nuevo item" para crear un insumo o producto.

![Formulario de item](imagenes/guia-operaciones/17-items-formulario.png)

1. Complete nombre, tipo, unidad, stock minimo, stock maximo, costo y precio.
2. Defina si el uso operativo es para habitacion o recepcion.
3. Guarde y verifique que el item quede activo.

## 15. Registrar movimientos de inventario

![Movimiento de inventario](imagenes/guia-operaciones/18-movimiento-inventario.png)

1. Entre a "Movimientos de inventario".
2. Presione "Nuevo movimiento".
3. Seleccione item, tipo de movimiento y cantidad.
4. Registre motivo, referencia o notas.
5. Guarde y confirme que el stock cambie correctamente.

## 16. Gestionar limpieza

![Tareas de limpieza](imagenes/guia-operaciones/19-limpieza-listado.png)

1. Entre a "Tareas de Limpieza".
2. Cree tareas para habitaciones que salieron o necesitan preparacion.
3. Cambie el estado a medida que avance el trabajo.
4. Al completar, revise que recepcion vea la habitacion lista.

## 17. Gestionar mantenimiento

![Ordenes de mantenimiento](imagenes/guia-operaciones/20-mantenimiento-listado.png)

1. Entre a "Ordenes de Mantenimiento".
2. Cree una orden con habitacion, titulo, prioridad, estado y descripcion.
3. Actualice avances y fecha estimada.
4. Si la habitacion no debe venderse, revise tambien su estado operativo.

## 18. Registrar egresos

![Formulario de egreso](imagenes/guia-operaciones/21-egresos-formulario.png)

1. Entre a "Egresos".
2. Presione "Nuevo egreso".
3. Complete categoria, tipo, comportamiento, monto, concepto y fecha.
4. Agregue proveedor, referencia o comprobante si aplica.
5. Guarde para que el gasto entre al control financiero.

## 19. Consultar reportes

![Reportes operativos](imagenes/guia-operaciones/22-reportes.png)

1. Entre a "Reportes".
2. Seleccione periodo o filtros disponibles.
3. Revise indicadores de ocupacion, ingresos, reservas y facturacion.
4. Exporte PDF cuando necesite soporte de cierre.

## 20. Crear usuarios

![Formulario de usuario](imagenes/guia-operaciones/23-usuarios-formulario.png)

1. Entre a "Usuarios".
2. Presione "Nuevo usuario".
3. Complete datos personales, usuario, correo, cargo, rol y hotel.
4. Asigne una contrasena temporal.
5. Active el usuario y guarde.

## 21. Asignar roles y recursos

![Roles y recursos](imagenes/guia-operaciones/24-roles-recursos.png)

1. Cree roles por funcion real: recepcion, gerencia, camareria, mantenimiento o administracion.
2. Asigne usuarios al rol correspondiente.
3. En "Recursos", agregue permisos de lectura y escritura segun necesidad.
4. Pruebe el acceso con un usuario no administrador.

## 22. Configurar el hotel

![Configuracion del hotel](imagenes/guia-operaciones/25-hotel-config.png)

1. Complete datos generales, logo, ubicacion y contacto.
2. Configure pisos, politicas de reserva, metodos de pago y datos financieros.
3. Guarde cambios.
4. Verifique que el hotel pueda crear habitaciones y reservas sin campos pendientes.

## 23. Flujo visual recomendado: llegada y salida

![Flujo recomendado de recepcion](imagenes/guia-operaciones/26-flujo-recepcion.png)

1. Dashboard: revisar llegadas y salidas.
2. Reservas: confirmar datos del huesped.
3. Check-in: pasar reserva a en curso.
4. Estadia: agregar cargos, consumos, limpieza o mantenimiento.
5. Factura: revisar saldo y registrar pagos.
6. Check-out: revisar inventario y cerrar estancia.
7. Limpieza: preparar habitacion para volver a vender.

## 24. Buenas practicas visuales

![Buenas practicas](imagenes/guia-operaciones/27-buenas-practicas.png)

- Busque antes de crear registros.
- No registre datos sensibles en capturas.
- Use notas internas para novedades importantes.
- No cierre check-out sin revisar factura.
- Mantenga estados de habitaciones, limpieza y mantenimiento al dia.
- Cierre sesion al terminar en equipos compartidos.
