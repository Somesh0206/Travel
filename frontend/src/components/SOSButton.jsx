import { useState } from "react";
import { AlertTriangle, PhoneCall, Volume2, VolumeX, MessageSquare, ShieldAlert } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

// Nearest police helper
function nearest(from, list) {
  if (!from || !list?.length) return null;
  let best = null; let bestD = Infinity;
  for (const p of list) {
    const dx = (p.lat - from.lat), dy = (p.lng - from.lng);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// Web Audio API emergency siren generator
let sirenAudioCtx = null;
let sirenOsc = null;
let sirenInterval = null;

function playSiren() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    sirenAudioCtx = new AudioContext();
    sirenOsc = sirenAudioCtx.createOscillator();
    const gainNode = sirenAudioCtx.createGain();
    
    sirenOsc.type = "sawtooth";
    sirenOsc.frequency.setValueAtTime(800, sirenAudioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.3, sirenAudioCtx.currentTime);
    
    sirenOsc.connect(gainNode);
    gainNode.connect(sirenAudioCtx.destination);
    sirenOsc.start();

    let high = true;
    sirenInterval = setInterval(() => {
      if (sirenOsc && sirenAudioCtx) {
        sirenOsc.frequency.setValueAtTime(high ? 1200 : 700, sirenAudioCtx.currentTime);
        high = !high;
      }
    }, 400);
  } catch (e) {
    console.error("Siren audio error", e);
  }
}

function stopSiren() {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  if (sirenOsc) {
    try { sirenOsc.stop(); } catch (e) {}
    sirenOsc = null;
  }
  if (sirenAudioCtx) {
    try { sirenAudioCtx.close(); } catch (e) {}
    sirenAudioCtx = null;
  }
}

export default function SOSButton({ userLoc, police, onOpenSafety }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);

  const toggleSiren = () => {
    if (sirenActive) {
      stopSiren();
      setSirenActive(false);
      toast.info("Audible siren deactivated");
    } else {
      playSiren();
      setSirenActive(true);
      toast.error("🚨 AUDIBLE SOS SIREN ACTIVATED!", { duration: 5000 });
    }
  };

  const trigger = async () => {
    if (!user.alt_phone) {
      toast.warning("Please set an alternate contact first");
      onOpenSafety?.();
      return;
    }
    setSending(true);
    try {
      const loc = userLoc || { lat: 20.3558, lng: 85.8175 };
      const near = nearest(loc, police);
      const mapsLink = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
      const msg = `🚨 EMERGENCY SOS from ${user.name}! I need urgent assistance. Live GPS Location: ${mapsLink}`;
      
      await api.post("/sos", { lat: loc.lat, lng: loc.lng, message: msg });
      
      // Auto-trigger audible siren for immediate deterrence
      if (!sirenActive) {
        playSiren();
        setSirenActive(true);
      }

      const cleanPhone = (user.alt_phone || "").replace(/[^0-9]/g, "");
      const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;

      toast.error(`🚨 SOS ALERT BROADCASTED!`, {
        description: (
          <div className="space-y-1 mt-1 text-xs">
            <div>Notified: <b>{user.alt_name || "Emergency Contact"}</b> ({user.alt_phone})</div>
            {near && <div>Nearest Station: <b>{near.name}</b> ({near.phone})</div>}
            <div className="pt-1 flex items-center gap-2">
              <a href={waUrl} target="_blank" rel="noreferrer" className="text-[#00E5FF] underline font-bold inline-flex items-center gap-1">
                <MessageSquare size={12} /> Send WhatsApp Alert
              </a>
              <span>·</span>
              <a href="tel:112" className="text-red-400 underline font-bold inline-flex items-center gap-1">
                <PhoneCall size={12} /> Call 112 SOS
              </a>
            </div>
          </div>
        ),
        duration: 12000,
      });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to send SOS");
    } finally {
      setSending(false);
      setOpen(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {/* Siren Sound Alarm Toggle Button */}
        {sirenActive && (
          <button
            type="button"
            onClick={toggleSiren}
            className="rounded-full bg-amber-500 hover:bg-amber-600 text-black px-3 py-1.5 text-xs font-bold shadow-lg flex items-center gap-1 animate-bounce"
          >
            <VolumeX size={14} /> Stop Siren Alarm
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`sos-pulse rounded-full ${
            sirenActive ? "bg-red-600 animate-ping" : "bg-[#FF3B30] hover:bg-[#CC2F26]"
          } text-white h-16 w-16 grid place-items-center shadow-2xl border-2 border-white/20`}
          aria-label="SOS emergency"
          data-testid="sos-fab"
        >
          <span className="font-extrabold text-base tracking-wider" style={{ fontFamily: "Outfit" }}>
            SOS
          </span>
        </button>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="mova-glass border-red-500/30" data-testid="sos-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-xl font-bold text-[#FF3B30]">
              <AlertTriangle className="text-[#FF3B30]" /> Trigger Emergency SOS?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm opacity-80 leading-relaxed">
              MOVA will immediately broadcast your live GPS location to{" "}
              <b className="text-white">{user?.alt_name || "your emergency contact"}</b>{" "}
              (<span className="font-mono text-[#00E5FF]">{user?.alt_phone || "not set"}</span>), dispatch alerts to campus police, and initiate audible alarm deterrence.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel data-testid="sos-cancel" className="pill-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={trigger}
              disabled={sending}
              className="bg-[#FF3B30] hover:bg-[#CC2F26] text-white pill-btn font-bold shadow-lg shadow-red-500/30"
              data-testid="sos-confirm"
            >
              <PhoneCall size={16} className="mr-1.5" />
              {sending ? "Broadcasting…" : "🚨 Send SOS & Siren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
