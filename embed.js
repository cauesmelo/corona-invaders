/** The green preview and itch iframe display the identical game surface. */
document.documentElement.classList.add("game-only");
const embedded =
  window.self !== window.top ||
  new URLSearchParams(location.search).get("embed") === "1";
if (embedded) document.documentElement.classList.add("itch-embed");
const surface = document.querySelector("main");
if (surface) {
  const button = document.createElement("button");
  button.className = "itch-fullscreen";
  button.type = "button";
  button.textContent = "⤢";
  button.title = "Toggle fullscreen";
  button.setAttribute("aria-label", "Toggle fullscreen");
  button.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await surface.requestFullscreen();
    } catch {
      button.title = "Use the host page fullscreen button";
    }
  });
  surface.append(button);
  document.addEventListener("fullscreenchange", () => {
    button.setAttribute("aria-pressed", String(!!document.fullscreenElement));
    window.dispatchEvent(new Event("resize"));
  });
}
