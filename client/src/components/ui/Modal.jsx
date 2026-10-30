import { Fragment } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { X } from 'lucide-react';

const MAX_WIDTHS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

export default function Modal({ isOpen, onClose, title, maxWidth = 'lg', children }) {
  const widthClass = MAX_WIDTHS[maxWidth] || MAX_WIDTHS.lg;

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
        </TransitionChild>

        {/* Panel wrapper */}
        <div className="fixed inset-0 flex items-end md:items-center justify-center p-0 md:p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-8 md:translate-y-4 md:scale-95"
            enterTo="opacity-100 translate-y-0 md:scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 md:scale-100"
            leaveTo="opacity-0 translate-y-8 md:translate-y-4 md:scale-95"
          >
            <DialogPanel
              className={`
                relative w-full ${widthClass} bg-white shadow-2xl
                rounded-t-2xl md:rounded-2xl
                max-h-[92vh] md:max-h-[85vh] flex flex-col overflow-hidden
              `}
            >
              {/* Header */}
              {title && (
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                  <DialogTitle className="text-lg font-bold text-gray-900">
                    {title}
                  </DialogTitle>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              {/* Mobile drag handle */}
              {!title && (
                <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
                  <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>
              )}

              {/* Close button when no title */}
              {!title && (
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors z-10"
                >
                  <X size={18} />
                </button>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5">
                {children}
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
