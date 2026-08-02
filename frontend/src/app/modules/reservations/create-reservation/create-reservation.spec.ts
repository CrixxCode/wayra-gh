import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CreateReservation } from './create-reservation';
import { ReservationService } from '../../../services/reservation';

describe('CreateReservation', () => {
  let component: CreateReservation;
  let fixture: ComponentFixture<CreateReservation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateReservation],
      providers: [
        {
          provide: ReservationService,
          useValue: {
            createReservation: () => of({ id: 1 }),
            createReservationRoom: () => of({ id: 1 })
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CreateReservation);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
