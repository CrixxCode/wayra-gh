export type ActionAlertType =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'assign'
  | 'remove'
  | 'register'
  | 'save'
  | 'deactivate';

const ACTION_LABELS: Record<ActionAlertType, string> = {
  create: 'creacion',
  update: 'actualizacion',
  delete: 'eliminacion',
  restore: 'restauracion',
  assign: 'asignacion',
  remove: 'remocion',
  register: 'registro',
  save: 'guardado',
  deactivate: 'desactivacion'
};

export const ACTION_ALERT_SUCCESS_SUMMARY = 'Operacion completada';
export const ACTION_ALERT_ERROR_SUMMARY = 'Operacion fallida';

function normalizeTarget(target: string): string {
  const normalized = String(target || '').trim();
  return normalized || 'registro';
}

export function successActionAlert(action: ActionAlertType, target: string): string {
  return `Operacion de ${ACTION_LABELS[action]} de ${normalizeTarget(target)} completada correctamente.`;
}

export function errorActionAlert(action: ActionAlertType, target: string): string {
  return `No se pudo completar la operacion de ${ACTION_LABELS[action]} de ${normalizeTarget(target)}.`;
}
