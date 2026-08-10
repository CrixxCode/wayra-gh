import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AmenitiesManager } from '../../rooms/managers/amenities-manager/amenities-manager';

@Component({
  selector: 'app-list-global-amenities',
  standalone: true,
  imports: [CommonModule, RouterLink, AmenitiesManager],
  templateUrl: './list-global-amenities.html',
  styleUrls: ['./list-global-amenities.css']
})
export class ListGlobalAmenities {}
