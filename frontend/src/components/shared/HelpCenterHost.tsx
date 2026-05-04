// Mounts the HelpCenterModal once at the App root. Other components
// open it by dispatching `window.dispatchEvent(new Event('help:open'))`
// — keeps imports decoupled (PortalShell doesn't need to know about
// HelpCenterModal at all).

import { useEffect, useState } from "react";
import { HelpCenterModal } from "./HelpCenterModal";

export function HelpCenterHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("help:open", onOpen);
    return () => window.removeEventListener("help:open", onOpen);
  }, []);

  return <HelpCenterModal open={open} onClose={() => setOpen(false)} />;
}

/** Imperative helper for components that don't want to import HelpCenterModal directly. */
export function openHelpCenter(): void {
  window.dispatchEvent(new Event("help:open"));
}
