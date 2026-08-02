import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { BillingService } from '../../../../services/billing';
import { CreditNoteForm } from './credit-note-form';

describe('CreditNoteForm', () => {
  let component: CreditNoteForm;
  let fixture: ComponentFixture<CreditNoteForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreditNoteForm],
      providers: [
        {
          provide: BillingService,
          useValue: {
            createCreditNote: () => of({}),
            updateCreditNote: () => of({})
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreditNoteForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
