import {esc} from './ui-helpers.js';

let routeLoaderToken = 0;

export function routeLoaderMarkup({title, previewImages = []}) {
  const frames = Array.from({length: 3}, (_, index) => {
    const src = previewImages[index];
    return `<span class="route-loader-art route-loader-art-${index + 1}">${src ? `<img src="${esc(src)}" alt="" loading="eager">` : '<span class="route-loader-art-fallback"></span>'}</span>`;
  }).join('');
  return `<div class="route-loader-card">
    <div class="route-loader-gallery" aria-hidden="true">
      <div class="route-loader-arts">${frames}</div>
      <svg class="route-loader-path" viewBox="0 0 320 38" aria-hidden="true">
        <path d="M18 16 C68 16 62 32 142 25 S236 10 302 21" fill="none" />
        <circle cx="18" cy="16" r="4" /><circle cx="142" cy="25" r="4" /><circle cx="302" cy="21" r="4" />
      </svg>
    </div>
    <h2 class="route-loader-title">${esc(title)}</h2>
  </div>`;
}

export async function runWithRouteLoader({title, durationMs = 2200, previewImages = []}, applyFn) {
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
  overlay.innerHTML = routeLoaderMarkup({title, previewImages});
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  await new Promise(resolve => setTimeout(resolve, durationMs));
  if (token !== routeLoaderToken) { overlay.remove(); return; }

  applyFn();
  overlay.classList.add('is-leaving');
  await new Promise(resolve => setTimeout(resolve, 380));
  overlay.remove();
}
