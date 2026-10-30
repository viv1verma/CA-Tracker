export default function StatCard({ label, value, subtitle, color = 'blue', highlight = false }) {
  const dotColors = { blue: 'bg-blue-600', green: 'bg-emerald-500', red: 'bg-red-500' };
  const textColors = { blue: 'text-gray-900', green: 'text-emerald-600', red: 'text-red-600' };
  return (
    <div className={`rounded-xl border p-5 ${highlight ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${dotColors[color] || dotColors.blue}`} />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-4xl font-bold ${textColors[color] || textColors.blue}`}>{value}</div>
      {subtitle && (
        <div className={`text-sm mt-1 ${highlight ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
