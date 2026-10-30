import { ini, avatarColor } from '../../utils/helpers';

export default function Avatar({ name, size = 36 }) {
  const [bg, color] = avatarColor(name);
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: bg, color, fontSize: size * 0.35 }}
    >
      {ini(name)}
    </div>
  );
}
