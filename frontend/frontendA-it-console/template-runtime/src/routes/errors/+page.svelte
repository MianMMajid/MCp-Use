<script>
  import DocsPage from '$lib/svelte-docs/DocsPage.svelte'
  import { docsByPath } from '$lib/svelte-docs/content.js'

  const doc = docsByPath['/errors']
</script>

<DocsPage {doc} />
