<script>
  import AppShell from '@/lib/components/AppShell.svelte';
  import { getCountries } from '@/data';

  const countries = getCountries();
  let selectedCountryCode = countries[0]?.code || '';
  $: selectedCountry = countries.find((item) => item.code === selectedCountryCode) || countries[0];
  $: if (selectedCountry && !selectedCountry.regions.includes(region)) {
    region = selectedCountry.regions[0] || '';
  }
  let region = selectedCountry?.regions?.[0] || '';

  let address = '147 Mayple Ave';
  let city = 'Toronto';
  let postal = 'A1A 1A1';
</script>

<AppShell>
  <section class="page card">
    <h1>Address</h1>
    <div class="grid">
      <label><span>Street Address</span><input bind:value={address} /></label>
      <label><span>City</span><input bind:value={city} /></label>
      <label>
        <span>Region</span>
        <select bind:value={region}>
          {#each selectedCountry?.regions || [] as item}
            <option value={item}>{item}</option>
          {/each}
        </select>
      </label>
      <label><span>Postal Code</span><input bind:value={postal} /></label>
      <label>
        <span>Country</span>
        <select bind:value={selectedCountryCode}>
          {#each countries as country}
            <option value={country.code}>{country.name}</option>
          {/each}
        </select>
      </label>
    </div>
    <p class="muted">Address edits are local preview in this phase.</p>
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); padding: 14px; display: grid; gap: 10px; }
  h1 { margin: 0; }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  label span { display: block; margin-bottom: 4px; font-size: 12px; color: var(--muted); }
  input, select {
    width: 100%;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 12px;
    background: rgba(20,24,32,.72);
    color: var(--fg);
    padding: 9px 11px;
    outline: none;
  }
  .muted { margin: 0; color: var(--muted); }
</style>
