import { useState } from "react";
import { AlertTriangle, PhoneCall } from "lucide-react";
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

export default function SOSButton({ userLoc, police, onOpenSafety }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

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
      const msg = `SOS from ${user.name}. Live location: https://maps.google.com/?q=${loc.lat},${loc.lng}`;
      await api.post("/sos", { lat: loc.lat, lng: loc.lng, message: msg });
      toast.success(`SOS sent to ${user.alt_name || "your contact"} (${user.alt_phone})`, {
        description: near ? `Nearest police: ${near.name} — ${near.phone}` : undefined,
        duration: 8000,
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sos-pulse fixed bottom-6 right-6 z-40 rounded-full bg-[#FF3B30] hover:bg-[#CC2F26] text-white h-16 w-16 grid place-items-center shadow-lg border-2 border-white/10"
        aria-label="SOS emergency"
        data-testid="sos-fab"
      >
        <span className="font-extrabold" style={{ fontFamily: "Outfit" }}>SOS</span>
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-testid="sos-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-[#FF3B30]" /> Send SOS?
            </AlertDialogTitle>
            <AlertDialogDescription>
              MOVA will share your live location with{" "}
              <b>{user?.alt_name || "your safety contact"}</b>{" "}
              (<span className="font-mono">{user?.alt_phone || "not set"}</span>) and notify admin.
              The nearest police station will also be highlighted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="sos-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={trigger} disabled={sending}
              className="bg-[#FF3B30] hover:bg-[#CC2F26] text-white"
              data-testid="sos-confirm">
              <PhoneCall size={16} className="mr-1.5" />
              {sending ? "Sending…" : "Send SOS now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
