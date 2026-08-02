import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth/auth';
import { register } from 'swiper/element/bundle';

register();

@Component({
  standalone: true,
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.html',
  styleUrls: ['./forgot-password.css'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    ButtonModule,
    RouterLink,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ForgotPasswordComponent {
  forgotForm: FormGroup;
  isLoading: boolean = false;
  message: string | null = null;
  messageType: 'success' | 'error' | 'warn' | null = null;
  emailSent: boolean = false;

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

  constructor(
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  onSubmit() {
    if (this.forgotForm.invalid) {
      this.message = 'Por favor ingresa un correo valido.';
      this.messageType = 'warn';
      setTimeout(() => (this.message = null), 4000);
      return;
    }

    this.isLoading = true;
    const email = this.forgotForm.value.email;

    this.authService.getCsrfToken().subscribe({
      next: () => {
        const baseUrl = window.location.origin + '/reset-password';
        this.authService.requestPasswordReset(email, baseUrl).subscribe({
          next: (response: { sent?: boolean }) => {
            this.isLoading = false;
            const sent = !!response?.sent;

            if (!sent) {
              this.emailSent = false;
              this.messageType = 'error';
              this.message = 'No fue posible enviar el correo de recuperacion. Verifica la configuracion SMTP del servidor.';
              return;
            }

            this.emailSent = true;
            this.messageType = 'success';
            this.message = 'Hemos enviado un enlace de recuperacion a tu correo electronico. Por favor revisa tu bandeja de entrada.';
          },
          error: (err) => {
            this.isLoading = false;
            this.messageType = 'error';
            if (err.status === 404) {
              this.message = 'No se encontro un usuario con ese correo electronico.';
            } else {
              this.message = 'Ocurrio un error al intentar enviar el correo. Por favor intenta mas tarde.';
            }
          }
        });
      },
      error: () => {
        this.isLoading = false;
        this.messageType = 'error';
        this.message = 'Error de conexion con el servidor.';
      }
    });
  }
}

