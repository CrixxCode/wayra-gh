import { ConfirmationService } from 'primeng/api';

export type ConfirmActionType = 'delete' | 'remove' | 'deactivate' | 'save' | 'cancel' | 'restore';

const ACTION_LABELS: Record<ConfirmActionType, string> = {
  delete: 'eliminacion',
  remove: 'remocion',
  deactivate: 'desactivacion',
  save: 'guardado',
  cancel: 'cancelacion',
  restore: 'restauracion'
};

function normalizeTarget(target: string): string {
  const normalized = String(target || '').trim();
  return normalized || 'registro';
}

export function confirmActionMessage(action: ConfirmActionType, target: string): string {
  if (action === 'restore') {
    return `Vas a ejecutar la operacion de ${ACTION_LABELS[action]} de ${normalizeTarget(target)}.`;
  }
  return `Vas a ejecutar la operacion de ${ACTION_LABELS[action]} de ${normalizeTarget(target)}. Esta accion no se puede deshacer.`;
}

type ConfirmActionOptions = {
  action: ConfirmActionType;
  target: string;
  onAccept: () => void;
  key?: string;
};

export function openActionConfirmation(
  confirmationService: ConfirmationService,
  options: ConfirmActionOptions
): void {
  const isRestore = options.action === 'restore';
  confirmationService.confirm({
    key: options.key || 'appConfirm',
    header: 'Confirmar accion',
    message: confirmActionMessage(options.action, options.target),
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: isRestore ? 'Si, restaurar' : 'Si, continuar',
    rejectLabel: 'Cancelar',
    acceptButtonStyleClass: isRestore ? 'p-button-success' : 'p-button-danger',
    rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
    defaultFocus: 'reject',
    accept: options.onAccept
  });
}
