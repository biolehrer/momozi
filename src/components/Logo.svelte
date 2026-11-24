<script lang="ts">
  // App-Logo: dasselbe Bild wie das App-Symbol (public/icons/icon.svg, erzeugt von scripts/make-icons.mjs).
  // Als Bild statt als Schriftzeichen, damit 墨 überall in derselben Pinselschrift erscheint –
  // unabhängig davon, welche chinesischen Schriften das Gerät hat.
  let { size = 44 }: { size?: number } = $props()

  const src = `${import.meta.env.BASE_URL}icons/icon.svg`
</script>

<img class="logo-img" {src} alt="" width={size} height={size} draggable="false" />

<style>
  .logo-img {
    display: block;
    flex-shrink: 0;
    user-select: none;
    -webkit-user-select: none;
    -webkit-user-drag: none;
  }
</style>
