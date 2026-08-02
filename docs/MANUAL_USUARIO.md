# Manual de Usuario - Aplicativo de Gestion Hotelera

Fecha: 31 de julio de 2026

## 1. Presentacion

El aplicativo de Gestion Hotelera Wayra es una herramienta para centralizar la operacion diaria de un hotel. Permite registrar clientes, reservas, habitaciones, check-ins, check-outs, facturas, pagos, inventario, limpieza, mantenimiento, reportes y configuracion administrativa.

Este manual esta escrito para usuarios finales. No explica instalacion, programacion ni configuracion tecnica del servidor. Su objetivo es indicar que se puede hacer en cada pantalla, que datos se deben registrar y cual es el flujo recomendado para usar el sistema correctamente.

## 2. Usuarios a quienes aplica

El manual puede ser usado por:

- Recepcion: registro de clientes, reservas, check-in, check-out y consulta de habitaciones.
- Administracion: facturacion, pagos, egresos, reportes y configuracion del hotel.
- Gerencia: dashboard, indicadores, reportes y control financiero.
- Camareria o housekeeping: tareas de limpieza y estado de habitaciones.
- Mantenimiento: ordenes de mantenimiento.
- Administrador del sistema: usuarios, roles, permisos, recursos y datos maestros.

Cada usuario vera solo los modulos permitidos para su rol. Si una opcion no aparece en el menu o una accion muestra "Acceso denegado", probablemente el usuario no tiene el permiso necesario.

## 3. Requisitos para usar el sistema

Antes de ingresar verifique:

- Tener un usuario creado en el sistema.
- Conocer su contrasena.
- Tener conexion a internet o a la red donde esta publicado el aplicativo.
- Usar un navegador actualizado como Google Chrome, Microsoft Edge o Mozilla Firefox.
- Tener permisos asignados segun el cargo.
- Tener configurado el hotel activo cuando el sistema maneje varios hoteles.

## 4. Conceptos basicos del sistema

- Cliente: persona registrada como contacto principal o responsable de una reserva.
- Huesped: persona que se aloja en el hotel. Puede ser el mismo cliente u otra persona asociada a la reserva.
- Reserva: registro de una estancia, con fechas, cliente, habitaciones, huespedes, politicas y valores.
- Habitacion: espacio fisico del hotel que puede estar disponible, ocupada, en limpieza, mantenimiento u otro estado configurado.
- Tipo de habitacion: categoria que define capacidad, camas y caracteristicas generales.
- Tarifa: precio por noche asociado a un tipo de habitacion.
- Servicio: item comercial que puede venderse o cargarse a una factura.
- Paquete: oferta que agrupa servicios y puede estar asociada a un tipo de habitacion.
- Promocion: descuento o beneficio con codigo, alcance y vigencia.
- Factura: documento de cobro asociado a una reserva.
- Cargo: valor agregado a una factura por alojamiento, servicio, paquete, consumo o cargo manual.
- Pago: abono o cancelacion registrada sobre una factura.
- Nota credito: ajuste que reduce o corrige el valor de una factura.
- Egreso: salida de dinero del hotel, como compras, pagos a proveedores o gastos operativos.
- Rol: grupo de permisos asignado a uno o varios usuarios.
- Recurso: permiso del sistema que habilita una pantalla o una accion.

## 5. Ingreso al sistema

1. Abra la direccion del aplicativo en el navegador.
2. En la pantalla de inicio de sesion, escriba su usuario.
3. Escriba su contrasena.
4. Active "Recordarme" solo si esta usando un equipo personal o seguro.
5. Presione "Ingresar".

Si los datos son correctos, el sistema cargara la pantalla principal. Si aparece un mensaje de error, revise usuario y contrasena.

### 5.1 Recuperar contrasena

Use este proceso cuando no recuerde la contrasena.

1. En la pantalla de inicio de sesion haga clic en "Olvide mi contrasena".
2. Escriba el correo electronico registrado en su cuenta.
3. Presione "Enviar enlace".
4. Revise el correo y abra el enlace recibido.
5. Escriba la nueva contrasena.
6. Confirme la nueva contrasena.
7. Guarde el cambio e ingrese nuevamente.

Si el correo no llega, revise la carpeta de spam o solicite ayuda al administrador.

### 5.2 Cambio obligatorio de contrasena

Algunos usuarios pueden tener activado el cambio obligatorio de contrasena, especialmente en el primer ingreso. En ese caso:

1. El sistema lo llevara a "Mi perfil".
2. Abra la pestana "Cambiar Contrasena" si no aparece activa.
3. Digite la contrasena actual.
4. Digite la nueva contrasena.
5. Confirme la nueva contrasena.
6. Presione "Cambiar Contrasena".

Use una contrasena de minimo 8 caracteres y evite compartirla.

## 6. Estructura de la pantalla principal

Despues de ingresar, el sistema muestra una interfaz con tres areas principales.

### 6.1 Menu lateral

El menu lateral contiene los modulos disponibles:

- Dashboard.
- Clientes y Huespedes.
- Reservas.
- Habitaciones.
- Tipos de habitacion.
- Tarifas de habitacion.
- Amenidades.
- Servicios.
- Facturas.
- Pagos.
- Reembolsos.
- Ingresos.
- Control financiero.
- Egresos.
- Paquetes.
- Promociones.
- Items.
- Inventario por habitacion.
- Movimientos de inventario.
- Tareas de limpieza.
- Ordenes de mantenimiento.
- Reportes.
- Actividad.
- Configuracion y administracion.

