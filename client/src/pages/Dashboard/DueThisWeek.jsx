import Card from '../../components/ui/Card';
import { STATUS_COLORS } from '../../utils/constants';
import EmptyState from '../../components/ui/EmptyState';

export default function DueThisWeek({ assignments, clients }) {
  // Build client lookup
  const clientMap = {};
  clients.forEach(c => { clientMap[c.id || c._id] = c; });

  // Get current week boundaries (Sunday to Saturday)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + (6 - today.getDay())); // Saturday
  weekEnd.setHours(23, 59, 59, 999);

  // Filter assignments due this week that are not completed
  const dueItems = assignments
    .filter(a => {
      if (!a.dueDate || a.status === 'Completed') return false;
      const due = new Date(a.dueDate + 'T23:59:59');
      return due >= today && due <= weekEnd;
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 6);

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (dueItems.length === 0) {
    return (
      <Card title="Due This Week">
        <EmptyState title="All clear!" description="No assignments due this week." />
      </Card>
    );
  }

  return (
    <Card title="Due This Week">
      <div className="space-y-3">
        {dueItems.map(a => {
          const due = new Date(a.dueDate + 'T00:00:00');
          const day = due.getDate();
          const month = MONTHS[due.getMonth()];
          const client = clientMap[a.clientId];
          const clientName = client?.name || 'Unknown';
          const colors = STATUS_COLORS[a.status] || STATUS_COLORS['On Hold'];

          return (
            <div
              key={a.id || a._id}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {/* Date badge */}
              <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-200 flex flex-col items-center justify-center shrink-0">
                <span className="text-base font-bold text-gray-900 leading-tight">{day}</span>
                <span className="text-[10px] text-gray-400 uppercase leading-tight">{month}</span>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{clientName}</div>
                <div className="text-xs text-gray-400 truncate">{a.workType || a.work || '--'}</div>
              </div>

              {/* Status dot */}
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: colors.bar }}
                title={a.status}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
