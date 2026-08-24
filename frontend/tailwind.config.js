/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        cyber: '#6366F1',
        emerald: '#10B981',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(99,102,241,.18), 0 0 32px rgba(99,102,241,.16)',
        'glow-strong': '0 0 0 1px rgba(99,102,241,.35), 0 0 45px rgba(99,102,241,.25)',
      },
      animation: {
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '0.45', transform: 'scale(.9)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [],
}
