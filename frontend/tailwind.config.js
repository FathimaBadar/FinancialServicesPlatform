/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './admin.html', './manufacturer.html', './distributor.html', './wholesaler.html', './widget-workbench.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Tier-2 semantic tokens (initial palette)
        canvas: 'var(--color-canvas)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          raised: 'var(--color-surface-raised)',
          sunken: 'var(--color-surface-sunken)',
        },
        action: {
          primary: 'var(--color-action-primary)',
          destructive: 'var(--color-action-destructive)',
          subtle: 'var(--color-action-subtle)',
        },
        status: {
          info: 'var(--color-status-info)',
          success: 'var(--color-status-success)',
          warning: 'var(--color-status-warning)',
          danger: 'var(--color-status-danger)',
          neutral: 'var(--color-status-neutral)',
        },
        financial: {
          debit: 'var(--color-financial-debit)',
          credit: 'var(--color-financial-credit)',
          pending: 'var(--color-financial-pending)',
          committed: 'var(--color-financial-committed)',
          unknown: 'var(--color-financial-unknown)',
        },
      },
    },
  },
  plugins: [],
}
