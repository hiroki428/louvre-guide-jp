import {esc} from './ui-helpers.js';

let routeLoaderToken = 0;

export function routeLoaderMarkup({title}) {
  return `<div class="route-loader-card">
    <span class="route-loader-spinner" aria-hidden="true"></span>
    <h2 class="route-loader-title">${esc(title)}</h2>
  </div>`;
}

export async function runWithRouteLoader({title, durationMs = 2200}, applyFn) {
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
  overlay.innerHTML = routeLoaderMarkup({title});
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  await new Promise(resolve => setTimeout(resolve, durationMs + 2000));
  if (token !== routeLoaderToken) { overlay.remove(); return; }

  applyFn();
  overlay.classList.add('is-leaving');
  await new Promise(resolve => setTimeout(resolve, 380));
  overlay.remove();
}
