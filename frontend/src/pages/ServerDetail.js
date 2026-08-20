import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import StatusBadge from "@/components/StatusBadge";
import ConsoleTab from "@/components/tabs/ConsoleTab";
import SettingsTab from "@/components/tabs/SettingsTab";
import PlayersTab from "@/components/tabs/PlayersTab";
import ModsTab from "@/components/tabs/ModsTab";
import BackupsTab from "@/components/tabs/BackupsTab";
import AutomationTab from "@/components/tabs/AutomationTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Play, Square, RotateCw, Trash2, ArrowLeft, Terminal, Settings, Package, HardDrive, Loader2, Users, RefreshCcw, Clock } from "lucide-react";

export default function ServerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/servers/${id}`);
      setServer(r.data);
    } catch (e) {
      if (e.response?.status === 404) { toast.error("Server not found"); navigate("/"); }
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const action = async (verb) => {
    setBusy(true);
    try {
      await api.post(`/servers/${id}/${verb}`);
      toast.success(`Server ${verb} requested`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || `Could not ${verb}`);
    } finally {
      setBusy(false);
    }
  };

  const removeServer = async () => {
    try {
      await api.delete(`/servers/${id}`);
      toast.success("Server deleted");
      navigate("/");
    } catch {
      toast.error("Delete failed");
    }
  };

  if (!server) {
    return <div className="flex h-screen items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const isRunning = ["running", "starting"].includes(server.status);
  const canStart = ["stopped", "error", "crashed"].includes(server.status);

  const toggleAutoRestart = async (val) => {
    setServer((s) => ({ ...s, auto_restart: val }));
    try {
      await api.put(`/servers/${id}`, { auto_restart: val });
      toast.success(val ? "Auto-restart enabled" : "Auto-restart disabled");
    } catch {
      toast.error("Could not update");
      load();
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button data-testid="back-btn" onClick={() => navigate("/")}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to servers
          </button>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-3xl font-black tracking-tight text-slate-50">{server.name}</h1>
                  <StatusBadge status={server.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500 font-mono">
                  {server.type} · {server.mc_version} · port {server.port} · {server.ram_mb}MB
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button data-testid="start-server-btn" onClick={() => action("start")}
                disabled={busy || !canStart || server.status === "installing"}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold disabled:opacity-40">
                <Play className="h-4 w-4 mr-1.5" /> Start
              </Button>
              <Button data-testid="stop-server-btn" onClick={() => action("stop")} disabled={busy || !isRunning}
                variant="outline" className="border-slate-700 bg-transparent hover:bg-slate-800 disabled:opacity-40">
                <Square className="h-4 w-4 mr-1.5" /> Stop
              </Button>
              <Button data-testid="restart-server-btn" onClick={() => action("restart")} disabled={busy || !isRunning}
                variant="outline" className="border-slate-700 bg-transparent hover:bg-slate-800 disabled:opacity-40">
                <RotateCw className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button data-testid="delete-server-btn" variant="outline"
                    className="border-red-900/60 bg-transparent text-red-400 hover:bg-red-500/10 hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this server?</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400">
                      This permanently deletes <b>{server.name}</b>, its world and all mods. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-slate-800 border-slate-700 hover:bg-slate-700">Cancel</AlertDialogCancel>
                    <AlertDialogAction data-testid="confirm-delete-btn" onClick={removeServer}
                      className="bg-red-500 hover:bg-red-400 text-white">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          {server.status === "installing" && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Installing server files… check the console for progress.
            </div>
          )}
          {server.status === "crashed" && (
            <div data-testid="crashed-banner" className="mt-3 flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              <RefreshCcw className="h-4 w-4" /> {server.message || "Server crashed unexpectedly."}
              {server.auto_restart ? " Auto-restart is enabled." : " Enable auto-restart to recover automatically."}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2.5">
            <Switch data-testid="auto-restart-switch" checked={!!server.auto_restart} onCheckedChange={toggleAutoRestart} />
            <Label className="text-sm text-slate-400 cursor-pointer flex items-center gap-1.5">
              <RefreshCcw className="h-3.5 w-3.5" /> Auto-restart on crash
            </Label>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs defaultValue="console" className="w-full">
          <TabsList className="bg-slate-900 border border-slate-800 p-1 h-auto">
            <TabsTrigger value="console" data-testid="tab-console" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 gap-1.5">
              <Terminal className="h-4 w-4" /> Console
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 gap-1.5">
              <Settings className="h-4 w-4" /> Settings
            </TabsTrigger>
            <TabsTrigger value="players" data-testid="tab-players" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 gap-1.5">
              <Users className="h-4 w-4" /> Players
            </TabsTrigger>
            <TabsTrigger value="mods" data-testid="tab-mods" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 gap-1.5">
              <Package className="h-4 w-4" /> {server.type === "paper" ? "Plugins" : "Mods"}
            </TabsTrigger>
            <TabsTrigger value="backups" data-testid="tab-backups" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 gap-1.5">
              <HardDrive className="h-4 w-4" /> Backups
            </TabsTrigger>
            <TabsTrigger value="automation" data-testid="tab-automation" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 gap-1.5">
              <Clock className="h-4 w-4" /> Automation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="console" className="mt-5">
            <ConsoleTab server={server} />
          </TabsContent>
          <TabsContent value="settings" className="mt-5">
            <SettingsTab server={server} />
          </TabsContent>
          <TabsContent value="players" className="mt-5">
            <PlayersTab server={server} />
          </TabsContent>
          <TabsContent value="mods" className="mt-5">
            <ModsTab server={server} />
          </TabsContent>
          <TabsContent value="backups" className="mt-5">
            <BackupsTab server={server} />
          </TabsContent>
          <TabsContent value="automation" className="mt-5">
            <AutomationTab server={server} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
