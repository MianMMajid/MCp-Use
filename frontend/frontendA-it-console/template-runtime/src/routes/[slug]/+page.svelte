<script>
  import DocsPage from '$lib/svelte-docs/DocsPage.svelte'

  export let data
</script>

<DocsPage doc={data.doc} />
