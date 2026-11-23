import {esc} from './ui-helpers.js';

let routeLoaderToken = 0;

export function routeLoaderMarkup({title, subtitle, modeBadge, steps}) {
  return `<div class="route-loader-card">
    <div class="route-loader-visual" aria-hidden="true">
      <svg viewBox="0 0 220 118" fill="none">
        <defs>
          <linearGradient id="goldLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#c9a45c" stop-opacity="0.35"/>
            <stop offset="50%" stop-color="#f3d88e"/>
            <stop offset="100%" stop-color="#c9a45c" stop-opacity="0.8"/>
          </linearGradient>
        </defs>
        <g class="loader-pyramid">
          <polygon points="110,10 156,82 64,82" stroke="rgba(243,216,142,0.34)" stroke-width="1.2"/>
          <line x1="110" y1="10" x2="110" y2="82" stroke="rgba(243,216,142,0.22)" stroke-width="1"/>
          <line x1="87" y1="46" x2="133" y2="46" stroke="rgba(243,216,142,0.2)" stroke-width="1"/>
          <line x1="76" y1="64" x2="144" y2="64" stroke="rgba(243,216,142,0.18)" stroke-width="1"/>
        </g>
        <path class="loader-route-base" d="M 24 94 C 52 94, 56 64, 82 64 C 106 64, 114 34, 142 40 C 168 46, 174 24, 198 28"/>
        <path class="loader-route-trace" d="M 24 94 C 52 94, 56 64, 82 64 C 106 64, 114 34, 142 40 C 168 46, 174 24, 198 28" stroke="url(#goldLine)"/>
        <g class="loader-node is-lit" transform="translate(24 94)"><circle class="loader-node-ring" r="7"/><circle class="loader-node-core" r="3"/></g>
        <g class="loader-node" transform="translate(82 64)"><circle class="loader-node-ring" r="7"/><circle class="loader-node-core" r="3"/></g>
        <g class="loader-node" transform="translate(142 40)"><circle class="loader-node-ring" r="7"/><circle class="loader-node-core" r="3"/></g>
        <g class="loader-node" transform="translate(198 28)"><circle class="loader-node-ring" r="8"/><circle class="loader-node-core" r="3.5"/></g>
      </svg>
    </div>
    <div class="route-loader-kicker">
      <span>ROUTE DESIGNING</span>
      ${modeBadge ? `<em>${esc(modeBadge)}</em>` : ''}
    </div>
    <h2 class="route-loader-title">${esc(title)}</h2>
    ${subtitle ? `<p class="route-loader-sub">${esc(subtitle)}</p>` : ''}
    <ul class="route-loader-steps">
      ${steps.map((text, idx) => `<li data-loader-step="${idx}"><i aria-hidden="true"></i><span>${esc(text)}</span></li>`).join('')}
    </ul>
    <div class="route-loader-bar" aria-hidden="true"><span class="route-loader-bar-fill"></span></div>
  </div>`;
}

export async function runWithRouteLoader({title, subtitle = '', modeBadge = '', steps, durationMs = 2200}, applyFn) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    applyFn();
    return;
  }
  const token = ++routeLoaderToken;
  document.querySelector('.route-loader-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'route-loader-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = routeLoaderMarkup({title, subtitle, modeBadge, steps});
  document.body.appendChild(overlay);

  const stepEls = [...overlay.querySelectorAll('[data-loader-step]')];
  const barEl = overlay.querySelector('.route-loader-bar-fill');
  const nodeEls = [...overlay.querySelectorAll('.loader-node')];
  const setStage = idx => {
    stepEls.forEach((el, i) => {
      el.classList.toggle('is-done', i < idx);
      el.classList.toggle('is-active', i === idx);
    });
    nodeEls.forEach((el, i) => {
      el.classList.toggle('is-lit', i <= idx + 1);
    });
    if (barEl) barEl.style.width = `${Math.min(100, Math.round(((idx + 1) / Math.max(1, stepEls.length)) * 100))}%`;
  };

  requestAnimationFrame(() => {
    overlay.classList.add('is-visible');
    setStage(0);
  });

  const stepDelay = Math.round(durationMs / Math.max(1, steps.length));
  for (let i = 1; i < steps.length; i += 1) {
    await new Promise(resolve => setTimeout(resolve, stepDelay));
    if (token !== routeLoaderToken) { overlay.remove(); return; }
    setStage(i);
  }
  await new Promise(resolve => setTimeout(resolve, Math.max(460, stepDelay)));
  if (token !== routeLoaderToken) { overlay.remove(); return; }

  applyFn();
  overlay.classList.add('is-leaving');
  await new Promise(resolve => setTimeout(resolve, 380));
  overlay.remove();
}
