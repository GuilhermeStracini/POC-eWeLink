export default function LoadingState() {
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-72 animate-pulse rounded-3xl border border-slate-700 bg-slate-800/60 p-6"><div className="h-12 w-12 rounded-2xl bg-slate-700" /><div className="mt-6 h-5 w-2/3 rounded bg-slate-700" /><div className="mt-3 h-4 w-1/3 rounded bg-slate-700" /><div className="mt-10 h-10 w-full rounded-xl bg-slate-700" /></div>)}</div>;
}
