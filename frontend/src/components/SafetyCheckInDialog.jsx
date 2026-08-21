import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export default function SafetyCheckInDialog({ open, onOpenChange }) {
  const { user, updateSafety } = useAuth();
  const [name, setName] = useState(user?.alt_name || "");
  const [phone, setPhone] = useState(user?.alt_phone || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("Please provide both name and phone");
      return;
    }
    setSaving(true);
    const r = await updateSafety(name.trim(), phone.trim());
    setSaving(false);
    if (r.ok) {
      toast.success("Safety contact saved");
      onOpenChange(false);
    } else {
      toast.error(r.error || "Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="safety-checkin-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="text-[#00E5FF]" size={18} /> Safety Check-in
          </DialogTitle>
          <DialogDescription>
            Set an alternate contact. In an SOS, MOVA notifies them with your live location.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="alt-name">Alternate contact name</Label>
            <Input id="alt-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Mom, roommate, guardian…" data-testid="alt-name-input" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="alt-phone">Alternate phone</Label>
            <Input id="alt-phone" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 …" data-testid="alt-phone-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="safety-cancel-btn">Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#00E5FF] text-black hover:bg-[#00B8CC]"
            data-testid="safety-save-btn">
            {saving ? "Saving…" : "Save contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
