import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";

export default function Offline() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen mova-hero-grid">
      <Header />
      <main className="max-w-3xl mx-auto p-6 pt-16">
        <div className="mova-glass rounded-3xl p-10 text-center border" data-testid="offline-page">
          <div className="mx-auto w-16 h-16 rounded-2xl grid place-items-center bg-[#12121A] border border-white/10 mb-4">
            <WifiOff size={28} className="text-[#FF3B30]" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter" style={{ fontFamily: "Outfit" }}>
            no satellite connection
          </h1>
          <p className="mt-3 opacity-70 max-w-lg mx-auto">
            MOVA can't reach live map tiles right now. Cached routes and stops for KIIT / Bhubaneswar are still available below.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 gap-3 text-left" data-testid="offline-cached-routes">
            {[
              { name: "Campus Loop", tag: "Low-floor Bus", eta: "6 min" },
              { name: "Hospital Route", tag: "Wheelchair Bus", eta: "9 min" },
              { name: "Night Safe Ride", tag: "Campus Vehicle", eta: "14 min" },
              { name: "City Express", tag: "Shared Van", eta: "12 min" },
            ].map((r) => (
              <div key={r.name} className="p-4 rounded-2xl border border-white/10 bg-[#12121A]/60">
                <div className="text-xs uppercase tracking-[0.2em] opacity-60">{r.tag}</div>
                <div className="text-lg font-semibold" style={{ fontFamily: "Outfit" }}>{r.name}</div>
                <div className="text-sm opacity-70 mt-1">ETA {r.eta} · cached earlier today</div>
              </div>
            ))}
          </div>

          <Button className="mt-8 pill-btn bg-[#00E5FF] text-black hover:bg-[#00B8CC]"
            onClick={() => nav("/")} data-testid="offline-back">
            Back to live map
          </Button>
        </div>
      </main>
    </div>
  );
}
