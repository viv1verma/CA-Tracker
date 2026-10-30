export default function EmptyState({ icon, title, description }) {
  return (
    <div className="text-center py-12 text-gray-400">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      {title && <div className="font-semibold text-gray-500">{title}</div>}
      {description && <div className="text-sm mt-1">{description}</div>}
    </div>
  );
}
