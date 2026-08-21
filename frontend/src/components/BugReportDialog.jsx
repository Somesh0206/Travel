import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Bug } from "lucide-react";

export default function BugReportDialog({ open, onOpenChange }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("bug");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !desc.trim()) {
      toast.error("Title and description are required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/bugs", { title: title.trim(), description: desc.trim(), category });
      toast.success("Report sent to admin");
      setTitle(""); setDesc(""); setCategory("bug");
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to send");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="bug-report-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug size={18} className="text-[#B24CFF]" /> Report an issue
          </DialogTitle>
          <DialogDescription>Tell admin about crowding, delays, or a bug you found.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="bug-category-trigger"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug / app issue</SelectItem>
                <SelectItem value="crowding">Crowding</SelectItem>
                <SelectItem value="delay">Delay</SelectItem>
                <SelectItem value="accessibility">Accessibility problem</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bug-title">Title</Label>
            <Input id="bug-title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Dark-mode toggle stuck" data-testid="bug-title-input" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bug-desc">Description</Label>
            <Textarea id="bug-desc" value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="Steps to reproduce, route number, stop name…" rows={4}
              data-testid="bug-desc-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="bug-cancel-btn">Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-[#B24CFF] hover:bg-[#9032dd] text-white"
            data-testid="bug-submit-btn">
            {saving ? "Sending…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
