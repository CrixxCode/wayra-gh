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
      phone: [''],
      country: [''],
      document_type: ['CC', [Validators.required]],
      document_number: ['', [Validators.required, Validators.maxLength(40)]]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['client'] || !this.client) return;

    this.clientForm.reset({
      first_name: this.client.first_name || '',
      last_name: this.client.last_name || '',
      email: this.client.email || '',
      phone: this.client.phone || '',
      country: this.client.country || '',
      document_type: this.normalizeDocumentType(this.client.document_type),
      document_number: this.client.document_number || ''
    });

    this.errorMessage = '';
  }

  get first_name() { return this.clientForm.get('first_name'); }
  get last_name() { return this.clientForm.get('last_name'); }
  get email() { return this.clientForm.get('email'); }
  get document_number() { return this.clientForm.get('document_number'); }

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
      phone: raw.phone?.trim() || '',
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
        this.errorMessage = error?.error?.detail || 'No se pudo actualizar el cliente. Verifica los datos e intenta de nuevo.';
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
}
