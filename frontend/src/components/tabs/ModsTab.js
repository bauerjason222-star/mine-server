import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, Trash2, Loader2, Package, ExternalLink } from "lucide-react";

export default function ModsTab({ server }) {
  const kind = server.type === "paper" ? "plugin" : "mod";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [installed, setInstalled] = useState([]);
  const [searching, setSearching] = useState(false);
  const [installingId, setInstallingId] = useState(null);

  const loadInstalled = useCallback(async () => {
    try {
      const r = await api.get(`/servers/${server.id}/mods`);
      setInstalled(r.data.mods);
    } catch { /* ignore */ }
  }, [server.id]);

  const search = useCallback(async () => {
    setSearching(true);
    try {
      const r = await api.get(`/servers/${server.id}/mods/search`, { params: { q: query } });
      setResults(r.data.results);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Search failed");
    } finally {
      setSearching(false);
    }
  }, [server.id, query]);

  useEffect(() => { loadInstalled(); search(); /* eslint-disable-next-line */ }, [loadInstalled]);

  const install = async (project_id, title) => {
    setInstallingId(project_id);
    try {
      const r = await api.post(`/servers/${server.id}/mods`, { project_id });
      toast.success(`Installed ${title} (${r.data.filename})`);
      loadInstalled();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not install");
    } finally {
      setInstallingId(null);
    }
  };

  const remove = async (filename) => {
    try {
      await api.delete(`/servers/${server.id}/mods/${encodeURIComponent(filename)}`);
      toast.success("Removed");
      loadInstalled();
    } catch {
      toast.error("Could not remove");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Search / browse */}
      <div className="lg:col-span-2 space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input data-testid="mod-search-input" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${kind}s on Modrinth for ${server.mc_version}…`}
              className="pl-9 bg-slate-950 border-slate-800" />
          </div>
          <Button data-testid="mod-search-btn" type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </form>

        {searching && results.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center">Searching Modrinth…</div>
        ) : results.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center">No results. Try another search.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {results.map((m) => (
              <div key={m.project_id} data-testid={`mod-result-${m.slug}`}
                className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex gap-3">
                <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-800 overflow-hidden flex items-center justify-center">
                  {m.icon_url ? <img src={m.icon_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-slate-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-slate-100 text-sm truncate">{m.title}</h4>
                    <a href={`https://modrinth.com/${kind}/${m.slug}`} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{m.description}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-slate-600">{m.downloads.toLocaleString()} downloads</span>
                    <Button size="sm" data-testid={`install-mod-${m.slug}`} onClick={() => install(m.project_id, m.title)}
                      disabled={installingId === m.project_id}
                      className="h-7 bg-emerald-500/90 hover:bg-emerald-400 text-slate-950 text-xs font-semibold">
                      {installingId === m.project_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Download className="h-3.5 w-3.5 mr-1" /> Install</>}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Installed */}
      <div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 sticky top-[125px]">
          <h3 className="font-display text-lg font-bold text-slate-100 mb-3 flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-400" /> Installed {kind}s ({installed.length})
          </h3>
          {installed.length === 0 ? (
            <p className="text-sm text-slate-500">None installed yet.</p>
          ) : (
            <div className="space-y-2" data-testid="installed-mods-list">
              {installed.map((m) => (
                <div key={m.filename} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-200 font-mono truncate">{m.filename}</div>
                    <div className="text-[11px] text-slate-600">{m.size_kb} KB</div>
                  </div>
                  <button data-testid={`remove-mod-${m.filename}`} onClick={() => remove(m.filename)}
                    className="text-slate-500 hover:text-red-400 transition-colors shrink-0 ml-2">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
