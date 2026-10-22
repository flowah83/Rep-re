"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="sheet-overlay" />
      <DialogPrimitive.Content
        className="sheet"
        onOpenAutoFocus={(event) => event.preventDefault()}
        aria-describedby={undefined}
      >
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
