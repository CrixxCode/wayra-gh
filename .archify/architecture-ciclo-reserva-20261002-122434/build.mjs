import fs from 'node:fs';

const DIR = '.archify/architecture-ciclo-reserva-20261002-122434';
const prev = JSON.parse(fs.readFileSync('.archify/architecture-arquitectura-logica-20261002-095133/candidate.json', 'utf8'));
const C = [];
// Desplazamiento vertical de los carriles 02 y 03 para dejar sitio a la nota de cancelación
const DY = 50;
const put = (id, type, label, x, y, w, h, extra = {}) => C.push({ id, type, label, ...extra, pos: [x, y], size: [w, h] });
const add = (id, type, label, x, y, w, h, extra = {}) => put(id, type, label, x, y >= 190 ? y + DY : y, w, h, extra);
const chip = (id, type, label, x, y, w) => add(id, type, label, x, y, w, 24, { icon: 'none' });

// Carril 01
add('nota-entradas', 'external', 'Entradas auxiliares: alimentan el flujo principal y no son etapas obligatorias', 60, 40, 1658, 26, { icon: 'none' });
add('reserva-web', 'external', 'Reserva web', 60, 76, 124, 60, { sublabel: 'Canal en línea' });
add('web-cliente', 'external', 'Crea cliente', 192, 76, 128, 26, { icon: 'none' });
add('web-reserva', 'external', 'Crea reserva PENDIENTE', 328, 76, 168, 26, { icon: 'none' });
add('web-habitaciones', 'external', 'Asigna habitaciones', 192, 110, 128, 26, { icon: 'none' });
add('web-huesped', 'external', 'Registra huésped principal', 328, 110, 168, 26, { icon: 'none' });
add('checkin-online', 'external', 'Check-in online', 506, 76, 136, 60, { sublabel: 'Pre-registro de huéspedes' });

// Carril 02 - fila principal
const Y = 516;
const H = 60;
add('reserva-creada', 'frontend', 'Reserva creada', 60, Y, 130, H, { sublabel: 'Estado: PENDIENTE' });
add('asignacion', 'frontend', 'Asignación de habitación', 230, Y, 166, H, { sublabel: 'Validación de disponibilidad' });
add('confirmacion', 'frontend', 'Confirmación', 432, Y, 130, H, { sublabel: 'Estado: CONFIRMADA' });
add('checkin', 'frontend', 'Check-in', 598, Y, 150, H, { sublabel: 'Estado: EN_CURSO' });
add('estadia', 'frontend', 'Estadía', 784, Y, 120, H, { sublabel: 'Reserva en curso' });
add('checkout', 'frontend', 'Check-out', 940, Y, 160, H, { sublabel: 'Cierre de la estadía' });
add('finalizada', 'backend', 'Reserva finalizada', 1186, Y, 150, H, { sublabel: 'Estado: FINALIZADA' });
add('limpieza', 'frontend', 'Limpieza', 1372, Y, 120, H, { sublabel: 'Habitación: LIMPIEZA' });
add('disponible', 'backend', 'Habitación disponible', 1578, Y, 140, H, { sublabel: 'Estado: DISPONIBLE' });

// Rama de cancelación
put('cancelacion', 'external', 'Cancelación', 230, 214, 166, 56, { sublabel: 'Estado: CANCELADA' });
put('nota-cancelacion', 'external', 'Solo antes del check-in', 230, 278, 166, 44, { sublabel: 'desde PENDIENTE o CONFIRMADA', icon: 'none' });

// Pilas de detalle
const stack = (prefix, type, items, x, w, lastY = 464) => items.map((label, i) => {
  const id = `${prefix}-${i + 1}`;
  chip(id, type, label, x, lastY - (items.length - 1 - i) * 32, w);
  return id;
});
const vAsig = stack('val-asig', 'frontend', ['Mismo establecimiento', 'Sin mantenimiento/limpieza', 'Sin solapamiento de fechas', 'Tarifa activa del periodo', 'Capacidad suficiente', 'Tipo compatible, si aplica'], 230, 166);
const cIn = stack('cond-checkin', 'frontend', ['Reserva confirmada', 'Fecha/hora permitida', 'Habitación habilitada'], 598, 150, 358);
const rIn = stack('res-checkin', 'frontend', ['Registro real_check_in', 'Inventario inicial'], 598, 150);
const aEst = stack('act-estadia', 'frontend', ['Servicios', 'Consumos', 'Cargos', 'Pagos o abonos'], 784, 120);
const vOut = stack('val-checkout', 'frontend', ['Revisión del inventario', 'Comparación con inicial', 'Cargos si hay faltantes', 'Recálculo financiero', 'Validación del saldo'], 940, 160);
const aFin = stack('acc-final', 'backend', ['Registro real_check_out', 'Actualiza inventario', 'Emisión de factura', 'Tarea de limpieza'], 1171, 180);

// Banda inferior del carril 02
chip('nota-correo', 'external', 'Correo si origen web', 432, 592, 130);
add('registrar-pago', 'frontend', 'Registrar pago', 1020, 616, 120, 52, { sublabel: 'Abono al saldo' });

