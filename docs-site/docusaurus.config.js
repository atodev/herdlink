// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'HerdLink',
  tagline: 'A direct-to-cell satellite collar concept, demonstrated in software',
  url: 'http://localhost:3000',
  baseUrl: '/',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/', // docs-only site
          sidebarPath: './sidebars.js',
        },
        blog: false,
        theme: {},
      }),
    ],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
      navbar: {
        title: 'HerdLink',
        items: [
          { href: 'http://localhost:5173', label: 'Open the demo ↗', position: 'right' },
        ],
      },
      footer: {
        style: 'dark',
        copyright: 'HerdLink — a demonstration concept. Not affiliated with Halter.',
      },
    }),
};

export default config;
