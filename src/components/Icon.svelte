<script lang="ts">
  const PATHS = {
    home: 'M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5',
    decks: 'M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5ZM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5',
    search: 'M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM15.5 15.5 20.5 20.5',
    settings:
      'M4 7h8M16 7h4M4 17h3M11 17h9M14 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM9 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    back: 'M15 5 8 12l7 7',
    close: 'M6 6l12 12M18 6 6 18',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12.5 9.5 17 19 7',
    play: 'M8 5.5v13l10.5-6.5L8 5.5Z',
    trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13',
    edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    replay: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5V9H9',
    brush: 'M14.5 4.5 19.5 9.5 11 18l-5-5 8.5-8.5ZM6 13l-2.5 7.5L11 18',
    chevron: 'M9 5l7 7-7 7',
    speaker: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5ZM15.5 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  } as const

  let { name, size = 24, stroke = 2 }: { name: keyof typeof PATHS; size?: number; stroke?: number } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>
