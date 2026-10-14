import * as React from "react";

/**
 * Radix only hands focus back to a dialog's own trigger. Most dialogs here are opened by an ordinary
 * button, so remember what had focus when the dialog opened and return to it when it closes.
 */
export function useRestoreFocus(props: { onOpenAutoFocus?: ((e: Event) => void) | undefined; onCloseAutoFocus?: ((e: Event) => void) | undefined }) {
  const opener = React.useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (e: Event) => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      props.onOpenAutoFocus?.(e);
    },
    onCloseAutoFocus: (e: Event) => {
      props.onCloseAutoFocus?.(e);
      const el = opener.current;
      if (!e.defaultPrevented && el && el !== document.body && el.isConnected) {
        e.preventDefault();
        el.focus();
      }
    },
  };
}
