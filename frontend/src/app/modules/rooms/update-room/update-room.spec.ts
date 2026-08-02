import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { UpdateRoom } from './update-room';
import { RoomService } from '../../../services/room';

describe('UpdateRoom', () => {
  let component: UpdateRoom;
  let fixture: ComponentFixture<UpdateRoom>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateRoom],
      providers: [
        {
          provide: RoomService,
          useValue: {
            updateRoom: () => of({})
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateRoom);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
