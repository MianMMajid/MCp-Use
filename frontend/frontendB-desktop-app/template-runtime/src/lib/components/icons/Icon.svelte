<script>
  export let name = 'chat';
  export let size = 18;
  export let stroke = 1.8;

  const paths = {
    chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 8.7 3.9 8.38 8.38 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5z',
    builder: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    tasks: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
    pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z',
    search: 'M11 19a8 8 0 1 1 5.3-14l.2.2A8 8 0 0 1 11 19zm10 2-4.35-4.35',
    menu: 'M3 6h18M3 12h18M3 18h18',
    spark: 'M12 3l2.8 5.7L21 9.6l-4.5 4.4L17.7 21 12 18l-5.7 3 1.2-7L3 9.6l6.2-.9z',
    agent: 'M12 3a4 4 0 0 1 4 4v1.6a6.4 6.4 0 0 1 2.4 5v2.1A2.3 2.3 0 0 1 16.1 18H7.9a2.3 2.3 0 0 1-2.3-2.3v-2.1a6.4 6.4 0 0 1 2.4-5V7a4 4 0 0 1 4-4zm0 18v-3',
    orchestration: 'M5 12a3 3 0 1 0 0 .01zM19 5a3 3 0 1 0 0 .01zM19 19a3 3 0 1 0 0 .01zM8 11l8-5M8 13l8 5',
    chevron: 'M6 9l6 6 6-6',
    send: 'M22 2 11 13M22 2 15 22 11 13 2 9z',
  };

  $: d = paths[name] || paths.chat;
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={d}></path>
</svg>
