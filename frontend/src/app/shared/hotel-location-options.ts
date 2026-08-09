import type { City, Country, State } from 'country-state-city';

type LocationLibrary = {
  Country: typeof Country;
  State: typeof State;
  City: typeof City;
};

export type HotelLocationDepartment = {
  code: string;
  name: string;
  countryCode: string;
};

export type HotelLocationCountry = {
  code: string;
  name: string;
};

let locationLibraryPromise: Promise<LocationLibrary> | null = null;
let countriesCache: HotelLocationCountry[] | null = null;
let countryCodeByName = new Map<string, string>();
const departmentsByCountry = new Map<string, HotelLocationDepartment[]>();
const citiesByState = new Map<string, string[]>();

export async function loadHotelCountries(): Promise<HotelLocationCountry[]> {
  if (countriesCache) return countriesCache;

  const { Country } = await loadLocationLibrary();
  countriesCache = Country.getAllCountries()
    .map((country) => ({
      code: country.isoCode,
      name: country.name,
    }))
    .sort((first, second) => first.name.localeCompare(second.name, 'es'));

  countryCodeByName = new Map(countriesCache.map((country) => [country.name, country.code]));
  return countriesCache;
}

export async function loadDepartmentsForCountry(
  country: string | null | undefined
): Promise<HotelLocationDepartment[]> {
  const countryCode = await resolveCountryCode(country);
  if (!countryCode) return [];

  const cached = departmentsByCountry.get(countryCode);
  if (cached) return cached;

  const { State } = await loadLocationLibrary();
  const departments = State.getStatesOfCountry(countryCode)
    .map((state) => ({
      code: state.isoCode,
      name: state.name,
      countryCode: state.countryCode,
    }))
    .sort((first, second) => first.name.localeCompare(second.name, 'es'));

  departmentsByCountry.set(countryCode, departments);
  return departments;
}

export async function loadCitiesForDepartment(
  country: string | null | undefined,
  department: string | null | undefined
): Promise<string[]> {
  const countryCode = await resolveCountryCode(country);
  if (!countryCode || !department) return [];

  const departmentOption = (await loadDepartmentsForCountry(countryCode)).find(
    (option) => option.name === department || option.code === department
  );

  if (!departmentOption) return [];
  return loadCitiesForStateCode(countryCode, departmentOption.code);
}

async function resolveCountryCode(country: string | null | undefined): Promise<string> {
  const value = String(country || '').trim();
  if (!value) return '';

  await loadHotelCountries();
  if (countryCodeByName.has(value)) return countryCodeByName.get(value) || '';

  const { Country } = await loadLocationLibrary();
  return Country.getCountryByCode(value)?.isoCode || '';
}

async function loadCitiesForStateCode(countryCode: string, stateCode: string): Promise<string[]> {
  const cacheKey = `${countryCode}:${stateCode}`;
  const cached = citiesByState.get(cacheKey);
  if (cached) return cached;

  const { City } = await loadLocationLibrary();
  const cities = City.getCitiesOfState(countryCode, stateCode)
    .map((city) => city.name)
    .filter((city, index, cityList) => cityList.indexOf(city) === index)
    .sort((first, second) => first.localeCompare(second, 'es'));

  citiesByState.set(cacheKey, cities);
  return cities;
}

function loadLocationLibrary(): Promise<LocationLibrary> {
  locationLibraryPromise ??= import('country-state-city');
  return locationLibraryPromise;
}
