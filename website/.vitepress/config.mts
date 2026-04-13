import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'BOA',
  titleTemplate: ':title — BOA, Backend on AWS',
  description: 'Backend on AWS, without the complexity. A complete backend in under a minute. Built for agents. Free until your users show up.',
  base: '/boa/',

  appearance: false,

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap', rel: 'stylesheet' }],
    ['meta', { name: 'theme-color', content: '#0A0A0A' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'BOA — Backend on AWS, without the complexity' }],
    ['meta', { property: 'og:description', content: 'A complete backend on AWS in under a minute. Built for agents. Free until your users show up. No ceiling when they do.' }],
    ['meta', { property: 'og:site_name', content: 'BOA' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'BOA — Backend on AWS, without the complexity' }],
    ['meta', { name: 'twitter:description', content: 'A complete backend on AWS in under a minute. Built for agents. Free until your users show up. No ceiling when they do.' }],
  ],

  themeConfig: {
    logo: undefined,
    siteTitle: 'BOA',

    nav: [
      { text: 'Overview', link: '/' },
      {
        text: 'Docs',
        items: [
          { text: 'Getting Started', link: '/docs/getting-started' },
          { text: 'How It Works', link: '/docs/how-it-works' },
          {
            text: 'Guides',
            items: [
              { text: 'Database', link: '/docs/database/overview' },
              { text: 'Auth', link: '/docs/auth/overview' },
              { text: 'API', link: '/docs/api/overview' },
              { text: 'Storage', link: '/docs/storage/overview' },
              { text: 'Functions', link: '/docs/functions/overview' },
              { text: 'Deployment', link: '/docs/deployment/overview' },
            ]
          },
          { text: 'FAQ', link: '/docs/faq' },
        ]
      },
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
          text: 'Database',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/docs/database/overview' },
            { text: 'Tables & Data', link: '/docs/database/tables' },
            { text: 'Migrations', link: '/docs/database/migrations' },
            { text: 'Connecting', link: '/docs/database/connecting' },
            { text: 'Querying', link: '/docs/database/querying' },
          ]
        },
        {
          text: 'Auth',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/docs/auth/overview' },
            { text: 'Email & Password', link: '/docs/auth/email-password' },
            { text: 'Social Login', link: '/docs/auth/social-login' },
            { text: 'JWTs & Tokens', link: '/docs/auth/jwts' },
            { text: 'MFA', link: '/docs/auth/mfa' },
          ]
        },
        {
          text: 'API',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/docs/api/overview' },
            { text: 'REST Endpoints', link: '/docs/api/rest' },
            { text: 'Authorization', link: '/docs/api/authorization' },
          ]
        },
        {
          text: 'Storage',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/docs/storage/overview' },
          ]
        },
        {
          text: 'Functions',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/docs/functions/overview' },
          ]
        },
        {
          text: 'Deployment',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/docs/deployment/overview' },
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
      { icon: 'github', link: 'https://github.com/yoshuacas/boa' }
    ],

    footer: {
      message: 'BOA is an open-source project from AWS.',
      copyright: 'Released under the Apache 2.0 License.',
    },

    editLink: {
      pattern: 'https://github.com/yoshuacas/boa/edit/main/docs/guides/:path',
      text: 'Edit this page on GitHub'
    },
  },
})
