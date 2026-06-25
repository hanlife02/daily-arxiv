"use client";

/**
 * Subtle ambient background for liquid glass refraction.
 * Provides just enough visual texture so the glass has something to
 * refract — the actual "content behind glass" is the page itself.
 */
export function LiquidGlassBg() {
  return (
    <div aria-hidden className="liquid-glass-bg">
      <div className="liquid-glass-blob liquid-glass-blob--1" />
      <div className="liquid-glass-blob liquid-glass-blob--2" />
      <div className="liquid-glass-blob liquid-glass-blob--3" />
    </div>
  );
}
