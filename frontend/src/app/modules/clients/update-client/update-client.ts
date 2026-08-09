import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientsService } from '../../../services/client';
import { ClientI } from '../client-model';

@Component({
  selector: 'app-update-client',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './update-client.html',
  styleUrls: ['./update-client.css']
})
export class UpdateClient implements OnChanges {
  @Input() client: ClientI | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

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

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['client'] || !this.client) return;

    const phoneParts = this.splitPhoneValue(this.client.phone || '');

    this.clientForm.reset({
      first_name: this.client.first_name || '',
      last_name: this.client.last_name || '',
      email: this.client.email || '',
      phone_prefix: phoneParts.prefix,
      phone_number: phoneParts.number,
      country: this.client.country || '',
      document_type: this.normalizeDocumentType(this.client.document_type),
      document_number: this.client.document_number || ''
    });

    this.errorMessage = '';
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

    if (!this.client?.id) {
      this.errorMessage = 'No se encontro el cliente a actualizar.';
      return;
    }

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

    this.clientsService.updateClient(this.client.id, payload).subscribe({
      next: () => {
        this.saving = false;
        this.updated.emit();
        this.closeDrawer();
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudo actualizar el cliente. Verifica los datos e intenta de nuevo.');
      }
    });
  }

  closeDrawer(): void {
    if (this.saving) return;
    this.closed.emit();
  }

  private normalizeDocumentType(value: string | undefined): string {
    if (!value) return 'CC';

    const normalized = value
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z]/g, '')
      .trim();

    if (normalized === 'PASSPORT') return 'PASAPORTE';
    if (normalized === 'PASAPORTE') return 'PASAPORTE';
    if (normalized === 'DNI') return 'DNI';
    if (normalized === 'CE') return 'CE';
    if (normalized === 'CC') return 'CC';

    return 'CC';
  }

  private buildPhoneValue(prefix: unknown, number: unknown): string {
    const digits = String(number || '').replace(/\D/g, '');
    if (!digits) return '';
    return `${String(prefix || '+57').trim()}${digits}`;
  }

  private splitPhoneValue(value: string): { prefix: string; number: string } {
    const compact = String(value || '').replace(/[\s()-]/g, '');
    const prefixes = [...this.phonePrefixes]
      .map((prefix) => prefix.code)
      .sort((a, b) => b.length - a.length);

    for (const prefix of prefixes) {
      if (compact.startsWith(prefix)) {
        return {
          prefix,
          number: compact.slice(prefix.length).replace(/\D/g, ''),
        };
      }
    }

    return {
      prefix: '+57',
      number: compact.replace(/\D/g, ''),
    };
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