La lista puede variar segun permisos. En pantallas pequenas use el boton de menu para abrir o cerrar el menu lateral.

### 6.2 Barra superior

La barra superior contiene:

- Selector de hotel activo: visible cuando el usuario puede operar varios hoteles.
- Notificaciones: muestra alertas, avisos y eventos recientes.
- Menu de usuario: acceso a perfil, configuracion, tema claro/oscuro y cierre de sesion.

Si el selector de hotel esta bloqueado, significa que el usuario no tiene permiso para cambiar de hotel.

### 6.3 Area de trabajo

Es la zona central donde se cargan las pantallas. La mayoria de modulos usan:

- Encabezado con nombre del modulo.
- Tarjetas de indicadores.
- Buscador.
- Filtros.
- Tabla o tarjetas de registros.
- Botones de acciones.
- Ventanas laterales para crear, editar o ver detalle.

## 7. Acciones comunes en los modulos

### 7.1 Buscar

Use el campo "Buscar" para localizar registros por nombre, documento, numero, codigo, referencia o descripcion. El sistema filtra segun el modulo.

Ejemplos:

- En clientes puede buscar por nombre, correo o documento.
- En reservas puede buscar por reserva, cliente o documento.
- En facturas puede buscar por factura, reserva, huesped o documento.
- En inventario puede buscar por item, SKU o notas.

### 7.2 Filtrar

Los filtros ayudan a reducir la lista de registros. Segun el modulo puede filtrar por:

- Estado.
- Tipo.
- Origen.
- Actividad.
- Categoria.
- Fecha.
- Piso.
- Vista.

Si no encuentra un registro, quite filtros o seleccione "Todos".

### 7.3 Actualizar

El boton "Actualizar" recarga la informacion de la pantalla. Es util cuando otro usuario pudo haber realizado cambios.

### 7.4 Exportar

El boton "Exportar" descarga la informacion visible cuando el modulo lo permite. Generalmente se usa para reportes, listados o revision administrativa.

### 7.5 Vista tabla, tarjetas y calendario

Algunos modulos permiten cambiar la vista:

- Tabla: recomendada para revisar muchos registros y comparar columnas.
- Tarjetas: recomendada para una visualizacion rapida y operativa.
- Calendario: disponible en reservas para revisar ocupacion por fechas y habitaciones.

### 7.6 Ventanas laterales

Crear, editar o ver detalle normalmente abre una ventana lateral. Para cerrarla puede:

- Presionar "Cerrar".
- Presionar "Cancelar".
- Usar el icono de X.
- Hacer clic fuera de la ventana, si la pantalla lo permite.

Si esta llenando un formulario, guarde antes de cerrar para no perder la informacion.

### 7.7 Campos obligatorios

Los campos marcados con asterisco (*) son obligatorios. Si no los completa, el sistema mostrara un mensaje de validacion.

Errores frecuentes:

- Correo con formato incorrecto.
- Monto igual a cero cuando debe ser mayor que cero.
- Fecha final menor que fecha inicial.
- Documento vacio.
- Seleccionar una opcion requerida.

### 7.8 Eliminacion y restauracion

Varios modulos usan eliminacion logica. Eso significa que el registro queda inactivo o eliminado, pero puede aparecer en "Ver eliminados" y restaurarse si el modulo lo permite.

Use "Eliminar" solo cuando este seguro. Si la eliminacion fue accidental, revise la opcion "Ver eliminados" y luego "Restaurar".

## 8. Dashboard

El Dashboard es la primera pantalla operativa despues del ingreso. Resume el estado del hotel.

### 8.1 Informacion que muestra

- Fecha y saludo del usuario.
- Reloj local.
- Indicadores principales de ocupacion, ingresos y operacion.
- Grafica de ocupacion semanal.
- Grafica de ingresos diarios.
- Estado de habitaciones.
- Check-ins de hoy.
- Check-outs de hoy.
- Alertas.
- Servicios del dia.
- Actividad reciente.
- Acciones rapidas.

### 8.2 Como usarlo

1. Revise primero los indicadores generales.
2. Consulte "Check-ins de Hoy" para preparar llegadas.
3. Consulte "Check-outs de Hoy" para preparar salidas y facturacion.
4. Revise "Estado de Habitaciones" para saber disponibilidad y ocupacion.
5. Abra "Alertas" si hay novedades.
6. Use "Ver todos" para ir al listado completo cuando necesite mas informacion.
7. Presione "Actualizar" para recargar datos.

### 8.3 Recomendacion operativa

Al iniciar el turno, recepcion deberia revisar Dashboard, Reservas y Habitaciones. Administracion deberia revisar Facturas, Pagos y Egresos.

## 9. Clientes y Huespedes

El modulo "Clientes y Huespedes" administra el directorio de personas vinculadas al hotel.

### 9.1 Que puede hacer

- Registrar clientes.
- Consultar datos de contacto.
- Ver documento y nacionalidad.
- Revisar estancias y total de noches.
- Clasificar clientes por tipo.
- Identificar huespedes actuales.
- Editar informacion.
- Eliminar o restaurar clientes.
- Exportar listado.

### 9.2 Crear un cliente

