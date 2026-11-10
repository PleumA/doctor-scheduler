/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./*.html', './*.js'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // "Duty sheet" palette — see DESIGN_SYSTEM.md
                ink: '#14252C',
                'ink-2': '#3C525B',
                paper: '#F2F5F4',
                night: '#0C171C',
                sheet: { DEFAULT: '#FFFFFF', dark: '#112229' },
                rule: { DEFAULT: '#D9E1DE', dark: '#233A42' },
                duty: { DEFAULT: '#0F766E', bright: '#2DD4BF' },
                signal: { DEFAULT: '#B42318', bright: '#F87171' },
                // Roadmap design system colours (kept for compatibility)
                primary: '#0d3b66',
                secondary: '#faf0ca',
                accent: '#f4a261',
            },
            fontFamily: {
                sans: ['Anuphan', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                display: ['Anuphan', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
};
