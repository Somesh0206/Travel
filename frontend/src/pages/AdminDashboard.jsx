import { useEffect, useState } from "react";
import Header from "@/components/Header";
import MapView from "@/components/MapView";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Bug, Users, MapPinned, ShieldCheck } from "lucide-react";

export default function AdminDashboard() {
  const { theme, user } = useAuth();
  const [sos, setSos] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [locs, setLocs] = useState([]);
  const [police, setPolice] = useState([]);

  const refresh = () => {
    api.get("/sos/all").then((r) => setSos(r.data)).catch(() => {});
    api.get("/bugs").then((r) => setBugs(r.data)).catch(() => {});
    api.get("/location/all").then((r) => setLocs(r.data)).catch(() => {});
    api.get("/safety/police").then((r) => setPolice(r.data)).catch(() => {});
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen mova-hero-grid">
      <Header />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] opacity-60">Admin console · locked to authorised staff</div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter" style={{ fontFamily: "Outfit" }}>
              MOVA Command Center
            </h1>
          </div>
          <Badge className="bg-[#00E5FF] text-black" data-testid="admin-badge">
            <ShieldCheck size={12} className="mr-1" /> {user?.email}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-in">
          <Kpi label="Live users" value={locs.length} icon={<Users size={16} />} testId="kpi-users" />
          <Kpi label="Active SOS" value={sos.filter(s => s.status === "active").length} icon={<AlertTriangle size={16} />} accent="#FF3B30" testId="kpi-sos" />
          <Kpi label="Bug reports" value={bugs.length} icon={<Bug size={16} />} accent="#B24CFF" testId="kpi-bugs" />
          <Kpi label="Police stations" value={police.length} icon={<MapPinned size={16} />} testId="kpi-police" />
        </div>

        <Card className="mova-glass" data-testid="admin-map-card">
          <CardContent className="p-4">
            <div className="text-sm uppercase tracking-[0.25em] opacity-60 mb-2">Live map</div>
            <MapView theme={theme} liveUsers={locs} police={police}
              stops={[]} routeStops={[]} height="52vh" />
          </CardContent>
        </Card>

        <Tabs defaultValue="sos" className="w-full">
          <TabsList data-testid="admin-tabs">
            <TabsTrigger value="sos" data-testid="tab-sos">SOS alerts</TabsTrigger>
            <TabsTrigger value="bugs" data-testid="tab-bugs">Reports</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Live users</TabsTrigger>
          </TabsList>

          <TabsContent value="sos" className="mt-3">
            <Card className="mova-glass">
              <CardContent className="p-4">
                {sos.length === 0 ? (
                  <Empty text="No SOS alerts. Stay safe." />
                ) : (
                  <div className="divide-y divide-white/5">
                    {sos.map((s) => (
                      <div key={s.id} className="py-3 flex items-start justify-between gap-4" data-testid={`sos-row-${s.id}`}>
                        <div>
                          <div className="font-semibold flex items-center gap-2">
                            <AlertTriangle size={14} className="text-[#FF3B30]" /> {s.user_name}
                            <span className="text-xs opacity-60">· {s.user_email}</span>
                          </div>
                          <div className="text-xs opacity-70 mt-1">
                            Contact: {s.alt_name || "—"} ({s.alt_phone || "—"})
                          </div>
                          <div className="text-xs opacity-70">{s.message}</div>
                        </div>
                        <div className="text-right">
                          <a className="text-[#00E5FF] text-sm hover:underline"
                            target="_blank" rel="noreferrer"
                            href={`https://maps.google.com/?q=${s.lat},${s.lng}`}>
                            {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                          </a>
                          <div className="text-[10px] opacity-60 mt-1">{new Date(s.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bugs" className="mt-3">
            <Card className="mova-glass">
              <CardContent className="p-4">
                {bugs.length === 0 ? (
                  <Empty text="No reports yet." />
                ) : (
                  <div className="divide-y divide-white/5">
                    {bugs.map((b) => (
                      <div key={b.id} className="py-3" data-testid={`bug-row-${b.id}`}>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-[#B24CFF] text-white capitalize">{b.category}</Badge>
                          <span className="font-semibold">{b.title}</span>
                          <span className="text-xs opacity-60">· {b.user_name}</span>
                        </div>
                        <div className="text-sm opacity-80 mt-1">{b.description}</div>
                        <div className="text-[10px] opacity-60 mt-1">{new Date(b.created_at).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-3">
            <Card className="mova-glass">
              <CardContent className="p-4">
                {locs.length === 0 ? (
                  <Empty text="No live users to track." />
                ) : (
                  <div className="divide-y divide-white/5">
                    {locs.map((u) => (
                      <div key={u.user_id} className="py-3 flex items-center justify-between" data-testid={`user-row-${u.user_id}`}>
                        <div>
                          <div className="font-semibold">{u.user_name}</div>
                          <div className="text-xs opacity-70">{u.user_email}</div>
                        </div>
                        <div className="text-right text-xs opacity-70">
                          <div className="font-mono">{u.lat.toFixed(4)}, {u.lng.toFixed(4)}</div>
                          <div>{new Date(u.updated_at).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Kpi({ label, value, icon, accent = "#00E5FF", testId }) {
  return (
    <div className="p-4 rounded-2xl mova-glass border" data-testid={testId}>
      <div className="flex items-center justify-between opacity-80">
        <span className="text-xs uppercase tracking-[0.2em]">{label}</span>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div className="text-3xl font-bold mt-1" style={{ fontFamily: "Outfit" }}>{value}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div className="py-10 text-center text-sm opacity-60">{text}</div>;
}
