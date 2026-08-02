import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LogoutScreen } from './logout-screen';

describe('LogoutScreen', () => {
  let component: LogoutScreen;
  let fixture: ComponentFixture<LogoutScreen>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogoutScreen]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LogoutScreen);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
