# Mayple Demo

To run the Mayple demo, first install the npm dependencies:

```bash
npm install
```

Next, run the development server:

```bash
npm run dev
```

Finally, open [http://localhost:3000](http://localhost:3000) in your browser to view the website.

## OpenWebUI Parity Matrix

Reference baseline: `/tmp/open-webui-ref` at commit `79f0437`.

Structural parity targets and Mayple implementation:

1. Sidebar shell (`Sidebar.svelte` parity)
- Full-height left rail with persisted width/collapse.
- Sticky top row, primary "New Chat" action, search, compact session list.
- Agent/Orchestration mode switch in the same sidebar region.

2. Chat workspace (`Chat.svelte` parity)
- Center-first message stream with fixed composer at the bottom.
- Minimal top strip and no mounted right controls pane.
- Unified shell for agent chat and orchestration chat modes.

3. Message composer (`MessageInput.svelte` parity)
- Card-style composer, multiline input, enter-to-send, shift+enter newline.
- Shared visual language across agent and orchestration composers.

4. Orchestration runtime controls (Mayple extension)
- Right panel removed.
- Runtime operations moved to inline orchestration dock in workspace and bottom controls in designer.
- Tabs and loop status stay visible without leaving chat context.
