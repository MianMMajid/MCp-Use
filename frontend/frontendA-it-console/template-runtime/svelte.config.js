import adapter from '@sveltejs/adapter-node'
import { mdsvex } from 'mdsvex'
import remarkGfm from 'remark-gfm'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: ['.svelte', '.svx'],
  preprocess: [
    mdsvex({
      extensions: ['.svx'],
      remarkPlugins: [remarkGfm],
    }),
  ],
  kit: {
    adapter: adapter(),
    alias: {
      '@': './src',
    },
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self', 'https://accounts.google.com'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:'],
        'font-src': ['self'],
        'connect-src': ['self'],
        'frame-src': ['self', 'https://accounts.google.com'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'frame-ancestors': ['none'],
      },
    },
  },
}

export default config
