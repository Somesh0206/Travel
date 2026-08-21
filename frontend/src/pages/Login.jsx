import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const r = await login(email, password);
    setLoading(false);
    if (r.ok) nav(r.user.role === "admin" ? "/admin" : "/");
    else setErr(r.error);
  };

  const handleQuickAdmin = async () => {
    setEmail("admin@mova.app");
    setPassword("admin");
    setErr("");
    setLoading(true);
    const r = await login("admin@mova.app", "admin");
    setLoading(false);
    if (r.ok) {
      toast.success("Admin authenticated successfully!");
      nav("/admin");
    } else {
      setErr(r.error);
    }
  };

  return (
    <div className="min-h-screen mova-hero-grid grid place-items-center p-4">
      <Card className="w-full max-w-md mova-glass" data-testid="login-card">
        <CardHeader className="text-center">
          <div className="mx-auto w-11 h-11 rounded-xl grid place-items-center bg-[#00E5FF] text-black mb-2">
            <Bus size={20} />
          </div>
          <CardTitle className="text-3xl tracking-tighter" style={{ fontFamily: "Outfit" }}>Welcome back to MOVA</CardTitle>
          <CardDescription>Safer, accessible journeys across KIIT & Bhubaneswar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email or Username</Label>
              <Input id="email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="e.g. user@mova.app or admin"
                autoComplete="email" data-testid="login-email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                placeholder="Enter your password"
                autoComplete="current-password" data-testid="login-password" />
            </div>
            {err && <div className="text-sm text-[#FF3B30]" data-testid="login-error">{err}</div>}
            <Button type="submit" className="w-full pill-btn bg-[#00E5FF] text-black hover:bg-[#00B8CC]"
              disabled={loading} data-testid="login-submit">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="text-sm text-center mt-4 opacity-80">
            New to MOVA?{" "}
            <Link to="/register" className="text-[#00E5FF] hover:underline" data-testid="link-register">Create account</Link>
          </div>
          
          {/* Quick Admin Access section with password 'admin' */}
          <div className="mt-5 p-3.5 rounded-2xl border border-white/10 bg-[#12121A]/80 space-y-2" data-testid="admin-hint">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#00E5FF] font-semibold flex items-center gap-1">
                <ShieldCheck size={13} /> Staff Admin Portal
              </div>
              <Badge variant="outline" className="text-[10px] border-[#00E5FF]/40 text-[#00E5FF]">
                Password: admin
              </Badge>
            </div>
            <div className="text-xs opacity-75">
              Authorised staff login credential: <span className="font-mono text-[#00E5FF]">admin@mova.app</span> / password <span className="font-mono text-[#00E5FF]">admin</span>.
            </div>
            <Button
              type="button"
              onClick={handleQuickAdmin}
              disabled={loading}
              className="w-full mt-1.5 text-xs py-2 h-auto bg-white/10 hover:bg-[#00E5FF]/20 hover:text-[#00E5FF] border border-white/15 rounded-xl font-semibold transition-all"
              data-testid="admin-quick-login-btn"
            >
              <ShieldCheck size={14} className="mr-1.5 text-[#00E5FF]" /> Quick Admin Sign In (Password: admin)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
