import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './*.{ts,tsx}', './{components,screens,services,state,data}/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        brand: 'rgb(var(--c-brand) / <alpha-value>)',
        brandSoft: 'rgb(var(--c-brand-soft) / <alpha-value>)',
        ember: 'rgb(var(--c-ember) / <alpha-value>)',
        sage: 'rgb(var(--c-sage) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { xl2: '1.25rem', xl3: '1.75rem', xl4: '2.25rem' },
      spacing: { 13: '3.25rem' },
      boxShadow: {
        soft: '0 1px 2px rgb(31 26 46 / 0.04), 0 8px 24px -12px rgb(31 26 46 / 0.18)',
        lift: '0 2px 4px rgb(31 26 46 / 0.05), 0 24px 48px -20px rgb(31 26 46 / 0.28)',
      },
      keyframes: {
        floatIn: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'none' } },
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.45' } },
      },
      animation: {
        floatIn: 'floatIn .45s cubic-bezier(.22,1,.36,1) both',
        pulseSoft: 'pulseSoft 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [forms({ strategy: 'base' })],
};
