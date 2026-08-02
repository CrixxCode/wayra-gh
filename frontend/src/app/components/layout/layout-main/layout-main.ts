import { Component, HostListener, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from '../header/header';
import { Aside } from '../aside/aside';
import { Content } from '../content/content';
import { CommonModule } from '@angular/common';
import { GuidedTour } from '../../tutorial/guided-tour/guided-tour';

@Component({
  selector: 'app-layout-main',
  imports: [Header, Aside, Content, CommonModule, GuidedTour],
  templateUrl: './layout-main.html',
  styleUrl: './layout-main.css'
})
export class LayoutMain {
  asideOpen = true;
  isMobile = false;

  ngOnInit() {
    this.checkScreen();
  }

  toggleAside() {
    this.asideOpen = !this.asideOpen;
  }

  isAsideOpen() {
    return this.asideOpen;
  }

  @HostListener('window:resize')
  checkScreen() {
    this.isMobile = window.innerWidth < 768; // breakpoint md
    if (this.isMobile) this.asideOpen = false; // colapsar por defecto en móviles
  }
}
