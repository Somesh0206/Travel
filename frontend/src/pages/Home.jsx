import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import MapView from "@/components/MapView";
import SOSButton from "@/components/SOSButton";
import SafetyCheckInDialog from "@/components/SafetyCheckInDialog";
import BugReportDialog from "@/components/BugReportDialog";
import VoiceInput from "@/components/VoiceInput";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Accessibility, Navigation, MapPin, Clock, Bus, ShieldPlus, WifiOff, IndianRupee, Route } from "lucide-react";

// Haversine distance in km
function distKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// Base ₹15 + ₹8/km, accessible +₹5, night +₹10
function computeFare(km, { accessible, night }) {
  const base = 15;
  const perKm = 8;
  let fare = base + perKm * km;
  if (accessible) fare += 5;
  if (night) fare += 10;
  return Math.max(15, Math.round(fare));
}

export default function Home() {
  const { user, theme } = useAuth();
  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [police, setPolice] = useState([]);
  const [d1Query, setD1Query] = useState("");
  const [d2Query, setD2Query] = useState("");
  const [d1, setD1] = useState(null);
  const [d2, setD2] = useState(null);
  const [wheelchair, setWheelchair] = useState(true);
  const [nightSafe, setNightSafe] = useState(false);
  const [userLoc, setUserLoc] = useState(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);

  useEffect(() => {
    api.get("/transit/stops").then((r) => setStops(r.data));
    api.get("/transit/routes").then((r) => setRoutes(r.data));
    api.get("/safety/police").then((r) => setPolice(r.data));
  }, []);

  useEffect(() => {
    // Ask user for safety contact once (skip admin)
    if (user && user.role !== "admin" && !user.alt_phone) setSafetyOpen(true);
  }, [user]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);
        api.post("/location/update", loc).catch(() => {});
      },
      () => { /* denied - fall back to KIIT center */ },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const findStop = (q) => {
    if (!q?.trim()) return null;
    const s = stops.find((x) => x.name.toLowerCase().includes(q.toLowerCase()));
    return s || null;
  };

  const plan = () => {
    const s1 = findStop(d1Query);
    const s2 = findStop(d2Query);
    if (!s1 || !s2) {
      toast.error("Could not find one or both stops. Try names like 'KIIT Square' or 'Kalinga Hospital'.");
      return;
    }
    setD1(s1); setD2(s2);
    toast.success(`Route planned: ${s1.name} → ${s2.name}`);
  };

  const routeStops = useMemo(() => {
    if (!d1 || !d2) return [];
    // Try to find a route containing both
    const eligible = routes.filter((r) => (wheelchair ? r.accessible : true));
    for (const r of eligible) {
      const iA = r.stops.indexOf(d1.id);
      const iB = r.stops.indexOf(d2.id);
      if (iA !== -1 && iB !== -1) {
        const [lo, hi] = iA < iB ? [iA, iB] : [iB, iA];
        return r.stops.slice(lo, hi + 1).map((sid) => stops.find((s) => s.id === sid)).filter(Boolean);
      }
    }
    // Fallback: straight line
    return [d1, d2];
  }, [d1, d2, routes, stops, wheelchair]);

  const suggested = useMemo(() => {
    let list = routes;
    if (wheelchair) list = list.filter((r) => r.accessible);
    if (nightSafe) list = list.filter((r) => r.name.toLowerCase().includes("night") || r.accessible);
    return list;
  }, [routes, wheelchair, nightSafe]);

  // Fare + total km along planned polyline
  const journey = useMemo(() => {
    if (routeStops.length < 2) return null;
    let km = 0;
    for (let i = 1; i < routeStops.length; i++) km += distKm(routeStops[i - 1], routeStops[i]);
    const fare = computeFare(km, { accessible: wheelchair, night: nightSafe });
    return { km: km.toFixed(2), fare, stops: routeStops.length };
  }, [routeStops, wheelchair, nightSafe]);

  return (
    <div className="min-h-screen mova-hero-grid">
      <Header onBug={() => setBugOpen(true)} />

      <main className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* Left: Map */}
        <section className="space-y-4">
          <MapView theme={theme} stops={stops} routeStops={routeStops}
            d1={d1} d2={d2} userLoc={userLoc} police={police} height="62vh" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-in">
            <StatCard icon={<Bus size={18} />} label="Routes" value={routes.length} testId="stat-routes" />
            <StatCard icon={<MapPin size={18} />} label="Stops" value={stops.length} testId="stat-stops" />
            <StatCard icon={<Accessibility size={18} />} label="Accessible" value={routes.filter(r=>r.accessible).length} testId="stat-access" />
            <StatCard icon={<ShieldPlus size={18} />} label="Police nearby" value={police.length} testId="stat-police" />
          </div>
        </section>

        {/* Right: Panel */}
        <aside className="space-y-4">
          <Card className="mova-glass" data-testid="plan-card">
            <CardContent className="p-5 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] opacity-60">Plan a journey</div>
                <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "Outfit" }}>
                  Where to, {user?.name?.split(" ")[0]}?
                </h2>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="d1">Start (Destination 1)</Label>
                  <div className="flex gap-2">
                    <Input id="d1" value={d1Query} onChange={(e) => setD1Query(e.target.value)}
                      list="stops-list" placeholder="KIIT Square" data-testid="d1-input" />
                    <VoiceInput onResult={(t) => setD1Query(t)} testId="d1-voice" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d2">End (Destination 2)</Label>
                  <div className="flex gap-2">
                    <Input id="d2" value={d2Query} onChange={(e) => setD2Query(e.target.value)}
                      list="stops-list" placeholder="Kalinga Hospital" data-testid="d2-input" />
                    <VoiceInput onResult={(t) => setD2Query(t)} testId="d2-voice" />
                  </div>
                </div>
                <datalist id="stops-list">
                  {stops.map((s) => <option key={s.id} value={s.name} />)}
                </datalist>
                <div className="flex flex-wrap gap-1.5 pt-1" data-testid="stop-chips">
                  {stops.slice(0, 6).map((s) => (
                    <button key={s.id} type="button"
                      onClick={() => (!d1Query ? setD1Query(s.name) : setD2Query(s.name))}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 hover:border-[#00E5FF]/50 hover:text-[#00E5FF] transition-colors"
                      data-testid={`chip-${s.id}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 text-sm" data-testid="toggle-wheelchair">
                  <Switch checked={wheelchair} onCheckedChange={setWheelchair} /> Wheelchair
                </label>
                <label className="flex items-center gap-2 text-sm" data-testid="toggle-night">
                  <Switch checked={nightSafe} onCheckedChange={setNightSafe} /> Night-safe
                </label>
              </div>

              <div className="flex gap-2">
                <Button onClick={plan} className="pill-btn bg-[#00E5FF] text-black hover:bg-[#00B8CC] flex-1"
                  data-testid="plan-route-btn">
                  <Navigation size={16} className="mr-1.5" /> Plan route
                </Button>
                <Button variant="outline" className="pill-btn" onClick={() => setSafetyOpen(true)} data-testid="open-safety-btn">
                  Safety check-in
                </Button>
              </div>

              {journey && (
                <div className="rounded-2xl border border-[#00E5FF]/25 bg-[#00E5FF]/5 p-4 mt-2" data-testid="fare-card">
                  <div className="text-xs uppercase tracking-[0.25em] opacity-70 mb-1">Fare estimate</div>
                  <div className="flex items-end gap-4 flex-wrap">
                    <div className="flex items-baseline">
                      <IndianRupee size={22} className="text-[#00E5FF]" />
                      <span className="text-4xl font-bold" style={{ fontFamily: "Outfit" }} data-testid="fare-amount">
                        {journey.fare}
                      </span>
                    </div>
                    <div className="text-sm opacity-80 space-y-0.5">
                      <div className="flex items-center gap-1.5"><Route size={13} /> {journey.km} km · {journey.stops} stops</div>
                      <div className="flex items-center gap-1.5 opacity-70">
                        <span data-testid="fare-from">{d1?.name}</span>
                        <span>→</span>
                        <span data-testid="fare-to">{d2?.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] opacity-60 mt-2">
                    ₹15 base + ₹8/km{wheelchair ? " + ₹5 accessible" : ""}{nightSafe ? " + ₹10 night-safe" : ""}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mova-glass" data-testid="suggested-routes">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "Outfit" }}>
                  Suggested routes
                </h3>
                <Badge variant="outline" className="border-white/15">
                  <Clock size={12} className="mr-1" /> Live
                </Badge>
              </div>
              <div className="space-y-2 stagger-in">
                {suggested.length === 0 && (
                  <div className="text-sm opacity-60">No routes match your filters.</div>
                )}
                {suggested.map((r) => {
                  const rStops = r.stops.map(sid => stops.find(s => s.id === sid)).filter(Boolean);
                  let rkm = 0;
                  for (let i = 1; i < rStops.length; i++) rkm += distKm(rStops[i-1], rStops[i]);
                  const rFare = computeFare(rkm, { accessible: r.accessible, night: r.name.toLowerCase().includes("night") });
                  return (
                    <div key={r.id} className="p-3 rounded-xl border border-white/10 hover:border-[#00E5FF]/40 transition-colors"
                      data-testid={`route-item-${r.id}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{r.name}</div>
                          <div className="text-xs opacity-70">{r.vehicle} · {r.stops.length} stops · {rkm.toFixed(1)} km</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-[#00E5FF]" style={{ fontFamily: "Outfit" }}>{r.eta_min}m</div>
                          <div className="text-xs opacity-80 inline-flex items-center gap-0.5" data-testid={`route-fare-${r.id}`}>
                            <IndianRupee size={11} />{rFare}
                          </div>
                          {r.accessible && (
                            <div className="text-[10px] inline-flex items-center gap-1 opacity-80 ml-2">
                              <Accessibility size={11} /> Accessible
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 text-xs opacity-60 inline-flex items-center gap-1.5">
                <WifiOff size={12} /> Tip: Offline tab shows cached routes if signal drops.
              </div>
            </CardContent>
          </Card>
        </aside>
      </main>

      <SOSButton userLoc={userLoc} police={police} onOpenSafety={() => setSafetyOpen(true)} />
      <SafetyCheckInDialog open={safetyOpen} onOpenChange={setSafetyOpen} />
      <BugReportDialog open={bugOpen} onOpenChange={setBugOpen} />
    </div>
  );
}

function StatCard({ icon, label, value, testId }) {
  return (
    <div className="p-4 rounded-2xl mova-glass border" data-testid={testId}>
      <div className="flex items-center justify-between opacity-80">
        <span className="text-xs uppercase tracking-[0.2em]">{label}</span>
        <span className="text-[#00E5FF]">{icon}</span>
      </div>
      <div className="text-3xl font-bold mt-1" style={{ fontFamily: "Outfit" }}>{value}</div>
    </div>
  );
}
