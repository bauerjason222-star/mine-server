import { Cpu } from "lucide-react";

const CONFIG = {
  installing: { label: "Installing", dot: "bg-amber-400", text: "text-amber-400", ring: "ring-amber-400/30", pulse: true },
  starting: { label: "Starting", dot: "bg-amber-400", text: "text-amber-400", ring: "ring-amber-400/30", pulse: true },
  running: { label: "Running", dot: "bg-emerald-400", text: "text-emerald-400", ring: "ring-emerald-400/30", pulse: true },
  stopping: { label: "Stopping", dot: "bg-orange-400", text: "text-orange-400", ring: "ring-orange-400/30", pulse: true },
  stopped: { label: "Stopped", dot: "bg-slate-500", text: "text-slate-400", ring: "ring-slate-500/20", pulse: false },
  error: { label: "Error", dot: "bg-red-500", text: "text-red-400", ring: "ring-red-500/30", pulse: false },
};

export default function StatusBadge({ status }) {
  const c = CONFIG[status] || CONFIG.stopped;
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium ring-1 ${c.ring} ${c.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${c.dot} ${c.pulse ? "pulse-dot" : ""}`} />
      {c.label}
    </span>
  );
}
