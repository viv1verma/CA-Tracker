export default function ProgressBar({ value = 0, className = '' }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 100 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#d97706';
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: pct + '%', background: color }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  );
}
