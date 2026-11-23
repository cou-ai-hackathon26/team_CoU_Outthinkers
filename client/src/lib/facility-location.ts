import api from "./api";

export type FacilityLocation = { latitude: number; longitude: number; approximate: boolean; label?: string };

export async function getFacilityLocation(): Promise<FacilityLocation> {
  if (navigator.geolocation) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000 }));
      return { latitude: position.coords.latitude, longitude: position.coords.longitude, approximate: false };
    } catch { /* Fall through to registered-area lookup. */ }
  }
  const result = await api.get("/facilities/location-for-me");
  return result.data.data as FacilityLocation;
}
