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

  get first_name() { return this.clientForm.get('first_name'); }
  get last_name() { return this.clientForm.get('last_name'); }
  get email() { return this.clientForm.get('email'); }
  get document_number() { return this.clientForm.get('document_number'); }

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
      phone: raw.phone?.trim() || '',
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
        this.errorMessage = error?.error?.detail || 'No se pudo crear el cliente. Verifica los datos e intenta de nuevo.';
      }
    });
  }

  closeDrawer(): void {
    if (this.saving) return;
    this.closed.emit();
  }
}
