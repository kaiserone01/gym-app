// Video de fondo en bucle. `muted` + `playsInline` son obligatorios para que el autoplay
// funcione en navegador, PWA y WebView2 (el mp4 trae pista de audio). El póster evita el negro al cargar.
export function FondoVideo() {
  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      poster="/branding/backgound.jpg"
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover"
    >
      <source src="/branding/backgound1.mp4" type="video/mp4" />
    </video>
  );
}
