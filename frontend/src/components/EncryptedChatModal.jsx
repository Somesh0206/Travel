import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Send,
  Lock,
  ShieldCheck,
  Headphones,
  Sparkles,
  Bot,
  User,
  CheckCheck,
  AlertCircle
} from "lucide-react";

export default function EncryptedChatModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [decryptedMap, setDecryptedMap] = useState({});
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Securing AES-256 Tunnel...");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async () => {
    if (!user) return;
    try {
      const res = await api.get("/chat/messages");
      const rawMsgs = res.data || [];
      setMessages(rawMsgs);
      setConnectionStatus("🔒 E2EE Secure Node Active");

      // Decrypt any new messages
      const newMap = { ...decryptedMap };
      for (const m of rawMsgs) {
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
    } catch (err) {
      console.error("Failed to fetch chat messages:", err);
    }
  };

  useEffect(() => {
    if (isOpen && user) {
      setLoading(true);
      fetchMessages().finally(() => setLoading(false));

      const interval = setInterval(fetchMessages, 3000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, decryptedMap, isOpen]);

  const handleSendMessage = async (customText = null) => {
    const textToSend = typeof customText === "string" ? customText : inputVal;
    if (!textToSend.trim() || !user || sending) return;

    setSending(true);
    try {
      // 1. Client-Side Encryption
      const encryptedPacket = await encryptMessage(textToSend.trim());

      // 2. Transmit Ciphertext to Server
      const payload = {
        ciphertext: encryptedPacket.ciphertext,
        iv: encryptedPacket.iv,
        algorithm: encryptedPacket.algorithm,
        receiver_email: "admin@mova.app",
        message_type: "text",
        preview_hint: "🔒 Encrypted Message"
      };

      const res = await api.post("/chat/send", payload);
      const sentMsg = res.data;

      // 3. Immediately store decrypted in local map
      setDecryptedMap((prev) => ({
        ...prev,
        [sentMsg.id]: textToSend.trim()
      }));

      setMessages((prev) => [...prev, sentMsg]);
      setInputVal("");
      scrollToBottom();
    } catch (err) {
      console.error("Failed to send encrypted message:", err);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0d1117]/95 border border-[#00E5FF]/30 rounded-3xl shadow-2xl shadow-[#00E5FF]/10 overflow-hidden flex flex-col h-[620px] max-h-[90vh]">
        
        {/* Cyberpunk Glow Header */}
        <div className="p-4 bg-gradient-to-r from-[#161b22] via-[#0d1117] to-[#161b22] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-[#00E5FF]/10 border border-[#00E5FF]/40 grid place-items-center text-[#00E5FF]">
                <ShieldCheck size={22} />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#00E5FF] animate-pulse border-2 border-[#0d1117]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base tracking-tight" style={{ fontFamily: "Outfit" }}>
                  MOVA Secure Link
                </h3>
                <Badge className="bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30 text-[10px] py-0 px-2 font-mono">
                  AES-256
                </Badge>
              </div>
              <p className="text-xs text-white/60 flex items-center gap-1.5 mt-0.5">
                <Lock size={11} className="text-[#00E5FF]" />
                {connectionStatus}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white grid place-items-center transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Security Assurance Bar */}
        <div className="bg-[#00E5FF]/5 border-b border-[#00E5FF]/10 px-4 py-2 text-[11px] text-[#00E5FF]/80 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Lock size={12} /> Messages are client-side encrypted before transmission.
          </span>
          <span className="font-mono text-[10px] text-white/40">TLS + GCM</span>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {/* Welcome Message */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-xs text-white/70 flex items-start gap-2.5">
            <Bot size={16} className="text-[#00E5FF] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-white">System: Secure Node Connected</div>
              <div>
                You are securely connected with the <b>MOVA Transit Command Desk</b>. All communications are protected via zero-knowledge AES-256 GCM encryption.
              </div>
            </div>
          </div>

          {loading && messages.length === 0 ? (
            <div className="py-12 text-center text-xs text-white/50 animate-pulse">
              Establishing encrypted channel and fetching verified history...
            </div>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 grid place-items-center mx-auto text-white/40">
                <Headphones size={22} />
              </div>
              <div className="text-sm font-semibold text-white/80">No active messages</div>
              <p className="text-xs text-white/50 max-w-xs mx-auto">
                Need help with bus routes, accessibility ramps, lost items, or safety? Send a secure message below.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_email === user?.email;
              const decryptedContent = decryptedMap[m.id] || "Decrypting payload...";

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-white/50 font-mono">
                    {isMe ? (
                      <>
                        <span>You</span>
                        <User size={11} />
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={11} className="text-[#00E5FF]" />
                        <span className="text-[#00E5FF] font-semibold">MOVA Admin</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm shadow-md ${
                      isMe
                        ? "bg-gradient-to-r from-[#00b4d8] to-[#0077b6] text-white rounded-tr-none"
                        : "bg-[#1f2937] border border-white/10 text-white rounded-tl-none"
                    }`}
                  >
                    <div className="leading-relaxed whitespace-pre-wrap break-words">
                      {decryptedContent}
                    </div>

                    <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] opacity-60">
                      <Lock size={9} />
                      <span className="text-[9px] font-mono">AES</span>
                      {isMe && <CheckCheck size={12} className="text-cyan-200" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 bg-[#161b22]/70 border-t border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[10px] text-white/40 uppercase tracking-widest shrink-0">Quick:</span>
          {[
            "🚌 Bus arrival status",
            "🦽 Wheelchair ramp help",
            "🚨 Night corridor inquiry",
            "📍 Report station issue"
          ].map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip)}
              className="text-[11px] bg-white/5 hover:bg-[#00E5FF]/20 border border-white/10 hover:border-[#00E5FF]/40 text-white/70 hover:text-white rounded-full px-2.5 py-1 shrink-0 transition"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input Area */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 bg-[#161b22] border-t border-white/10 flex items-center gap-2"
        >
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Type encrypted message to Admin..."
            disabled={!user || sending}
            className="flex-1 bg-black/40 border-white/10 text-white placeholder:text-white/30 rounded-xl text-sm focus-visible:ring-[#00E5FF]"
          />
          <Button
            type="submit"
            disabled={!inputVal.trim() || !user || sending}
            className="bg-[#00E5FF] hover:bg-[#00b8cc] text-black font-bold rounded-xl px-4 shrink-0 transition"
          >
            {sending ? (
              <span className="animate-spin text-xs">...</span>
            ) : (
              <Send size={16} />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
