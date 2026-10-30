import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import StatCards from './StatCards';
import RecentAssignments from './RecentAssignments';
import AssignmentsByStatus from './AssignmentsByStatus';
import DueThisWeek from './DueThisWeek';

export default function Dashboard() {
  const { user } = useAuth();
  const { assignments, clients, loading } = useData();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Calculate due this week count
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(todayStart.getDate() + (6 - todayStart.getDay()));
  weekEnd.setHours(23, 59, 59, 999);

  const dueThisWeek = assignments.filter(a =>
    a.dueDate &&
    a.status !== 'Completed' &&
    new Date(a.dueDate + 'T23:59:59') >= todayStart &&
    new Date(a.dueDate + 'T23:59:59') <= weekEnd
  ).length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      {/* Greeting */}
      <h1 className="text-2xl font-bold text-gray-900">
        {greeting}, {user?.name}
      </h1>
      <p className="text-gray-500 mt-1">
        {today} &middot; {dueThisWeek} assignment{dueThisWeek !== 1 ? 's' : ''} due this week
      </p>

      {/* Stat Cards */}
      <StatCards assignments={assignments} clients={clients} />

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Recent Assignments (takes 2 cols) */}
        <div className="lg:col-span-2">
          <RecentAssignments assignments={assignments} clients={clients} />
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <AssignmentsByStatus assignments={assignments} />
          <DueThisWeek assignments={assignments} clients={clients} />
        </div>
      </div>
    </div>
  );
}
