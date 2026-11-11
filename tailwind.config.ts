import type { Config } from 'tailwindcss';
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: '#fff' },
      },
      borderRadius: { lg: '0.6rem', md: '0.4rem', sm: '0.25rem' },
    },
  },
  plugins: [],
} satisfies Config;
