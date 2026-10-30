import { STATUS_COLORS } from '../../utils/constants';

export default function Badge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS['On Hold'];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: colors.bg, color: colors.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.text }} />
      {status}
    </span>
  );
}
