"use client";

import { useEffect, useRef } from "react";

/**
 * Bandeau du haut, limité à la zone de la barre d’état.
 * Au repos il est opaque, de la couleur de la page : les titres en dessous restent nets,
 * et le flou automatique d’iOS ne les voile pas.
 * Dès que le contenu passe dessous (0 → 24 px), le flou et le filet apparaissent.
 */
export function ScrollEdge() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = bar.current;
    if (!node) return;

    const read = (target: EventTarget | null) => {
      const fromTarget = scrollerOf(target);
      if (fromTarget) return fromTarget.scrollTop;
      const sheet = document.querySelector(".sheet");
      if (sheet instanceof HTMLElement) return sheet.scrollTop;
      const overlay = document.querySelector(".overlay");
      if (overlay instanceof HTMLElement) return overlay.scrollTop;
      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    const apply = (top: number) => {
      const progress = Math.max(0, Math.min(1, top / 24));
      node.style.setProperty("--edge", progress.toFixed(3));
      node.classList.toggle("on", progress > 0.02);
    };

    const onScroll = (event: Event) => apply(read(event.target));
    apply(read(null));
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    const observer = new MutationObserver(() => apply(read(null)));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="scroll-edge" ref={bar} data-testid="scroll-edge" aria-hidden="true">
      <span />
    </div>
  );
}

function scrollerOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.classList.contains("sheet") || target.classList.contains("overlay")) return target;
  const closest = target.closest(".sheet, .overlay");
  return closest instanceof HTMLElement ? closest : null;
}
