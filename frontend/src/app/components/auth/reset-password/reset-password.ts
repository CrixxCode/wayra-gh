import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../services/auth/auth';
import { register } from 'swiper/element/bundle';

register();

@Component({
    standalone: true,
    selector: 'app-reset-password',
    templateUrl: './reset-password.html',
    styleUrls: ['./reset-password.css'],
    imports: [
        CommonModule,
        ReactiveFormsModule,
        PasswordModule,
        ButtonModule,
        RouterLink,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ResetPasswordComponent implements OnInit {
    resetForm: FormGroup;
    isLoading: boolean = false;
    message: string | null = null;
    messageType: 'success' | 'error' | 'warn' | null = null;
    success: boolean = false;

    uid: string = '';
    token: string = '';

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
        private authService: AuthService,
        private route: ActivatedRoute
    ) {
        this.resetForm = this.fb.group({
            new_password: ['', [Validators.required, Validators.minLength(8)]],
            confirm_password: ['', Validators.required],
        }, { validators: this.passwordMatchValidator });
    }

    ngOnInit() {
        this.route.queryParams.subscribe(params => {
            this.uid = params['uid'] || '';
            this.token = params['token'] || '';

            if (!this.uid || !this.token) {
                this.messageType = 'error';
                this.message = 'Enlace de recuperación inválido o incompleto.';
            }
        });
    }

    passwordMatchValidator(g: FormGroup) {
        return g.get('new_password')?.value === g.get('confirm_password')?.value
            ? null : { mismatch: true };
    }

    onSubmit() {
        if (!this.uid || !this.token) {
            this.messageType = 'error';
            this.message = 'Enlace de recuperación inválido.';
            return;
        }

        if (this.resetForm.invalid) {
            this.messageType = 'warn';
            if (this.resetForm.hasError('mismatch')) {
                this.message = 'Las contraseñas no coinciden.';
            } else {
                this.message = 'La contraseña debe tener al menos 8 caracteres.';
            }
            setTimeout(() => (this.message = null), 4000);
            return;
        }

        this.isLoading = true;
        const { new_password } = this.resetForm.value;

        this.authService.getCsrfToken().subscribe({
            next: () => {
                this.authService.confirmPasswordReset(this.uid, this.token, new_password).subscribe({
                    next: () => {
                        this.isLoading = false;
                        this.success = true;
                        this.messageType = 'success';
                        this.message = 'Tu contraseña ha sido actualizada correctamente.';
                    },
                    error: (err) => {
                        this.isLoading = false;
                        this.messageType = 'error';
                        this.message = err.error?.uid || err.error?.token || 'Error al restablecer la contraseña. Es posible que el enlace haya expirado.';
                    }
                });
            },
            error: () => {
                this.isLoading = false;
                this.messageType = 'error';
                this.message = 'Error de red al conectar con el servidor.';
            }
        });
    }
}
