/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
    "./index.tsx"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg:           { DEFAULT: 'rgb(var(--color-bg) / <alpha-value>)',          secondary: 'rgb(var(--color-bg-secondary) / <alpha-value>)' },
        surface:      { DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',      elevated: 'rgb(var(--color-surface-el) / <alpha-value>)' },
        border:       { DEFAULT: 'rgb(var(--color-border) / var(--color-border-alpha))', bright: 'rgb(var(--color-border) / var(--color-border-bright-alpha))' },
        accent:       { DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',       dim: 'rgb(var(--color-accent-dim) / <alpha-value>)', light: 'rgb(var(--color-accent-light) / <alpha-value>)' },
        secondary:    'rgb(var(--color-secondary) / <alpha-value>)',
        success:      'rgb(var(--color-success) / <alpha-value>)',
        warning:      'rgb(var(--color-warning) / <alpha-value>)',
        error:        'rgb(var(--color-error) / <alpha-value>)',
        txt: {
          primary:    'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary:  'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted:      'rgb(var(--color-text-muted) / <alpha-value>)',
          heading:    'rgb(var(--color-text-heading) / <alpha-value>)',
        },
      },
      boxShadow: {
        soft:     'var(--shadow-soft)',
        elevated: 'var(--shadow-elevated)',
      },
    },
  },
  plugins: [],
}
