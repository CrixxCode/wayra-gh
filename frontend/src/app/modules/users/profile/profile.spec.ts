import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { UserProfile } from './profile';
import { UserService } from '../../../services/user';

describe('UserProfile', () => {
  let component: UserProfile;
  let fixture: ComponentFixture<UserProfile>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserProfile],
      providers: [
        {
          provide: UserService,
          useValue: {
            getUserRoles: () => of({ roles: [], active_role_ids: [] }),
            setUserRoles: () => of(null),
          },
        },
        MessageService,
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserProfile);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
