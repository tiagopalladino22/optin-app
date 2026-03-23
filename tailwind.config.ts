import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#07111f', mid: '#0e1f35', light: '#162840' },
        accent: { DEFAULT: '#25679e', bright: '#3a85c8', wash: 'rgba(37,103,158,0.1)', border: 'rgba(37,103,158,0.18)' },
        offwhite: '#f4f1ec',
        'text-primary': '#07111f',
        'text-mid': '#4a5a6a',
        'text-light': '#8a9aaa',
        'border-custom': '#e0ddd8',
      },
      fontFamily: {
        display: ['var(--font-bebas)', 'sans-serif'],
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
