import {t} from '../i18n.js';
import {esc} from '../app/ui-helpers.js';

export const ONBOARDING_STEPS = Object.freeze([
  {id: 'map', selector: '.map-frame', titleKey: 'tour.step1Title', bodyKey: 'tour.step1Body', pad: 6},
  {id: 'floors', selector: '.floor-tabs', titleKey: 'tour.step2Title', bodyKey: 'tour.step2Body', pad: 6},
  {id: 'subbar', selector: '.map-subbar', titleKey: 'tour.step3Title', bodyKey: 'tour.step3Body', pad: 6},
  {id: 'plan', selector: '[data-tab="plan"]', titleKey: 'tour.step4Title', bodyKey: 'tour.step4Body', pad: 4},
  {id: 'audio', selector: '[data-tab="audio"]', titleKey: 'tour.step5Title', bodyKey: 'tour.step5Body', pad: 4},
  {id: 'settings', selector: '[data-tab="settings"]', titleKey: 'tour.step6Title', bodyKey: 'tour.step6Body', pad: 4}
]);

let repositionCleanup = null;

export function cleanupOnboardingPositioning() {
  if (repositionCleanup) {
    repositionCleanup();
    repositionCleanup = null;
  }
}

export function startOnboardingTour(ctx) {
  const {state} = ctx;
  state.tab = 'map';
  state.detailWorkId = null;
  state.audioSettingsOpen = false;
  state.onboarding = {active: true, step: 0};
  ctx.render();
  window.scrollTo({top: 0});
}

export function finishOnboardingTour(ctx) {
  const {state} = ctx;
  cleanupOnboardingPositioning();
  state.onboarding = {active: false, step: 0};
  state.hasSeenOnboarding = true;
  ctx.persistState();
  ctx.render();
}

export function onboardingTourMarkup(ctx) {
  const {state} = ctx;
  if (!state.onboarding?.active || state.appPhase !== 'main') return '';
  if (state.incomingSharedPlan || state.shareModal?.open) return '';

  const lang = state.lang;
  const tr = (key, params) => t(key, params, lang);
  const idx = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, state.onboarding.step || 0));
  const step = ONBOARDING_STEPS[idx];
  const isFirst = idx === 0;
  const isLast = idx === ONBOARDING_STEPS.length - 1;

  return `<div class="tour-overlay" data-tour-overlay role="dialog" aria-modal="true" aria-label="${esc(tr('tour.dialogAria'))}">
    <div class="tour-backdrop" data-tour-backdrop></div>
    <div class="tour-spotlight" data-tour-spotlight aria-hidden="true"></div>
    <section class="tour-popover" data-tour-popover>
      <div class="tour-popover-head">
        <span class="tour-step-badge">${esc(tr('tour.stepCounter', {current: idx + 1, total: ONBOARDING_STEPS.length}))}</span>
        <button type="button" class="tour-skip-btn" data-tour-skip>${esc(tr('tour.skipBtn'))}</button>
      </div>
      <h2>${esc(tr(step.titleKey))}</h2>
      <p>${esc(tr(step.bodyKey))}</p>
      <div class="tour-dots" aria-hidden="true">
        ${ONBOARDING_STEPS.map((item, i) => `<span class="${i === idx ? 'active' : i < idx ? 'done' : ''}"></span>`).join('')}
      </div>
      <div class="tour-actions">
        ${!isFirst ? `<button type="button" class="secondary compact-btn" data-tour-prev>${esc(tr('tour.prevBtn'))}</button>` : '<span></span>'}
        <button type="button" class="primary compact-btn" data-tour-next>${esc(isLast ? tr('tour.doneBtn') : tr('tour.nextBtn'))}</button>
      </div>
    </section>
  </div>`;
}

function positionSpotlightAndPopover(step) {
  const spotlight = document.querySelector('[data-tour-spotlight]');
  const popover = document.querySelector('[data-tour-popover]');
  const backdrop = document.querySelector('[data-tour-backdrop]');
  if (!spotlight || !popover) return;

  const target = document.querySelector(step.selector);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!target) {
    spotlight.style.display = 'none';
    if (backdrop) backdrop.style.display = 'block';
    popover.style.left = `${Math.max(12, Math.round((vw - popover.offsetWidth) / 2))}px`;
    popover.style.top = `${Math.max(16, Math.round((vh - popover.offsetHeight) / 2))}px`;
    return;
  }

  const rect = target.getBoundingClientRect();
  const pad = step.pad ?? 6;
  const left = Math.max(4, Math.round(rect.left - pad));
  const top = Math.max(4, Math.round(rect.top - pad));
  const width = Math.min(vw - left - 4, Math.round(rect.width + pad * 2));
  const height = Math.min(vh - top - 4, Math.round(rect.height + pad * 2));

  if (backdrop) backdrop.style.display = 'none';
  spotlight.style.display = 'block';
  spotlight.style.left = `${left}px`;
  spotlight.style.top = `${top}px`;
  spotlight.style.width = `${Math.max(24, width)}px`;
  spotlight.style.height = `${Math.max(24, height)}px`;

  const popW = popover.offsetWidth || Math.min(340, vw - 24);
  const popH = popover.offsetHeight || 190;
  const centerX = left + width / 2;
  const popLeft = Math.max(12, Math.min(vw - popW - 12, Math.round(centerX - popW / 2)));

  const spaceBelow = vh - (top + height);
  const spaceAbove = top;
  let popTop;
  if (spaceBelow >= popH + 16) {
    popTop = top + height + 12;
  } else if (spaceAbove >= popH + 16) {
    popTop = top - popH - 12;
  } else {
    popTop = Math.max(12, Math.min(vh - popH - 12, Math.round((vh - popH) / 2)));
  }

  popover.style.left = `${popLeft}px`;
  popover.style.top = `${popTop}px`;
}

export function wireOnboardingTour(ctx) {
  cleanupOnboardingPositioning();
  const {state} = ctx;
  if (!state.onboarding?.active || state.appPhase !== 'main') return;
  if (state.incomingSharedPlan || state.shareModal?.open) return;

  const idx = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, state.onboarding.step || 0));
  const step = ONBOARDING_STEPS[idx];

  document.querySelector('[data-tour-skip]')?.addEventListener('click', () => finishOnboardingTour(ctx));
  document.querySelector('[data-tour-prev]')?.addEventListener('click', () => {
    state.onboarding.step = Math.max(0, idx - 1);
    ctx.render();
  });
  document.querySelector('[data-tour-next]')?.addEventListener('click', () => {
    if (idx >= ONBOARDING_STEPS.length - 1) {
      finishOnboardingTour(ctx);
    } else {
      state.onboarding.step = idx + 1;
      ctx.render();
    }
  });

  const target = document.querySelector(step.selector);
  if (target) {
    const r = target.getBoundingClientRect();
    if (r.top < 56 || r.bottom > window.innerHeight - 64) {
      target.scrollIntoView({block: 'center', behavior: 'auto'});
    }
  }

  const sync = () => positionSpotlightAndPopover(step);
  requestAnimationFrame(sync);
  window.addEventListener('resize', sync, {passive: true});
  window.addEventListener('scroll', sync, {passive: true});
  repositionCleanup = () => {
    window.removeEventListener('resize', sync);
    window.removeEventListener('scroll', sync);
  };
}