1. Ingrese a "Clientes y Huespedes".
2. Presione "Nuevo cliente".
3. Complete "Nombres".
4. Complete "Apellidos".
5. Complete "Correo".
6. Registre "Telefono" si lo tiene.
7. Registre "Pais".
8. Seleccione "Tipo de documento".
9. Escriba "Numero de documento".
10. Presione "Guardar cliente".

Campos obligatorios:

- Nombres.
- Apellidos.
- Correo.
- Tipo de documento.
- Numero de documento.

### 9.3 Consultar un cliente

1. Use el buscador para localizar el cliente.
2. Puede filtrar por estado: Todos, Activo, Inactivo o Huesped actual.
3. Puede filtrar por tipo: VIP, Frecuente o Regular.
4. Haga clic en el registro o en el icono de ver detalle.

El detalle muestra:

- Nombre completo.
- Tipo de cliente.
- Estado.
- Contacto.
- Documento.
- Estancias.
- Total estimado gastado.
- Preferencias.

### 9.4 Editar un cliente

1. Busque el cliente.
2. Presione el icono de editar.
3. Actualice los campos necesarios.
4. Presione "Guardar cambios".

Evite cambiar documento o correo sin validar con el huesped, porque esos datos sirven para busquedas y trazabilidad.

### 9.5 Eliminar o restaurar un cliente

Para eliminar:

1. Busque el cliente.
2. Presione el icono de eliminar.
3. Confirme la accion.

Para restaurar:

1. Active "Ver eliminados" si aparece el aviso de clientes eliminados.
2. Busque el cliente eliminado.
3. Presione "Restaurar".

## 10. Reservas

El modulo "Reservas" permite controlar el ciclo completo de una estancia: creacion, confirmacion, check-in, seguimiento, check-out y cancelacion.

### 10.1 Informacion principal del listado

En el listado de reservas puede ver:

- Numero o codigo de reserva.
- Huesped o cliente.
- Habitacion.
- Estancia.
- Origen.
- Total.
- Estado de pago.
- Estado operativo.
- Acciones disponibles.

Tambien aparecen indicadores como:

- Total de reservas.
- Reservas en curso.
- Check-ins de hoy.
- Check-outs de hoy.
- Ingresos del mes.

### 10.2 Crear una reserva

1. Ingrese a "Reservas".
2. Presione "Nueva reserva".
3. En "Cliente", seleccione un cliente existente.
4. Si el cliente no existe, presione "Agregar cliente" y registre sus datos.
5. Seleccione "Origen", por ejemplo canal directo, agencia u otro origen configurado.
6. Ingrese "Codigo promo" si aplica.
7. Seleccione "Paquete" si la reserva incluye uno.
8. Ingrese "Check-in esperado".
9. Ingrese "Check-out esperado".
10. Ingrese "Descuento total" si aplica.
11. Escriba "Notas internas" si hay instrucciones para recepcion u operaciones.
12. Si hay abono inicial, registre monto, metodo de pago, fecha, referencia y notas.
13. En "Habitaciones de la reserva", agregue una o varias habitaciones.
14. En "Politicas de la reserva", agregue politicas si aplican.
15. En "Huespedes de la reserva", agregue los huespedes con documento y datos personales.
16. Presione "Guardar reserva".

Campos obligatorios:

- Cliente.
- Origen.
- Check-in esperado.
- Check-out esperado.
- Datos obligatorios de cada huesped agregado.

### 10.3 Abono inicial

El abono inicial es opcional. Se usa cuando el cliente paga una parte al crear la reserva.

Si registra un monto mayor que cero, tambien debe seleccionar el metodo de pago. Es recomendable escribir la referencia del comprobante, por ejemplo numero de transaccion, recibo o ultimos digitos del pago.

### 10.4 Habitaciones de la reserva

Puede agregar una o varias habitaciones. La tarifa se toma automaticamente segun el tipo de habitacion y la configuracion disponible.

Antes de guardar revise:

- Que la habitacion corresponda al tipo solicitado.
- Que la capacidad sea suficiente.
- Que las fechas sean correctas.
- Que no exista conflicto con otra reserva.

### 10.5 Huespedes de la reserva

Para cada huesped puede registrar:

- Tipo de documento.
- Numero de documento.
- Nombres.
- Apellidos.
- Fecha de nacimiento.
- Nacionalidad.
- Grupo sanguineo.
- Contacto de emergencia.
- Telefono de emergencia.

Los campos de documento, nombres y apellidos son importantes para control interno y trazabilidad.

### 10.6 Consultar reservas

Puede usar:

- Vista tabla: para control detallado.
- Vista tarjetas: para seguimiento rapido.
- Vista calendario: para revisar ocupacion por fechas y habitaciones.

Filtros disponibles:

- Buscar por reserva, cliente o documento.
- Estado.
- Origen.
- Pestanas de estado.

### 10.7 Detalle de una reserva

Al abrir una reserva se muestra:

- Codigo de reserva.
- Estado.
- Datos del cliente.
- Contacto.
- Habitacion.
- Fechas de estancia.
- Duracion.
- Origen.
- Paquete.
- Huespedes asociados.
- Facturacion.
- Estado de pago.
- Politicas asociadas.

Desde el detalle puede aparecer:

- Confirmar reserva.
- Registrar check-in.
- Registrar check-out.
- Editar reserva.
- Cancelar reserva.
- Cerrar.

Las acciones dependen del estado actual.

### 10.8 Flujo recomendado de estados

