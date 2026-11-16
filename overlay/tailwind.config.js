/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        phasmo: {
          bg: '#0b0e14',
          panel: '#121721',
          border: '#232c3d',
          accent: '#38bdf8',
          emerald: '#10b981',
          amber: '#f59e0b',
          crimson: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
