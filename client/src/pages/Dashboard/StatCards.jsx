import StatCard from '../../components/ui/StatCard';

export default function StatCards({ assignments, clients }) {
  const total = assignments.length;
  const completed = assignments.filter(a => a.status === 'Completed').length;
  const inProgress = assignments.filter(a => a.status === 'In Progress').length;
  const overdue = assignments.filter(a =>
    a.dueDate && new Date(a.dueDate + 'T23:59:59') < new Date() && a.status !== 'Completed'
  ).length;
  const rate = total ? Math.round((completed / total) * 100) : 0;
  const clientsWithIP = new Set(
    assignments.filter(a => a.status === 'In Progress').map(a => a.clientId)
  ).size;

  // Count assignments created this month
  const now = new Date();
  const thisMonthCount = assignments.filter(a => {
    const d = new Date(a.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
      <StatCard
        label="Total Assignments"
        value={total}
        subtitle={`+${thisMonthCount} this month`}
        color="blue"
      />
      <StatCard
        label="Completed"
        value={completed}
        subtitle={`${rate}% completion rate`}
        color="green"
      />
      <StatCard
        label="In Progress"
        value={inProgress}
        subtitle={`across ${clientsWithIP} clients`}
        color="blue"
      />
      <StatCard
        label="Overdue"
        value={overdue}
        subtitle="needs attention"
        color="red"
        highlight={overdue > 0}
      />
    </div>
  );
}
