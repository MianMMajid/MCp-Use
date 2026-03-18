<script>
  export let doc
</script>

<main class="docs-page">
  <header class="hero">
    <h1>{doc?.title ?? 'Documentation'}</h1>
    {#if doc?.summary}<p>{doc.summary}</p>{/if}
    {#if doc?.ctas?.length}
      <div class="cta-row">
        {#each doc.ctas as cta}
          <a href={cta.href}>{cta.label}</a>
        {/each}
      </div>
    {/if}
  </header>

  {#if doc?.sections?.length}
    {#each doc.sections as section}
      <section id={section.id} class="card">
        <h2>{section.title}</h2>
        {#if section.body}<p>{section.body}</p>{/if}
        {#if section.bullets?.length}
          <ul>
            {#each section.bullets as bullet}
              <li>{bullet}</li>
            {/each}
          </ul>
        {/if}
        {#if section.code}
          <pre><code>{section.code}</code></pre>
        {/if}
      </section>
    {/each}
  {/if}
</main>

<style>
  .docs-page { max-width: 980px; margin: 0 auto; padding: 1.5rem 1rem 3rem; display: grid; gap: 1rem; }
  .hero { display: grid; gap: 0.5rem; }
  .hero p { margin: 0; color: var(--muted, #555); }
  .cta-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .cta-row a { text-decoration: none; border: 1px solid var(--line, #d7c9bc); border-radius: 999px; padding: 0.4rem 0.8rem; color: var(--ink, #222); }
  .card { border: 1px solid var(--line, #ddd); border-radius: 12px; background: var(--panel, #fff); padding: 0.9rem; display: grid; gap: 0.55rem; }
  .card h2 { margin: 0; font-size: 1.1rem; }
  ul { margin: 0; padding-left: 1.1rem; }
  pre { margin: 0; background: var(--bg-soft, #f8f8f8); border-radius: 10px; border: 1px solid var(--line, #eee); padding: 0.7rem; overflow: auto; }
</style>
