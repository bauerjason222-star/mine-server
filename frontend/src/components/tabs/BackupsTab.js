import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { HardDrive, Plus, Loader2, RotateCcw, Trash2, Archive } from "lucide-react";

export default function BackupsTab({ server }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/servers/${server.id}/backups`);
      setBackups(r.data.backups);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [server.id]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const r = await api.post(`/servers/${server.id}/backups`);
      toast.success(`Backup created (${r.data.size_kb} KB)`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Backup failed");
    } finally {
      setCreating(false);
    }
  };

  const restore = async (name) => {
    try {
      await api.post(`/servers/${server.id}/backups/restore`, { name });
      toast.success("World restored from backup");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Restore failed");
    }
  };

  const remove = async (name) => {
    try {
      await api.delete(`/servers/${server.id}/backups/${encodeURIComponent(name)}`);
      toast.success("Backup deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-xl font-bold text-slate-100">World Backups</h3>
          <p className="text-sm text-slate-500">Snapshot your world folders. Stop the server before restoring.</p>
        </div>
        <Button data-testid="create-backup-btn" onClick={create} disabled={creating}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">
          {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />} Create Backup
        </Button>
      </div>

      {loading ? (
        <div className="text-slate-500 py-10 text-center flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : backups.length === 0 ? (
        <div data-testid="backups-empty" className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 py-16 text-center">
          <Archive className="h-10 w-10 text-slate-600 mx-auto" />
          <p className="mt-3 text-slate-400">No backups yet.</p>
          <p className="text-xs text-slate-600">Start the server once to generate a world, then create a backup.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="backups-list">
          {backups.map((b) => (
            <div key={b.name} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-5 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 shrink-0">
                  <HardDrive className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-sm text-slate-200 truncate">{b.name}</div>
                  <div className="text-xs text-slate-500">{b.size_kb} KB · {new Date(b.created).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" data-testid={`restore-backup-${b.name}`}
                      className="border-slate-700 bg-transparent hover:bg-slate-800 h-8">
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-100">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-400">
                        This will overwrite the current world with the backup. Make sure the server is stopped.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-slate-800 border-slate-700 hover:bg-slate-700">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => restore(b.name)} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950">Restore</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button data-testid={`delete-backup-${b.name}`} onClick={() => remove(b.name)}
                  className="text-slate-500 hover:text-red-400 transition-colors p-2">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
