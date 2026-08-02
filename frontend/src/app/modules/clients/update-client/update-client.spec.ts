import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { UpdateClient } from './update-client';

describe('UpdateClient', () => {
  let component: UpdateClient;
  let fixture: ComponentFixture<UpdateClient>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateClient],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateClient);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
