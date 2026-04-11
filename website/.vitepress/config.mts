import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'BOA',
  titleTemplate: ':title — BOA, Backend on AWS',
  description: 'Open-source skill plugin that teaches your AI coding agent to build serverless backends on AWS.',
  base: '/boa/',

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap', rel: 'stylesheet' }],
  ],

  themeConfig: {
    logo: undefined,
    siteTitle: 'BOA',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Docs', link: '/docs/getting-started' },
      { text: 'Install', link: '/install' },
      { text: 'Pricing', link: '/pricing' },
    ],

    sidebar: {
      '/docs/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/docs/getting-started' },
            { text: 'How It Works', link: '/docs/how-it-works' },
          ]
        },
        {
          text: 'Architecture',
          items: [
            { text: 'The Stack', link: '/docs/stack-overview' },
            { text: 'Migrations', link: '/docs/migrations' },
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'FAQ', link: '/docs/faq' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/aws/boa' }
    ],

    footer: {
      message: 'BOA is an open-source project from AWS.',
      copyright: 'Released under the Apache 2.0 License.',
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/aws/boa/edit/main/website/:path',
      text: 'Edit this page on GitHub'
    },
  },
})
