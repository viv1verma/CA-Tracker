export default function Card({ children, className = '', title, action }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          {title && <h3 className="font-semibold text-gray-900">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
