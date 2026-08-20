import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Boxes, Package, Blocks, Hammer, Plus, Loader2, Check } from "lucide-react";

const TYPES = [
  { id: "vanilla", label: "Vanilla", desc: "Pure Minecraft, no mods", icon: Boxes },
  { id: "paper", label: "Paper", desc: "High performance + plugins", icon: Package },
  { id: "fabric", label: "Fabric", desc: "Lightweight modding", icon: Blocks },
  { id: "forge", label: "Forge", desc: "Classic modding platform", icon: Hammer },
];

export default function CreateServerWizard({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [type, setType] = useState("paper");
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [version, setVersion] = useState("");
  const [ram, setRam] = useState(2048);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingVersions(true);
    setVersion("");
    api.get(`/versions/${type}`)
      .then((r) => {
        setVersions(r.data.versions || []);
        if (r.data.versions?.length) setVersion(r.data.versions[0]);
      })
      .catch(() => toast.error("Could not load versions"))
      .finally(() => setLoadingVersions(false));
  }, [type, open]);

  const reset = () => { setStep(1); setName(""); setType("paper"); setRam(2048); };

  const submit = async () => {
    if (!name.trim()) return toast.error("Please enter a server name");
    if (!version) return toast.error("Please select a version");
    setSubmitting(true);
    try {
      const r = await api.post("/servers", { name: name.trim(), type, mc_version: version, ram_mb: ram });
      toast.success("Server created — installing in the background");
      setOpen(false);
      reset();
      onCreated?.(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button data-testid="open-create-server-btn" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">
          <Plus className="h-4 w-4 mr-1.5" /> New Server
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Create a Server</DialogTitle>
          <DialogDescription className="text-slate-400">
            Choose a type and version — MineHost downloads and configures everything for you.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="srv-name">Server name</Label>
              <Input id="srv-name" data-testid="server-name-input" value={name}
                onChange={(e) => setName(e.target.value)} placeholder="My Awesome Server"
                className="bg-slate-950 border-slate-800" />
            </div>
            <div className="space-y-2">
              <Label>Server type</Label>
              <div className="grid grid-cols-2 gap-3">
                {TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = type === t.id;
                  return (
                    <button key={t.id} data-testid={`type-option-${t.id}`} onClick={() => setType(t.id)}
                      className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-emerald-500 bg-emerald-500/10" : "border-slate-800 bg-slate-950 hover:border-slate-700"}`}>
                      <div className="flex items-center justify-between">
                        <Icon className={`h-5 w-5 ${active ? "text-emerald-400" : "text-slate-400"}`} />
                        {active && <Check className="h-4 w-4 text-emerald-400" />}
                      </div>
                      <div className="mt-2 font-semibold text-sm text-slate-100">{t.label}</div>
                      <div className="text-xs text-slate-500">{t.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button data-testid="wizard-next-btn" onClick={() => name.trim() ? setStep(2) : toast.error("Enter a name first")}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold w-full">Continue</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Minecraft version</Label>
              {loadingVersions ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading versions…</div>
              ) : (
                <Select value={version} onValueChange={setVersion}>
                  <SelectTrigger data-testid="version-select" className="bg-slate-950 border-slate-800">
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-100 max-h-72">
                    {versions.map((v) => (
                      <SelectItem key={v} value={v} data-testid={`version-item-${v}`}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Allocated RAM</Label>
                <span className="font-mono text-emerald-400 text-sm">{ram} MB</span>
              </div>
              <Slider data-testid="ram-slider" min={512} max={8192} step={512} value={[ram]}
                onValueChange={(v) => setRam(v[0])} />
              <div className="flex justify-between text-xs text-slate-500"><span>512 MB</span><span>8 GB</span></div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="border-slate-700 bg-transparent hover:bg-slate-800">Back</Button>
              <Button data-testid="create-server-submit-btn" onClick={submit} disabled={submitting || !version}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold flex-1">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Create Server
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
