import { useState, useEffect } from "react";
import { 
  WifiOff, 
  Download, 
  CheckCircle2, 
  Bus, 
  PhoneCall, 
  MapPin, 
  Clock, 
  Compass, 
  Accessibility, 
  ShieldCheck, 
  AlertCircle,
  ExternalLink,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function Offline() {
  const nav = useNavigate();
  const [offlinePack, setOfflinePack] = useState(null);
  const [downloadedAt, setDownloadedAt] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const fallbackPack = {
    version: "2.0.0",
    routes: [
      {
        id: "r1",
        name: "Campus Loop Express",
        vehicle: "Low-Floor Electric Bus",
        vehicle_no: "OD-02-KIIT-101",
        accessible: true,
        wheelchair_spaces: 2,
        stops: ["KIIT Square (Campus 1 & 3)", "KIIT Lake Gate & KSAC", "Campus 15 (KIMS Hospital)", "Nandankanan Road Junction"],
        frequency: "Every 10 min",
        schedule: ["07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"]
      },
      {
        id: "r2",
        name: "City Transit Link",
        vehicle: "AC Low-Floor City Bus",
        vehicle_no: "OD-02-CRUT-502",
        accessible: true,
        wheelchair_spaces: 1,
        stops: ["KIIT Square", "Patia Railway Halt", "Vani Vihar Square", "Master Canteen (BBS Station)"],
        frequency: "Every 15 min",
        schedule: ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"]
      },
      {
        id: "r3",
        name: "KIMS Medical Care Line",
        vehicle: "Wheelchair-Lift Specialized Van",
        vehicle_no: "OD-02-MED-304",
        accessible: true,
        wheelchair_spaces: 3,
        stops: ["KIIT Lake Gate", "Patia Railway Halt", "Kalinga Hospital Gate", "Campus 15 (KIMS)"],
        frequency: "Every 20 min",
        schedule: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"]
      },
      {
        id: "r4",
        name: "Night Safe Escort Ride",
        vehicle: "Campus Security Escort Vehicle",
        vehicle_no: "OD-02-SAFE-007",
        accessible: true,
        wheelchair_spaces: 1,
        stops: ["Campus 1", "Campus 3", "Campus 5", "Campus 6 (Law)", "Campus 7 (KSOM)", "Campus 11", "Campus 15", "KIIT Lake Gate"],
        frequency: "On-demand & Every 15 min",
        schedule: ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "01:00", "02:00", "03:00", "04:00", "05:00"]
      }
    ],
    emergency_contacts: [
      {"name": "National Emergency SOS", "number": "112", "desc": "Police, Fire, Medical Services"},
      {"name": "KIIT Campus Security 24/7", "number": "+91-674-2725113", "desc": "Campus Central Control Room"},
      {"name": "Women & Student Safety Helpline", "number": "1091", "desc": "Toll-free 24-hour response"},
      {"name": "KIMS Hospital Emergency Trauma", "number": "108", "desc": "Medical Emergency & Ambulance"},
      {"name": "Infocity Police Station", "number": "+91-674-2725100", "desc": "Local Jurisdiction Police Station"},
      {"name": "CRUT Mo Bus Transit Helpline", "number": "1800-345-7177", "desc": "Lost & Found, Bus Operations"}
    ],
    offline_navigation_tips: [
      "All KIIT campus e-rickshaws and blue transit buses accept Student ID cards for free travel.",
      "Low-floor wheelchair buses (Route R1 & R3) stop at designated yellow accessibility markers at Campus 1, 3, KSAC, and KIMS.",
      "Night Safe Escort Rides operate continuously between 20:00 and 05:00 along all lighted campus loops.",
      "In no-signal zones, memorize your designated stop landmark or call Campus Security Hotline 112 / +91-674-2725113."
    ]
  };

  useEffect(() => {
    // Check local storage for downloaded pack
    const cached = localStorage.getItem("mova_offline_transit_pack");
    const cachedTime = localStorage.getItem("mova_offline_downloaded_at");
    if (cached) {
      try {
        setOfflinePack(JSON.parse(cached));
        setDownloadedAt(cachedTime);
      } catch (e) {
        setOfflinePack(fallbackPack);
      }
    } else {
      setOfflinePack(fallbackPack);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadPack = async () => {
    try {
      const res = await api.get("/transit/offline-pack");
      const packData = res.data;
      localStorage.setItem("mova_offline_transit_pack", JSON.stringify(packData));
      const now = new Date().toLocaleString();
      localStorage.setItem("mova_offline_downloaded_at", now);
      setOfflinePack(packData);
      setDownloadedAt(now);
      toast.success("Offline Transit Pack saved to your device!");
    } catch (e) {
      // Fallback local save
      localStorage.setItem("mova_offline_transit_pack", JSON.stringify(fallbackPack));
      const now = new Date().toLocaleString();
      localStorage.setItem("mova_offline_downloaded_at", now);
      setOfflinePack(fallbackPack);
      setDownloadedAt(now);
      toast.success("Offline Pack saved from internal cache!");
    }
  };

  const pack = offlinePack || fallbackPack;

  const filteredRoutes = pack.routes.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.vehicle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.stops && r.stops.some(s => (typeof s === "string" ? s : s.name).toLowerCase().includes(searchQuery.toLowerCase())));
    if (selectedCategory === "all") return matchesSearch;
    if (selectedCategory === "accessible") return matchesSearch && (r.accessible || r.wheelchair_accessible);
    if (selectedCategory === "night") return matchesSearch && (r.name.includes("Night") || r.id === "r4");
    return matchesSearch;
  });

  return (
    <div className="min-h-screen mova-hero-grid text-white">
      <Header />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Banner Section */}
        <div className="mova-glass rounded-3xl p-6 sm:p-8 border border-white/10 relative overflow-hidden" data-testid="offline-page">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF9500]/20 border border-[#FF9500]/30 text-[#FF9500] text-xs font-semibold uppercase tracking-wider">
                <WifiOff size={13} /> Module 7 · Offline Transit Companion & Schedules
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter" style={{ fontFamily: "Outfit" }}>
                Offline Transit Directory
              </h1>
              <p className="text-sm opacity-75 leading-relaxed">
                100% accessible when disconnected from the internet or cellular network. Access pre-cached bus timetables, step-by-step route sequences, and emergency campus telephone numbers.
              </p>
              {downloadedAt && (
                <div className="text-xs text-emerald-400 font-medium flex items-center gap-1.5 pt-1">
                  <CheckCircle2 size={13} /> Stored on this device · Last synced: {downloadedAt}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <Button
                onClick={downloadPack}
                className="pill-btn bg-[#00E5FF] text-black font-bold hover:bg-[#00B8CC] shadow-lg shadow-[#00E5FF]/20"
              >
                <Download size={15} className="mr-2" /> Download / Sync Pack
              </Button>
              <Button
                variant="outline"
                onClick={() => nav("/")}
                className="pill-btn border-white/20"
              >
                Back to Live Map
              </Button>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <Input
              placeholder="Search route, campus, or stop..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-black/40 border-white/10 rounded-xl"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1">
            {[
              { id: "all", label: "All Routes" },
              { id: "accessible", label: "♿ Wheelchair Accessible" },
              { id: "night", label: "🌙 Late-Night Safe Escorts" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  selectedCategory === tab.id
                    ? "bg-[#00E5FF] text-black border-[#00E5FF]"
                    : "border-white/10 hover:border-white/20 opacity-70 hover:opacity-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Offline Routes & Schedules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="offline-cached-routes">
          {filteredRoutes.map((route) => (
            <Card key={route.id} className="mova-glass border-white/10 hover:border-white/20 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider font-semibold opacity-60 flex items-center gap-1.5">
                      <Bus size={13} className="text-[#00E5FF]" /> {route.vehicle}
                    </div>
                    <CardTitle className="text-xl font-bold text-white mt-1 tracking-tight">
                      {route.name}
                    </CardTitle>
                  </div>
                  <Badge className="bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30 text-xs">
                    {route.frequency || "Every 10-15 min"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Accessibility Badges */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <Accessibility size={11} /> ♿ {route.wheelchair_spaces ?? 2} Wheelchair Slots
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                    <ShieldCheck size={11} /> Verified Safe Route
                  </span>
                </div>

                {/* Stop Sequence */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-2 flex items-center gap-1">
                    <MapPin size={12} className="text-[#00E5FF]" /> Stop Sequence:
                  </div>
                  <div className="space-y-1.5 pl-2 border-l-2 border-[#00E5FF]/40">
                    {(route.stops || []).map((stop, idx) => (
                      <div key={idx} className="text-xs text-white/90 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF]" />
                        <span>{typeof stop === "string" ? stop : stop.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Departure Schedule */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-1.5 flex items-center gap-1">
                    <Clock size={12} className="text-amber-400" /> Daily Departure Timetable:
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
                    {(route.schedule || []).map((time, idx) => (
                      <span key={idx} className="text-[11px] px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 font-mono text-white/80">
                        {time}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Emergency Offline Directory & Navigation Tips */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4">
          {/* Emergency Telephone Directory */}
          <div className="lg:col-span-6">
            <Card className="mova-glass border-white/10">
              <CardHeader>
                <CardTitle className="text-xl font-bold flex items-center gap-2 text-[#FF3B30]">
                  <PhoneCall size={20} />
                  Offline Emergency Directory (Tap to Call)
                </CardTitle>
                <CardDescription className="opacity-70">
                  Direct dial telephone numbers that work natively via cell networks without internet data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pack.emergency_contacts.map((contact, idx) => (
                  <a
                    key={idx}
                    href={`tel:${contact.number}`}
                    className="p-3 rounded-2xl border border-white/10 bg-black/30 hover:border-[#00E5FF]/50 transition-all flex items-center justify-between group"
                  >
                    <div>
                      <div className="font-semibold text-sm text-white group-hover:text-[#00E5FF] transition-colors">
                        {contact.name}
                      </div>
                      <div className="text-xs opacity-60">{contact.desc}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30 font-mono">
                        {contact.number}
                      </span>
                    </div>
                  </a>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Offline Navigation Tips */}
          <div className="lg:col-span-6">
            <Card className="mova-glass border-white/10">
              <CardHeader>
                <CardTitle className="text-xl font-bold flex items-center gap-2 text-[#00E5FF]">
                  <Compass size={20} />
                  Offline Accessibility & Campus Navigation Guide
                </CardTitle>
                <CardDescription className="opacity-70">
                  Key survival advice and accessibility protocol when travelling without connectivity.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pack.offline_navigation_tips.map((tip, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl border border-white/5 bg-black/20 text-xs leading-relaxed flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#00E5FF]/20 text-[#00E5FF] grid place-items-center font-bold text-[10px] shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="opacity-85">{tip}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
