import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AlliedHotel } from '../shared/allied-hotels';

@Injectable({ providedIn: 'root' })
export class AlliedHotelService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly alliedHotelsUrl = `${this.apiBase}/api/allied-hotels/`;

  constructor(private http: HttpClient) {}

  listActiveAlliedHotels(): Observable<AlliedHotel[]> {
    return this.http.get<AlliedHotel[]>(this.alliedHotelsUrl);
  }
}