// Carril 03
add('conflicto', 'security', 'Conflicto de habitación', 230, 720, 166, 60, { sublabel: 'Asignación rechazada' });
const eConf = stack('exc-conf', 'security', ['Solapamiento de fechas', 'Mantenimiento o limpieza', 'Tarifa o capacidad no apta'], 230, 166, 860);
add('checkin-bloqueado', 'security', 'Check-in no permitido', 593, 720, 160, 60, { sublabel: 'Ingreso rechazado' });
const eIn = stack('exc-checkin', 'security', ['Reserva no confirmada', 'Fecha/hora no válida', 'Habitación no habilitada'], 593, 160, 860);
add('saldo-pendiente', 'security', 'Saldo pendiente', 895, 720, 150, 60, { sublabel: 'Impide cerrar check-out' });
const eSaldo = stack('exc-saldo', 'security', ['Hasta que saldo = 0'], 895, 150, 796);
add('nota-controles', 'external', 'Controles funcionales: el flujo no avanza mientras no se cumplan las condiciones del proceso', 60, 900, 1658, 26, { icon: 'none' });

const lane02 = ['reserva-creada', 'asignacion', 'confirmacion', 'checkin', 'estadia', 'checkout', 'finalizada', 'limpieza', 'disponible', 'cancelacion', 'nota-cancelacion',
  ...vAsig, ...cIn, ...rIn, ...aEst, ...vOut, ...aFin, 'nota-correo', 'registrar-pago'];
const boundaries = [
  { kind: 'region', label: '01 / Canales de entrada', wraps: ['nota-entradas', 'reserva-web', 'web-cliente', 'web-reserva', 'web-habitaciones', 'web-huesped', 'checkin-online'] },
  { kind: 'region', label: '02 / Operación hotelera', wraps: lane02 },
  { kind: 'region', label: '03 / Validaciones y bloqueos', wraps: ['conflicto', ...eConf, 'checkin-bloqueado', ...eIn, 'saldo-pendiente', ...eSaldo, 'nota-controles'] },
  { kind: 'security-group', label: 'Validaciones', wraps: vAsig, pad: 6 },
  { kind: 'security-group', label: 'Condiciones', wraps: cIn, pad: 6 },
  { kind: 'region', label: 'Resultado', wraps: rIn, pad: 6 },
  { kind: 'region', label: 'Actividades', wraps: aEst, pad: 6 },
  { kind: 'security-group', label: 'Validaciones y acciones', wraps: vOut, pad: 6 },
  { kind: 'region', label: 'Acciones al completar el check-out', wraps: aFin, pad: 6 },
];

const E = (id, from, to, extra = {}) => ({ id, from, to, ...extra });
const connections = [
  E('web-crea', 'reserva-web', 'reserva-creada', { variant: 'dashed', fromSide: 'bottom', toSide: 'top' }),
  E('online-checkin', 'checkin-online', 'checkin', { variant: 'dashed', label: 'datos previos', fromSide: 'bottom', toSide: 'left', labelAt: [574, 172] }),
  E('m1', 'reserva-creada', 'asignacion', { variant: 'emphasis' }),
  E('m2', 'asignacion', 'confirmacion', { variant: 'emphasis' }),
  E('m3', 'confirmacion', 'checkin', { variant: 'emphasis' }),
  E('m4', 'checkin', 'estadia', { variant: 'emphasis' }),
  E('m5', 'estadia', 'checkout', { variant: 'emphasis' }),
  E('m6', 'checkout', 'finalizada', { variant: 'emphasis', label: 'saldo = 0' }),
  E('m7', 'finalizada', 'limpieza', { variant: 'emphasis' }),
  E('m8', 'limpieza', 'disponible', { variant: 'emphasis', label: 'completada' }),
  E('cancel-pend', 'reserva-creada', 'cancelacion', { variant: 'dashed', label: 'cancelar', fromSide: 'top', toSide: 'left', labelSegment: 1 }),
  E('cancel-conf', 'confirmacion', 'cancelacion', { variant: 'dashed', label: 'cancelar', fromSide: 'top', toSide: 'right', labelSegment: 1 }),
  E('x-asig', 'asignacion', 'conflicto', { variant: 'security', label: 'no cumple', fromSide: 'bottom', toSide: 'top' }),
  E('x-checkin', 'checkin', 'checkin-bloqueado', { variant: 'security', label: 'no cumple', fromSide: 'bottom', toSide: 'top' }),
  E('x-saldo', 'checkout', 'saldo-pendiente', { variant: 'security', label: 'saldo > 0', fromSide: 'bottom', toSide: 'top' }),
  E('saldo-pago', 'saldo-pendiente', 'registrar-pago', { fromSide: 'right', toSide: 'bottom' }),
  E('pago-checkout', 'registrar-pago', 'checkout', { label: 'revalidar', fromSide: 'top', toSide: 'bottom' }),
];

const cand = {
  schema_version: 1,
  diagram_type: 'architecture',
  meta: {
    title: 'Flujo funcional del ciclo de reserva y alojamiento en la plataforma',
    locale: 'es',
    translations: prev.meta.translations,
    output: `${DIR}/ciclo-reserva.html`,
    quality_profile: 'showcase',
    legend: {
      entries: {
        frontend: { label: 'Etapa del flujo y detalle' },
        backend: { label: 'Estado final' },
        security: { label: 'Control o bloqueo' },
        external: { label: 'Entrada auxiliar o ruta alternativa' },
      },
    },
  },
  components: C,
  boundaries,
  connections,
};
fs.writeFileSync(`${DIR}/candidate.json`, JSON.stringify(cand, null, 2));
console.log(C.length, connections.length);
