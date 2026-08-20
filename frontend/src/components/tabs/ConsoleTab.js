import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Cpu, MemoryStick, Users, ChevronRight } from "lucide-react";

export default function ConsoleTab({ server }) {
  const [lines, setLines] = useState([]);
  const [cmd, setCmd] = useState("");
  const [metrics, setMetrics] = useState({ cpu: 0, memory_mb: 0 });
  const [players, setPlayers] = useState([]);
  const sinceRef = useRef(0);
  const seenRef = useRef(new Set());
  const inFlightRef = useRef(false);
  const scrollRef = useRef(null);
  const autoScroll = useRef(true);
  const [live, setLive] = useState(false);

  const mergeData = useCallback((d) => {
    if (d.lines?.length) {
      const fresh = d.lines.filter((l) => !seenRef.current.has(l.i));
      fresh.forEach((l) => seenRef.current.add(l.i));
      if (d.last) sinceRef.current = d.last;
      if (fresh.length) setLines((prev) => [...prev, ...fresh].slice(-1500));
    }
    setMetrics(d.metrics || { cpu: 0, memory_mb: 0 });
    setPlayers(d.players || []);
  }, []);

  const poll = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const r = await api.get(`/servers/${server.id}/console`, { params: { since: sinceRef.current } });
      mergeData(r.data);
    } catch (e) { /* ignore */ } finally {
      inFlightRef.current = false;
    }
  }, [server.id, mergeData]);

  useEffect(() => {
    setLines([]); sinceRef.current = 0; seenRef.current = new Set();
    let ws = null, poller = null, closed = false;
    const startPolling = () => {
      if (poller || closed) return;
      setLive(false);
      poll();
      poller = setInterval(poll, 1500);
    };
    try {
      const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/^http/, "ws");
      ws = new WebSocket(`${base}/api/servers/${server.id}/ws`);
      ws.onopen = () => setLive(true);
      ws.onmessage = (e) => { try { mergeData(JSON.parse(e.data)); } catch (err) { /* ignore */ } };
      ws.onerror = () => startPolling();
      ws.onclose = () => { if (!closed) startPolling(); };
    } catch (e) { startPolling(); }
    const safety = setTimeout(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) startPolling();
    }, 3500);
    return () => {
      closed = true;
      clearTimeout(safety);
      if (poller) clearInterval(poller);
      if (ws) { ws.onclose = null; try { ws.close(); } catch (e) { /* ignore */ } }
    };
  }, [server.id, poll, mergeData]);

  useEffect(() => {
    if (autoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const send = async (e) => {
    e.preventDefault();
    const c = cmd.trim();
    if (!c) return;
    setCmd("");
    try {
      await api.post(`/servers/${server.id}/command`, { command: c });
      poll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Server not running");
    }
  };

  const colorize = (t) => {
    if (/error|exception|severe|failed/i.test(t)) return "text-red-400";
    if (/warn/i.test(t)) return "text-amber-400";
    if (/^\s*>/.test(t)) return "text-sky-400";
    if (/\bdone\b|joined the game|installation complete|ready to start/i.test(t)) return "text-emerald-400";
    if (/\[installer\]|\[forge\]|===/i.test(t)) return "text-violet-400";
    return "text-slate-300";
  };

  const ramPct = Math.min(100, Math.round((metrics.memory_mb / server.ram_mb) * 100)) || 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <div className="lg:col-span-3">
        <div className="rounded-xl border border-slate-800 bg-[#08090c] overflow-hidden flex flex-col" style={{ height: "60vh" }}>
          <div className="flex items-center justify-between border-b border-slate-800 bg-black/40 px-4 py-2">
            <span className="text-xs font-mono text-slate-500">console</span>
            <span data-testid="console-live-indicator" className="inline-flex items-center gap-1.5 text-[11px] font-medium">
              <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400 pulse-dot" : "bg-slate-600"}`} />
              <span className={live ? "text-emerald-400" : "text-slate-500"}>{live ? "LIVE" : "polling"}</span>
            </span>
          </div>
          <div ref={scrollRef} onScroll={onScroll}
            data-testid="console-output"
            className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed">
            {lines.length === 0 ? (
              <div className="text-slate-600">No output yet. Start the server to see logs…</div>
            ) : (
              lines.map((l) => (
                <div key={l.i} className={`whitespace-pre-wrap break-words ${colorize(l.text)}`}>{l.text}</div>
              ))
            )}
          </div>
          <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-800 bg-black/40 px-4 py-2.5">
            <ChevronRight className="h-4 w-4 text-emerald-400 shrink-0" />
            <input
              data-testid="console-command-input"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="Type a command (e.g. say Hello, list, op <player>)…"
              className="flex-1 bg-transparent font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
            />
          </form>
        </div>
      </div>

      <div className="space-y-4">
        <MetricCard icon={MemoryStick} label="Memory" value={`${metrics.memory_mb} MB`} sub={`of ${server.ram_mb} MB`} pct={ramPct} color="emerald" />
        <MetricCard icon={Cpu} label="CPU" value={`${metrics.cpu}%`} pct={Math.min(100, metrics.cpu)} color="sky" />
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><Users className="h-4 w-4" /> Online Players ({players.length})</div>
          {players.length === 0 ? (
            <p className="text-xs text-slate-600">No players online</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {players.map((p) => (
                <span key={p} className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-200">{p}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, pct, color }) {
  const bar = color === "emerald" ? "bg-emerald-500" : "bg-sky-500";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Icon className="h-4 w-4" /> {label}</div>
        <span className="font-mono text-slate-200 text-sm">{value}</span>
      </div>
      {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full ${bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