1. Crear reserva.
2. Confirmar reserva si el proceso interno lo requiere.
3. Registrar check-in cuando el huesped llega.
4. Mantener la reserva en curso durante la estancia.
5. Revisar factura y pagos antes de salida.
6. Registrar check-out.
7. Finalizar la operacion.

Si el cliente cancela, use "Cancelar reserva" desde el detalle cuando este disponible.

### 10.9 Registrar check-in desde Reservas

1. Ingrese a "Reservas".
2. Busque la reserva.
3. Verifique fechas, cliente y habitacion.
4. Presione el boton de check-in o abra el detalle.
5. Confirme la accion.

El check-in actualiza la reserva y la habitacion asociada.

### 10.10 Registrar check-out desde Reservas

1. Ingrese a "Reservas".
2. Busque la reserva en curso.
3. Abra el detalle.
4. Revise datos de estancia y facturacion.
5. Presione "Registrar check-out".
6. Si aparece revision de inventario, registre cantidades revisadas.
7. Agregue notas si encuentra diferencias.
8. Presione "Confirmar check-out".

Antes de confirmar, revise si la factura tiene saldo pendiente.

## 11. Habitaciones

El modulo "Habitaciones" permite revisar disponibilidad y ejecutar acciones operativas por habitacion.

### 11.1 Informacion que muestra

Por cada habitacion puede ver:

- Numero.
- Tipo de habitacion.
- Piso.
- Estado.
- Tarifa.
- Huesped actual si esta ocupada.
- Amenidades.
- Mantenimiento activo si existe.
- Notas internas.

### 11.2 Acciones disponibles

Segun estado y permisos, puede:

- Ver detalle.
- Editar habitacion.
- Crear nueva reserva desde una habitacion disponible.
- Registrar check-in.
- Registrar check-out.
- Confirmar reserva.
- Solicitar cambio de habitacion.
- Marcar como disponible.
- Exportar listado.

### 11.3 Crear una habitacion

1. Ingrese a "Habitaciones".
2. Presione la opcion para crear nueva habitacion si esta disponible.
3. Escriba el numero de habitacion.
4. Seleccione el piso.
5. Seleccione tipo de habitacion.
6. Seleccione estado.
7. Escriba notas internas si aplica.
8. Seleccione amenidades.
9. Presione "Guardar habitacion".

Campos importantes:

- Numero: ejemplo 101, 202, Suite 1.
- Piso: debe existir en la configuracion o datos maestros.
- Tipo de habitacion: define capacidad y tarifa base.
- Estado: afecta disponibilidad operativa.
- Amenidades: ayudan a describir y vender la habitacion.

### 11.4 Tipos de habitacion

Este modulo define categorias como sencilla, doble, suite o familiar.

Para crear un tipo:

1. Ingrese a "Tipos de habitacion".
2. Presione "Nuevo tipo".
3. Escriba codigo, por ejemplo DELUXE_KING.
4. Escriba nombre.
5. Defina capacidad en personas.
6. Defina cantidad de camas.
7. Escriba tipo de cama si aplica.
8. Defina orden de visualizacion si desea organizar el listado.
9. Escriba descripcion.
10. Active el tipo para nuevos registros y tarifas.
11. Presione "Guardar tipo".

El codigo solo debe usar letras, numeros, guion o guion bajo.

### 11.5 Tarifas de habitacion

Las tarifas se asocian a tipos de habitacion y se usan en reservas.

Para crear una tarifa:

1. Ingrese a "Tarifas de habitacion".
2. Presione "Nueva tarifa".
3. Seleccione el tipo de habitacion.
4. Escriba nombre de tarifa.
5. Escriba precio por noche.
6. Defina vigencia desde y hasta si aplica.
7. Active la tarifa para reservas nuevas.
8. Presione "Guardar tarifa".

Recomendacion: revise vigencias para evitar que una tarifa vencida se use en reservas nuevas.

### 11.6 Amenidades

Las amenidades son caracteristicas o beneficios, por ejemplo aire acondicionado, wifi, television o balcon.

Use este modulo para:

- Crear amenidades.
- Editar nombre, descripcion o icono.
- Activar o desactivar amenidades.
- Eliminar o restaurar registros.
- Exportar listado.

## 12. Servicios, paquetes y promociones

Estos modulos alimentan la parte comercial y de facturacion.

### 12.1 Servicios

Un servicio es un producto o actividad que el hotel puede vender o cargar a una factura.

Ejemplos:

- Desayuno.
- Lavanderia.
- Transporte.
- Spa.
- Minibar.

Para crear un servicio:

1. Ingrese a "Catalogo de servicios".
2. Presione "Nuevo servicio".
3. Escriba nombre del servicio.
4. Seleccione tipo de servicio.
5. Registre precio base.
6. Escriba descripcion.
7. Active "Disponible para venta inmediata" si ya se puede vender.
8. Presione "Guardar servicio".

El servicio debe estar activo para aparecer en cargos de facturacion.

### 12.2 Paquetes

Un paquete agrupa beneficios o servicios bajo un precio base.

Para crear un paquete:

1. Ingrese a "Catalogo de paquetes".
2. Presione "Nuevo paquete".
3. Escriba nombre.
4. Escriba descripcion.
5. Registre precio base.
6. Active disponibilidad para venta inmediata si aplica.
7. Seleccione categoria o tipo de habitacion.
8. Defina fecha "Valido desde" y "Valido hasta" si tiene vigencia.
9. Seleccione servicios incluidos.
10. Presione "Crear paquete".

