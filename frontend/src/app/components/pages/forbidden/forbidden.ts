import { CommonModule, Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, MeResponse } from '../../../services/auth/auth';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './forbidden.html',
  styleUrl: './forbidden.css',
})
export class ForbiddenPage implements OnInit {
  requestedPath = '/';
  username = 'Usuario';
  primaryRole = 'Sin rol';

  constructor(
    private router: Router,
    private location: Location,
    private route: ActivatedRoute,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.requestedPath = this.route.snapshot.queryParamMap.get('from') || '/recurso-restringido';
    this.authService.getUserInfo().subscribe({
      next: (user) => this.setUserInfo(user),
      error: () => {
        this.username = 'Usuario';
        this.primaryRole = 'Sin rol';
      },
    });
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  goBack() {
    this.location.back();
  }

  private setUserInfo(user: MeResponse) {
    this.username = user.username || 'Usuario';
    const roleName = Array.isArray(user.roles) && user.roles.length ? user.roles[0]?.name : null;
    this.primaryRole = roleName || 'Usuario';
  }
}
