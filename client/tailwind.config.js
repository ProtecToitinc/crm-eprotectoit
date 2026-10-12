/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif']
      },
      colors: {
        app: 'var(--app-bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        fg: 'var(--fg)',
        'fg-muted': 'var(--fg-muted)',
        'fg-faint': 'var(--fg-faint)',
        sidebar: {
          bg: 'var(--sidebar-bg)',
          fg: 'var(--sidebar-fg)',
          muted: 'var(--sidebar-muted)',
          border: 'var(--sidebar-border)'
        },
        accent: {
          DEFAULT: 'var(--accent)',
          fg: 'var(--accent-fg)'
        }
      },
      boxShadow: {
        card: 'var(--shadow)'
      },
      borderRadius: {
        card: '14px'
      }
    }
  },
  plugins: []
};
