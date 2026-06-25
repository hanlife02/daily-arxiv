"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type LiquidGlassRootProps = {
  children: React.ReactNode;
  className?: string;
};

const PANEL_CONFIG = {
  blurAmount: 0.2,
  refraction: 0.55,
  chromAberration: 0.02,
  edgeHighlight: 0.1,
  specular: 0.18,
  fresnel: 0.75,
  distortion: 0.02,
  cornerRadius: 16,
  zRadius: 22,
  saturation: -0.1,
  tintStrength: 0,
  brightness: 0.03,
  shadowOpacity: 0.18,
  shadowSpread: 10,
  shadowOffsetY: 2
};

const SIDEBAR_CONFIG = {
  ...PANEL_CONFIG,
  cornerRadius: 0,
  shadowOpacity: 0.1,
  shadowSpread: 6,
  refraction: 0.4,
  blurAmount: 0.25
};

const AUTH_CONFIG = {
  ...PANEL_CONFIG,
  cornerRadius: 20,
  refraction: 0.65,
  blurAmount: 0.25,
  specular: 0.22,
  fresnel: 0.85,
  shadowSpread: 16,
  shadowOpacity: 0.22
};

export function LiquidGlassRoot({ children, className }: LiquidGlassRootProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let destroyed = false;
    let instance: { destroy: () => void } | undefined;

    async function init() {
      const root = rootRef.current;
      if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const panels = Array.from(root.querySelectorAll<HTMLElement>(":scope > .liquid-glass-panel"));
      const sidebars = Array.from(root.querySelectorAll<HTMLElement>(":scope > .liquid-glass-sidebar"));
      const auths = Array.from(root.querySelectorAll<HTMLElement>(":scope > .liquid-glass-auth"));
      const allGlass = [...sidebars, ...panels, ...auths];

      if (allGlass.length === 0) return;

      for (const el of sidebars) {
        el.dataset.config = JSON.stringify(SIDEBAR_CONFIG);
      }
      for (const el of panels) {
        el.dataset.config = JSON.stringify(PANEL_CONFIG);
      }
      for (const el of auths) {
        el.dataset.config = JSON.stringify(AUTH_CONFIG);
      }

      try {
        const { LiquidGlass } = await import("@ybouane/liquidglass");
        if (destroyed) return;
        instance = await LiquidGlass.init({
          root,
          glassElements: allGlass,
          defaults: PANEL_CONFIG
        });
      } catch (error) {
        console.warn("LiquidGlass disabled:", error);
      }
    }

    void init();

    return () => {
      destroyed = true;
      instance?.destroy();
    };
  }, []);

  return (
    <div ref={rootRef} className={cn("liquid-glass-root relative isolate", className)}>
      {children}
    </div>
  );
}
