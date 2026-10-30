import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3, AlertTriangle, Users, CalendarDays,
  TrendingUp, ScrollText, CalendarOff, Clock,
} from 'lucide-react';

const REPORT_CARDS = [
  {
    key: 'workload',
    title: 'Workload Report',
    description: 'Team member workload distribution and task allocation analysis.',
    icon: BarChart3,
    color: 'from-blue-500 to-blue-600',
    iconBg: 'bg-blue-100 text-blue-600',
    path: '/reports/workload',
  },
  {
    key: 'overdue',
    title: 'Overdue Report',
    description: 'All overdue assignments with aging analysis and priority breakdown.',
    icon: AlertTriangle,
    color: 'from-red-500 to-red-600',
    iconBg: 'bg-red-100 text-red-600',
    path: '/reports/overdue',
  },
  {
    key: 'client',
    title: 'Client Report',
    description: 'Client-wise completion statistics and service delivery metrics.',
    icon: Users,
    color: 'from-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-600',
    path: '/reports/client',
  },
  {
    key: 'monthly',
    title: 'Monthly Report',
    description: 'Monthly performance summary with trends and comparisons.',
    icon: CalendarDays,
    color: 'from-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-600',
    path: '/reports/monthly',
  },
  {
    key: 'performance',
    title: 'Performance Analytics',
    description: 'Team performance metrics, on-time rates, and efficiency scores.',
    icon: TrendingUp,
    color: 'from-amber-500 to-amber-600',
    iconBg: 'bg-amber-100 text-amber-600',
    path: '/reports/performance',
  },
  {
    key: 'audit',
    title: 'Audit Trail',
    description: 'Complete activity log with entity tracking and change history.',
    icon: ScrollText,
    color: 'from-slate-500 to-slate-600',
    iconBg: 'bg-slate-100 text-slate-600',
    path: '/reports/audit',
  },
  {
    key: 'leave',
    title: 'Leave Report',
    description: 'Leave balance, usage patterns, and team availability overview.',
    icon: CalendarOff,
    color: 'from-pink-500 to-pink-600',
    iconBg: 'bg-pink-100 text-pink-600',
    path: '/reports/leave',
  },
  {
    key: 'attendance',
    title: 'Attendance Report',
    description: 'Attendance summary, late marks, and working hours analysis.',
    icon: Clock,
    color: 'from-cyan-500 to-cyan-600',
    iconBg: 'bg-cyan-100 text-cyan-600',
    path: '/reports/attendance',
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function Reports() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Explore analytics, audit trails, and team performance insights</p>
      </div>

      {/* Report Cards Grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
      >
        {REPORT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.key}
              variants={item}
              whileHover={{ y: -6, transition: { duration: 0.2 } }}
              className="group cursor-pointer"
              onClick={() => navigate(card.path)}
            >
              <div className="relative bg-white rounded-2xl border border-gray-200 p-6 h-full transition-shadow hover:shadow-lg hover:shadow-gray-200/50 overflow-hidden">
                {/* Gradient accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.color} opacity-0 group-hover:opacity-100 transition-opacity`} />

                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                  <Icon size={24} />
                </div>

                {/* Content */}
                <h3 className="text-base font-bold text-gray-900 mb-1.5 group-hover:text-blue-600 transition-colors">
                  {card.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {card.description}
                </p>

                {/* View button */}
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <span className="text-sm font-semibold text-blue-600 group-hover:text-blue-700 transition-colors inline-flex items-center gap-1">
                    View Report
                    <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
