"use client";

// Small visual reactions, done with plain DOM + CSS classes from globals.css (colours come from the
// theme's CSS variables). With "reduce motion" on, particles are skipped and the CSS falls back to fades.

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Replays a CSS animation class on an element (works when tapped again quickly).
export function replay(el: Element | null, cls: string): void {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth; // restart the animation
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}

function layer(cls: string, x: number, y: number): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = cls;
  span.setAttribute("aria-hidden", "true");
  span.style.left = `${x}px`;
  span.style.top = `${y}px`;
  document.body.appendChild(span);
  return span;
}
const centre = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
};

// "+20 XP" rising from a control.
export function floatText(anchor: Element | null, text: string): void {
  if (!anchor) return;
  const { x, r } = centre(anchor);
  const span = layer("feel-float", x, r.top);
  span.textContent = text;
  setTimeout(() => span.remove(), 1100);
}

// A burst of small sparks from the centre of an element.
export function sparkle(anchor: Element | null, count = 12, spread = 70): void {
  if (!anchor || reducedMotion()) return;
  const { x, y } = centre(anchor);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = spread * (0.55 + Math.random() * 0.45);
    const spark = layer(`feel-spark${i % 3 === 0 ? " feel-spark-alt" : ""}`, x, y);
    spark.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    spark.style.animationDelay = `${Math.random() * 60}ms`;
    setTimeout(() => spark.remove(), 900);
  }
}

// A centred banner for big moments (level up, milestone). Tap to close; closes itself after ~2.8 s.
export function celebrate(title: string, subtitle: string): void {
  document.querySelector(".feel-celebrate")?.remove();
  const box = document.createElement("div");
  box.className = "feel-celebrate";
  box.setAttribute("role", "status");
  box.innerHTML = `<div class="feel-celebrate-card"><p class="feel-celebrate-sub"></p><p class="feel-celebrate-title"></p></div>`;
  box.querySelector(".feel-celebrate-title")!.textContent = title;
  box.querySelector(".feel-celebrate-sub")!.textContent = subtitle;
  document.body.appendChild(box);
  const close = () => {
    box.classList.add("feel-celebrate-out");
    setTimeout(() => box.remove(), 300);
  };
  box.addEventListener("click", close, { once: true });
  setTimeout(close, 2800);
  requestAnimationFrame(() => sparkle(box.querySelector(".feel-celebrate-card"), 22, 160));
}
