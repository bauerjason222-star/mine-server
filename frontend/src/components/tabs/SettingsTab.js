import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, Gamepad2, Globe, Users, Zap, Network, MemoryStick } from "lucide-react";

const GROUP_ICONS = { Gameplay: Gamepad2, World: Globe, Players: Users, Performance: Zap, Network: Network };

export default function SettingsTab({ server }) {
  const [schema, setSchema] = useState([]);
  const [groups, setGroups] = useState([]);
  const [props, setProps] = useState({});
  const [ram, setRam] = useState(server.ram_mb);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sch, pr] = await Promise.all([
        api.get(`/property-schema`),
        api.get(`/servers/${server.id}/properties`),
      ]);
      setSchema(sch.data.schema);
      setGroups(sch.data.groups);
      setProps(pr.data.properties);
    } catch {
      toast.error("Could not load settings");
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => { load(); }, [load]);

  const setVal = (key, val) => setProps((p) => ({ ...p, [key]: val }));

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        api.put(`/servers/${server.id}/properties`, { properties: props }),
        ram !== server.ram_mb ? api.put(`/servers/${server.id}`, { ram_mb: ram }) : Promise.resolve(),
      ]);
      toast.success("Settings saved. Restart the server to apply changes.");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-400 py-10 justify-center"><Loader2 className="h-5 w-5 animate-spin" /> Loading settings…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between sticky top-[110px] z-10 rounded-lg border border-slate-800 bg-slate-950/90 backdrop-blur px-4 py-3">
        <p className="text-sm text-slate-400">Fine-tune every aspect of your server.</p>
        <Button data-testid="save-settings-btn" onClick={save} disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />} Save Changes
        </Button>
      </div>

      {/* RAM allocation */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-2 mb-4">
          <MemoryStick className="h-5 w-5 text-emerald-400" />
          <h3 className="font-display text-lg font-bold text-slate-100">Resources</h3>
        </div>
        <div className="max-w-md">
          <div className="flex items-center justify-between mb-2">
            <Label>Allocated RAM</Label>
            <span className="font-mono text-emerald-400 text-sm">{ram} MB</span>
          </div>
          <Slider data-testid="settings-ram-slider" min={512} max={8192} step={512} value={[ram]} onValueChange={(v) => setRam(v[0])} />
        </div>
      </section>

      {groups.map((g) => {
        const Icon = GROUP_ICONS[g] || Gamepad2;
        const fields = schema.filter((f) => f.group === g);
        return (
          <section key={g} className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Icon className="h-5 w-5 text-emerald-400" />
              <h3 className="font-display text-lg font-bold text-slate-100">{g}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              {fields.map((f) => (
                <Field key={f.key} field={f} value={props[f.key] ?? f.default} onChange={(v) => setVal(f.key, v)} />
              ))}
            </div>
          </section>
        );
      })}

      <div className="flex justify-end">
        <Button data-testid="save-settings-btn-bottom" onClick={save} disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />} Save Changes
        </Button>
      </div>
    </div>
  );
}

function Field({ field, value, onChange }) {
  const tid = `setting-${field.key}`;
  if (field.type === "switch") {
    return (
      <div className="flex items-center justify-between rounded-lg bg-slate-950/50 px-4 py-3">
        <Label className="text-slate-300">{field.label}</Label>
        <Switch data-testid={tid} checked={value === "true"} onCheckedChange={(c) => onChange(c ? "true" : "false")} />
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div className="space-y-1.5">
        <Label className="text-slate-300 text-sm">{field.label}</Label>
        <Select value={String(value)} onValueChange={onChange}>
          <SelectTrigger data-testid={tid} className="bg-slate-950 border-slate-800"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
            {field.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-slate-300 text-sm">{field.label}</Label>
      <Input data-testid={tid} type={field.type === "number" ? "number" : "text"}
        value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-slate-950 border-slate-800" />
    </div>
  );
}
