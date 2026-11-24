import {getLang, getWingName, localizeWork, t} from './i18n.js';

const collators = new Map();
function collatorFor(lang) {
  const code = lang || 'ja';
  if (!collators.has(code)) {
    collators.set(code, new Intl.Collator(code, {numeric: true, sensitivity: 'base'}));
  }
  return collators.get(code);
}

export function audioLengthsFor(work) {
  return Array.isArray(work?.audioLengths) && work.audioLengths.length ? work.audioLengths : [60];
}

export function priorityTierFor(work, lang = getLang()) {
  const raw = work?.catalogPriority;
  if (raw === '超有名') return {key: 'gold', label: t('tier.gold', null, lang), rank: 1};
  if (raw === '有名') return {key: 'silver', label: t('tier.silver', null, lang), rank: 2};
  return {key: 'bronze', label: t('tier.bronze', null, lang), rank: 3};
}

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    // ラテン文字のアクセント記号のみ除去（日本語の濁点・半濁点には影響させない）
    .replace(/[\u00C0-\u024F]/g, ch => ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .toLocaleLowerCase('ja')
    // カタカナをひらがなへ統一
    .replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    // ゔぃ/ゔぇ/ゔぉ/ゔぁ/ゔ の表記ゆれを吸収（ダ・ヴィンチ <-> ダビンチ等）
    .replace(/ゔぁ/g, 'ば')
    .replace(/ゔぃ/g, 'び')
    .replace(/ゔぇ/g, 'べ')
    .replace(/ゔぉ/g, 'ぼ')
    .replace(/ゔ/g, 'ぶ')
    // 中黒・空白・記号・長音符のゆれを吸収
    .replace(/[\s・･\-‐‑‒–—―ー=＝,，.。/／()（）「」『』《》:：;；'’"”]/g, '');
}

export function catalogWorks(works, {query = '', sort = 'title-asc', filter = 'all', myPlanIds = null, lang = getLang()} = {}) {
  const needle = normalizeSearchText(query);
  const myPlanSet = myPlanIds instanceof Set ? myPlanIds : Array.isArray(myPlanIds) ? new Set(myPlanIds) : null;
  const collator = collatorFor(lang);
  const matches = works.filter(work => {
    const tier = priorityTierFor(work, lang);
    const tierEn = priorityTierFor(work, 'en');
    if (filter === 'mapped' && work.locationPrecision !== 'room') return false;
    if (filter === 'top' && tier.key !== 'gold') return false;
    if (filter === 'famous' && tier.key !== 'silver') return false;
    if (filter === 'masterpiece' && tier.key !== 'bronze') return false;
    if (filter === 'myplan' && (!myPlanSet || !myPlanSet.has(work.id))) return false;
    if (!needle) return true;
    const localized = localizeWork(work, lang);
    const wingJa = getWingName(work.wing, 'ja');
    const wingEn = getWingName(work.wing, 'en');
    const text = normalizeSearchText(
      [
        work.title, work.author, work.year,
        localized.title, localized.author, localized.year,
        work.room, work.wing, wingJa, wingEn,
        work.catalogPriority, tier.label, tierEn.label
      ]
        .filter(Boolean)
        .join(' ')
    );
    return text.includes(needle);
  });
  const byTitle = (a, b) => collator.compare(localizeWork(a, lang).title, localizeWork(b, lang).title);
  const byRank = (a, b) => {
    const tierDiff = priorityTierFor(a).rank - priorityTierFor(b).rank;
    if (tierDiff) return tierDiff;
    const aRank = Number.isInteger(a.catalogRank) ? a.catalogRank : 9999;
    const bRank = Number.isInteger(b.catalogRank) ? b.catalogRank : 9999;
    return (aRank - bRank) || byTitle(a, b);
  };
  const byRoom = (a, b) => {
    const aRoom = Number(a.room), bRoom = Number(b.room);
    const aKnown = a.room != null && a.room !== '' && Number.isFinite(aRoom);
    const bKnown = b.room != null && b.room !== '' && Number.isFinite(bRoom);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (!aKnown) return byTitle(a, b);
    return (aRoom - bRoom) || byTitle(a, b);
  };
  if (sort === 'rank-asc') {
    matches.sort(byRank);
  } else {
    matches.sort(sort.startsWith('room-') ? byRoom : byTitle);
  }
  if (sort.endsWith('-desc')) {
    if (sort.startsWith('room-')) {
      const known = matches.filter(work => work.room != null && work.room !== '' && Number.isFinite(Number(work.room)));
      const unknown = matches.filter(work => work.room == null || work.room === '' || !Number.isFinite(Number(work.room)));
      return known.reverse().concat(unknown);
    }
    matches.reverse();
  }
  return matches;
}