Recomendacion: antes de crear paquetes, registre primero los servicios que incluiran.

### 12.3 Promociones

Una promocion define descuentos y condiciones comerciales.

Para crear una promocion:

1. Ingrese a "Promociones".
2. Presione "Nueva promocion".
3. Escriba nombre de promocion.
4. Escriba codigo interno si aplica.
5. Seleccione tipo de descuento.
6. Ingrese valor del descuento.
7. Escriba descripcion con condiciones y restricciones.
8. Active "Promocion activa" si ya puede usarse.
9. Active "Visible para clientes" si debe mostrarse publicamente.
10. Defina alcance: general, servicio especifico o paquete especifico.
11. Si el alcance es servicio o paquete, seleccione el elemento.
12. Defina fecha valida desde y valida hasta.
13. Presione "Crear promocion".

Revise que la fecha final no sea menor que la fecha inicial.

## 13. Facturacion

El modulo "Facturas" permite controlar cargos, pagos, notas credito y descarga de PDF.

### 13.1 Informacion del listado

En el listado puede ver:

- Numero de factura.
- Huesped.
- Reserva asociada.
- Estancia.
- Fecha de emision.
- Total.
- Estado.
- Actividad.
- Accion para ver detalle.

Filtros disponibles:

- Buscar por factura, reserva, huesped o documento.
- Estado.
- Actividad.
- Vista tarjetas o tabla.

### 13.2 Detalle de factura

Al abrir una factura se muestra:

- Habitacion o reserva.
- Huesped.
- Saldo pendiente.
- Total de factura.
- Total pagado.
- Cantidad de cargos.
- Notas credito activas.
- Cargos agrupados por categoria.
- Pagos registrados.
- Subtotal.
- IVA.
- Total con impuesto.

### 13.3 Agregar cargo

1. Abra "Facturas".
2. Busque la factura.
3. Abra el detalle.
4. Presione "Agregar cargo".
5. Seleccione categoria.
6. Si la categoria corresponde a servicio, seleccione el servicio.
7. Si corresponde a paquete, seleccione el paquete.
8. Ingrese cantidad.
9. Si es cargo manual, escriba descripcion y valor unitario.
10. Presione "Registrar".

Notas:

- En modo automatico el precio se carga desde el catalogo.
- En modo manual debe escribir descripcion y valor unitario.
- Puede retirar cargos manuales cuando la accion este disponible.

### 13.4 Bar / Mini tienda

La opcion "Bar / Mini tienda" permite registrar consumos de productos de forma rapida.

Uso recomendado:

1. Abra la factura del huesped.
2. Presione "Bar / Mini tienda".
3. Busque el producto.
4. Agregue cantidades.
5. Revise el resumen.
6. Registre los cargos.

### 13.5 Registrar pago

1. Abra el detalle de factura.
2. Presione "Agregar pago".
3. Seleccione metodo de pago.
4. Ingrese monto.
5. Escriba referencia si aplica.
6. Escriba notas si necesita dejar observaciones.
7. Presione "Registrar pago".
8. Verifique el saldo pendiente.

El sistema muestra el saldo pendiente antes de registrar el pago.

### 13.6 Notas credito

Use notas credito para ajustes o correcciones sobre una factura.

Desde el detalle:

1. Presione "Notas credito".
2. Revise notas existentes.
3. Cree una nueva nota si aplica.
4. Edite o anule una nota cuando la accion este disponible.
5. Actualice la factura para revisar nuevos saldos.

### 13.7 Descargar PDF

1. Abra la factura.
2. Presione "Descargar PDF".
3. Espere mientras se genera.
4. Guarde o imprima el archivo segun necesidad.

## 14. Pagos y reembolsos

### 14.1 Pagos

El modulo de pagos permite consultar pagos registrados. En el detalle de un pago puede revisar:

- Numero o identificador.
- Metodo de pago.
- Monto.
- Referencia.
- Fecha.
- Estado.
- Reembolsos procesados.

Para registrar pagos, normalmente se hace desde el detalle de factura.

### 14.2 Reembolsos

Los reembolsos representan devoluciones asociadas a pagos. Pueden aparecer como pendientes o procesados segun el flujo configurado.

Uso recomendado:

1. Abra el pago o modulo de reembolsos.
2. Revise monto pagado y monto disponible para reembolso.
3. Registre el reembolso con motivo y monto si la pantalla lo permite.
4. Espere aprobacion si el sistema lo maneja como pendiente.
5. Verifique que la factura y el pago reflejen el ajuste.

## 15. Inventario

El sistema maneja inventario general, movimientos y asignaciones por habitacion.

### 15.1 Items

Los items son productos, insumos o elementos controlables.

Para crear un item:

1. Ingrese a "Items".
2. Presione "Nuevo item".
3. Escriba nombre del item.
4. Escriba SKU si aplica.
5. Seleccione tipo de item.
6. Seleccione unidad de medida.
7. Registre stock inicial.
8. Registre stock minimo.
9. Registre stock maximo.
10. Registre costo unitario.
11. Registre precio de venta.
12. Escriba descripcion.
13. Active "Disponible para movimientos de inventario".
14. Presione "Guardar item".

Campos obligatorios:

- Nombre.
- Tipo de item.
- Unidad de medida.
- Stock inicial.
- Stock minimo.
- Stock maximo.
- Costo unitario.
- Precio de venta.

