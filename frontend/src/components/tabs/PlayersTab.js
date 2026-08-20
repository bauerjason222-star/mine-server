import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListChecks, Shield, Ban, Plus, X, UserMinus, Loader2 } from "lucide-react";

const SECTIONS = [
  { key: "whitelist", title: "Whitelist", icon: ListChecks, accent: "text-emerald-400",
    hint: "Only whitelisted players can join (enable 'Whitelist' in Settings).", placeholder: "Player name to whitelist" },
  { key: "ops", title: "Operators", icon: Shield, accent: "text-sky-400",
    hint: "OPs have full admin command access.", placeholder: "Player name to op" },
  { key: "banned", title: "Banned Players", icon: Ban, accent: "text-red-400",
    hint: "Banned players cannot join the server.", placeholder: "Player name to ban" },
];

export default function PlayersTab({ server }) {
  const [data, setData] = useState({ whitelist: [], ops: [], banned: [], online: [], whitelist_enabled: false });
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState({ whitelist: "", ops: "", banned: "" });
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/servers/${server.id}/players`);
      setData(r.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [server.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const add = async (listType) => {
    const name = inputs[listType].trim();
    if (!name) return toast.error("Enter a player name");
    setBusy(`add-${listType}`);
    try {
      const r = await api.post(`/servers/${server.id}/players/${listType}`, { name });
      setData(r.data);
      setInputs((s) => ({ ...s, [listType]: "" }));
      toast.success(`${name} added to ${listType}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Action failed");
    } finally { setBusy(null); }
  };

  const remove = async (listType, name) => {
    setBusy(`rm-${listType}-${name}`);
    try {
      const r = await api.delete(`/servers/${server.id}/players/${listType}/${encodeURIComponent(name)}`);
      setData(r.data);
      toast.success(`${name} removed`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Action failed");
    } finally { setBusy(null); }
  };

  const kick = async (name) => {
    setBusy(`kick-${name}`);
    try {
      await api.post(`/servers/${server.id}/players/kick/${encodeURIComponent(name)}`);
      toast.success(`Kicked ${name}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not kick");
    } finally { setBusy(null); }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-400 py-10 justify-center"><Loader2 className="h-5 w-5 animate-spin" /> Loading players…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Online players */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="font-display text-lg font-bold text-slate-100 mb-1">Online Players ({data.online.length})</h3>
        <p className="text-sm text-slate-500 mb-4">Players currently connected to the server.</p>
        {data.online.length === 0 ? (
          <p className="text-sm text-slate-600">No one is online right now.</p>
        ) : (
          <div className="flex flex-wrap gap-2" data-testid="online-players">
            {data.online.map((p) => (
              <div key={p} className="flex items-center gap-2 rounded-lg bg-slate-950/60 pl-3 pr-1.5 py-1.5">
                <span className="text-sm font-mono text-slate-200">{p}</span>
                <button data-testid={`kick-${p}`} onClick={() => kick(p)} disabled={busy === `kick-${p}`}
                  title="Kick player" className="rounded-md p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <UserMinus className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {SECTIONS.map((sec) => {
        const Icon = sec.icon;
        const list = data[sec.key] || [];
        return (
          <section key={sec.key} className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-5 w-5 ${sec.accent}`} />
              <h3 className="font-display text-lg font-bold text-slate-100">{sec.title} ({list.length})</h3>
              {sec.key === "whitelist" && (
                <span className={`ml-2 text-xs rounded-full px-2 py-0.5 ${data.whitelist_enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>
                  {data.whitelist_enabled ? "Enforced" : "Not enforced"}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mb-4">{sec.hint}</p>

            <form onSubmit={(e) => { e.preventDefault(); add(sec.key); }} className="flex gap-2 mb-4">
              <Input data-testid={`player-input-${sec.key}`} value={inputs[sec.key]}
                onChange={(e) => setInputs((s) => ({ ...s, [sec.key]: e.target.value }))}
                placeholder={sec.placeholder} className="bg-slate-950 border-slate-800 max-w-sm" />
              <Button type="submit" data-testid={`player-add-${sec.key}`} disabled={busy === `add-${sec.key}`}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">
                {busy === `add-${sec.key}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Add</>}
              </Button>
            </form>

            {list.length === 0 ? (
              <p className="text-sm text-slate-600">Empty.</p>
            ) : (
              <div className="flex flex-wrap gap-2" data-testid={`player-list-${sec.key}`}>
                {list.map((e) => (
                  <div key={e.name || e.uuid} className="flex items-center gap-2 rounded-lg bg-slate-950/60 pl-3 pr-1.5 py-1.5">
                    <span className="text-sm font-mono text-slate-200">{e.name}</span>
                    {sec.key === "banned" && e.reason && <span className="text-[11px] text-slate-600 max-w-[160px] truncate">({e.reason})</span>}
                    <button data-testid={`player-remove-${sec.key}-${e.name}`} onClick={() => remove(sec.key, e.name)}
                      disabled={busy === `rm-${sec.key}-${e.name}`}
                      className="rounded-md p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
