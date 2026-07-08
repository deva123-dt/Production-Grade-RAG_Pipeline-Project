import React, { useEffect, useRef, useState } from "react";
import { LogItem } from "../types";
import { Terminal, ShieldAlert, Sparkles, AlertTriangle, RefreshCw } from "lucide-react";

export const LogsTerminal: React.FC = () => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error("Failed to fetch logs", e);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 1500); // Poll logs every 1.5s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const getLogLevelStyles = (level: LogItem["level"]) => {
    switch (level) {
      case "SUCCESS":
        return { text: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-900/30" };
      case "WARNING":
        return { text: "text-amber-400", bg: "bg-amber-950/40 border-amber-900/30" };
      case "ERROR":
        return { text: "text-rose-400", bg: "bg-rose-950/40 border-rose-900/30" };
      default:
        return { text: "text-sky-400", bg: "bg-slate-900/60 border-slate-800/40" };
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-900 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[320px]">
      {/* Console Header */}
      <div className="bg-slate-900/80 px-4 py-2.5 flex items-center justify-between border-b border-slate-950">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-mono font-medium text-slate-200">RAG TRACE LOGGER</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </div>
        <div className="flex items-center space-x-3 text-[10px]">
          <button 
            onClick={() => setLogs([])}
            className="text-slate-400 hover:text-slate-200 font-mono transition-colors"
          >
            CLEAR SCREEN
          </button>
          <label className="flex items-center space-x-1 cursor-pointer select-none text-slate-400 hover:text-slate-200">
            <input 
              type="checkbox" 
              checked={autoScroll} 
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 w-3 h-3 text-indigo-500" 
            />
            <span className="font-mono">AUTOSCROLL</span>
          </label>
        </div>
      </div>

      {/* Terminal logs list */}
      <div className="p-4 overflow-y-auto flex-1 font-mono text-xs space-y-2 select-text scrollbar-thin scrollbar-thumb-slate-800">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-xs">
            No pipeline events logged yet. Execute an Ingestion or Q&A Query above to trace logs.
          </div>
        ) : (
          logs.map((log) => {
            const styles = getLogLevelStyles(log.level);
            return (
              <div 
                key={log.id} 
                className={`p-2 border rounded-md ${styles.bg} transition-all hover:bg-slate-900/40`}
              >
                <div className="flex flex-wrap items-center justify-between text-[10px] opacity-75 mb-1 border-b border-slate-900/30 pb-0.5">
                  <span className="text-slate-400">{log.timestamp} UTC</span>
                  <span className={`${styles.text} font-bold`}>{log.module.toUpperCase()} : {log.level}</span>
                </div>
                <p className="text-[11px] text-slate-300 whitespace-pre-line leading-relaxed">
                  {log.message}
                </p>
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};