### 15.2 Inventario por habitacion

Este modulo asigna items a habitaciones. Sirve para controlar elementos como toallas, controles, sabanas, amenities fisicas o productos de minibar.

Para asignar inventario:

1. Ingrese a "Inventario por Habitacion".
2. Presione "Nueva asignacion" si esta disponible.
3. Seleccione habitacion.
4. Agregue items a asignar.
5. Defina cantidades.
6. Guarde asignaciones.

Use el detalle para revisar los items asociados a cada habitacion.

### 15.3 Movimientos de inventario

Los movimientos permiten registrar entradas, salidas o ajustes.

Uso recomendado:

1. Ingrese a "Movimientos de inventario".
2. Presione "Nuevo movimiento".
3. Seleccione item.
4. Indique tipo de movimiento.
5. Ingrese cantidad.
6. Registre motivo, referencia o notas.
7. Guarde.

### 15.4 Revision de inventario en check-out

Cuando se registra check-out, el sistema puede mostrar una revision de inventario.

1. Revise la cantidad esperada por item.
2. Ingrese la cantidad encontrada o revisada.
3. Observe la diferencia.
4. Escriba notas si hay faltantes, danos o novedades.
5. Presione "Confirmar check-out".

Esta revision ayuda a detectar consumos, perdidas o necesidades de reposicion.

## 16. Limpieza

El modulo "Tareas de Limpieza" ayuda a coordinar camareria y preparacion de habitaciones.

### 16.1 Crear tarea de limpieza

1. Ingrese a "Tareas de Limpieza".
2. Presione "Nueva tarea" si esta disponible.
3. Seleccione habitacion.
4. Seleccione tipo de tarea.
5. Seleccione estado inicial.
6. Defina fecha programada.
7. Escriba notas para camareria.
8. Presione "Guardar tarea".

Campos obligatorios:

- Habitacion.
- Tipo de tarea.
- Estado.

### 16.2 Seguimiento de tareas

Desde el listado puede:

- Buscar por habitacion, tipo, estado o notas.
- Cambiar vista entre tarjetas y tabla.
- Avanzar estado de tarea.
- Ver detalle.
- Eliminar tarea.
- Restaurar tarea eliminada.
- Exportar.

Recomendacion: actualice el estado al terminar una limpieza para que recepcion conozca disponibilidad real.

## 17. Mantenimiento

El modulo "Ordenes de Mantenimiento" permite registrar incidencias tecnicas y hacer seguimiento.

### 17.1 Crear orden de mantenimiento

1. Ingrese a "Ordenes de Mantenimiento".
2. Presione "Nueva orden" si esta disponible.
3. Seleccione habitacion.
4. Escriba titulo de la incidencia.
5. Seleccione prioridad.
6. Seleccione estado.
7. Defina fecha estimada de finalizacion si aplica.
8. Escriba descripcion tecnica.
9. Presione "Guardar orden".

Campos obligatorios:

- Habitacion.
- Titulo.
- Prioridad.
- Estado.

### 17.2 Seguimiento de mantenimiento

Use el listado para:

- Ver ordenes activas.
- Filtrar por estado o prioridad.
- Revisar fecha estimada.
- Marcar avances.
- Registrar fecha real de finalizacion cuando se complete.
- Ver detalle.
- Eliminar o restaurar ordenes.

Recomendacion: si una habitacion no debe venderse por mantenimiento, actualice tambien su estado operativo.

## 18. Finanzas

### 18.1 Consolidado de ingresos

Permite revisar ingresos agrupados por periodo, origen o categoria segun los datos disponibles.

Uso recomendado:

1. Ingrese a "Consolidado de ingresos".
2. Revise totales y tendencias.
3. Aplique filtros si estan disponibles.
4. Exporte la informacion si necesita soporte para cierres.

### 18.2 Egresos

El modulo "Egresos" registra salidas de caja.

Para crear un egreso:

1. Ingrese a "Egresos".
2. Presione "Nuevo egreso".
3. Seleccione categoria.
4. Seleccione tipo de egreso.
5. Seleccione comportamiento de costo o gasto.
6. Ingrese monto.
7. Escriba concepto.
8. Seleccione fecha.
9. Seleccione metodo de pago si aplica.
10. Escriba proveedor si aplica.
11. Escriba referencia, factura, comprobante o recibo.
12. Agregue descripcion.
13. Verifique que este activo para reportes y cierres financieros.
14. Presione "Guardar egreso".

Campos obligatorios:

- Categoria.
- Tipo de egreso.
- Comportamiento.
- Monto.
- Concepto.
- Fecha.

### 18.3 Control financiero

Control financiero muestra informacion para seguimiento gerencial. Puede incluir:

- Utilidad.
- Tendencias.
- Balance.
- Alertas.
- Indicadores operativos y financieros.

Use esta pantalla para revisar decisiones administrativas, no para registrar ventas diarias.

## 19. Reportes y actividad

### 19.1 Reportes

El modulo "Reportes" permite consultar indicadores y generar salidas para revision administrativa.

Uso basico:

1. Ingrese a "Reportes".
2. Revise los indicadores.
3. Use filtros de periodo o categoria si estan disponibles.
4. Presione "Actualizar" para recargar.
5. Presione "Exportar PDF" si necesita guardar o imprimir.

Los reportes pueden incluir informacion de:

- Ocupacion.
- Ingresos.
- Servicios.
- Reservas.
- Facturacion.
- Categorias de servicio.
- Tendencias de operacion.

