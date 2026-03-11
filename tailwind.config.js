/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0D0F1A',
        card:    '#161B2E',
        card2:   '#1E2640',
        border:  '#2A3352',
        gold:    '#F0B90B',
        muted:   '#6B7A99',
        p1: '#F0B90B', p2: '#3DD6C8', p3: '#A78BFA',
        p4: '#60A5FA', p5: '#34D399', p6: '#F87171',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
