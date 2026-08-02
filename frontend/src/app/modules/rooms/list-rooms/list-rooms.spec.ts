import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ListRooms } from './list-rooms';
import { RoomService } from '../../../services/room';

describe('ListRooms', () => {
  let component: ListRooms;
  let fixture: ComponentFixture<ListRooms>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListRooms],
      providers: [
        {
          provide: RoomService,
          useValue: {
            listRooms: () => of([]),
            listRoomTypes: () => of([]),
            listAmenities: () => of([]),
            listFloors: () => of([]),
            listRates: () => of([])
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListRooms);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
