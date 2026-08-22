import { useEffect, useState, useRef } from "react";
import Header from "@/components/Header";
import MapView from "@/components/MapView";
import ExportPanel from "@/components/ExportPanel";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Bug,
  Users,
  MapPinned,
  ShieldCheck,
  MessageSquare,
  Lock,
  Send,
  User,
  CheckCheck,
  Headphones,
  RefreshCw,
  Sparkles,
  BarChart3,
  TrendingUp,
  Activity,
  Download,
  Calendar,
  Layers,
  Smartphone,
  Laptop
} from "lucide-react";

export default function AdminDashboard() {
  const { theme, user } = useAuth();
  const [sos, setSos] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [locs, setLocs] = useState([]);
  const [police, setPolice] = useState([]);

  // Encrypted Chat Desk state
  const [chatThreads, setChatThreads] = useState([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState("");
  const [activeMessages, setActiveMessages] = useState([]);
  const [decryptedMap, setDecryptedMap] = useState({});
  const [adminInput, setAdminInput] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const chatBottomRef = useRef(null);

  // Daily Usage & Feature Analytics state
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [selectedFeatureFilter, setSelectedFeatureFilter] = useState("all");
  const [searchLogTerm, setSearchLogTerm] = useState("");

  const fetchAnalytics = (days = analyticsDays) => {
    setAnalyticsLoading(true);
    api.get(`/analytics/daily-usage?days=${days}`)
      .then((r) => setAnalyticsData(r.data))
      .catch((err) => console.error("Analytics fetch failed:", err))
      .finally(() => setAnalyticsLoading(false));
  };

  const refresh = () => {
    api.get("/sos/all").then((r) => setSos(r.data)).catch(() => {});
    api.get("/bugs").then((r) => setBugs(r.data)).catch(() => {});
    api.get("/location/all").then((r) => setLocs(r.data)).catch(() => {});
    api.get("/safety/police").then((r) => setPolice(r.data)).catch(() => {});
    api.get("/chat/threads").then((r) => {
      const threads = r.data || [];
      setChatThreads(threads);
      if (!selectedUserEmail && threads.length > 0) {
        setSelectedUserEmail(threads[0].user_email);
      }
    }).catch(() => {});
    fetchAnalytics(analyticsDays);
  };

  const fetchActiveThreadMessages = async (targetEmail) => {
    if (!targetEmail) return;
    const threadKey = `mova_admin_chat_${targetEmail}`;

    // 1. Immediately restore cached messages if available
    try {
      const cached = JSON.parse(localStorage.getItem(threadKey) || "[]");
      const cachedDecrypted = JSON.parse(localStorage.getItem(threadKey + "_decrypted") || "{}");
      if (cached.length > 0) {
        setActiveMessages(cached);
      }
      if (Object.keys(cachedDecrypted).length > 0) {
        setDecryptedMap((prev) => ({ ...cachedDecrypted, ...prev }));
      }
    } catch (e) {}

    try {
      const res = await api.get(`/chat/messages?with_user=${encodeURIComponent(targetEmail)}`);
      const msgs = res.data || [];

      // Merge unique messages
      let cached = [];
      try {
        cached = JSON.parse(localStorage.getItem(threadKey) || "[]");
      } catch (e) {}

      const msgMap = new Map();
      cached.forEach((m) => { if (m?.id) msgMap.set(m.id, m); });
      msgs.forEach((m) => { if (m?.id) msgMap.set(m.id, m); });

      const mergedList = Array.from(msgMap.values()).sort((a, b) =>
        (a.created_at || "").localeCompare(b.created_at || "")
      );
      setActiveMessages(mergedList);

      try {
        localStorage.setItem(threadKey, JSON.stringify(mergedList));
      } catch (e) {}

      // Decrypt incoming messages
      let cachedDecrypted = {};
      try {
        cachedDecrypted = JSON.parse(localStorage.getItem(threadKey + "_decrypted") || "{}");
      } catch (e) {}

      const newMap = { ...cachedDecrypted, ...decryptedMap };
      let updated = false;
      for (const m of mergedList) {
        if (!newMap[m.id]) {
          try {
            const plain = await decryptMessage(m.ciphertext, m.iv);
            newMap[m.id] = plain;
            updated = true;
          } catch (e) {
            newMap[m.id] = "[Decryption Failed]";
          }
        }
      }
      if (updated || Object.keys(newMap).length !== Object.keys(decryptedMap).length) {
        setDecryptedMap(newMap);
        try {
          localStorage.setItem(threadKey + "_decrypted", JSON.stringify(newMap));
        } catch (e) {}
      }

      // Mark read
      api.post("/chat/mark-read", { with_user: targetEmail }).catch(() => {});
    } catch (err) {
      console.error("Error fetching thread messages:", err);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedUserEmail) {
      fetchActiveThreadMessages(selectedUserEmail);
      const tid = setInterval(() => fetchActiveThreadMessages(selectedUserEmail), 3000);
      return () => clearInterval(tid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserEmail]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages, decryptedMap]);

  const handleAdminSend = async (customText = null) => {
    const textToSend = typeof customText === "string" ? customText : adminInput;
    if (!textToSend.trim() || !selectedUserEmail || sendingReply) return;

    setSendingReply(true);
    try {
      // 1. Client-Side AES-GCM Encryption
      const encrypted = await encryptMessage(textToSend.trim());

      // 2. Dispatch payload
      const payload = {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        algorithm: encrypted.algorithm,
        receiver_email: selectedUserEmail,
        message_type: "text",
        preview_hint: "🔒 Encrypted Message"
      };

      const res = await api.post("/chat/send", payload);
      const sentMsg = res.data;

      const threadKey = `mova_admin_chat_${selectedUserEmail}`;
      const updatedMessages = [...activeMessages, sentMsg];
      const updatedDecrypted = {
        ...decryptedMap,
        [sentMsg.id]: textToSend.trim()
      };

      try {
        localStorage.setItem(threadKey, JSON.stringify(updatedMessages));
        localStorage.setItem(threadKey + "_decrypted", JSON.stringify(updatedDecrypted));
      } catch (e) {}

      setDecryptedMap(updatedDecrypted);
      setActiveMessages(updatedMessages);
      setAdminInput("");
      refresh();
    } catch (err) {
      console.error("Failed to send admin encrypted reply:", err);
    } finally {
      setSendingReply(false);
    }
  };

  const totalUnreadChat = chatThreads.reduce((acc, t) => acc + (t.unread_count || 0), 0);

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

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 stagger-in">
          <Kpi label="Live users" value={locs.length} icon={<Users size={16} />} testId="kpi-users" />
          <Kpi label="Active SOS" value={sos.filter(s => s.status === "active").length} icon={<AlertTriangle size={16} />} accent="#FF3B30" testId="kpi-sos" />
          <Kpi label="Usage Events" value={analyticsData?.summary?.total_events || "..."} icon={<Activity size={16} />} accent="#10B981" testId="kpi-usage" />
          <Kpi label="Encrypted chats" value={chatThreads.length} icon={<MessageSquare size={16} />} accent="#00E5FF" testId="kpi-chats" />
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

        <Tabs defaultValue="chat" className="w-full">
          <TabsList data-testid="admin-tabs">
            <TabsTrigger value="chat" data-testid="tab-chat" className="relative">
              <MessageSquare size={14} className="mr-1.5" /> Encrypted User Chat
              {totalUnreadChat > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-[#00E5FF] text-black text-[10px] font-bold">
                  {totalUnreadChat}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              <BarChart3 size={14} className="mr-1.5" /> Daily Usage & Exports
            </TabsTrigger>
            <TabsTrigger value="sos" data-testid="tab-sos">SOS alerts</TabsTrigger>
            <TabsTrigger value="bugs" data-testid="tab-bugs">Reports</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Live users</TabsTrigger>
          </TabsList>

          {/* Encrypted User-to-Admin Chat Desk */}
          <TabsContent value="chat" className="mt-3">
            <Card className="mova-glass overflow-hidden border border-[#00E5FF]/20 shadow-2xl">
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-12 min-h-[550px]">
                  
                  {/* Left Column: User Conversation Threads */}
                  <div className="md:col-span-4 border-r border-white/10 p-3 bg-black/20 flex flex-col">
                    <div className="flex items-center justify-between px-2 py-2 mb-2 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <Lock size={14} className="text-[#00E5FF]" />
                        <span className="font-bold text-sm text-white">Active Channels</span>
                      </div>
                      <Badge className="bg-[#00E5FF]/20 text-[#00E5FF] text-[10px] py-0 font-mono">
                        E2EE Active
                      </Badge>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
                      {chatThreads.length === 0 ? (
                        <div className="py-12 text-center text-xs text-white/50 space-y-2">
                          <Headphones size={24} className="mx-auto opacity-40" />
                          <div>No user chat threads yet.</div>
                          <div className="text-[11px] opacity-40">User messages from the live support modal will appear here.</div>
                        </div>
                      ) : (
                        chatThreads.map((th) => {
                          const isSelected = th.user_email === selectedUserEmail;
                          return (
                            <button
                              key={th.user_email}
                              onClick={() => setSelectedUserEmail(th.user_email)}
                              className={`w-full text-left p-3 rounded-2xl transition border ${
                                isSelected
                                  ? "bg-[#00E5FF]/15 border-[#00E5FF]/40 text-white shadow-lg"
                                  : "bg-white/5 border-white/5 hover:bg-white/10 text-white/70"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-semibold text-sm truncate flex items-center gap-1.5 text-white">
                                  <User size={13} className={isSelected ? "text-[#00E5FF]" : "text-white/50"} />
                                  {th.user_name || th.user_email.split("@")[0]}
                                </div>
                                {th.unread_count > 0 && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-[#00E5FF] text-black text-[10px] font-bold animate-pulse">
                                    {th.unread_count} new
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-white/50 truncate font-mono">
                                {th.user_email}
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-white/40 mt-1.5">
                                <span className="flex items-center gap-1">
                                  <Lock size={9} /> {th.last_preview}
                                </span>
                                <span>
                                  {th.last_message_time ? new Date(th.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Column: Encrypted Conversation Stream */}
                  <div className="md:col-span-8 flex flex-col bg-black/40">
                    {selectedUserEmail ? (
                      <>
                        {/* Conversation Header */}
                        <div className="p-3.5 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/40 grid place-items-center text-[#00E5FF]">
                              <ShieldCheck size={16} />
                            </div>
                            <div>
                              <div className="font-bold text-sm text-white flex items-center gap-1.5">
                                <span>{selectedUserEmail}</span>
                                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] py-0 font-mono">
                                  Verified Session
                                </Badge>
                              </div>
                              <div className="text-[11px] text-white/50 flex items-center gap-1">
                                <Lock size={10} className="text-[#00E5FF]" /> AES-GCM-256 Client-Side End-to-End Encryption
                              </div>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => fetchActiveThreadMessages(selectedUserEmail)}
                            className="text-xs text-white/70 hover:text-white"
                          >
                            <RefreshCw size={13} className="mr-1" /> Refresh
                          </Button>
                        </div>

                        {/* Message Stream */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar max-h-[380px]">
                          {activeMessages.length === 0 ? (
                            <div className="py-12 text-center text-xs text-white/40">
                              No messages exchanged in this thread yet. Send a secure response below.
                            </div>
                          ) : (
                            activeMessages.map((m) => {
                              const isAdminSender = m.sender_role === "admin" || m.sender_email === "admin@mova.app";
                              const text = decryptedMap[m.id] || "Decrypting payload...";

                              return (
                                <div
                                  key={m.id}
                                  className={`flex flex-col ${isAdminSender ? "items-end" : "items-start"}`}
                                >
                                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-white/50 font-mono">
                                    {isAdminSender ? (
                                      <>
                                        <ShieldCheck size={10} className="text-[#00E5FF]" />
                                        <span className="text-[#00E5FF] font-bold">You (Admin Dispatcher)</span>
                                      </>
                                    ) : (
                                      <>
                                        <User size={10} />
                                        <span className="font-semibold text-white/80">{m.sender_name || m.sender_email}</span>
                                      </>
                                    )}
                                    <span>·</span>
                                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>

                                  <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-md ${
                                      isAdminSender
                                        ? "bg-gradient-to-r from-[#00b4d8] to-[#0077b6] text-white rounded-tr-none"
                                        : "bg-[#1f2937] border border-white/10 text-white rounded-tl-none"
                                    }`}
                                  >
                                    <div className="leading-relaxed whitespace-pre-wrap break-words">{text}</div>
                                    <div className="flex items-center justify-end gap-1 text-[9px] opacity-60 mt-1 font-mono">
                                      <Lock size={8} /> AES-GCM
                                      {isAdminSender && <CheckCheck size={11} className="text-cyan-200" />}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={chatBottomRef} />
                        </div>

                        {/* Quick Action Responses */}
                        <div className="px-4 py-2 bg-black/40 border-t border-white/5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                          <span className="text-[10px] text-white/40 uppercase tracking-widest shrink-0">Dispatch:</span>
                          {[
                            "✅ Assistance dispatched to your location.",
                            "🚌 Route 101 arrives in ~4 mins.",
                            "🦽 Driver notified to deploy ramp.",
                            "🙏 Thank you for the update. Safe travels!"
                          ].map((reply, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleAdminSend(reply)}
                              className="text-[11px] bg-white/5 hover:bg-[#00E5FF]/20 border border-white/10 hover:border-[#00E5FF]/40 text-white/70 hover:text-white rounded-full px-2.5 py-1 shrink-0 transition"
                            >
                              {reply}
                            </button>
                          ))}
                        </div>

                        {/* Admin Message Composer */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleAdminSend();
                          }}
                          className="p-3 bg-white/5 border-t border-white/10 flex items-center gap-2"
                        >
                          <Input
                            value={adminInput}
                            onChange={(e) => setAdminInput(e.target.value)}
                            placeholder={`Reply securely to ${selectedUserEmail}...`}
                            disabled={sendingReply}
                            className="flex-1 bg-black/50 border-white/10 text-white placeholder:text-white/30 rounded-xl text-sm focus-visible:ring-[#00E5FF]"
                          />
                          <Button
                            type="submit"
                            disabled={!adminInput.trim() || sendingReply}
                            className="bg-[#00E5FF] hover:bg-[#00b8cc] text-black font-bold rounded-xl px-4 shrink-0 transition"
                          >
                            {sendingReply ? <span className="animate-spin text-xs">...</span> : <Send size={16} />}
                          </Button>
                        </form>
                      </>
                    ) : (
                      <div className="m-auto py-16 text-center text-sm text-white/40 space-y-2">
                        <MessageSquare size={32} className="mx-auto opacity-30 text-[#00E5FF]" />
                        <div>Select a user chat thread on the left to start encrypted communication.</div>
                      </div>
                    )}
                  </div>

                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Daily Usage & Feature Analytics Tab */}
          <TabsContent value="analytics" className="mt-3 space-y-5">
            {/* Top Export Card from Export-Feature module */}
            <ExportPanel
              defaultDays={analyticsDays}
              onExportSuccess={() => fetchAnalytics(analyticsDays)}
            />

            {/* Analytics KPI Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <span>Tracked Events</span>
                  <Activity size={16} className="text-emerald-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1" style={{ fontFamily: "Outfit" }}>
                  {analyticsLoading ? "..." : analyticsData?.summary?.total_events || 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Actions across all features</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <span>Daily Active Users</span>
                  <Users size={16} className="text-blue-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1" style={{ fontFamily: "Outfit" }}>
                  {analyticsLoading ? "..." : analyticsData?.summary?.daily_active_users_today || 0}
                </div>
                <div className="text-[11px] text-emerald-400 mt-1">Active Today</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <span>Unique Commuters</span>
                  <User size={16} className="text-purple-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1" style={{ fontFamily: "Outfit" }}>
                  {analyticsLoading ? "..." : analyticsData?.summary?.total_users || 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">In selected timeframe</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <span>Top Utilized Feature</span>
                  <TrendingUp size={16} className="text-amber-400" />
                </div>
                <div className="text-lg sm:text-xl font-extrabold text-amber-300 mt-1 capitalize truncate" style={{ fontFamily: "Outfit" }}>
                  {analyticsLoading ? "..." : (analyticsData?.summary?.top_feature || "None").replace(/_/g, " ")}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Highest user engagement</div>
              </div>
            </div>

            {/* Feature Utilization & Daily Trend Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Feature Breakdown Progress Bars */}
              <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-emerald-400" />
                    <h3 className="text-base font-bold text-white">Feature Utilization Breakdown</h3>
                  </div>
                  <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-xs">
                    {analyticsData?.feature_breakdown?.length || 0} Features Active
                  </Badge>
                </div>

                <div className="space-y-3.5">
                  {(!analyticsData?.feature_breakdown || analyticsData.feature_breakdown.length === 0) ? (
                    <Empty text="No feature interactions logged yet." />
                  ) : (
                    analyticsData.feature_breakdown.map((f) => (
                      <div key={f.feature_name} className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white capitalize">{f.feature_name.replace(/_/g, " ")}</span>
                            <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                              {f.feature_category}
                            </span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-emerald-400 font-bold">{f.count}</span>
                            <span className="text-slate-500 ml-1">({f.percentage}%)</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(8, f.percentage))}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Daily Usage Trend Bars */}
              <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar size={18} className="text-blue-400" />
                      <h3 className="text-base font-bold text-white">Daily Commuter Activity Trend</h3>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">Day-by-Day Volume</span>
                  </div>

                  <div className="space-y-2 mt-2">
                    {(!analyticsData?.daily_trends || analyticsData.daily_trends.length === 0) ? (
                      <Empty text="No daily trend data available." />
                    ) : (
                      analyticsData.daily_trends.slice(-7).map((d) => (
                        <div key={d.date} className="flex items-center gap-3 text-xs">
                          <span className="w-20 text-slate-400 font-mono shrink-0">{d.date}</span>
                          <div className="flex-1 bg-slate-800 h-6 rounded-lg overflow-hidden relative flex items-center px-2">
                            <div
                              className="absolute top-0 left-0 bg-blue-600/50 h-full rounded-lg transition-all"
                              style={{ width: `${Math.min(100, Math.max(12, d.total_events * 12))}%` }}
                            />
                            <span className="relative z-10 text-[11px] font-semibold text-white">
                              {d.total_events} events • {d.active_users} users
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-emerald-400" />
                    <span>Audit compliance verification passed</span>
                  </div>
                  <button
                    onClick={() => fetchAnalytics(analyticsDays)}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                  >
                    <RefreshCw size={12} className={analyticsLoading ? "animate-spin" : ""} /> Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Commuter Activity Audit Log Table */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Activity size={18} className="text-emerald-400" /> Commuter Activity Audit Log
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time log of feature interactions by commuters and visitors</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Search commuter email / name..."
                    value={searchLogTerm}
                    onChange={(e) => setSearchLogTerm(e.target.value)}
                    className="w-48 sm:w-60 h-8 text-xs bg-slate-800 border-slate-700 text-white rounded-xl"
                  />
                  <select
                    value={selectedFeatureFilter}
                    onChange={(e) => setSelectedFeatureFilter(e.target.value)}
                    className="h-8 text-xs bg-slate-800 border border-slate-700 text-white rounded-xl px-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="all">All Features</option>
                    <option value="route_planner">Route Planner</option>
                    <option value="sos_alert">SOS Emergency</option>
                    <option value="bus_tracking">Bus Tracking</option>
                    <option value="crowd_prediction">Crowd Prediction</option>
                    <option value="voice_assistant">Voice Assistant</option>
                    <option value="encrypted_chat">Encrypted Chat</option>
                    <option value="offline_pack">Offline Pack</option>
                    <option value="concession_pass">Concession Pass</option>
                    <option value="bug_report">Bug Reports</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Date / Time</th>
                      <th className="py-2.5 px-3">Commuter</th>
                      <th className="py-2.5 px-3">Feature Used</th>
                      <th className="py-2.5 px-3">Action Details</th>
                      <th className="py-2.5 px-3">Platform</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(!analyticsData?.recent_logs || analyticsData.recent_logs.length === 0) ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No audit logs found.
                        </td>
                      </tr>
                    ) : (
                      analyticsData.recent_logs
                        .filter((l) => {
                          const matchesSearch = !searchLogTerm ||
                            (l.user_email || "").toLowerCase().includes(searchLogTerm.toLowerCase()) ||
                            (l.user_name || "").toLowerCase().includes(searchLogTerm.toLowerCase()) ||
                            (l.action_details || "").toLowerCase().includes(searchLogTerm.toLowerCase());
                          const matchesFeat = selectedFeatureFilter === "all" || l.feature_name === selectedFeatureFilter;
                          return matchesSearch && matchesFeat;
                        })
                        .slice(0, 50)
                        .map((l) => (
                          <tr key={l.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5 px-3 text-slate-400 font-mono whitespace-nowrap">
                              {(l.timestamp || "").slice(0, 16).replace("T", " ")}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-white">{l.user_name || "Commuter"}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{l.user_email}</div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <Badge className="bg-emerald-950/80 text-emerald-300 border-emerald-500/30 capitalize font-medium">
                                {l.feature_name.replace(/_/g, " ")}
                              </Badge>
                              <div className="text-[10px] text-slate-500 mt-0.5">{l.feature_category}</div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate">
                              {l.action_details}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                {l.platform?.includes("Mobile") ? <Smartphone size={12} /> : <Laptop size={12} />}
                                {l.platform || "Web"}
                              </span>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>


          {/* SOS Alerts Tab */}
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

          {/* Bug Reports Tab */}
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

          {/* Live Users Tab */}
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
