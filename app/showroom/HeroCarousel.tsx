"use client";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { HeroSlide } from "./hero-slides";
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(motionQuery); media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}
const reducedSnapshot = () => window.matchMedia(motionQuery).matches;
const visibleSnapshot = () => document.visibilityState !== "hidden";

export function HeroCarousel({ slides, fallback }: { slides: HeroSlide[]; fallback: ReactNode }) {
  const [active, setActive] = useState(0), [paused, setPaused] = useState(false), [hovered, setHovered] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotion, reducedSnapshot, () => true);
  const visible = useSyncExternalStore(subscribeVisibility, visibleSnapshot, () => false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const current = slides.length ? active % slides.length : 0;
  useEffect(() => {
    if (slides.length < 2 || paused || reduced || hovered || !visible) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % slides.length), 3000);
    return () => window.clearInterval(timer);
  }, [slides.length, paused, reduced, hovered, visible]);
  function choose(index: number) { setPaused(true); setActive((index + slides.length) % slides.length); }
  if (!slides.length) return fallback;
  return <section className="hero-carousel" role="region" aria-roledescription="карусель" aria-label="Фотографии MARIPOSA"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={event => { if (!(event.target as HTMLElement).closest("[data-carousel-toggle]")) setPaused(true); }}>
    <div className="hero-carousel-stage" aria-live="off" onPointerDown={event => {
      if (!event.isPrimary || event.pointerType === "mouse") return;
      touch.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerCancel={() => { touch.current = null; }} onPointerUp={event => {
      const start = touch.current; touch.current = null;
      if (!start || slides.length < 2) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) choose(current + (dx < 0 ? 1 : -1));
    }}>
      {slides.map((slide, index) => <div className={"hero-carousel-slide" + (index === current ? " is-current" : "")} key={slide.src} aria-hidden={index !== current}>
        <picture>{slide.mobile && <source media="(max-width: 700px)" srcSet={slide.mobile.src} width={slide.mobile.width} height={slide.mobile.height} />}<Image src={slide.src} width={slide.width} height={slide.height} alt={slide.alt} unoptimized loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "low"} draggable={false} /></picture>
      </div>)}
    </div>
    {slides.length > 1 && <div className="hero-carousel-controls">
      <div className="hero-carousel-dots" role="group" aria-label="Выбор фотографии">{slides.map((slide, index) => <button key={slide.src} type="button" aria-label={"Фото " + (index + 1) + " из " + slides.length} aria-current={index === current ? "true" : undefined} onClick={() => choose(index)}><span aria-hidden="true" /></button>)}</div>
      <span className="hero-carousel-position" aria-live={paused || reduced ? "polite" : "off"}>{current + 1} / {slides.length}</span>
      {reduced ? <span className="hero-carousel-motion-note">Автосмена отключена</span> : <button type="button" data-carousel-toggle aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "Продолжить" : "Пауза"}</button>}
    </div>}
  </section>;
}
