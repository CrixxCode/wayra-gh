import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailPackage } from './detail-package';

describe('DetailPackage', () => {
  let component: DetailPackage;
  let fixture: ComponentFixture<DetailPackage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailPackage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailPackage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
