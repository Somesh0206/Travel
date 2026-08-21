import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  Bus, 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Radio, 
  Accessibility, 
  Volume2, 
  AlertCircle,
  HelpCircle,
  ShieldAlert
} from "lucide-react";

export default function DriverDashboard() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState("r1");
  const [requests, setRequests] = useState([]);
  const [crowdLevel, setCrowdLevel] = useState("Low");
  const [seats, setSeats] = useState(18);
  const [wheelchairSlots, setWheelchairSlots] = useState(2);
  const [delayMin, setDelayMin] = useState(0);
  const [detourAlert, setDetourAlert] = useState("");
  const [loading, setLoading] = useState(false);
  const [sosList, setSosList] = useState([]);

  const loadData = async () => {
    try {
      const [rRes, reqRes] = await Promise.all([
        api.get("/driver/routes"),
        api.get("/driver/assistance-requests")
      ]);
      setRoutes(rRes.data);
      setRequests(reqRes.data);

      // Set selected route initial values
      const current = rRes.data.find(r => r.id === selectedRouteId) || rRes.data[0];
      if (current) {
        setCrowdLevel(current.crowd_level || "Low");
        setSeats(current.available_seats ?? 15);
        setWheelchairSlots(current.wheelchair_spaces ?? 2);
        setDelayMin(current.delay_min ?? 0);
        setDetourAlert(current.detour_alert || "");
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, [selectedRouteId]);

  const handleRouteSelect = (route) => {
    setSelectedRouteId(route.id);
    setCrowdLevel(route.crowd_level || "Low");
    setSeats(route.available_seats ?? 15);
    setWheelchairSlots(route.wheelchair_spaces ?? 2);
    setDelayMin(route.delay_min ?? 0);
    setDetourAlert(route.detour_alert || "");
  };

  const handleUpdateStatus = async () => {
    setLoading(true);
    try {
      await api.post("/driver/update", {
        route_id: selectedRouteId,
        crowd_level: crowdLevel,
        available_seats: Number(seats),
        wheelchair_spaces: Number(wheelchairSlots),
        delay_min: Number(delayMin),
        detour_alert: detourAlert
      });
      toast.success("Vehicle status broadcasted to all passengers!");
      loadData();
    } catch (e) {
      toast.error("Failed to update driver status");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRequest = async (reqId) => {
    try {
      await api.post(`/driver/assistance-requests/${reqId}/complete`);
      toast.success("Assistance marked as completed!");
      loadData();
    } catch (e) {
      toast.error("Failed to update assistance request");
    }
  };

  const playChime = () => {
    if ("speechSynthesis" in window) {
      const speech = new SpeechSynthesisUtterance(`Attention passengers: Route ${selectedRouteId} departing soon.`);
      window.speechSynthesis.speak(speech);
    }
  };

  const currentRoute = routes.find(r => r.id === selectedRouteId) || routes[0];

  return (
    <div className="min-h-screen mova-hero-grid text-white">
      <Header />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Top Header Banner */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-[#00E5FF] font-semibold flex items-center gap-1.5">
              <Radio size={14} className="animate-pulse" /> Module 6 · Driver & Fleet Operator Console
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter" style={{ fontFamily: "Outfit" }}>
              Driver & Operator Dashboard
            </h1>
            <p className="text-sm opacity-70 mt-1">
              Manage real-time vehicle occupancy, report route delays, broadcast detour alerts, and assist accessibility passengers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30 px-3 py-1 text-sm font-medium">
              <Bus size={14} className="mr-1.5" /> Operator: {user?.name || "Transit Driver"}
            </Badge>
            <Button size="sm" variant="outline" className="pill-btn border-white/20" onClick={playChime}>
              <Volume2 size={15} className="mr-1.5 text-[#00E5FF]" /> Audio PA Announce
            </Button>
          </div>
        </div>

        {/* Route Selector Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {routes.map((r) => {
            const isSelected = r.id === selectedRouteId;
            return (
              <button
                key={r.id}
                onClick={() => handleRouteSelect(r)}
                className={`p-4 rounded-2xl text-left transition-all border ${
                  isSelected 
                    ? "bg-[#00E5FF]/15 border-[#00E5FF] shadow-[0_0_20px_rgba(0,229,255,0.2)]" 
                    : "mova-glass border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/10 uppercase tracking-wider">
                    {r.vehicle_no || r.id}
                  </span>
                  <Badge variant="outline" className={`text-xs ${
                    r.crowd_level === "High" ? "border-red-500 text-red-400" :
                    r.crowd_level === "Moderate" ? "border-amber-500 text-amber-400" : "border-emerald-500 text-emerald-400"
                  }`}>
                    {r.crowd_level || "Low"} Crowd
                  </Badge>
                </div>
                <div className="text-lg font-bold text-white tracking-tight">{r.name}</div>
                <div className="text-xs opacity-70 mt-1 flex items-center gap-2">
                  <span>💺 {r.available_seats ?? 15} Seats</span>
                  <span>♿ {r.wheelchair_spaces ?? 2} Wheelchairs</span>
                </div>
                {r.delay_min > 0 && (
                  <div className="mt-2 text-xs text-amber-400 font-semibold flex items-center gap-1">
                    <Clock size={12} /> +{r.delay_min} min delay
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Controls: Occupancy, Delay & Broadcast */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="mova-glass border-white/10">
              <CardHeader>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Bus size={20} className="text-[#00E5FF]" />
                  Live Fleet Status Broadcast: {currentRoute?.name}
                </CardTitle>
                <CardDescription className="opacity-70">
                  Update passenger app status in real-time. Changes immediately reflect across passenger route planning and maps.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Crowding Level Selector */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider opacity-70 block mb-2">
                    Vehicle Occupancy & Crowding Level
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { level: "Low", label: "🟢 Low (Seats Free)", desc: "Comfortable seating" },
                      { level: "Moderate", label: "🟡 Moderate", desc: "Few seats left" },
                      { level: "High", label: "🔴 High (Packed)", desc: "Standing room only" },
                    ].map((item) => (
                      <button
                        key={item.level}
                        type="button"
                        onClick={() => setCrowdLevel(item.level)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          crowdLevel === item.level
                            ? "border-[#00E5FF] bg-[#00E5FF]/20 text-white font-bold"
                            : "border-white/10 bg-black/40 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <div className="text-sm font-semibold">{item.label}</div>
                        <div className="text-[11px] opacity-60 mt-0.5">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Available Seats & Wheelchair Spaces */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider opacity-70 block mb-1.5">
                      Available Passenger Seats
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="60"
                      value={seats}
                      onChange={(e) => setSeats(e.target.value)}
                      className="bg-black/50 border-white/10 rounded-xl text-lg font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider opacity-70 block mb-1.5 flex items-center gap-1">
                      <Accessibility size={13} className="text-[#00E5FF]" /> Wheelchair Reserved Spaces
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="6"
                      value={wheelchairSlots}
                      onChange={(e) => setWheelchairSlots(e.target.value)}
                      className="bg-black/50 border-white/10 rounded-xl text-lg font-bold"
                    />
                  </div>
                </div>

                {/* Schedule Delay Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider opacity-70">
                      Estimated Schedule Delay
                    </label>
                    <span className="text-sm font-bold text-amber-400">
                      {delayMin === 0 ? "On Time (0 min)" : `+${delayMin} min delay`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    step="5"
                    value={delayMin}
                    onChange={(e) => setDelayMin(Number(e.target.value))}
                    className="w-full accent-[#00E5FF] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] opacity-50 mt-1">
                    <span>On Time</span>
                    <span>+15 min</span>
                    <span>+30 min</span>
                    <span>+45 min</span>
                  </div>
                </div>

                {/* Detour / Hazard Alert Banner */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider opacity-70 block mb-1.5">
                    Route Detour / Road Condition Alert Broadcast
                  </label>
                  <Input
                    placeholder="e.g. Detour via Nandankanan flyover due to event traffic"
                    value={detourAlert}
                    onChange={(e) => setDetourAlert(e.target.value)}
                    className="bg-black/50 border-white/10 rounded-xl"
                  />
                </div>

                <Button
                  onClick={handleUpdateStatus}
                  disabled={loading}
                  className="w-full pill-btn bg-[#00E5FF] text-black font-bold hover:bg-[#00B8CC] py-3 text-base shadow-lg shadow-[#00E5FF]/20"
                >
                  {loading ? "Broadcasting..." : "📢 Broadcast Live Updates to Passenger App"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Side Panel: Passenger Accessibility Assistance Requests */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="mova-glass border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <Accessibility size={20} className="text-[#00E5FF]" />
                    Passenger Assistance Queue
                  </CardTitle>
                  <Badge className="bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30">
                    {requests.filter(r => r.status === "pending").length} Active
                  </Badge>
                </div>
                <CardDescription className="opacity-70">
                  Real-time pickup requests from disabled, elderly, or late-night passengers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {requests.length === 0 ? (
                  <div className="text-center py-8 opacity-60 space-y-2">
                    <CheckCircle2 size={32} className="mx-auto text-emerald-400 opacity-80" />
                    <p className="text-sm">No pending passenger assistance requests on this line.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                    {requests.map((req) => (
                      <div
                        key={req.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          req.status === "completed"
                            ? "bg-black/20 border-white/5 opacity-50"
                            : "bg-[#161622] border-[#00E5FF]/30 shadow-md"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-bold text-[#00E5FF] flex items-center gap-1.5">
                              <Accessibility size={13} /> {req.assistance_type}
                            </div>
                            <div className="text-sm font-bold text-white mt-0.5">
                              📍 Stop: {req.stop_name}
                            </div>
                            <div className="text-xs opacity-70 mt-1">
                              Passenger: <span className="font-semibold text-white">{req.passenger_name}</span>
                            </div>
                            {req.note && (
                              <div className="text-xs italic opacity-80 mt-1 text-amber-300">
                                "{req.note}"
                              </div>
                            )}
                            <div className="text-[10px] opacity-40 mt-1">
                              Requested {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>

                          {req.status === "pending" ? (
                            <Button
                              size="sm"
                              onClick={() => handleCompleteRequest(req.id)}
                              className="pill-btn bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 text-xs shrink-0"
                            >
                              <CheckCircle2 size={13} className="mr-1" /> Assisted
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                              Completed
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Safety Guidelines for Drivers */}
            <Card className="mova-glass border-white/10">
              <CardContent className="p-4 space-y-2">
                <div className="text-xs uppercase tracking-wider font-bold text-[#00E5FF] flex items-center gap-1.5">
                  <ShieldAlert size={14} /> Operator Accessibility Standards
                </div>
                <ul className="text-xs opacity-75 space-y-1.5 list-disc pl-4">
                  <li>Deploy ramp at yellow curbside accessibility markers for wheelchair boarding.</li>
                  <li>Verify audio PA announcements are audible at all campus and city stops.</li>
                  <li>Ensure well-lit campus boarding zones are used for late-night safe routes.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
