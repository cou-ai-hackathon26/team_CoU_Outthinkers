import { useState } from "react";
import api from "./lib/api";
import { getFacilityLocation } from "./lib/facility-location";

type Props = { latitude: number; longitude: number };

export default function RouteTimeButton({ latitude, longitude }: Props) {
  const [label, setLabel] = useState("সময় দেখুন");
  const [busy, setBusy] = useState(false);
  const calculate = async () => {
    setBusy(true); setLabel("হিসাব হচ্ছে…");
    try {
      const location = await getFacilityLocation();
      const result = await api.get(`/facilities/route?originLat=${location.latitude}&originLng=${location.longitude}&destinationLat=${latitude}&destinationLng=${longitude}`);
      setLabel(`${result.data.data.durationMinutes} মিনিট${location.approximate ? " · আনুমানিক" : ""}`);
    } catch { setLabel("সময় পাওয়া যায়নি"); }
    finally { setBusy(false); }
  };
  return <button className="route-time-button" type="button" disabled={busy} onClick={calculate}>{label}</button>;
}
