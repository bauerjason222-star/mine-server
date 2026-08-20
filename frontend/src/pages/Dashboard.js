import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import ServerCard from "@/components/ServerCard";
import CreateServerWizard from "@/components/CreateServerWizard";
import { Server, Boxes } from "lucide-react";

export default function Dashboard() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/servers");
      setServers(r.data);
    } catch (e) {
      // ignore transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const running = servers.filter((s) => s.status === "running").length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-slate-950">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <span className="font-display text-xl font-black tracking-tight text-slate-50">MineHost</span>
              <span className="ml-2 text-xs text-slate-500 hidden sm:inline">Minecraft Server Panel</span>
            </div>
          </div>
          <CreateServerWizard onCreated={load} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-black tracking-tight text-slate-50">Your Servers</h1>
            <p className="mt-1 text-slate-400">
              {servers.length} server{servers.length !== 1 ? "s" : ""} · <span className="text-emerald-400">{running} running</span>
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 rounded-xl border border-slate-800 bg-slate-900 animate-pulse" />
            ))}
          </div>
        ) : servers.length === 0 ? (
          <div data-testid="empty-state" className="fade-up rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 py-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
              <Server className="h-8 w-8 text-slate-500" />
            </div>
            <h2 className="mt-5 font-display text-2xl font-bold text-slate-100">No servers yet</h2>
            <p className="mt-2 text-slate-400">Create your first Minecraft server to get started.</p>
            <div className="mt-6 flex justify-center">
              <CreateServerWizard onCreated={load} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {servers.map((s, i) => <ServerCard key={s.id} server={s} index={i} />)}
          </div>
        )}
      </main>
    </div>
  );
}
