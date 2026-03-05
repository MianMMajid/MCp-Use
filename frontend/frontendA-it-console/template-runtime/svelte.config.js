import adapter from '@sveltejs/adapter-auto'
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
  },
}

export default config
