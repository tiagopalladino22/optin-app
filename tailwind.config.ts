import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: 'var(--color-navy)',
          mid: 'var(--color-navy-mid)',
          light: 'var(--color-navy-light)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          bright: 'var(--color-accent-bright)',
          wash: 'var(--color-accent-wash)',
          border: 'var(--color-accent-border)',
        },
        offwhite: 'var(--color-offwhite)',
        surface: 'var(--color-surface)',
        'surface-elevated': 'var(--color-surface-elevated)',
        'text-primary': 'var(--color-text-primary)',
        'text-mid': 'var(--color-text-mid)',
        'text-light': 'var(--color-text-light)',
        'border-custom': 'var(--color-border)',
      },
      fontFamily: {
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'pill': '980px',
      },
      boxShadow: {
        'apple': '0 2px 12px rgba(0,0,0,0.08)',
        'apple-lg': '3px 5px 30px rgba(0,0,0,0.12)',
        'apple-dark': '0 2px 12px rgba(0,0,0,0.3)',
        'apple-dark-lg': '3px 5px 30px rgba(0,0,0,0.4)',
      },
      backdropBlur: {
        'apple': '20px',
      },
    },
  },
  plugins: [],
};
export default config;
