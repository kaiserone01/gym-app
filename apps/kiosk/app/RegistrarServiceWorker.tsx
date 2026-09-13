"use client";

import { useEffect } from "react";

export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("No se pudo registrar el service worker:", error);
      });
    }
  }, []);

  return null;
}
