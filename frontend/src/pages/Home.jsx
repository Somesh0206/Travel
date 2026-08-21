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
import {
  Accessibility, Navigation, MapPin, Clock, Bus, ShieldPlus,
  WifiOff, IndianRupee, Route, ExternalLink, Car, Footprints,
  Building2, Plane, Train, Compass
} from "lucide-react";

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
function computeFare(km, { accessible, night, mode = "transit" }) {
  if (mode === "walking") return 0;
  const base = mode === "driving" ? 30 : 15;
  const perKm = mode === "driving" ? 14 : 8;
  let fare = base + perKm * km;
  if (accessible) fare += 5;
  if (night) fare += 10;
  return Math.max(base, Math.round(fare));
}

export default function Home() {
  const { user, theme } = useAuth();
  const [stops, setStops] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [police, setPolice] = useState([]);
  
  const [d1Query, setD1Query] = useState("");
  const [d2Query, setD2Query] = useState("");
  const [d1, setD1] = useState(null);
  const [d2, setD2] = useState(null);
  
  const [travelMode, setTravelMode] = useState("transit"); // transit | driving | walking
  const [chipTab, setChipTab] = useState("campuses"); // campuses | hubs | stops
  const [wheelchair, setWheelchair] = useState(true);
  const [nightSafe, setNightSafe] = useState(false);
  
  const [userLoc, setUserLoc] = useState(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);

  useEffect(() => {
    api.get("/transit/stops").then((r) => setStops(r.data)).catch(() => {});
    api.get("/transit/campuses").then((r) => setCampuses(r.data)).catch(() => {});
    api.get("/transit/hubs").then((r) => setHubs(r.data)).catch(() => {});
    api.get("/transit/routes").then((r) => setRoutes(r.data)).catch(() => {});
    api.get("/safety/police").then((r) => setPolice(r.data)).catch(() => {});
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

  // Combined searchable locations (Stops, KIIT Campuses, Pan-India Hubs)
  const allLocations = useMemo(() => {
    const list = [...campuses, ...hubs, ...stops];
    // Remove duplicate entries by name
    const unique = [];
    const seen = new Set();
    for (const item of list) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        unique.push(item);
      }
    }
    return unique;
  }, [campuses, hubs, stops]);

  const findLocation = (q) => {
    if (!q?.trim()) return null;
    const lower = q.toLowerCase();
    return allLocations.find((x) => 
      x.name.toLowerCase().includes(lower) || 
      (x.short && x.short.toLowerCase().includes(lower)) ||
      (x.city && x.city.toLowerCase().includes(lower))
    ) || { name: q, lat: 20.3558, lng: 85.8175 }; // fallback lat/lng if custom string
  };

  const plan = () => {
    if (!d1Query.trim() || !d2Query.trim()) {
      toast.error("Please enter both Start and End locations.");
      return;
    }
    const loc1 = findLocation(d1Query);
    const loc2 = findLocation(d2Query);
    setD1(loc1);
    setD2(loc2);
    toast.success(`Route planned: ${loc1.name} → ${loc2.name}`);
  };

  // Direct Google Maps & Apple Maps Navigation Links
  const navUrls = useMemo(() => {
    const originStr = d1Query.trim() || (d1 ? d1.name : "KIIT Square, Bhubaneswar");
    const destStr = d2Query.trim() || (d2 ? d2.name : "Patia, Bhubaneswar");
    const orig = encodeURIComponent(originStr);
    const dest = encodeURIComponent(destStr);
    
    // Google Maps mode mapping
    const gMode = travelMode === "walking" ? "walking" : (travelMode === "driving" ? "driving" : "transit");
    // Apple Maps dirflg mapping (r=transit, d=driving, w=walking)
    const aMode = travelMode === "walking" ? "w" : (travelMode === "driving" ? "d" : "r");

    return {
      google: `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&travelmode=${gMode}`,
      apple: `https://maps.apple.com/?saddr=${orig}&daddr=${dest}&dirflg=${aMode}`,
    };
  }, [d1Query, d2Query, d1, d2, travelMode]);

  const routeStops = useMemo(() => {
    if (!d1 || !d2) return [];
    // Try to find a route containing both stops if available
    const eligible = routes.filter((r) => (wheelchair ? r.accessible : true));
    for (const r of eligible) {
      const iA = r.stops.indexOf(d1.id);
      const iB = r.stops.indexOf(d2.id);
      if (iA !== -1 && iB !== -1) {
        const [lo, hi] = iA < iB ? [iA, iB] : [iB, iA];
        return r.stops.slice(lo, hi + 1).map((sid) => stops.find((s) => s.id === sid)).filter(Boolean);
      }
    }
    // Fallback straight line polyline
    return [d1, d2];
  }, [d1, d2, routes, stops, wheelchair]);

  const suggested = useMemo(() => {
    let list = routes;
    if (wheelchair) list = list.filter((r) => r.accessible);
    if (nightSafe) list = list.filter((r) => r.name.toLowerCase().includes("night") || r.accessible);
    return list;
  }, [routes, wheelchair, nightSafe]);

  // Fare + total km along planned route
  const journey = useMemo(() => {
    if (!d1 || !d2) return null;
    const km = distKm(d1, d2);
    const fare = computeFare(km, { accessible: wheelchair, night: nightSafe, mode: travelMode });
    const estMinutes = travelMode === "walking" 
      ? Math.round(km * 12) 
      : (travelMode === "driving" ? Math.round(km * 2.2 + 5) : Math.round(km * 3 + 8));
    
    return {
      km: km.toFixed(2),
      fare,
      estMinutes,
      stops: routeStops.length > 2 ? routeStops.length : "Direct"
    };
  }, [d1, d2, routeStops, wheelchair, nightSafe, travelMode]);

  const activeChips = useMemo(() => {
    if (chipTab === "campuses") return campuses;
    if (chipTab === "hubs") return hubs;
    return stops;
  }, [chipTab, campuses, hubs, stops]);

  return (
    <div className="min-h-screen mova-hero-grid">
      <Header onBug={() => setBugOpen(true)} />

      <main className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* Left: Interactive Map */}
        <section className="space-y-4">
          <MapView
            theme={theme}
            stops={stops}
            routeStops={routeStops}
            d1={d1}
            d2={d2}
            userLoc={userLoc}
            police={police}
            height="64vh"
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-in">
            <StatCard icon={<Building2 size={18} />} label="KIIT Campuses" value={campuses.length || 10} testId="stat-campuses" />
            <StatCard icon={<Compass size={18} />} label="Pan-India Hubs" value={hubs.length || 10} testId="stat-hubs" />
            <StatCard icon={<Accessibility size={18} />} label="Accessible" value={routes.filter(r => r.accessible).length} testId="stat-access" />
            <StatCard icon={<ShieldPlus size={18} />} label="Police nearby" value={police.length} testId="stat-police" />
          </div>
        </section>

        {/* Right: Journey Planner & Navigation Options */}
        <aside className="space-y-4">
          <Card className="mova-glass" data-testid="plan-card">
            <CardContent className="p-5 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] opacity-60">Pan-India & KIIT Campus Navigator</div>
                <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "Outfit" }}>
                  Where to, {user?.name?.split(" ")[0]}?
                </h2>
              </div>

              {/* Mode Selector (Transit / Driving / Walking) */}
              <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 gap-1" data-testid="mode-selector">
                <button
                  type="button"
                  onClick={() => setTravelMode("transit")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    travelMode === "transit" ? "bg-[#00E5FF] text-black shadow-md" : "hover:text-[#00E5FF] opacity-70"
                  }`}
                >
                  <Bus size={14} /> Public Transit
                </button>
                <button
                  type="button"
                  onClick={() => setTravelMode("driving")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    travelMode === "driving" ? "bg-[#00E5FF] text-black shadow-md" : "hover:text-[#00E5FF] opacity-70"
                  }`}
                >
                  <Car size={14} /> Drive / Cab
                </button>
                <button
                  type="button"
                  onClick={() => setTravelMode("walking")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    travelMode === "walking" ? "bg-[#00E5FF] text-black shadow-md" : "hover:text-[#00E5FF] opacity-70"
                  }`}
                >
                  <Footprints size={14} /> Walk
                </button>
              </div>

              {/* Input Fields */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="d1">From (Origin)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="d1"
                      value={d1Query}
                      onChange={(e) => setD1Query(e.target.value)}
                      list="all-locations-list"
                      placeholder="e.g. KIIT Campus 3 or Biju Patnaik Airport"
                      data-testid="d1-input"
                    />
                    <VoiceInput onResult={(t) => setD1Query(t)} testId="d1-voice" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="d2">To (Destination)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="d2"
                      value={d2Query}
                      onChange={(e) => setD2Query(e.target.value)}
                      list="all-locations-list"
                      placeholder="e.g. Campus 15 (KIMS) or Howrah Stn"
                      data-testid="d2-input"
                    />
                    <VoiceInput onResult={(t) => setD2Query(t)} testId="d2-voice" />
                  </div>
                </div>

                <datalist id="all-locations-list">
                  {allLocations.map((item, idx) => (
                    <option key={idx} value={item.name} />
                  ))}
                </datalist>

                {/* Quick Chips Tabs (KIIT Campuses / Pan-India Hubs / Bus Stops) */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setChipTab("campuses")}
                      className={`pb-1 font-medium transition-colors ${
                        chipTab === "campuses" ? "text-[#00E5FF] border-b-2 border-[#00E5FF]" : "opacity-60 hover:opacity-100"
                      }`}
                    >
                      🎓 KIIT Campuses
                    </button>
                    <button
                      type="button"
                      onClick={() => setChipTab("hubs")}
                      className={`pb-1 font-medium transition-colors ${
                        chipTab === "hubs" ? "text-[#00E5FF] border-b-2 border-[#00E5FF]" : "opacity-60 hover:opacity-100"
                      }`}
                    >
                      ✈️ Pan-India Hubs
                    </button>
                    <button
                      type="button"
                      onClick={() => setChipTab("stops")}
                      className={`pb-1 font-medium transition-colors ${
                        chipTab === "stops" ? "text-[#00E5FF] border-b-2 border-[#00E5FF]" : "opacity-60 hover:opacity-100"
                      }`}
                    >
                      🚏 Bus Stops
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1" data-testid="quick-chips">
                    {activeChips.map((loc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => (!d1Query ? setD1Query(loc.name) : setD2Query(loc.name))}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 hover:border-[#00E5FF]/50 hover:text-[#00E5FF] transition-colors flex items-center gap-1 bg-white/5"
                        data-testid={`chip-${idx}`}
                      >
                        {loc.category === "Airport" && <Plane size={11} />}
                        {loc.category === "Railway Station" && <Train size={11} />}
                        {loc.short || loc.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 text-sm" data-testid="toggle-wheelchair">
                  <Switch checked={wheelchair} onCheckedChange={setWheelchair} /> Wheelchair Access
                </label>
                <label className="flex items-center gap-2 text-sm" data-testid="toggle-night">
                  <Switch checked={nightSafe} onCheckedChange={setNightSafe} /> Night-Safe Ride
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={plan}
                  className="pill-btn bg-[#00E5FF] text-black hover:bg-[#00B8CC] flex-1 font-semibold"
                  data-testid="plan-route-btn"
                >
                  <Navigation size={16} className="mr-1.5" /> Plan Route
                </Button>
                <Button variant="outline" className="pill-btn" onClick={() => setSafetyOpen(true)} data-testid="open-safety-btn">
                  Safety Check-in
                </Button>
              </div>

              {/* Google Maps / Apple Maps Direct Navigation Links */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] opacity-60">External Maps Navigation</div>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={navUrls.google}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all"
                    data-testid="gmaps-btn"
                  >
                    🗺️ Google Maps <ExternalLink size={12} />
                  </a>
                  <a
                    href={navUrls.apple}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold border border-white/20 shadow-sm transition-all"
                    data-testid="apple-maps-btn"
                  >
                    🍎 Apple Maps <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* Journey Details & Fare Estimate */}
              {journey && (
                <div className="rounded-2xl border border-[#00E5FF]/25 bg-[#00E5FF]/5 p-4 mt-2" data-testid="fare-card">
                  <div className="text-xs uppercase tracking-[0.25em] opacity-70 mb-1">Route & Fare Summary</div>
                  <div className="flex items-end gap-4 flex-wrap">
                    <div className="flex items-baseline">
                      <IndianRupee size={22} className="text-[#00E5FF]" />
                      <span className="text-4xl font-bold" style={{ fontFamily: "Outfit" }} data-testid="fare-amount">
                        {journey.fare}
                      </span>
                    </div>
                    <div className="text-sm opacity-80 space-y-0.5">
                      <div className="flex items-center gap-1.5 font-medium text-[#00E5FF]">
                        <Clock size={14} /> ~{journey.estMinutes} mins ({journey.km} km)
                      </div>
                      <div className="flex items-center gap-1.5 opacity-70 text-xs">
                        <span data-testid="fare-from">{d1Query || d1?.name}</span>
                        <span>→</span>
                        <span data-testid="fare-to">{d2Query || d2?.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] opacity-60 mt-2">
                    {travelMode === "walking" ? "Free walking route" : `Base fare + ₹8/km${wheelchair ? " + ₹5 accessible" : ""}${nightSafe ? " + ₹10 night-safe" : ""}`}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Suggested Transit Routes */}
          <Card className="mova-glass" data-testid="suggested-routes">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "Outfit" }}>
                  Active Transit Routes
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
