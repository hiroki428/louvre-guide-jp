const japanese = new Intl.Collator('ja', {numeric:true, sensitivity:'base'});

export function audioLengthsFor(work) {
  return Array.isArray(work?.audioLengths) && work.audioLengths.length ? work.audioLengths : [20, 40, 60, 120];
}

export function priorityTierFor(work) {
  const raw = work?.catalogPriority;
  if (raw === '超有名') return {key: 'gold', label: '超有名', rank: 1};
  if (raw === '有名') return {key: 'silver', label: '有名', rank: 2};
  return {key: 'bronze', label: '傑作', rank: 3};
}

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
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

export function catalogWorks(works, {query = '', sort = 'title-asc', filter = 'all', myPlanIds = null} = {}) {
  const needle = normalizeSearchText(query);
  const myPlanSet = myPlanIds instanceof Set ? myPlanIds : Array.isArray(myPlanIds) ? new Set(myPlanIds) : null;
  const matches = works.filter(work => {
    const tier = priorityTierFor(work);
    if (filter === 'mapped' && work.locationPrecision !== 'room') return false;
    if (filter === 'top' && tier.key !== 'gold') return false;
    if (filter === 'famous' && tier.key !== 'silver') return false;
    if (filter === 'masterpiece' && tier.key !== 'bronze') return false;
    if (filter === 'myplan' && (!myPlanSet || !myPlanSet.has(work.id))) return false;
    if (!needle) return true;
    const wingJa = {Richelieu:'リシュリュー', Sully:'シュリー', Denon:'ドゥノン'}[work.wing] ?? '';
    const text = normalizeSearchText(
      [work.title, work.author, work.year, work.room, work.wing, wingJa, work.catalogPriority, tier.label]
        .filter(Boolean)
        .join(' ')
    );
    return text.includes(needle);
  });
  const byTitle = (a, b) => japanese.compare(a.title, b.title);
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
