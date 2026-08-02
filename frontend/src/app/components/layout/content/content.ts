import { Component } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MenuItem } from 'primeng/api';
import { RouterOutlet } from '@angular/router';
import { BreadcrumbModule } from 'primeng/breadcrumb';

@Component({
  selector: 'app-content',
  imports: [RouterOutlet, BreadcrumbModule],
  templateUrl: './content.html',
  styleUrl: './content.css',
  standalone: true,
})
export class Content {
  items: MenuItem[] = [];
  home: MenuItem = { icon: 'pi pi-home', routerLink: '/dashboard' };

  constructor(private router: Router, private route: ActivatedRoute) {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.buildBreadcrumb();
      });
  }

  buildBreadcrumb() {
    const routeLabel = this.getRouteLabel();
    if (routeLabel) {
      this.items = [{ label: routeLabel }];
      return;
    }

    const segments = this.router.url.split('/').filter((seg) => seg);
    this.items = segments.map((seg, index) => {
      const url = '/' + segments.slice(0, index + 1).join('/');
      return { label: this.formatLabel(seg), routerLink: url };
    });
  }

  private getRouteLabel(): string | null {
    let current = this.route.snapshot;
    while (current.firstChild) {
      current = current.firstChild;
    }

    return current.data?.['breadcrumbLabel'] || null;
  }

  private formatLabel(segment: string): string {
    const normalizedSegment = decodeURIComponent(segment).toLowerCase();

    return normalizedSegment
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
