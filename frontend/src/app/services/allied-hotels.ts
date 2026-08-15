import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpParams,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AlliedHotel } from '../shared/allied-hotels';

export interface AlliedHotelAvailabilityParams {
  checkIn?: string;
  checkOut?: string;
  rooms?: number;
  guests?: number;
}

@Injectable({ providedIn: 'root' })
export class AlliedHotelService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly alliedHotelsUrl = `${this.apiBase}/api/allied-hotels/`;

  constructor(private http: HttpClient) {}

  listActiveAlliedHotels(
    availability?: AlliedHotelAvailabilityParams
  ): Observable<AlliedHotel[]> {

    let params =
      new HttpParams();

    if (availability?.checkIn) {
      params = params.set('checkIn', availability.checkIn);
    }

    if (availability?.checkOut) {
      params = params.set('checkOut', availability.checkOut);
    }

    if (availability?.rooms) {
      params = params.set('rooms', availability.rooms);
    }

    if (availability?.guests) {
      params = params.set('guests', availability.guests);
    }

    return this.http.get<AlliedHotel[]>(
      this.alliedHotelsUrl,
      {
        params,
      }
    );
  }
}
