import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import ProgressBar from '../../components/ui/ProgressBar';
import EmptyState from '../../components/ui/EmptyState';

export default function RecentAssignments({ assignments, clients }) {
  // Build a client lookup map
  const clientMap = {};
  clients.forEach(c => { clientMap[c.id || c._id] = c; });

  // Sort by most recently created/updated and take top 8
  const sorted = [...assignments]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 8);

  if (sorted.length === 0) {
    return (
      <Card title="Recent Assignments">
        <EmptyState title="No assignments yet" description="Assignments will appear here once created." />
      </Card>
    );
  }

  return (
    <Card
      title="Recent Assignments"
      action={
        <span className="text-xs text-gray-400">
          Showing {sorted.length} of {assignments.length}
        </span>
      }
    >
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="px-5 pb-3">Client</th>
              <th className="px-5 pb-3">Work</th>
              <th className="px-5 pb-3">Status</th>
              <th className="px-5 pb-3 w-40">Progress</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(a => {
              const client = clientMap[a.clientId];
              const clientName = client?.name || 'Unknown Client';
              const memberName = a.assignedToName || a.assignedTo || '';
              const progress = a.progress ?? 0;

              return (
                <tr key={a.id || a._id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={clientName} size={32} />
                      <div>
                        <div className="font-medium text-gray-900 truncate max-w-[180px]">{clientName}</div>
                        {memberName && (
                          <div className="text-xs text-gray-400 truncate max-w-[180px]">{memberName}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-gray-700">{a.workType || a.work || '--'}</span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge status={a.status} />
                  </td>
                  <td className="px-5 py-3">
                    <ProgressBar value={progress} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
