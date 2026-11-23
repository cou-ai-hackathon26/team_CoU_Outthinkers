import axios from "axios";
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../auth/auth-token";

const router = Router();
router.use(requireAuth, requireRole("PATIENT", "NURSE", "ADMIN"));

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(bLat - aLat); const dLng = radians(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get("/nearby", async (request, response) => {
  const latitude = Number(request.query.latitude); const longitude = Number(request.query.longitude);
  const radius = Math.min(Math.max(Number(request.query.radius) || 10000, 500), 50000);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { response.status(400).json({ error: "সঠিক location দিন।" }); return; }

  const span = radius / 111000;
  const curated = await prisma.facility.findMany({ where: { status: "VERIFIED", latitude: { gte: latitude - span, lte: latitude + span }, longitude: { gte: longitude - span, lte: longitude + span } }, orderBy: { nameBn: "asc" }, take: 50 });
  const trusted = curated.map(item => ({ id: item.id, name: item.nameBn, address: item.addressBn, phone: item.phone, latitude: item.latitude, longitude: item.longitude, distanceKm: Number(distanceKm(latitude, longitude, item.latitude, item.longitude).toFixed(2)), services: item.services, source: "CURATED", trusted: true, verifiedAt: item.verifiedAt, googleMapsUri: item.googlePlaceId ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(item.googlePlaceId)}` : null })).filter(item => item.distanceKm * 1000 <= radius).sort((a, b) => a.distanceKm - b.distanceKm);

  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) { response.json({ data: { facilities: trusted, google: { available: false, message: "Google Maps API key configured নয়।" } } }); return; }
  try {
    const result = await axios.post("https://places.googleapis.com/v1/places:searchNearby", { includedTypes: ["hospital", "medical_clinic"], maxResultCount: 10, rankPreference: "DISTANCE", languageCode: "bn", regionCode: "BD", locationRestriction: { circle: { center: { latitude, longitude }, radius } } }, { timeout: 8000, headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.primaryType,places.businessStatus" } });
    const discovered = (result.data?.places || []).map((place: any) => ({ id: place.id, name: place.displayName?.text || "নাম পাওয়া যায়নি", address: place.formattedAddress || "ঠিকানা পাওয়া যায়নি", latitude: place.location?.latitude, longitude: place.location?.longitude, distanceKm: Number(distanceKm(latitude, longitude, place.location?.latitude, place.location?.longitude).toFixed(2)), services: {}, source: "GOOGLE_PLACES", trusted: false, status: "UNVERIFIED", googleMapsUri: place.googleMapsUri || null, primaryType: place.primaryType || null, businessStatus: place.businessStatus || null }));
    response.json({ data: { facilities: [...trusted, ...discovered], google: { available: true } } });
  } catch (error: any) {
    console.error("Google nearby facility search failed", error.response?.data || error.message);
    response.json({ data: { facilities: trusted, google: { available: false, message: "Google facility search সাময়িকভাবে unavailable।" } } });
  }
});

export default router;
