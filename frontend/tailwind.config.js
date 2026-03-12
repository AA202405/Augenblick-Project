/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy:  '#1B2A4A',
        risk: {
          low:      '#22c55e',
          medium:   '#eab308',
          high:     '#f97316',
          critical: '#ef4444',
        },
      },
      animation: {
        'pulse-fast': 'pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flash': 'flash 0.5s ease-in-out infinite',
      },
      keyframes: {
        flash: {
          '0%, 100%': { opacity: 1 },
          '50%':      { opacity: 0.2 },
        },
      },
    },
  },
  plugins: [],
}
