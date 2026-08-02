import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';

import { UserUpdate } from './update';

describe('UserUpdate', () => {
  let component: UserUpdate;
  let fixture: ComponentFixture<UserUpdate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserUpdate],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        MessageService
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserUpdate);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
