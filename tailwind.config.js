/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Colours are CSS variables (RGB channels, set in index.css) so the
      // high-contrast accessibility mode can swap the whole palette at runtime.
      colors: {
        bg:      'rgb(var(--c-bg) / <alpha-value>)',
        primary: 'rgb(var(--c-primary) / <alpha-value>)',
        accent:  'rgb(var(--c-accent) / <alpha-value>)',
        alert:   'rgb(var(--c-alert) / <alpha-value>)',
        card:    'rgb(var(--c-card) / <alpha-value>)',
        ink:     'rgb(var(--c-ink) / <alpha-value>)',
        muted:   'rgb(var(--c-muted) / <alpha-value>)',
        border:  'rgb(var(--c-border) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        sm:         '0 1px 2px 0 rgba(0,0,0,0.05)',
        md:         '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04)',
        lg:         '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)',
        xl:         '0 20px 25px -5px rgba(0,0,0,0.08), 0 10px 10px -5px rgba(0,0,0,0.03)',
        map:        '0 1px 3px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)',
        lift:       '0 1px 3px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)',
        glow:       '0 0 0 3px rgba(26,115,232,0.15)',
        'glow-teal':'0 0 0 3px rgba(10,191,191,0.15)',
      },
      keyframes: {
        pulseRing: { '0%': { transform:'scale(0.4)', opacity:'0.7' }, '100%': { transform:'scale(2.6)', opacity:'0' } },
        alertGlow: { '0%,100%': { boxShadow:'0 0 0 0 rgba(234,67,53,0.4)' }, '50%': { boxShadow:'0 0 16px 3px rgba(234,67,53,0.4)' } },
        pageIn:    { '0%': { opacity:'0', transform:'translateY(8px)' }, '100%': { opacity:'1', transform:'translateY(0)' } },
        pinDrop:   { '0%': { transform:'translateY(-40px) scale(0.6)', opacity:'0' }, '100%': { transform:'translateY(0) scale(1)', opacity:'1' } },
      },
      animation: {
        'pulse-ring': 'pulseRing 2.4s ease-out infinite',
        'alert-glow': 'alertGlow 2s ease-in-out infinite',
        'page-in':    'pageIn 280ms ease-out both',
        'pin-drop':   'pinDrop 520ms cubic-bezier(0.34,1.56,0.64,1) both',
      },
    },
  },
  plugins: [],
}
