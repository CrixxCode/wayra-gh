import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { LayoutMain } from './layout-main';

describe('LayoutMain', () => {
  let component: LayoutMain;
  let fixture: ComponentFixture<LayoutMain>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayoutMain],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LayoutMain);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
