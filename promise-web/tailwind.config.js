/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Noto Serif KR"', 'serif'],
        sans: ['"Noto Sans KR"', 'sans-serif'],
      },
      animation: {
        'marquee-vertical': 'marquee-vertical 20s linear infinite',
      },
      keyframes: {
        'marquee-vertical': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-50%)' }, // Assuming content is duplicated once
        }
      }
    },
  },
  plugins: [
    require('tailwindcss-animate')
  ],
}

