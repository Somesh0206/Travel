import { useEffect, useMemo, useState, useRef } from "react";
import Header from "@/components/Header";
import MapView from "@/components/MapView";
import SOSButton from "@/components/SOSButton";
import SafetyCheckInDialog from "@/components/SafetyCheckInDialog";
import BugReportDialog from "@/components/BugReportDialog";
import EncryptedChatModal from "@/components/EncryptedChatModal";
import VoiceInput from "@/components/VoiceInput";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import {
  Accessibility, Navigation, MapPin, Clock, Bus, ShieldPlus,
  WifiOff, IndianRupee, Route, ExternalLink, Car, Footprints,
  Building2, Plane, Train, Globe, MousePointerClick, CornerUpRight, Search,
  Volume2, ShieldCheck, AlertTriangle, Users, MessageSquare, Radio, Bell, Compass
} from "lucide-react";

// Haversine fallback distance in km
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
  const nav = useNavigate();
  const [stops, setStops] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [police, setPolice] = useState([]);
  
  const [d1Query, setD1Query] = useState("");
  const [d2Query, setD2Query] = useState("");
  const [d1, setD1] = useState(null);
  const [d2, setD2] = useState(null);

  // Suggestion Dropdown states (Never auto-writes as user types)
  const [d1Suggestions, setD1Suggestions] = useState([]);
  const [d2Suggestions, setD2Suggestions] = useState([]);
  const [showD1Menu, setShowD1Menu] = useState(false);
  const [showD2Menu, setShowD2Menu] = useState(false);
  
  const [travelMode, setTravelMode] = useState("transit"); // transit | driving | walking
  const [chipTab, setChipTab] = useState("hubs"); // hubs | campuses | stops
  
  // Accessibility filters (Module 2)
  const [wheelchair, setWheelchair] = useState(true);
  const [nightSafe, setNightSafe] = useState(false);
  const [elderlyPriority, setElderlyPriority] = useState(false);
  const [voiceAssistance, setVoiceAssistance] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  
  const [userLoc, setUserLoc] = useState(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  
  // Assistance Request Dialog state (Module 2)
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistStop, setAssistStop] = useState("");
  const [assistType, setAssistType] = useState("Wheelchair Ramp Assistance");
  const [assistNote, setAssistNote] = useState("");
  const [assistRouteId, setAssistRouteId] = useState("r1");

  // Crowding / Delay Report Dialog (Module 3)
  const [reportOpen, setReportOpen] = useState(false);
  const [reportRouteId, setReportRouteId] = useState("r1");
  const [reportCrowd, setReportCrowd] = useState("Moderate");
  const [reportDelay, setReportDelay] = useState(5);

  // Road-following navigation polyline data from OSRM
  const [roadData, setRoadData] = useState(null);

  // Dedicated Bus Route Road Geometry Selection
  const [activeBusRouteRoad, setActiveBusRouteRoad] = useState(null);
  
  // Interactive Map Click Selection Mode ("origin" | "destination" | null)
  const [mapClickTarget, setMapClickTarget] = useState(null);

  const d1ContainerRef = useRef(null);
  const d2ContainerRef = useRef(null);

  const fetchRoutes = () => {
    api.get("/transit/routes").then((r) => setRoutes(r.data)).catch(() => {});
  };

  useEffect(() => {
    api.get("/transit/stops").then((r) => setStops(r.data)).catch(() => {});
    api.get("/transit/campuses").then((r) => setCampuses(r.data)).catch(() => {});
    api.get("/transit/hubs").then((r) => setHubs(r.data)).catch(() => {});
    api.get("/safety/police").then((r) => setPolice(r.data)).catch(() => {});
    fetchRoutes();
    const interval = setInterval(fetchRoutes, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user && user.role !== "admin" && !user.alt_phone) setSafetyOpen(true);
  }, [user]);

  // Click outside listener to close suggestion dropdown menus
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (d1ContainerRef.current && !d1ContainerRef.current.contains(e.target)) {
        setShowD1Menu(false);
      }
      if (d2ContainerRef.current && !d2ContainerRef.current.contains(e.target)) {
        setShowD2Menu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch geocoded suggestions as user types (Without auto-overwriting input text)
  useEffect(() => {
    const q = d1Query.trim();
    if (!q || q.length < 2) {
      setD1Suggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get(`/transit/geocode?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (r.data?.results) setD1Suggestions(r.data.results);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [d1Query]);

  useEffect(() => {
    const q = d2Query.trim();
    if (!q || q.length < 2) {
      setD2Suggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get(`/transit/geocode?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (r.data?.results) setD2Suggestions(r.data.results);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [d2Query]);

  // Fetch real road-following navigation from OSRM whenever d1 and d2 coordinates are set
  useEffect(() => {
    if (!d1 || !d2) {
      setRoadData(null);
      return;
    }
    api.get(`/transit/road-route?start_lat=${d1.lat}&start_lng=${d1.lng}&end_lat=${d2.lat}&end_lng=${d2.lng}&mode=${travelMode}`)
      .then((res) => {
        if (res.data) {
          setRoadData(res.data);
          setActiveBusRouteRoad(null); // Prioritize user-specific origin-destination road route
        }
      })
      .catch(() => setRoadData(null));
  }, [d1, d2, travelMode]);

  // Fetch complete multi-stop road route for a selected bus line
  const handleShowBusRouteOnRoad = async (route) => {
    try {
      toast.info(`Fetching road street path for ${route.name}…`);
      const res = await api.get(`/transit/route-road-geometry?route_id=${route.id}`);
      if (res.data && res.data.coordinates) {
        setActiveBusRouteRoad({
          routeId: route.id,
          name: route.name,
          vehicleNo: route.vehicle_no,
          coordinates: res.data.coordinates,
          distance_km: res.data.distance_km,
          duration_min: res.data.duration_min,
        });
        setRoadData(null);
        toast.success(`🛣️ Showing ${route.name} on the road (${res.data.distance_km} km)!`);
      }
    } catch (e) {
      toast.error("Could not fetch road route geometry");
    }
  };

  // Speech announcement helper for Audio Guidance (Module 2 & 5)
  const speakAnnouncement = (text) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  const simulateArrivalAlert = (route) => {
    const msg = `Attention: ${route.name} (${route.vehicle}) is arriving at your stop in 2 minutes. Ramp and low-floor boarding ready.`;
    speakAnnouncement(msg);
    toast.info("🚌 Live Vehicle Approach Notification", {
      description: msg,
      duration: 7000
    });
  };

  const handleAssistanceSubmit = async () => {
    if (!assistStop) {
      toast.warning("Please specify your boarding stop");
      return;
    }
    try {
      await api.post("/driver/assistance-request", {
        route_id: assistRouteId,
        stop_id: assistStop,
        stop_name: assistStop,
        assistance_type: assistType,
        note: assistNote
      });
      toast.success("Assistance Request Sent directly to the Driver & Control Center!");
      setAssistOpen(false);
      setAssistNote("");
    } catch (e) {
      toast.error("Failed to submit assistance request");
    }
  };

  const handleReportSubmit = async () => {
    try {
      await api.post("/transit/report-status", {
        route_id: reportRouteId,
        crowd_level: reportCrowd,
        delay_min: Number(reportDelay)
      });
      toast.success("Crowding & Delay report submitted. Thank you for helping fellow commuters!");
      setReportOpen(false);
      fetchRoutes();
    } catch (e) {
      toast.error("Failed to submit report");
    }
  };

  // Filter routes based on accessibility options
  const suggested = useMemo(() => {
    return routes.filter((r) => {
      if (wheelchair && !r.accessible && !r.wheelchair_accessible) return false;
      if (nightSafe && !r.safe_night_corridor && !r.name.toLowerCase().includes("night")) return false;
      if (elderlyPriority && (r.priority_elderly_seats || 0) < 4) return false;
      return true;
    });
  }, [routes, wheelchair, nightSafe, elderlyPriority]);

  // Compute calculated journey details
  const journey = useMemo(() => {
    if (!d1 || !d2) return null;

    let km = 0;
    let isRoad = false;
    let steps = [];

    if (roadData && roadData.distance_km > 0) {
      km = roadData.distance_km;
      isRoad = roadData.source === "osrm";
      steps = roadData.steps || [];
    } else {
      km = Math.max(0.4, Number(distKm(d1, d2).toFixed(2)));
    }

    const fare = computeFare(km, { accessible: wheelchair, night: nightSafe, mode: travelMode });
    const speed = travelMode === "walking" ? 4.5 : (travelMode === "driving" ? 35 : 22);
    const estMinutes = roadData?.duration_min ? Math.round(roadData.duration_min) : Math.max(3, Math.round((km / speed) * 60));

    return { km, fare, estMinutes, isRoad, steps };
  }, [d1, d2, wheelchair, nightSafe, travelMode, roadData]);

  // Map Click Coordinate Handler
  const handleMapCoordinatePick = (coords) => {
    const label = `Selected (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
    if (mapClickTarget === "origin") {
      setD1(coords);
      setD1Query(label);
      setMapClickTarget(null);
      toast.success("Origin set from map click");
    } else if (mapClickTarget === "destination") {
      setD2(coords);
      setD2Query(label);
      setMapClickTarget(null);
      toast.success("Destination set from map click");
    }
  };

  return (
    <div className={`min-h-screen mova-hero-grid text-white ${highContrast ? "contrast-125 bg-black" : ""}`}>
      <Header onBug={() => setBugOpen(true)} onChat={() => setChatOpen(true)} />

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Top Hero Banner & Accessibility Preset Bar */}
        <div className="mova-glass rounded-3xl p-5 sm:p-7 border border-white/10 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-[#00E5FF] text-xs font-semibold uppercase tracking-wider">
                <Accessibility size={13} /> 5. Accessible Public Transport Assistant
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter" style={{ fontFamily: "Outfit" }}>
                Safe & Accessible Mobility on Roads
              </h1>
              <p className="text-sm opacity-75 leading-relaxed">
                Live street-following road routes, animated transit movement, wheelchair ramp assistance, live crowding, and night-safe corridors across KIIT campuses and India.
              </p>
            </div>

            {/* Quick Launch Shortcuts: Driver Portal, Chat Admin & Offline Pack */}
            <div className="flex flex-wrap gap-2.5 w-full lg:w-auto">
              <Button
                onClick={() => setChatOpen(true)}
                className="pill-btn bg-gradient-to-r from-[#00E5FF] to-[#00b4d8] text-black font-bold hover:brightness-110 shadow-lg shadow-[#00E5FF]/20 text-xs sm:text-sm"
              >
                <MessageSquare size={15} className="mr-1.5" /> 🔒 Live Support
              </Button>
              <Button
                onClick={() => setAssistOpen(true)}
                className="pill-btn bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold text-xs sm:text-sm"
              >
                <Accessibility size={15} className="mr-1.5 text-[#00E5FF]" /> Request Boarding Aid
              </Button>
              <Button
                onClick={() => setReportOpen(true)}
                variant="outline"
                className="pill-btn border-white/20 text-xs sm:text-sm"
              >
                <Users size={15} className="mr-1.5 text-amber-400" /> Report Crowding
              </Button>
              <Button
                onClick={() => nav("/driver")}
                variant="outline"
                className="pill-btn border-[#00E5FF]/40 text-[#00E5FF] hover:bg-[#00E5FF]/10 text-xs sm:text-sm"
              >
                <Radio size={14} className="mr-1.5" /> Driver Console
              </Button>
              <Button
                onClick={() => nav("/offline")}
                variant="outline"
                className="pill-btn border-white/20 text-xs sm:text-sm"
              >
                <WifiOff size={14} className="mr-1.5 text-orange-400" /> Offline Pack
              </Button>
            </div>
          </div>

          {/* Module 2: Accessibility & Assistance Controls Toolbar */}
          <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Accessibility size={14} className="text-[#00E5FF]" />
                <span>♿ Wheelchair / Ramp</span>
              </div>
              <Switch checked={wheelchair} onCheckedChange={setWheelchair} />
            </div>

            <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-cyan-400" />
                <span>🌙 Night Safe Route</span>
              </div>
              <Switch checked={nightSafe} onCheckedChange={setNightSafe} />
            </div>

            <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Users size={14} className="text-amber-400" />
                <span>👴 Elderly Priority</span>
              </div>
              <Switch checked={elderlyPriority} onCheckedChange={setElderlyPriority} />
            </div>

            <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Volume2 size={14} className="text-emerald-400" />
                <span>🔊 Voice Guidance</span>
              </div>
              <Switch checked={voiceAssistance} onCheckedChange={(val) => {
                setVoiceAssistance(val);
                if (val) speakAnnouncement("Voice accessibility guidance activated.");
              }} />
            </div>

            <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <span>👁️ High Contrast</span>
              </div>
              <Switch checked={highContrast} onCheckedChange={setHighContrast} />
            </div>
          </div>
        </div>

        {/* Main Grid: Left Map & Route Explorer, Right Origin/Destination Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Map Column */}
          <div className="lg:col-span-7 space-y-4">
            {/* Interactive Map Mode Indicator */}
            {mapClickTarget && (
              <div className="p-3 rounded-2xl bg-[#00E5FF]/20 border border-[#00E5FF] text-[#00E5FF] text-xs font-bold flex items-center justify-between animate-pulse">
                <span className="flex items-center gap-2">
                  <MousePointerClick size={16} /> Click anywhere on the map to set your {mapClickTarget.toUpperCase()}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setMapClickTarget(null)} className="h-6 text-xs text-white">
                  Cancel
                </Button>
              </div>
            )}

            {/* Quick One-Click Bus Line Road Route Switcher */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/70 flex items-center gap-1 shrink-0">
                <Route size={13} className="text-[#00E5FF]" /> Show Road Routes:
              </span>
              <div className="flex gap-1.5 shrink-0">
                {routes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleShowBusRouteOnRoad(r)}
                    className={`text-xs px-2.5 py-1 rounded-xl border transition-all font-semibold flex items-center gap-1 ${
                      activeBusRouteRoad?.routeId === r.id
                        ? "bg-[#00E5FF] text-black border-[#00E5FF] font-bold shadow-md shadow-[#00E5FF]/40"
                        : "bg-white/5 border-white/15 text-white/80 hover:text-white hover:border-[#00E5FF]/50"
                    }`}
                  >
                    <Bus size={11} /> {r.name.split(" ")[0]} ({r.id.toUpperCase()})
                  </button>
                ))}
              </div>
            </div>

            <Card className="mova-glass overflow-hidden border-white/10" data-testid="map-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs uppercase tracking-wider font-semibold opacity-70 flex items-center gap-1.5">
                    <Route size={14} className="text-[#00E5FF]" /> Live OSRM Road & Navigation Map
                  </div>
                  {activeBusRouteRoad ? (
                    <Badge className="bg-[#00E5FF] text-black font-bold text-[10px]">
                      🛣️ Road: {activeBusRouteRoad.name} ({activeBusRouteRoad.distance_km} km)
                    </Badge>
                  ) : journey?.isRoad ? (
                    <Badge className="bg-[#00E5FF] text-black font-bold text-[10px]">
                      🛣️ Street Path Active ({journey.km} km)
                    </Badge>
                  ) : null}
                </div>

                <MapView
                  theme={theme}
                  stops={stops}
                  campuses={campuses}
                  hubs={hubs}
                  police={police}
                  roadCoordinates={roadData?.coordinates || activeBusRouteRoad?.coordinates || []}
                  activeRouteName={activeBusRouteRoad?.name || (journey?.isRoad ? "Custom Road Corridor" : "")}
                  activeVehicleNo={activeBusRouteRoad?.vehicleNo || "OD-02-KIIT-101"}
                  roadDistanceKm={activeBusRouteRoad?.distance_km || journey?.km}
                  roadDurationMin={activeBusRouteRoad?.duration_min || journey?.estMinutes}
                  d1={d1}
                  d2={d2}
                  onSelectStop={(st) => {
                    if (!d1) {
                      setD1(st);
                      setD1Query(st.name);
                      toast.success(`Origin set: ${st.name}`);
                    } else {
                      setD2(st);
                      setD2Query(st.name);
                      toast.success(`Destination set: ${st.name}`);
                    }
                  }}
                  onMapClick={handleMapCoordinatePick}
                  height="54vh"
                />
              </CardContent>
            </Card>

            {/* Quick Campus & Indian Transit Hub Selector Chips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
                  Quick Select Stops & Landmarks
                </span>
                <div className="flex gap-1">
                  {[
                    { id: "hubs", label: "National Hubs" },
                    { id: "campuses", label: "KIIT Campuses" },
                    { id: "stops", label: "City Stops" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setChipTab(t.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        chipTab === t.id
                          ? "bg-[#00E5FF] text-black border-[#00E5FF] font-bold"
                          : "border-white/10 opacity-70 hover:opacity-100"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                {(chipTab === "hubs" ? hubs : chipTab === "campuses" ? campuses : stops).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (!d1) {
                        setD1(item);
                        setD1Query(item.name);
                        toast.success(`From: ${item.short || item.name}`);
                      } else {
                        setD2(item);
                        setD2Query(item.name);
                        toast.success(`To: ${item.short || item.name}`);
                      }
                    }}
                    className="text-xs px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 hover:border-[#00E5FF]/50 transition-all flex items-center gap-1.5"
                  >
                    {item.category === "Airport" ? <Plane size={11} className="text-sky-400" /> :
                     item.category === "Railway Station" ? <Train size={11} className="text-amber-400" /> :
                     item.category === "KIIT Campus" ? <Building2 size={11} className="text-[#00E5FF]" /> :
                     <MapPin size={11} className="text-emerald-400" />}
                    <span>{item.short || item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Origin/Destination Search, Fare, and Active Routes */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="mova-glass border-white/10">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold tracking-tight" style={{ fontFamily: "Outfit" }}>
                    Plan Accessible Journey
                  </h2>
                  <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                    {[
                      { id: "transit", icon: <Bus size={13} />, label: "Bus" },
                      { id: "driving", icon: <Car size={13} />, label: "Van" },
                      { id: "walking", icon: <Footprints size={13} />, label: "Walk" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setTravelMode(m.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                          travelMode === m.id
                            ? "bg-[#00E5FF] text-black font-bold"
                            : "opacity-60 hover:opacity-100"
                        }`}
                      >
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* From Origin Input with Non-Autowriting Suggestions */}
                <div ref={d1ContainerRef} className="relative space-y-1.5">
                  <div className="flex items-center justify-between text-xs opacity-70">
                    <Label className="font-semibold flex items-center gap-1">
                      <MapPin size={13} className="text-[#00E5FF]" /> From (Origin)
                    </Label>
                    <button
                      type="button"
                      onClick={() => setMapClickTarget("origin")}
                      className="text-[#00E5FF] hover:underline flex items-center gap-0.5"
                    >
                      <MousePointerClick size={11} /> Pick from Map
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      placeholder="Type origin (e.g. Campus 3, Airport, Delhi)..."
                      value={d1Query}
                      onChange={(e) => {
                        setD1Query(e.target.value);
                        setShowD1Menu(true);
                      }}
                      onFocus={() => setShowD1Menu(true)}
                      className="bg-black/50 border-white/10 rounded-xl pr-10"
                    />
                    <VoiceInput onTranscript={(txt) => {
                      setD1Query(txt);
                      setShowD1Menu(true);
                    }} />
                  </div>

                  {/* Suggestion Dropdown */}
                  {showD1Menu && d1Suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-2xl mova-glass border border-white/20 shadow-2xl p-2 space-y-1 max-h-56 overflow-y-auto">
                      {d1Suggestions.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setD1(item);
                            setD1Query(item.name);
                            setShowD1Menu(false);
                            toast.success(`Origin: ${item.name}`);
                          }}
                          className="w-full text-left p-2.5 rounded-xl hover:bg-[#00E5FF]/20 transition-all flex items-start gap-2.5 text-xs group"
                        >
                          <MapPin size={14} className="text-[#00E5FF] shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold text-white group-hover:text-[#00E5FF]">{item.short || item.name}</div>
                            <div className="opacity-60 text-[10px] truncate">{item.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* To Destination Input with Non-Autowriting Suggestions */}
                <div ref={d2ContainerRef} className="relative space-y-1.5">
                  <div className="flex items-center justify-between text-xs opacity-70">
                    <Label className="font-semibold flex items-center gap-1">
                      <Navigation size={13} className="text-emerald-400" /> To (Destination)
                    </Label>
                    <button
                      type="button"
                      onClick={() => setMapClickTarget("destination")}
                      className="text-emerald-400 hover:underline flex items-center gap-0.5"
                    >
                      <MousePointerClick size={11} /> Pick from Map
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      placeholder="Type destination (e.g. KIMS Hospital, Howrah)..."
                      value={d2Query}
                      onChange={(e) => {
                        setD2Query(e.target.value);
                        setShowD2Menu(true);
                      }}
                      onFocus={() => setShowD2Menu(true)}
                      className="bg-black/50 border-white/10 rounded-xl pr-10"
                    />
                    <VoiceInput onTranscript={(txt) => {
                      setD2Query(txt);
                      setShowD2Menu(true);
                    }} />
                  </div>

                  {/* Suggestion Dropdown */}
                  {showD2Menu && d2Suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-2xl mova-glass border border-white/20 shadow-2xl p-2 space-y-1 max-h-56 overflow-y-auto">
                      {d2Suggestions.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setD2(item);
                            setD2Query(item.name);
                            setShowD2Menu(false);
                            toast.success(`Destination: ${item.name}`);
                          }}
                          className="w-full text-left p-2.5 rounded-xl hover:bg-emerald-500/20 transition-all flex items-start gap-2.5 text-xs group"
                        >
                          <Navigation size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold text-white group-hover:text-emerald-300">{item.short || item.name}</div>
                            <div className="opacity-60 text-[10px] truncate">{item.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Journey Cost & Summary Card */}
                {journey && (
                  <div className="p-4 rounded-2xl border border-[#00E5FF]/30 bg-[#00E5FF]/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider font-semibold text-[#00E5FF]">
                        {journey.isRoad ? "🛣️ OSRM Road-Following Route" : "Calculated Transit Summary"}
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/10">
                        {travelMode.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline">
                        <IndianRupee size={20} className="text-[#00E5FF]" />
                        <span className="text-3xl font-extrabold text-white" style={{ fontFamily: "Outfit" }}>
                          {journey.fare}
                        </span>
                      </div>
                      <div className="text-right text-xs opacity-80">
                        <div className="font-bold text-white flex items-center gap-1">
                          <Clock size={13} className="text-[#00E5FF]" /> ~{journey.estMinutes} mins ({journey.km} km)
                        </div>
                        <div className="opacity-60 text-[10px] mt-0.5">Includes accessibility priority</div>
                      </div>
                    </div>

                    {/* Turn-by-Turn Steps */}
                    {journey.steps && journey.steps.length > 0 && (
                      <div className="pt-2 border-t border-white/10 space-y-1">
                        <div className="text-[11px] font-bold text-[#00E5FF] flex items-center gap-1">
                          <CornerUpRight size={12} /> Turn-by-Turn Street Directions:
                        </div>
                        <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                          {journey.steps.map((st, idx) => (
                            <div key={idx} className="text-[11px] opacity-80 flex items-center justify-between bg-white/5 px-2 py-1 rounded-lg">
                              <span>{st.instruction}</span>
                              {st.distance_m > 0 && <span className="opacity-50 text-[10px] ml-1">{st.distance_m}m</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Module 3 & 5: Active Transit Routes with Live Crowding & Arrival Alerts */}
            <Card className="mova-glass border-white/10" data-testid="suggested-routes">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold tracking-tight" style={{ fontFamily: "Outfit" }}>
                    Active Accessible Transit Lines
                  </h3>
                  <Badge variant="outline" className="border-white/20 text-xs">
                    <Clock size={11} className="mr-1 text-[#00E5FF]" /> Live Fleet
                  </Badge>
                </div>

                <div className="space-y-3">
                  {suggested.map((r) => (
                    <div
                      key={r.id}
                      className="p-3.5 rounded-2xl border border-white/10 hover:border-[#00E5FF]/50 transition-all bg-black/30 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-sm text-white flex items-center gap-2">
                            {r.name}
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 opacity-70">
                              {r.vehicle_no || r.id}
                            </span>
                          </div>
                          <div className="text-xs opacity-70 mt-0.5">{r.vehicle} · {r.frequency}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-extrabold text-[#00E5FF]" style={{ fontFamily: "Outfit" }}>
                            {r.eta_min}m ETA
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${
                            r.crowd_level === "High" ? "border-red-500 text-red-400" :
                            r.crowd_level === "Moderate" ? "border-amber-500 text-amber-400" : "border-emerald-500 text-emerald-400"
                          }`}>
                            {r.crowd_level || "Low"} Crowd
                          </Badge>
                        </div>
                      </div>

                      {/* Crowding, Seats, and Wheelchair details (Module 3) */}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5 opacity-80">
                        <div className="flex items-center gap-2">
                          <span>💺 {r.available_seats ?? 15} seats</span>
                          <span>♿ {r.wheelchair_spaces ?? 2} wheelchair spaces</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleShowBusRouteOnRoad(r)}
                            className="text-[#00E5FF] hover:underline flex items-center gap-1 text-[11px] font-bold"
                          >
                            <Route size={11} /> Show Road
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => simulateArrivalAlert(r)}
                            className="text-white/70 hover:text-white flex items-center gap-1 text-[11px] font-semibold"
                          >
                            <Bell size={11} /> Alert
                          </button>
                        </div>
                      </div>

                      {/* Detour Alert Banner if Present (Module 5) */}
                      {r.detour_alert && (
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-1.5">
                          <AlertTriangle size={13} className="shrink-0" />
                          <span>{r.detour_alert}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Module 2: Boarding Assistance Request Dialog */}
      <Dialog open={assistOpen} onOpenChange={setAssistOpen}>
        <DialogContent className="mova-glass border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-[#00E5FF]">
              <Accessibility size={20} /> Request Wheelchair / Boarding Aid
            </DialogTitle>
            <DialogDescription className="text-sm opacity-70">
              Notifies the bus driver and station ramp assistant to prepare prior to vehicle arrival.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold uppercase opacity-70 block mb-1">Select Transit Route</Label>
              <select
                value={assistRouteId}
                onChange={(e) => setAssistRouteId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-black/60 border border-white/20 text-sm text-white"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id} className="bg-[#12121A] text-white">
                    {r.name} ({r.vehicle})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase opacity-70 block mb-1">Your Boarding Stop</Label>
              <Input
                placeholder="e.g. Campus 3 Gate / KIIT Square"
                value={assistStop}
                onChange={(e) => setAssistStop(e.target.value)}
                className="bg-black/60 border-white/20 rounded-xl"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase opacity-70 block mb-1">Type of Assistance</Label>
              <select
                value={assistType}
                onChange={(e) => setAssistType(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-black/60 border border-white/20 text-sm text-white"
              >
                <option value="Wheelchair Ramp Assistance" className="bg-[#12121A] text-white">♿ Wheelchair Ramp Assistance</option>
                <option value="Elderly Boarding Help" className="bg-[#12121A] text-white">👴 Elderly Boarding Help</option>
                <option value="Late Night Escort Aid" className="bg-[#12121A] text-white">🌙 Late-Night Escort Aid</option>
                <option value="Visual / Audio Guidance" className="bg-[#12121A] text-white">👁️ Visual / Audio Guidance</option>
              </select>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase opacity-70 block mb-1">Special Note for Driver (Optional)</Label>
              <Input
                placeholder="e.g. Waiting at yellow bench near gate"
                value={assistNote}
                onChange={(e) => setAssistNote(e.target.value)}
                className="bg-black/60 border-white/20 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssistOpen(false)} className="pill-btn border-white/20">
              Cancel
            </Button>
            <Button onClick={handleAssistanceSubmit} className="pill-btn bg-[#00E5FF] text-black font-bold hover:bg-[#00B8CC]">
              📢 Dispatch to Driver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Module 3: Crowding & Delay User Reporting Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="mova-glass border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-amber-400">
              <Users size={20} /> Report Live Crowding & Delays
            </DialogTitle>
            <DialogDescription className="text-sm opacity-70">
              Help your campus community with real-time transit crowding conditions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold uppercase opacity-70 block mb-1">Select Transit Line</Label>
              <select
                value={reportRouteId}
                onChange={(e) => setReportRouteId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-black/60 border border-white/20 text-sm text-white"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id} className="bg-[#12121A] text-white">
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase opacity-70 block mb-1">Current Crowding Level</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: "Low", label: "🟢 Low" },
                  { val: "Moderate", label: "🟡 Moderate" },
                  { val: "High", label: "🔴 High" },
                ].map((c) => (
                  <button
                    key={c.val}
                    type="button"
                    onClick={() => setReportCrowd(c.val)}
                    className={`p-2 rounded-xl text-xs font-bold border transition-all ${
                      reportCrowd === c.val
                        ? "bg-[#00E5FF] text-black border-[#00E5FF]"
                        : "bg-black/50 border-white/10 opacity-70 hover:opacity-100"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase opacity-70 block mb-1">Observed Delay (Minutes)</Label>
              <Input
                type="number"
                min="0"
                max="60"
                value={reportDelay}
                onChange={(e) => setReportDelay(e.target.value)}
                className="bg-black/60 border-white/20 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)} className="pill-btn border-white/20">
              Cancel
            </Button>
            <Button onClick={handleReportSubmit} className="pill-btn bg-amber-400 text-black font-bold hover:bg-amber-500">
              Submit Live Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Global Safety & SOS Overlays */}
      <SOSButton userLoc={userLoc} police={police} onOpenSafety={() => setSafetyOpen(true)} />
      <SafetyCheckInDialog open={safetyOpen} onOpenChange={setSafetyOpen} />
      <BugReportDialog open={bugOpen} onOpenChange={setBugOpen} />
      <EncryptedChatModal isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
