<script>
  import { onMount, onDestroy } from 'svelte';

  export let size = 80;
  export let animate = true;

  let blinking = false;
  let winking = false;
  let bouncing = false;
  let blinkTimer;
  let winkTimer;

  // Gradient ID — unique per instance
  const gradientId = 'mayple-' + Math.random().toString(36).slice(2, 8);

  // Randomised blink every 3-6s
  function scheduleBlink() {
    if (!animate) return;
    const delay = 3000 + Math.random() * 3000;
    blinkTimer = setTimeout(() => {
      blinking = true;
      setTimeout(() => {
        blinking = false;
        scheduleBlink();
      }, 180);
    }, delay);
  }

  // Random wink every 8-15s
  function scheduleWink() {
    if (!animate) return;
    const delay = 8000 + Math.random() * 7000;
    winkTimer = setTimeout(() => {
      winking = true;
      setTimeout(() => {
        winking = false;
        scheduleWink();
      }, 300);
    }, delay);
  }

  function handleClick() {
    if (!animate || bouncing) return;
    bouncing = true;
    setTimeout(() => { bouncing = false; }, 500);
  }

  onMount(() => {
    if (animate) {
      scheduleBlink();
      scheduleWink();
    }
  });

  onDestroy(() => {
    clearTimeout(blinkTimer);
    clearTimeout(winkTimer);
  });
</script>

<div
  class="mayple-char"
  class:breathing={animate}
  class:bouncing
  style:width="{size}px"
  style:height="{size}px"
  on:click={handleClick}
  role="img"
  aria-label="Mayple mascot"
>
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
  >
    <defs>
      <radialGradient id={gradientId} cx="45%" cy="38%" r="55%">
        <stop offset="0%" stop-color="#ffb366" />
        <stop offset="100%" stop-color="#e8740c" />
      </radialGradient>
    </defs>

    <!-- Head -->
    <circle cx="16" cy="14" r="12" fill="url(#{gradientId})" />

    <!-- Eyes -->
    <ellipse cx="12" cy="12" rx="1.8" ry={blinking || winking ? 0.3 : 2.2} fill="#111" style="transition: ry 0.1s ease-in-out" />
    <ellipse cx="20" cy="12" rx="1.8" ry={blinking ? 0.3 : 2.2} fill="#111" style="transition: ry 0.1s ease-in-out" />

    <!-- Eye highlights -->
    <circle cx="12.6" cy="11.2" r="0.7" fill="#fff" opacity={blinking || winking ? 0 : 1} style="transition: opacity 0.08s" />
    <circle cx="20.6" cy="11.2" r="0.7" fill="#fff" opacity={blinking ? 0 : 1} style="transition: opacity 0.08s" />

    <!-- Cheeks -->
    <ellipse cx="9" cy="16" rx="2.4" ry="1.6" fill="#ff9966" opacity="0.5" />
    <ellipse cx="23" cy="16" rx="2.4" ry="1.6" fill="#ff9966" opacity="0.5" />

    <!-- Mouth -->
    <path d="M13 17.5 Q16 20 19 17.5" stroke="#111" stroke-width="0.8" fill="none" stroke-linecap="round" />

    <!-- Feet -->
    <ellipse cx="11" cy="27" rx="3.5" ry="2.2" fill="#d06800" class="foot-left" />
    <ellipse cx="21" cy="27" rx="3.5" ry="2.2" fill="#d06800" class="foot-right" />
  </svg>
</div>

<style>
  .mayple-char {
    display: inline-flex;
    cursor: pointer;
    user-select: none;
  }

  .breathing {
    animation: breathe 3.5s ease-in-out infinite;
  }

  .bouncing {
    animation: bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .foot-left {
    animation: foot-l 2s ease-in-out infinite;
  }

  .foot-right {
    animation: foot-r 2s ease-in-out 1s infinite;
  }

  @keyframes breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }

  @keyframes bounce {
    0%   { transform: translateY(0) rotate(0deg); }
    25%  { transform: translateY(-12px) rotate(-3deg); }
    50%  { transform: translateY(-2px) rotate(2deg); }
    75%  { transform: translateY(-5px) rotate(-1deg); }
    100% { transform: translateY(0) rotate(0deg); }
  }

  @keyframes foot-l {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-0.5px) translateX(-0.3px); }
  }

  @keyframes foot-r {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(0.5px) translateX(0.3px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .breathing, .bouncing, .foot-left, .foot-right {
      animation: none;
    }
  }
</style>
