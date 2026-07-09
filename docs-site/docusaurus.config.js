// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'HerdLink',
  tagline: 'A direct-to-cell satellite collar concept, demonstrated in software',
  // Served under /docs of the main app's domain in production (see the
  // root package.json build:vercel script).
  url: 'https://herdlink.atodev.xyz',
  baseUrl: '/docs/',
  favicon: 'img/favicon.svg',
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
        logo: { alt: 'HerdLink', src: 'img/favicon.svg' },
        items: [
          { href: '/', label: 'Open the demo ↗', position: 'right', target: '_self' },
        ],
      },
      footer: {
        style: 'dark',
        copyright: 'HerdLink — a demonstration concept. Not affiliated with Halter.',
      },
    }),
};

export default config;
