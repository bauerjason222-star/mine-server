import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Dashboard from "@/pages/Dashboard";
import ServerDetail from "@/pages/ServerDetail";

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="App min-h-screen bg-slate-950 text-slate-100">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/server/:id" element={<ServerDetail />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" theme="dark" richColors />
    </div>
  );
}

export default App;
