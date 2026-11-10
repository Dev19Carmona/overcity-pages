"use client";

import { useEffect, useRef } from "react";

type Rain = { x: number; y: number; length: number; speed: number; drift: number; opacity: number; width: number; slant: number };
type Fog = { x: number; baseY: number; rx: number; ry: number; direction: 1 | -1; speed: number; rise: number; alpha: number; phase: number; age: number };
type Petal = { x: number; y: number; size: number; vx: number; vy: number; rotation: number; spin: number; wave: number; waveSpeed: number; opacity: number; hue: string };

// Cada efecto expone resize y frame; un único bucle se pausa con la pestaña oculta.
type Effect = { resize: (w: number, h: number) => void; frame: (delta: number) => void };

function makeRain(canvas: HTMLCanvasElement): Effect | null {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  let w = 0, h = 0;
  let drops: Rain[] = [];
  const make = (randomY: boolean): Rain => {
    const depth = Math.random();
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : -Math.random() * 100 - 20,
      length: 8 + depth * 10 + Math.random() * 3,
      speed: 2.25 + depth * 2.65 + Math.random() * 0.45,
      drift: 0.48 + Math.random() * 0.95,
      opacity: 0.11 + depth * 0.13 + Math.random() * 0.035,
      width: 0.55 + depth * 0.48,
      slant: 2.5 + depth * 4.5,
    };
  };
  return {
    resize(width, height) {
      w = width; h = height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(62, Math.min(155, Math.round((w * h) / 14500)));
      drops = Array.from({ length: count }, () => make(true));
    },
    frame(delta) {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(215, 231, 245, 1)";
      for (const d of drops) {
        ctx.globalAlpha = d.opacity;
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(d.x - d.slant, d.y - d.length);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
        d.x += d.drift * delta;
        d.y += d.speed * delta;
        if (d.y > h + 22 || d.x > w + 18) Object.assign(d, make(false));
      }
      ctx.globalAlpha = 1;
    },
  };
}

function makeFog(canvas: HTMLCanvasElement): Effect | null {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  let w = 0, h = 0;
  let banks: Fog[] = [];
  const make = (initial: boolean, forced: 1 | -1 | null): Fog => {
    const rx = 170 + Math.random() * 260;
    const ry = 30 + Math.random() * 48;
    const direction: 1 | -1 = forced ?? (Math.random() < 0.5 ? 1 : -1);
    const startX = direction === 1 ? -rx * (0.72 + Math.random() * 0.48) : w + rx * (0.72 + Math.random() * 0.48);
    return {
      x: initial ? startX : direction === 1 ? -rx * 1.05 : w + rx * 1.05,
      baseY: initial ? h + ry * (0.05 + Math.random() * 0.55) : h + ry * (0.15 + Math.random() * 0.5),
      rx, ry, direction,
      speed: (0.85 + Math.random() * 0.85) * direction,
      rise: 0.1 + Math.random() * 0.2,
      alpha: 0.92 + Math.random() * 0.42,
      phase: Math.random() * Math.PI * 2,
      age: initial ? Math.random() * 85 : 0,
    };
  };
  return {
    resize(width, height) {
      w = width; h = height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      banks = Array.from({ length: 10 }, (_, i) => make(true, i % 2 === 0 ? 1 : -1));
    },
    frame(delta) {
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.filter = "blur(22px)";
      for (const c of banks) {
        c.x += c.speed * delta;
        c.baseY -= c.rise * delta;
        c.phase += 0.006 * delta;
        c.age += delta;
        const y = c.baseY + Math.sin(c.phase) * 7;
        const fadeIn = Math.min(1, c.age / 95);
        const edgeFade = Math.max(0, Math.min(1, (c.x + c.rx) / (c.rx * 0.75), (w + c.rx - c.x) / (c.rx * 0.75)));
        const o = fadeIn * edgeFade * c.alpha;
        const g = ctx.createRadialGradient(c.x, y, 2, c.x, y, c.rx);
        g.addColorStop(0, `rgba(205, 218, 231, ${0.145 * o})`);
        g.addColorStop(0.38, `rgba(177, 196, 215, ${0.092 * o})`);
        g.addColorStop(0.72, `rgba(153, 177, 201, ${0.042 * o})`);
        g.addColorStop(1, "rgba(143, 169, 191, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(c.x, y, c.rx, c.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        if ((c.direction === 1 && c.x - c.rx > w + 100) || (c.direction === -1 && c.x + c.rx < -100)) {
          Object.assign(c, make(false, c.direction));
        }
      }
      ctx.restore();
    },
  };
}

