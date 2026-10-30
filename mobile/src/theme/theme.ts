/** GARP design language, mirrored from the existing web app's CSS variables. */
export const colors = {
  primary: '#1a56db',
  primaryDark: '#1e40af',
  primaryLight: '#eff6ff',
  green: '#16a34a',
  red: '#dc2626',
  amber: '#d97706',
  purple: '#7c3aed',
  teal: '#0e9aa7',
  bg: '#f3f4f6',
  card: '#ffffff',
  border: '#e5e7eb',
  text: '#111827',
  muted: '#6b7280',
  white: '#ffffff',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 10, lg: 14, xl: 18, pill: 999 } as const;

export const font = {
  h1: { fontSize: 24, fontWeight: '800' },
  h2: { fontSize: 18, fontWeight: '800' },
  h3: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 14, fontWeight: '500' },
  small: { fontSize: 12, fontWeight: '600' },
  tiny: { fontSize: 10, fontWeight: '700' },
} as const;

export const shadow = {
  card: {
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
} as const;
