import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { UpdateReservation } from './update-reservation';
import { ReservationService } from '../../../services/reservation';

describe('UpdateReservation', () => {
  let component: UpdateReservation;
  let fixture: ComponentFixture<UpdateReservation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateReservation],
      providers: [
        {
          provide: ReservationService,
          useValue: {
            updateReservation: () => of({ id: 1 }),
            updateReservationRoom: () => of({ id: 1 }),
            createReservationRoom: () => of({ id: 2 }),
            deleteReservationRoom: () => of(null)
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(UpdateReservation);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
