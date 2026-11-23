import {formatWorkCreatorMeta, formatWorkLocation} from '../app-config.js';
import {priorityTierFor} from '../catalog.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const workStatus = work => formatWorkLocation(work);
export const creatorMeta = work => formatWorkCreatorMeta(work);
export const formatAudioLengthLabel = length => (length === 60 ? '標準 1分' : length === 120 ? '深掘り 2分' : length < 60 ? `${length}秒` : `${length / 60}分`);

export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatRate(rate) {
  return `${Number(rate.toFixed(2))}x`;
}

export function wingClass(wing) {
  return wing ? `wing-tint-${String(wing).toLowerCase()}` : 'wing-tint-unknown';
}

export function thumbMarkup(ctx, work, sizeClass = '') {
  const image = ctx.artworkImages[work.id];
  const fallbackText = esc((work.title || '?').slice(0, 1));
  if (image?.src) {
    const src = new URL(image.src, ctx.appBase).href;
    return `<span class="work-thumb ${sizeClass} ${wingClass(work.wing)}"><img src="${src}" alt="${esc(work.title)}" loading="lazy" onerror="this.remove()"><em>${fallbackText}</em></span>`;
  }
  return `<span class="work-thumb ${sizeClass} ${wingClass(work.wing)}" aria-hidden="true"><em>${fallbackText}</em></span>`;
}

export function priorityBadgeMarkup(work) {
  const tier = priorityTierFor(work);
  return `<span class="tier-badge tier-${tier.key}">${esc(tier.label)}</span>`;
}

export function createNoticeController(state) {
  let noticeTimer = null;

  function setNotice(message, canUndo = false, duration = 5200) {
    if (noticeTimer) clearTimeout(noticeTimer);
    state.notice = {message, canUndo};
    noticeTimer = setTimeout(() => {
      state.notice = null;
      if (canUndo) state.undo = null;
      document.querySelector('.arrival-toast')?.remove();
      noticeTimer = null;
    }, duration);
  }

  function clearProgressNotice() {
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = null;
    state.notice = null;
    state.undo = null;
  }

  return {setNotice, clearProgressNotice};
}

export function noticeMarkup(ctx, hasMini) {
  if (!ctx.state.notice) return '';
  return `<aside class="arrival-toast ${hasMini ? 'with-mini-player' : ''}" role="status" aria-live="polite">
    <span>${esc(ctx.state.notice.message)}</span>
    ${ctx.state.notice.canUndo ? '<button type="button" data-undo-arrival>元に戻す</button>' : ''}
  </aside>`;
}

export function bottomTabsMarkup(ctx) {
  const tabs = [
    {id: 'map', label: 'マップ', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 7v13l6-3 6 3 6-3V4l-6 3-6-3Zm0 0v13m6-10v13"/></svg>'},
    {id: 'plan', label: 'プラン一覧', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>'},
    {id: 'audio', label: '音声一覧', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2Zm16 0a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2Z"/></svg>'},
    {id: 'settings', label: '案内・設定', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z"/></svg>'}
  ];
  return `<nav class="bottom-tabs" aria-label="メインメニュー">
    ${tabs.map(t => `<button type="button" data-tab="${t.id}" class="${ctx.state.tab === t.id ? 'active' : ''}" aria-current="${ctx.state.tab === t.id ? 'page' : 'false'}">${t.icon}<span>${t.label}</span></button>`).join('')}
  </nav>`;
}