### 19.2 Actividad

El registro de actividad muestra eventos del sistema para trazabilidad.

Puede servir para:

- Revisar acciones recientes.
- Identificar cambios importantes.
- Consultar eventos operativos.
- Apoyar auditorias internas.

## 20. Administracion del sistema

Los modulos administrativos deben ser usados por personal autorizado.

### 20.1 Usuarios

Permite crear y administrar cuentas.

Para crear usuario:

1. Ingrese a "Usuarios".
2. Presione "Nuevo usuario".
3. Registre avatar URL si aplica.
4. Escriba nombre.
5. Escriba apellidos.
6. Escriba nombre de usuario.
7. Escriba correo electronico.
8. Seleccione rol.
9. Seleccione cargo.
10. Escriba contrasena.
11. Seleccione hotel si el sistema lo solicita.
12. Active "Usuario activo".
13. Presione "Registrar".

Recomendacion: asigne el rol minimo necesario para el cargo del usuario.

### 20.2 Roles

Los roles agrupan permisos. En esta pantalla puede:

- Crear rol.
- Editar rol.
- Eliminar rol.
- Buscar roles.
- Asignar usuarios disponibles a un rol.
- Quitar usuarios asignados.

Uso recomendado:

1. Cree roles por funciones reales, por ejemplo Administrador, Recepcion, Gerente, Camareria o Mantenimiento.
2. Asigne usuarios al rol correcto.
3. Revise permisos en "Recursos".
4. Pruebe el acceso con un usuario no administrador.

### 20.3 Recursos

Los recursos controlan las pantallas y acciones disponibles.

En esta pantalla puede:

- Buscar roles.
- Seleccionar un rol.
- Ver recursos disponibles.
- Ver recursos asignados.
- Asignar recursos a roles.
- Quitar recursos.
- Crear recurso.
- Editar recurso.
- Eliminar recurso.

Ejemplos de recursos:

- clients.read: ver clientes.
- clients.write: gestionar clientes.
- reservations.read: ver reservas.
- reservations.write: gestionar reservas.
- invoices.read: ver facturas.
- invoices.write: gestionar facturacion.

Use recursos de lectura para consultar y recursos de escritura para crear, modificar o eliminar.

### 20.4 Master Data

Master Data administra catalogos base usados por otros modulos.

Ejemplos de datos maestros:

- Tipos de documento.
- Origenes de reserva.
- Metodos de pago.
- Tipos de servicio.
- Tipos de item.
- Unidades de medida.
- Estados.
- Categorias.

Antes de usar un modulo, asegurese de que sus catalogos esten creados y activos. Por ejemplo:

- Para crear items necesita tipos de item y unidades de medida.
- Para crear egresos necesita categorias de egreso.
- Para crear promociones necesita tipos de descuento.
- Para crear tareas de limpieza necesita tipos y estados.
- Para crear ordenes de mantenimiento necesita prioridades y estados.

### 20.5 Configuracion del hotel

Este modulo define datos generales y parametros operativos del hotel.

Puede incluir:

- Nombre del hotel.
- Logo.
- Ciudad y pais.
- Telefonos.
- Correos.
- Moneda.
- Zona horaria.
- Politicas de reserva.
- Configuracion financiera.
- Parametros operativos.

Uso recomendado:

1. Configure primero datos generales del hotel.
2. Configure politicas de reserva.
3. Configure datos financieros.
4. Guarde cambios.
5. Verifique que el logo y nombre se muestren correctamente en el menu.

### 20.6 Panel SaaS y hoteles globales

Estas opciones son para administradores globales cuando el sistema gestiona varios hoteles.

Permiten:

- Revisar panel general SaaS.
- Consultar hoteles registrados.
- Cambiar hotel activo.
- Crear o administrar hoteles si el rol lo permite.

## 21. Procedimientos operativos completos

### 21.1 Flujo recomendado para una reserva nueva

1. Verifique si el cliente ya existe en "Clientes y Huespedes".
2. Si no existe, cree el cliente.
3. Verifique disponibilidad en "Habitaciones" o "Reservas" vista calendario.
4. Cree la reserva.
5. Asigne habitacion.
6. Registre huespedes.
7. Registre abono inicial si aplica.
8. Guarde.
9. Confirme la reserva si su proceso lo requiere.
10. Revise que aparezca correctamente en el listado y calendario.

### 21.2 Flujo recomendado para llegada de huesped

1. Abra Dashboard al iniciar turno.
2. Revise "Check-ins de Hoy".
3. Ingrese a "Reservas".
4. Busque la reserva del huesped.
5. Verifique documento y datos de contacto.
6. Verifique habitacion asignada.
7. Revise pagos o abonos.
8. Registre check-in.
9. Confirme que la habitacion quede ocupada.

### 21.3 Flujo recomendado durante la estancia

1. Registre consumos desde la factura.
2. Use "Bar / Mini tienda" para consumos rapidos.
3. Registre cargos manuales cuando el consumo no exista en catalogo.
4. Cree tareas de limpieza segun necesidades.
5. Cree ordenes de mantenimiento si hay novedades.
6. Registre pagos parciales si el huesped abona.
7. Mantenga notas internas actualizadas.

### 21.4 Flujo recomendado para salida de huesped

