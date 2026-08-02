import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailService } from './detail-service';

describe('DetailService', () => {
  let component: DetailService;
  let fixture: ComponentFixture<DetailService>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailService]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailService);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
