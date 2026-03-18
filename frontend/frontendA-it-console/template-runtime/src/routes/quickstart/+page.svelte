<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import DocsPage from '$lib/svelte-docs/DocsPage.svelte'
  import { docsByPath } from '$lib/svelte-docs/content.js'

  const doc = docsByPath['/quickstart']

  // Redirect bookmark traffic to the canonical /maple workspace docs view.
  // The DocsPage component renders as a fallback while the redirect fires.
  onMount(() => {
    goto('/maple?category=docs&view=overview', { replaceState: true })
  })
</script>

<DocsPage {doc} />
