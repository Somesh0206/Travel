import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LogOut, Bus, ShieldCheck, WifiOff, Bug } from "lucide-react";

export default function Header({ onBug }) {
  const { user, logout, theme, toggleTheme } = useAuth();
  const nav = useNavigate();

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Travel safe tonight";
  };

  return (
    <header className="mova-glass sticky top-0 z-40 border-b" data-testid="site-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2" data-testid="logo-link">
          <div className="w-9 h-9 rounded-xl grid place-items-center bg-[#00E5FF] text-black">
            <Bus size={18} strokeWidth={2.4} />
          </div>
          <div className="leading-none">
            <div className="text-xl font-bold tracking-tighter" style={{ fontFamily: "Outfit" }}>MOVA</div>
            <div className="text-[10px] uppercase tracking-[0.25em] opacity-60">Accessible transit</div>
          </div>
        </Link>

        <nav className="ml-6 hidden md:flex items-center gap-1 text-sm">
          <Link to="/" className="px-3 py-1.5 rounded-full hover:bg-white/5" data-testid="nav-home">Home</Link>
          <Link to="/offline" className="px-3 py-1.5 rounded-full hover:bg-white/5 inline-flex items-center gap-1.5" data-testid="nav-offline">
            <WifiOff size={14} /> Offline
          </Link>
          {user && user.role === "admin" && (
            <Link to="/admin" className="px-3 py-1.5 rounded-full hover:bg-white/5 inline-flex items-center gap-1.5" data-testid="nav-admin">
              <ShieldCheck size={14} /> Admin
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user && (
            <div className="hidden sm:block text-sm mr-1" data-testid="header-greeting">
              <span className="opacity-70">{greeting()},</span>{" "}
              <span className="font-semibold">{user.name.split(" ")[0]}</span>
            </div>
          )}
          {user && (
            <Button variant="ghost" size="sm" className="pill-btn" onClick={onBug} data-testid="report-bug-btn">
              <Bug size={16} className="mr-1.5" /> Report
            </Button>
          )}
          <Button variant="ghost" size="icon" className="pill-btn" onClick={toggleTheme} data-testid="theme-toggle" aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          {user ? (
            <Button size="sm" variant="secondary" className="pill-btn"
              onClick={async () => { await logout(); nav("/login"); }} data-testid="logout-btn">
              <LogOut size={14} className="mr-1.5" /> Logout
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="pill-btn" onClick={() => nav("/login")} data-testid="header-login">Login</Button>
              <Button size="sm" className="pill-btn bg-[#00E5FF] text-black hover:bg-[#00B8CC]"
                onClick={() => nav("/register")} data-testid="header-register">Sign up</Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
