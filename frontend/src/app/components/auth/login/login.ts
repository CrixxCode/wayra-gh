import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth/auth';
import { LoadingScreen } from '../../pages/loading-screen/loading-screen';
import { register } from 'swiper/element/bundle';

register();

@Component({
  standalone: true,
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ButtonModule,
    RouterLink,
    LoadingScreen,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class LoginComponent {
  loginForm: FormGroup;
  showLoading: boolean = false;
  errorMessage: string | null = null;
  errorType: 'error' | 'warn' | null = null;

  backgrounds = [
    'login/fondo-login-1.jpg',
    'login/fondo-login-2.jpg',
    'login/fondo-login-3.jpg',
    'login/fondo-login-4.jpg',
    'login/fondo-login-5.jpg',
    'login/fondo-login-6.jpg',
    'login/fondo-login-7.jpg',
    'login/fondo-login-8.jpg',
    'login/fondo-login-9.jpg',
    'login/fondo-login-10.jpg',
  ];

  swiperConfig = {
    loop: true,
    effect: 'fade',
    speed: 1500,
    allowTouchMove: false,
    autoplay: {
      delay: 4000,
      disableOnInteraction: false,
    },
  };

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private messageService: MessageService
  ) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
      rememberMe: [false],
    });
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      this.errorMessage = 'Por favor completa todos los campos.';
      this.errorType = 'warn';
      setTimeout(() => (this.errorMessage = null), 4000);
      return;
    }

    const { username, password } = this.loginForm.value;

    this.authService.login(username, password).subscribe({
      next: (res) => {
        this.errorMessage = null;
        this.showLoading = true;

        const isFirstLogin = Boolean(res?.is_first_login);
        const mustChangePassword = Boolean(
          res?.must_change_password ?? res?.user?.must_change_password
        );

        setTimeout(() => {
          this.showLoading = false;

          if (mustChangePassword) {
            this.router.navigate(['/mi-perfil'], {
              queryParams: {
                forcePasswordChange: 1,
                tab: 'password',
              },
            }).then(() => {
              if (isFirstLogin) {
                this.showWelcomeToast();
              }
            });
            return;
          }

          this.router.navigate(['/dashboard']).then(() => {
            if (isFirstLogin) {
              this.showWelcomeToast();
            }
          });
        }, 2000);
      },
      error: (err) => {
        const msg = err.error?.detail || '';

        if (msg.includes('Faltan credenciales')) {
          this.errorMessage = 'Por favor ingresa tu usuario y contrasena.';
          this.errorType = 'warn';
        } else if (msg.includes('Credenciales')) {
          this.errorMessage = 'Usuario o contrasena incorrectos.';
          this.errorType = 'error';
        } else if (msg.includes('Usuario inactivo')) {
          this.errorMessage = 'Tu cuenta esta inactiva. Contacta al administrador.';
          this.errorType = 'warn';
        } else if (msg.includes('Debes cambiar tu contrasena antes de continuar') || msg.includes('Debes cambiar tu contraseña antes de continuar')) {
          this.errorMessage = 'Debes cambiar tu contrasena antes de continuar.';
          this.errorType = 'warn';
        } else {
          this.errorMessage = 'No se pudo iniciar sesion. Intenta nuevamente.';
          this.errorType = 'error';
        }

        setTimeout(() => (this.errorMessage = null), 4000);
      },
    });
  }

  private showWelcomeToast(): void {
    this.messageService.add({
      key: 'auth',
      severity: 'success',
      summary: 'Bienvenido',
      detail: 'Este es tu primer inicio de sesion. Bienvenido al sistema.',
      life: 4500,
    });
  }
}
