import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

const CONFIRM_COLORS = {
  red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  blue: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  green: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
  amber: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
};

const ICON_BG = {
  red: 'bg-red-100 text-red-600',
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
};

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Delete',
  confirmColor = 'red',
  loading = false,
}) {
  const btnColor = CONFIRM_COLORS[confirmColor] || CONFIRM_COLORS.red;
  const iconBg = ICON_BG[confirmColor] || ICON_BG.red;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="text-center py-2">
        {/* Animated icon */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 14, stiffness: 300 }}
          className={`w-14 h-14 rounded-full ${iconBg} flex items-center justify-center mx-auto mb-4`}
        >
          <AlertTriangle size={28} />
        </motion.div>

        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${btnColor}`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
