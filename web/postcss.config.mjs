// Tailwind 4 is a PostCSS plugin and nothing else — no tailwind.config.js, no
// content array. What it draws from lives in styles/tailwind.css, next to the
// tokens it reads. Next.js picks this file up on its own.
//
// Build plan G1, ADR 0042.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