function makePetals(canvas: HTMLCanvasElement): Effect | null {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  let w = 0, h = 0;
  let petals: Petal[] = [];
  const make = (initial: boolean): Petal => ({
    x: 18 + Math.random() * Math.min(420, w * 0.5),
    y: initial ? Math.random() * Math.min(235, h * 0.35) : -12 - Math.random() * 110,
    size: 3.1 + Math.random() * 3.6,
    vx: 0.55 + Math.random() * 1.25,
    vy: 0.38 + Math.random() * 0.72,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.085,
    wave: Math.random() * Math.PI * 2,
    waveSpeed: 0.025 + Math.random() * 0.035,
    opacity: 0.48 + Math.random() * 0.42,
    hue: Math.random() > 0.65 ? "#ffd1e4" : Math.random() > 0.5 ? "#f3a1c3" : "#d96d9b",
  });
  return {
    resize(width, height) {
      w = width; h = height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      petals = Array.from({ length: Math.max(14, Math.min(24, Math.round(w / 70))) }, () => make(true));
    },
    frame(delta) {
      ctx.clearRect(0, 0, w, h);
      for (const p of petals) {
        p.wave += p.waveSpeed * delta;
        p.x += (p.vx + Math.sin(p.wave) * 0.72) * delta;
        p.y += (p.vy + Math.cos(p.wave * 0.7) * 0.25) * delta;
        p.rotation += p.spin * delta;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;
        ctx.shadowColor = "rgba(255, 132, 187, .55)";
        ctx.shadowBlur = 7;
        ctx.fillStyle = p.hue;
        ctx.beginPath();
        ctx.moveTo(0, -p.size * 1.55);
        ctx.quadraticCurveTo(p.size * 1.5, -p.size * 0.45, 0, p.size * 1.55);
        ctx.quadraticCurveTo(-p.size * 1.5, -p.size * 0.45, 0, -p.size * 1.55);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 231, 241, .48)";
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(0, p.size * 1.05);
        ctx.stroke();
        ctx.restore();
        if (p.x > w + 25 || p.y > h + 25) Object.assign(p, make(false));
      }
    },
  };
}

export default function SceneEffects() {
  const rainRef = useRef<HTMLCanvasElement>(null);
  const fogRef = useRef<HTMLCanvasElement>(null);
  const petalsRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const effects = [
      rainRef.current && makeRain(rainRef.current),
      fogRef.current && makeFog(fogRef.current),
      petalsRef.current && makePetals(petalsRef.current),
    ].filter((e): e is Effect => Boolean(e));

    const resize = () => effects.forEach((e) => e.resize(window.innerWidth, window.innerHeight));
    resize();

    let raf: number | null = null;
    let last = 0;
    const tick = (t: number) => {
      const delta = last ? Math.min((t - last) / 16.667, 2.5) : 1;
      last = t;
      effects.forEach((e) => e.frame(delta));
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf !== null || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      last = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    // Relámpagos: solo destello visual, cada 11 a 24 s, con posible doble destello.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = new Set<number>();
    let disposed = false;
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const strike = () => {
      const el = flashRef.current;
      if (!el || document.hidden) return;
      el.classList.remove("strike");
      void el.offsetWidth;
      el.classList.add("strike");
      later(() => el.classList.remove("strike"), 800);
    };
    const schedule = () => {
      later(() => {
        if (disposed) return;
        strike();
        if (Math.random() > 0.72) later(strike, 240 + Math.random() * 500);
        schedule();
      }, 11000 + Math.random() * 13000);
    };
    if (!reduced) schedule();

    return () => {
      disposed = true;
      stop();
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <>
      <canvas ref={rainRef} className="scene-canvas z-[1]" aria-hidden="true" />
      <canvas ref={fogRef} className="scene-canvas z-[2]" aria-hidden="true" />
      <div ref={flashRef} className="lightning-flash" aria-hidden="true" />
      <canvas ref={petalsRef} className="scene-canvas z-[4]" aria-hidden="true" />
    </>
  );
}
