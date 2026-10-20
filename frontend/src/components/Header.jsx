import { Activity, RefreshCw, Zap } from 'lucide-react';

export default function Header({ connected, refreshing, onRefresh }) {
  return <header className="mb-10 flex flex-col gap-5 border-b border-slate-700/60 pb-7 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20"><Zap size={24} fill="currentColor" /></div><div><h1 className="text-2xl font-bold tracking-tight text-white">eWeLink Control</h1><div className="mt-1 flex items-center gap-2 text-sm text-slate-400"><span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'}`} /><span>{connected ? 'Connected' : 'Connection unavailable'}</span></div></div></div>
    <button onClick={onRefresh} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Refreshing' : 'Refresh'}</button>
  </header>;
}
