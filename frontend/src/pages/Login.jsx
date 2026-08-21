import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bus } from "lucide-react";

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
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                autoComplete="email" data-testid="login-email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
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
          <div className="mt-5 p-3 rounded-xl border border-white/10 bg-[#12121A]/60" data-testid="admin-hint">
            <div className="text-[10px] uppercase tracking-[0.25em] opacity-60 mb-1">Admin console (locked)</div>
            <div className="text-xs opacity-80">Only authorised staff can open <span className="font-mono">/admin</span>.</div>
            <div className="text-xs opacity-70 mt-1">
              Demo: <span className="font-mono">admin@mova.app</span> / <span className="font-mono">mova@admin123</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
