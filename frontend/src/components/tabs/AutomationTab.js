import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Clock, Plus, Trash2, Loader2, RotateCw, HardDrive, MessageSquare, Send, Save, Skull, Trophy, Power, Users, ArrowLeftRight,
} from "lucide-react";

export default function AutomationTab({ server }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SchedulesCard server={server} />
      <DiscordCard server={server} />
    </div>
  );
}

/* ------------------------------- Schedules ------------------------------- */
function SchedulesCard({ server }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("restart");
  const [mode, setMode] = useState("daily");
  const [time, setTime] = useState("04:00");
  const [intervalHours, setIntervalHours] = useState(6);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/servers/${server.id}/schedules`);
      setSchedules(r.data.schedules);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [server.id]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setAdding(true);
    try {
      const r = await api.post(`/servers/${server.id}/schedules`, {
        action, mode, time, interval_hours: Number(intervalHours),
      });
      setSchedules(r.data.schedules);
      toast.success("Schedule added");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add schedule");
    } finally { setAdding(false); }
  };

  const toggle = async (sid, enabled) => {
    try {
      const r = await api.put(`/servers/${server.id}/schedules/${sid}`, { enabled });
      setSchedules(r.data.schedules);
    } catch { toast.error("Update failed"); }
  };

  const remove = async (sid) => {
    try {
      const r = await api.delete(`/servers/${server.id}/schedules/${sid}`);
      setSchedules(r.data.schedules);
      toast.success("Schedule removed");
    } catch { toast.error("Delete failed"); }
  };

  const describe = (s) => s.mode === "interval"
    ? `every ${s.interval_hours}h`
    : `daily at ${s.time}`;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="h-5 w-5 text-emerald-400" />
        <h3 className="font-display text-lg font-bold text-slate-100">Scheduled Tasks</h3>
      </div>
      <p className="text-sm text-slate-500 mb-5">Automatic restarts &amp; backups (server time / UTC).</p>

      <div className="space-y-3 rounded-lg bg-slate-950/50 p-4 mb-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Task</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger data-testid="schedule-action-select" className="bg-slate-950 border-slate-800"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                <SelectItem value="restart">Restart server</SelectItem>
                <SelectItem value="backup">Create backup</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Frequency</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger data-testid="schedule-mode-select" className="bg-slate-950 border-slate-800"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                <SelectItem value="daily">Daily at time</SelectItem>
                <SelectItem value="interval">Every N hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {mode === "daily" ? (
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Time (HH:MM)</Label>
            <Input data-testid="schedule-time-input" value={time} onChange={(e) => setTime(e.target.value)}
              placeholder="04:00" className="bg-slate-950 border-slate-800 max-w-[140px] font-mono" />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Interval (hours)</Label>
            <Input data-testid="schedule-interval-input" type="number" min={1} value={intervalHours}
              onChange={(e) => setIntervalHours(e.target.value)} className="bg-slate-950 border-slate-800 max-w-[140px] font-mono" />
          </div>
        )}
        <Button data-testid="schedule-add-btn" onClick={add} disabled={adding}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold w-full">
          {adding ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />} Add Schedule
        </Button>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">Loading…</div>
      ) : schedules.length === 0 ? (
        <p className="text-sm text-slate-600">No schedules yet.</p>
      ) : (
        <div className="space-y-2" data-testid="schedules-list">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-4 py-3">
              <div className="flex items-center gap-3">
                {s.action === "restart" ? <RotateCw className="h-4 w-4 text-sky-400" /> : <HardDrive className="h-4 w-4 text-emerald-400" />}
                <div>
                  <div className="text-sm text-slate-200 capitalize">{s.action}</div>
                  <div className="text-xs text-slate-500 font-mono">{describe(s)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch data-testid={`schedule-toggle-${s.id}`} checked={s.enabled} onCheckedChange={(v) => toggle(s.id, v)} />
                <button data-testid={`schedule-delete-${s.id}`} onClick={() => remove(s.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------- Discord -------------------------------- */
function DiscordCard({ server }) {
  const [cfg, setCfg] = useState({ enabled: false, channel_id: "", notify_deaths: true, notify_advancements: true, notify_status: true, notify_joins: true, notify_chat: true, bridge_from_discord: true, has_token: false });
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/servers/${server.id}/discord`);
      setCfg(r.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [server.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        enabled: cfg.enabled,
        channel_id: cfg.channel_id,
        notify_deaths: cfg.notify_deaths,
        notify_advancements: cfg.notify_advancements,
        notify_status: cfg.notify_status,
        notify_joins: cfg.notify_joins,
        notify_chat: cfg.notify_chat,
        bridge_from_discord: cfg.bridge_from_discord,
      };
      if (token.trim()) body.bot_token = token.trim();
      const r = await api.put(`/servers/${server.id}/discord`, body);
      setCfg((c) => ({ ...c, has_token: r.data.has_token }));
      setToken("");
      toast.success("Discord settings saved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      await api.post(`/servers/${server.id}/discord/test`);
      toast.success("Test message sent to Discord!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Test failed — check token & channel ID");
    } finally { setTesting(false); }
  };

  if (loading) return <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-500 text-sm">Loading…</div>;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-indigo-400" />
          <h3 className="font-display text-lg font-bold text-slate-100">Discord Notifications</h3>
        </div>
        <Switch data-testid="discord-enabled-switch" checked={cfg.enabled}
          onCheckedChange={(v) => setCfg((c) => ({ ...c, enabled: v }))} />
      </div>
      <p className="text-sm text-slate-500 mb-5">Post player deaths &amp; advancements to a Discord channel via your bot.</p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-sm">Bot Token</Label>
          <Input data-testid="discord-token-input" type="password" value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={cfg.has_token ? "•••••••• (saved — leave blank to keep)" : "Paste your Discord bot token"}
            className="bg-slate-950 border-slate-800 font-mono" />
          <p className="text-[11px] text-slate-600">
            Create a bot at discord.com/developers → Bot → Reset Token. Invite it to your server with "Send Messages".
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-sm">Channel ID</Label>
          <Input data-testid="discord-channel-input" value={cfg.channel_id}
            onChange={(e) => setCfg((c) => ({ ...c, channel_id: e.target.value }))}
            placeholder="Right-click a channel → Copy Channel ID"
            className="bg-slate-950 border-slate-800 font-mono" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between rounded-lg bg-slate-950/50 px-4 py-3">
            <Label className="text-slate-300 text-sm flex items-center gap-1.5"><Skull className="h-4 w-4 text-red-400" /> Deaths</Label>
            <Switch data-testid="discord-deaths-switch" checked={cfg.notify_deaths}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, notify_deaths: v }))} />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-950/50 px-4 py-3">
            <Label className="text-slate-300 text-sm flex items-center gap-1.5"><Trophy className="h-4 w-4 text-amber-400" /> Advancements</Label>
            <Switch data-testid="discord-advancements-switch" checked={cfg.notify_advancements}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, notify_advancements: v }))} />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-950/50 px-4 py-3">
            <Label className="text-slate-300 text-sm flex items-center gap-1.5"><Power className="h-4 w-4 text-emerald-400" /> Server status</Label>
            <Switch data-testid="discord-status-switch" checked={cfg.notify_status}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, notify_status: v }))} />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-950/50 px-4 py-3">
            <Label className="text-slate-300 text-sm flex items-center gap-1.5"><Users className="h-4 w-4 text-sky-400" /> Join / Leave</Label>
            <Switch data-testid="discord-joins-switch" checked={cfg.notify_joins}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, notify_joins: v }))} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
            <ArrowLeftRight className="h-4 w-4 text-indigo-400" /> Two-way Chat Bridge
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-slate-300 text-sm flex items-center gap-1.5"><MessageSquare className="h-4 w-4 text-emerald-400" /> In-game chat → Discord</Label>
            <Switch data-testid="discord-chat-switch" checked={cfg.notify_chat}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, notify_chat: v }))} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-slate-300 text-sm flex items-center gap-1.5"><MessageSquare className="h-4 w-4 text-indigo-400" /> Discord → in-game chat</Label>
            <Switch data-testid="discord-bridge-switch" checked={cfg.bridge_from_discord}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, bridge_from_discord: v }))} />
          </div>
          <p className="text-[11px] text-slate-600">Bridge relays messages while the server is running. Needs the bot's "Read Message History" permission &amp; Message Content Intent.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button data-testid="discord-save-btn" onClick={save} disabled={saving}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />} Save
          </Button>
          <Button data-testid="discord-test-btn" onClick={test} disabled={testing}
            variant="outline" className="border-indigo-700 bg-transparent text-indigo-300 hover:bg-indigo-500/10">
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />} Test
          </Button>
        </div>
      </div>
    </section>
  );
}
