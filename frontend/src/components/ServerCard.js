import { useNavigate } from "react-router-dom";
import { Users, Cpu, Boxes, Blocks, Package, Hammer } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

const TYPE_META = {
  vanilla: { label: "Vanilla", icon: Boxes, color: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20" },
  paper: { label: "Paper", icon: Package, color: "text-sky-400 bg-sky-500/10 ring-sky-500/20" },
  fabric: { label: "Fabric", icon: Blocks, color: "text-violet-400 bg-violet-500/10 ring-violet-500/20" },
  forge: { label: "Forge", icon: Hammer, color: "text-orange-400 bg-orange-500/10 ring-orange-500/20" },
};

export default function ServerCard({ server, index = 0 }) {
  const navigate = useNavigate();
  const meta = TYPE_META[server.type] || TYPE_META.vanilla;
  const Icon = meta.icon;

  return (
    <button
      data-testid={`server-card-${server.id}`}
      onClick={() => navigate(`/server/${server.id}`)}
      style={{ animationDelay: `${index * 60}ms` }}
      className="fade-up group text-left w-full rounded-xl border border-slate-800 bg-slate-900 p-6 transition-transform duration-200 hover:-translate-y-1 hover:border-slate-700 hover:shadow-xl hover:shadow-black/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-lg ring-1 ${meta.color}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-slate-50 leading-tight">{server.name}</h3>
            <p className="text-xs text-slate-500">{meta.label} · {server.mc_version}</p>
          </div>
        </div>
        <StatusBadge status={server.status} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs"><Users className="h-3.5 w-3.5" /> Players</div>
          <div className="mt-1 font-mono text-slate-200">{server.players?.length ?? 0}</div>
        </div>
        <div className="rounded-lg bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs"><Cpu className="h-3.5 w-3.5" /> RAM</div>
          <div className="mt-1 font-mono text-slate-200">{server.ram_mb}M</div>
        </div>
        <div className="rounded-lg bg-slate-950/60 p-3">
          <div className="text-slate-500 text-xs">Port</div>
          <div className="mt-1 font-mono text-slate-200">{server.port}</div>
        </div>
      </div>
    </button>
  );
}
