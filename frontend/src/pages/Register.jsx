import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", alt_name: "", alt_phone: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const r = await register(form);
    setLoading(false);
    if (r.ok) nav("/");
    else setErr(r.error);
  };

  return (
    <div className="min-h-screen mova-hero-grid grid place-items-center p-4">
      <Card className="w-full max-w-lg mova-glass" data-testid="register-card">
        <CardHeader className="text-center">
          <div className="mx-auto w-11 h-11 rounded-xl grid place-items-center bg-[#B24CFF] text-white mb-2">
            <UserPlus size={20} />
          </div>
          <CardTitle className="text-3xl tracking-tighter" style={{ fontFamily: "Outfit" }}>Join MOVA</CardTitle>
          <CardDescription>Set a safety contact now so SOS works from day one</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" required value={form.name} onChange={upd("name")} data-testid="reg-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={form.email} onChange={upd("email")} data-testid="reg-email" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" required minLength={6} value={form.password} onChange={upd("password")} data-testid="reg-password" />
            </div>
            <div className="pt-2 border-t border-white/10">
              <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-2">Safety check-in</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="an">Alt contact name</Label>
                  <Input id="an" value={form.alt_name} onChange={upd("alt_name")} placeholder="Mom, roommate…" data-testid="reg-alt-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ap">Alt phone</Label>
                  <Input id="ap" value={form.alt_phone} onChange={upd("alt_phone")} placeholder="+91 …" data-testid="reg-alt-phone" />
                </div>
              </div>
            </div>
            {err && <div className="text-sm text-[#FF3B30]" data-testid="reg-error">{err}</div>}
            <Button type="submit" className="w-full pill-btn bg-[#B24CFF] hover:bg-[#9032dd] text-white"
              disabled={loading} data-testid="reg-submit">
              {loading ? "Creating…" : "Create account"}
            </Button>
          </form>
          <div className="text-sm text-center mt-4 opacity-80">
            Already have an account?{" "}
            <Link to="/login" className="text-[#00E5FF] hover:underline" data-testid="link-login">Sign in</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
