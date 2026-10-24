"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useRef, type ReactNode } from "react";

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: () => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = content.current;
    const bar = edge.current;
    if (!el || !bar) return;
    const onScroll = () => {
      const progress = Math.max(0, Math.min(1, el.scrollTop / 24));
      bar.style.setProperty("--edge", progress.toFixed(3));
      bar.classList.toggle("on", progress > 0.02);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="sheet-overlay" />
      <DialogPrimitive.Content
        ref={content}
        className="sheet"
        onOpenAutoFocus={(event) => {
          const root = event.currentTarget;
          if (!(root instanceof HTMLElement)) return;
          const title = root.querySelector("h2, h1");
          if (!(title instanceof HTMLElement)) return;
          event.preventDefault();
          title.tabIndex = -1;
          title.focus();
        }}
        aria-describedby={undefined}
      >
        <div className="sheet-edge" ref={edge} aria-hidden="true">
          <span />
        </div>
        <div className="grab" />
        {onClose ? (
          <button type="button" className="linkish" data-testid="close-sheet" onClick={onClose} style={{ float: "right" }}>
            Fermer
          </button>
        ) : null}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
