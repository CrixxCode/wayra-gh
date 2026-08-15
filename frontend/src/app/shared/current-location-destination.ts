export interface CurrentLocationDestinationOption {
  city: string;
  country: string;
}

export interface CurrentLocationDestinationResult {
  destination: string;
}

interface ReverseGeocodeResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
  countryCode?: string;
}

export async function resolveCurrentLocationDestination(
  options: CurrentLocationDestinationOption[]
): Promise<CurrentLocationDestinationResult> {

  if (!navigator.geolocation) {
    throw new Error('Tu navegador no permite usar tu ubicacion.');
  }

  const position =
    await getCurrentPosition();

  const location =
    await reverseGeocodePosition(
      position.coords.latitude,
      position.coords.longitude
    );

  const match =
    findDestinationMatch(options, location);

  if (!match) {
    throw new Error('No encontramos destinos aliados para tu ubicacion.');
  }

  return match;
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      () => {
        reject(new Error('No pudimos acceder a tu ubicacion.'));
      },
      {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: 10000,
      }
    );
  });
}

async function reverseGeocodePosition(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResponse> {
  const params =
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: 'es',
    });

  const response =
    await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?${params.toString()}`
    );

  if (!response.ok) {
    throw new Error('No pudimos identificar tu ciudad.');
  }

  return response.json() as Promise<ReverseGeocodeResponse>;
}

function findDestinationMatch(
  options: CurrentLocationDestinationOption[],
  location: ReverseGeocodeResponse
): CurrentLocationDestinationResult | null {

  const cityCandidates =
    [
      location.city,
      location.locality,
      location.principalSubdivision,
    ]
      .map(normalizeText)
      .filter(Boolean);

  const countryCandidates =
    [
      location.countryName,
      location.countryCode,
    ]
      .map(normalizeText)
      .filter(Boolean);

  const exactCity =
    options.find(
      (option) =>
        cityCandidates.includes(normalizeText(option.city)) &&
        matchesCountry(option.country, countryCandidates)
    );

  if (exactCity) {
    return {
      destination: exactCity.city,
    };
  }

  const countryMatch =
    options.find(
      (option) =>
        matchesCountry(option.country, countryCandidates)
    );

  if (countryMatch) {
    return {
      destination: countryMatch.country,
    };
  }

  return null;
}

function matchesCountry(
  country: string,
  countryCandidates: string[]
): boolean {
  const normalizedCountry =
    normalizeText(country);

  return countryCandidates.some(
    (candidate) =>
      candidate === normalizedCountry ||
      normalizedCountry.includes(candidate) ||
      candidate.includes(normalizedCountry)
  );
}

function normalizeText(value: string | undefined): string {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
