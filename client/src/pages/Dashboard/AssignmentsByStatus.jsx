import Card from '../../components/ui/Card';
import { STATUS_COLORS, STATUS_OPTIONS } from '../../utils/constants';

export default function AssignmentsByStatus({ assignments }) {
  // Count assignments per status
  const counts = {};
  STATUS_OPTIONS.forEach(s => { counts[s] = 0; });
  assignments.forEach(a => {
    if (counts[a.status] !== undefined) counts[a.status]++;
  });

  const total = assignments.length || 1; // avoid division by zero
  const maxCount = Math.max(...Object.values(counts), 1);

  return (
    <Card title="Assignments by Status">
      <div className="space-y-4">
        {STATUS_OPTIONS.map(status => {
          const count = counts[status];
          const pct = Math.round((count / maxCount) * 100);
          const colors = STATUS_COLORS[status];

          return (
            <div key={status}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: colors.bar }}
                  />
                  <span className="text-sm text-gray-700">{status}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{count}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: pct + '%', background: colors.bar }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
