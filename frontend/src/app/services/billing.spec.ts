import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AuthService } from './auth/auth';
import { BillingService } from './billing';
import { InvoiceI, PaymentI } from '../modules/billing/billing-model';

class AuthServiceMock {
  buildCsrfRequestOptions() {
    return { withCredentials: true };
  }
}

describe('BillingService', () => {
  let service: BillingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: AuthServiceMock }
      ]
    });
    service = TestBed.inject(BillingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send backend filter params for invoice listing', () => {
    service
      .listInvoices({
        search: 'FAC-2026',
        ordering: '-id',
        reservation: 77,
        is_active: true
      })
      .subscribe();

    const request = httpMock.expectOne((req) => req.method === 'GET' && req.url.endsWith('/api/invoices/'));

    expect(request.request.params.get('search')).toBe('FAC-2026');
    expect(request.request.params.get('ordering')).toBe('-id');
    expect(request.request.params.get('reservation')).toBe('77');
    expect(request.request.params.get('is_active')).toBe('true');
    expect(request.request.withCredentials).toBeTrue();

    request.flush({ results: [] });
  });

  it('should unwrap paginated invoices without applying local reservation filtering', () => {
    let result: InvoiceI[] = [];

    service.listInvoices({ reservation: 999 }).subscribe((rows) => {
      result = rows;
    });

    const request = httpMock.expectOne((req) => req.method === 'GET' && req.url.endsWith('/api/invoices/'));
    request.flush({
      results: [
        {
          id: 1,
          reservation: 1,
          status: 1,
          invoice_number: 'FAC-001',
          subtotal: 10,
          tax_amount: 0,
          total_amount: 10,
          is_active: true
        }
      ]
    });

    expect(result.length).toBe(1);
    expect(Number(result[0].reservation)).toBe(1);
  });

  it('should send backend filter params for payment listing', () => {
    let result: PaymentI[] = [];

    service
      .listPayments({
        search: 'transfer',
        ordering: '-payment_date',
        invoice: 55,
        is_active: false
      })
      .subscribe((rows) => {
        result = rows;
      });

    const request = httpMock.expectOne((req) => req.method === 'GET' && req.url.endsWith('/api/payments/'));

    expect(request.request.params.get('search')).toBe('transfer');
    expect(request.request.params.get('ordering')).toBe('-payment_date');
    expect(request.request.params.get('invoice')).toBe('55');
    expect(request.request.params.get('is_active')).toBe('false');

    request.flush({
      results: [
        {
          id: 2,
          invoice: 55,
          payment_method: 1,
          amount: 20,
          is_active: false
        }
      ]
    });

    expect(result.length).toBe(1);
    expect(result[0].invoice).toBe(55);
    expect(result[0].is_active).toBeFalse();
  });
});
