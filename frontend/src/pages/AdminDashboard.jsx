import { useEffect, useState, useRef } from "react";
import Header from "@/components/Header";
import MapView from "@/components/MapView";
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
  Sparkles
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
  };

  const fetchActiveThreadMessages = async (targetEmail) => {
    if (!targetEmail) return;
    try {
      const res = await api.get(`/chat/messages?with_user=${encodeURIComponent(targetEmail)}`);
      const msgs = res.data || [];
      setActiveMessages(msgs);

      // Decrypt incoming messages
      const newMap = { ...decryptedMap };
      for (const m of msgs) {
        if (!newMap[m.id]) {
          try {
            const plain = await decryptMessage(m.ciphertext, m.iv);
            newMap[m.id] = plain;
          } catch (e) {
            newMap[m.id] = "[Decryption Failed]";
          }
        }
      }
      setDecryptedMap(newMap);

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
  }, []);

  useEffect(() => {
    if (selectedUserEmail) {
      fetchActiveThreadMessages(selectedUserEmail);
      const tid = setInterval(() => fetchActiveThreadMessages(selectedUserEmail), 3000);
      return () => clearInterval(tid);
    }
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

      setDecryptedMap((prev) => ({
        ...prev,
        [sentMsg.id]: textToSend.trim()
      }));

      setActiveMessages((prev) => [...prev, sentMsg]);
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

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 stagger-in">
          <Kpi label="Live users" value={locs.length} icon={<Users size={16} />} testId="kpi-users" />
          <Kpi label="Active SOS" value={sos.filter(s => s.status === "active").length} icon={<AlertTriangle size={16} />} accent="#FF3B30" testId="kpi-sos" />
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
