/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Canonical token values live in CLAUDE.md — do not restate them
    // elsewhere. A colour introduced twice becomes a colour defined twice,
    // which is how #C8A24A came to exist. Cite bg-gold / text-gold-ink /
    // etc.; never a raw hex in a component.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#FFFFFF',
      black: '#000000',
      ink: '#09090A',
      gold: '#C9A24A',
      // AMENDMENT-004: gold on white is 2.40:1, fails WCAG AA at every
      // size. gold-ink (5.04:1) is the only permitted gold for small text
      // on a light surface. Gold on ink is 8.29:1 and needs no substitute.
      'gold-ink': '#8A6A22',
      silver: '#C0C0C0',
      offwhite: '#FAFAFA',
      // ink-45 (5.08:1) is muted INFORMATIONAL text.
      'ink-45': '#6E6E72',
      // AMENDMENT-004: ink-25 is 2.61:1 — decorative/disabled only. It may
      // not carry information; use ink-45 for anything a reader must read.
      'ink-25': '#A0A0A4',
      healthy: '#2F6B4F',
      warning: '#A8631F',
      critical: '#8F2A2A',
      failure: '#5C1212',

      // Derived neutrals — practical, not canonical/ratified (design/
      // workbench.html labels them the same way). Still centrally cited
      // here rather than as arbitrary Tailwind values in a component, so
      // "no hardcoded hex" holds even for borders and dividers.
      'ink-70': '#3A3A3C',
      rule: '#E4E4E6',
      'rule-soft': '#EFEFF1',
    },
    fontFamily: {
      display: ['Bebas Neue', 'sans-serif'],
      body: ['Barlow', 'system-ui', 'sans-serif'],
      mono: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
    },
    extend: {},
  },
  plugins: [],
}
