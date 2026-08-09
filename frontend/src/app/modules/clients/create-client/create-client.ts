import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientsService } from '../../../services/client';
import { ClientI } from '../client-model';

@Component({
  selector: 'app-create-client',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-client.html',
  styleUrls: ['./create-client.css']
})
export class CreateClient {
  @Input() asModal = false;

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<ClientI>();

  readonly phonePrefixes = [
    { code: '+57', label: 'Colombia +57' },
    { code: '+1', label: 'EE. UU. +1' },
    { code: '+52', label: 'Mexico +52' },
    { code: '+34', label: 'Espana +34' },
    { code: '+54', label: 'Argentina +54' },
    { code: '+56', label: 'Chile +56' },
    { code: '+51', label: 'Peru +51' },
  ];

  saving = false;
  errorMessage = '';

  clientForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private clientsService: ClientsService
  ) {
    this.clientForm = this.fb.group({
      first_name: ['', [Validators.required, Validators.maxLength(80)]],
      last_name: ['', [Validators.required, Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email]],
      phone_prefix: ['+57'],
      phone_number: ['', [Validators.pattern(/^\d*$/), Validators.maxLength(20)]],
      country: [''],
      document_type: ['CC', [Validators.required]],
      document_number: ['', [Validators.required, Validators.maxLength(40)]]
    });
  }

  get first_name() { return this.clientForm.get('first_name'); }
  get last_name() { return this.clientForm.get('last_name'); }
  get email() { return this.clientForm.get('email'); }
  get phone_number() { return this.clientForm.get('phone_number'); }
  get document_number() { return this.clientForm.get('document_number'); }

  onPhoneNumberInput(): void {
    const control = this.clientForm.get('phone_number');
    const onlyDigits = String(control?.value || '').replace(/\D/g, '');
    if (control?.value !== onlyDigits) {
      control?.setValue(onlyDigits, { emitEvent: false });
    }
  }

  submit(): void {
    this.errorMessage = '';

    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    this.saving = true;

    const raw = this.clientForm.getRawValue();
    const payload: Partial<ClientI> = {
      first_name: raw.first_name?.trim() || '',
      last_name: raw.last_name?.trim() || '',
      email: raw.email?.trim() || '',
      phone: this.buildPhoneValue(raw.phone_prefix, raw.phone_number),
      country: raw.country?.trim() || '',
      document_type: raw.document_type || 'CC',
      document_number: raw.document_number?.trim() || ''
    };

    this.clientsService.createClient(payload).subscribe({
      next: (createdClient) => {
        this.saving = false;
        this.created.emit(createdClient);
        this.closeDrawer();
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudo crear el cliente. Verifica los datos e intenta de nuevo.');
      }
    });
  }

  closeDrawer(): void {
    if (this.saving) return;
    this.closed.emit();
  }

  private buildPhoneValue(prefix: unknown, number: unknown): string {
    const digits = String(number || '').replace(/\D/g, '');
    if (!digits) return '';
    return `${String(prefix || '+57').trim()}${digits}`;
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const payload = (error as { error?: unknown } | null)?.error;
    if (!payload) return fallback;

    const readMessage = (value: unknown): string | null => {
      if (typeof value === 'string' && value.trim()) return value;
      if (Array.isArray(value)) {
        for (const item of value) {
          const message = readMessage(item);
          if (message) return message;
        }
      }
      if (value && typeof value === 'object') {
        for (const key of Object.keys(value as Record<string, unknown>)) {
          const message = readMessage((value as Record<string, unknown>)[key]);
          if (message) return message;
        }
      }
      return null;
    };

    return readMessage(payload) || fallback;
  }
}
