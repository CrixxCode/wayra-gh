import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { Header } from './header';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should describe the desktop action from the sidebar state', () => {
    component.isMobile = false;
    component.asideOpen = true;
    expect(component.menuToggleLabel).toBe('Colapsar menu lateral');
    expect(component.menuToggleIcon).toContain('fa-angles-left');

    component.asideOpen = false;
    expect(component.menuToggleLabel).toBe('Expandir menu lateral');
    expect(component.menuToggleIcon).toContain('fa-bars');
  });

  it('should describe the mobile action from the sidebar state', () => {
    component.isMobile = true;
    component.asideOpen = true;
    expect(component.menuToggleLabel).toBe('Cerrar menu lateral');
    expect(component.menuToggleIcon).toContain('fa-xmark');

    component.asideOpen = false;
    expect(component.menuToggleLabel).toBe('Abrir menu lateral');
    expect(component.menuToggleIcon).toContain('fa-bars');
  });
});
