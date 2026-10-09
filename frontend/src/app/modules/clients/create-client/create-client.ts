import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientsService } from '../../../services/client';
import { MasterDataService } from '../../../services/master-data.service';
import { ClientI } from '../client-model';
import { HotelLocationCountry, loadHotelCountries } from '../../../shared/hotel-location-options';

@Component({
  selector: 'app-create-client',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-client.html',
  styleUrls: ['./create-client.css']
})
export class CreateClient implements OnInit {
  @Input() asModal = false;

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<ClientI>();

  saving = false;
  errorMessage = '';
  countryOptions: HotelLocationCountry[] = [];

  clientForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private clientsService: ClientsService,
    private masterDataService: MasterDataService
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

  /**
   * Tipos de documento del catalogo (`DOCUMENT_TYPE`). Antes iban fijos en el HTML: un tipo
   * nuevo en Master Data nunca aparecia aqui (auditoria, Bloque 5 #5). La lista fija queda
   * solo como respaldo si el catalogo no carga.
   */
  documentTypes: Array<{ code: string; name: string }> = [
    { code: 'CC', name: 'CC' },
    { code: 'CE', name: 'CE' },
    { code: 'DNI', name: 'DNI' },
    { code: 'PASAPORTE', name: 'Pasaporte' }
  ];

  ngOnInit(): void {
    void this.loadCountryOptions();
    this.masterDataService
      .listMasterData({ group: 'DOCUMENT_TYPE', is_active: 'true' })
      .subscribe({
        next: (rows) => {
          const options = (rows || [])
            .filter((row) => !!row.code)
            .map((row) => ({ code: String(row.code), name: String(row.name || row.code) }));
          if (options.length) this.documentTypes = options;
        },
        error: () => undefined
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

  private async loadCountryOptions(): Promise<void> {
    this.countryOptions = await loadHotelCountries();
  }
}
