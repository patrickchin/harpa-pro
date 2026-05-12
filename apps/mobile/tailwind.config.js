/** @type {import('tailwindcss').Config} */
module.exports = {
  // Placeholder tokens. Real tokens land in P2 from
  // docs/legacy-v3/realignment/pages/*.md "Visual tokens" sections.
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Placeholder. Do not use raw hex in components — extend this map.
        background: '#FFFFFF',
        foreground: '#0B0B0F',
        muted: '#6B7280',
        primary: '#111827',
      },
    },
  },
  plugins: [],
};
