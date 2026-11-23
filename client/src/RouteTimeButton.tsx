import { useState } from "react";
import api from "./lib/api";

type Props = { latitude: number; longitude: number };

export default function RouteTimeButton({ latitude, longitude }: Props) {
  const [label, setLabel] = useState("সময় দেখুন");
  const [busy, setBusy] = useState(false);
  const calculate = () => {
    if (!navigator.geolocation) { setLabel("Location নেই"); return; }
    setBusy(true); setLabel("হিসাব হচ্ছে…");
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const result = await api.get(`/facilities/route?originLat=${position.coords.latitude}&originLng=${position.coords.longitude}&destinationLat=${latitude}&destinationLng=${longitude}`);
        setLabel(`${result.data.data.durationMinutes} মিনিট`);
      } catch { setLabel("সময় পাওয়া যায়নি"); }
      finally { setBusy(false); }
    }, () => { setBusy(false); setLabel("Location অনুমতি দিন"); }, { enableHighAccuracy: false, timeout: 10000 });
  };
  return <button className="route-time-button" type="button" disabled={busy} onClick={calculate}>{label}</button>;
}