1. Revise "Check-outs de Hoy" en Dashboard.
2. Abra la reserva o habitacion.
3. Revise factura.
4. Agregue cargos pendientes.
5. Registre pagos pendientes.
6. Verifique saldo.
7. Revise inventario de habitacion si el sistema lo solicita.
8. Registre check-out.
9. Descargue PDF de factura si el huesped lo solicita.
10. Cree tarea de limpieza para preparar la habitacion.

### 21.5 Flujo recomendado para cierre administrativo diario

1. Revise Dashboard.
2. Revise reservas finalizadas y en curso.
3. Revise facturas emitidas y pagadas.
4. Revise pagos del dia.
5. Registre egresos pendientes.
6. Revise consolidado de ingresos.
7. Exporte reportes necesarios.
8. Revise actividad reciente si hubo novedades.

## 22. Buenas practicas

- Busque antes de crear registros para evitar duplicados.
- No cree clientes con correos o documentos inventados si luego se usaran para facturacion.
- Registre notas internas cuando haya condiciones especiales.
- Mantenga actualizado el estado de las habitaciones.
- No confirme check-out sin revisar factura.
- Registre referencias de pago siempre que existan.
- Mantenga catalogos activos y ordenados.
- Revise stock minimo de items para evitar faltantes.
- No elimine registros administrativos sin validar impacto.
- Asigne permisos por rol, no por costumbre.
- Use exportaciones para cierres y respaldos administrativos.
- Cierre sesion al terminar en equipos compartidos.

## 23. Problemas frecuentes y solucion

### No puedo iniciar sesion

Revise usuario y contrasena. Si olvido la contrasena, use "Olvide mi contrasena". Si el problema continua, solicite al administrador verificar que el usuario este activo.

### No veo un modulo en el menu

El rol no tiene permiso para ese modulo. Solicite al administrador revisar roles y recursos.

### El sistema muestra acceso denegado

El usuario no tiene permiso para esa ruta o accion. Vuelva al Dashboard o contacte al administrador.

### No puedo guardar una reserva

Revise:

- Cliente seleccionado.
- Origen seleccionado.
- Fechas de check-in y check-out.
- Habitaciones agregadas.
- Datos obligatorios de huespedes.
- Que la fecha de salida sea posterior a la fecha de entrada.

### No aparece una habitacion disponible

Revise:

- Estado de la habitacion.
- Fechas de la reserva.
- Si la habitacion ya esta asignada.
- Si esta en mantenimiento o limpieza.
- Si el tipo de habitacion tiene tarifa activa.

### No puedo registrar un item

Revise:

- Que exista configuracion activa del hotel.
- Que existan tipos de item en Master Data.
- Que existan unidades de medida en Master Data.
- Que el stock y precios sean validos.

### No puedo registrar un egreso

Revise:

- Que exista configuracion activa del hotel.
- Que existan categorias de egreso activas.
- Que el monto sea mayor que cero.
- Que la fecha sea valida.

### La factura tiene saldo pendiente

Abra el detalle de factura y revise:

- Total de cargos.
- Pagos registrados.
- Notas credito.
- Estado de pagos.
- Si falta registrar algun pago o abono.

### El PDF de factura no se descarga

Espere a que termine la generacion. Si continua fallando, actualice la pantalla y vuelva a intentar. Si el problema persiste, informe al administrador.

### Los datos no se actualizan

Use el boton "Actualizar". Si no cambia, cierre sesion e ingrese nuevamente. Tambien revise conexion a internet o red local.

### Aparecen caracteres extranos o textos incompletos

Actualice la pagina. Si continua, informe al administrador indicando pantalla, accion realizada y hora aproximada del problema.

## 24. Recomendaciones de seguridad

- No comparta usuario ni contrasena.
- No deje sesiones abiertas en equipos publicos.
- Cambie su contrasena periodicamente.
- Use contrasenas de minimo 8 caracteres.
- Combine letras, numeros y simbolos.
- No use la misma contrasena de correos personales u otros sistemas.
- Informe al administrador si sospecha que alguien uso su cuenta.

## 25. Glosario ampliado

- Abono inicial: pago parcial registrado al crear una reserva.
- Actividad: evento o movimiento registrado por el sistema.
- Amenidad: caracteristica asociada a una habitacion.
- Cargo automatico: cargo que toma precio desde un servicio, paquete u otro catalogo.
- Cargo manual: cargo escrito por el usuario con descripcion y valor.
- Check-in esperado: fecha programada de llegada.
- Check-out esperado: fecha programada de salida.
- Codigo promo: codigo de promocion aplicado a una reserva.
- Comportamiento de costo: clasificacion financiera del egreso.
- Disponibilidad: estado que indica si una habitacion puede ser vendida.
- Estado activo: registro disponible para uso.
- Estado inactivo: registro que no se usa en nuevos procesos.
- Eliminacion logica: registro marcado como eliminado sin borrarse definitivamente.
- Huesped actual: cliente o persona que se encuentra alojada.
- Metodo de pago: forma usada para pagar, por ejemplo efectivo, transferencia o tarjeta.
- Origen: canal por el cual llega una reserva.
- Prioridad: nivel de importancia de una orden de mantenimiento.
- Reembolso: devolucion total o parcial de un pago.
- SKU: codigo interno de un item de inventario.
- Stock maximo: cantidad maxima sugerida para un item.
- Stock minimo: cantidad minima requerida antes de reponer.
- Tenencia de hotel: separacion de informacion por hotel cuando el sistema maneja varios.
