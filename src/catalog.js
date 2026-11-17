const japanese = new Intl.Collator('ja', {numeric:true, sensitivity:'base'});

export function audioLengthsFor(work) {
  return Array.isArray(work.audioLengths) && work.audioLengths.length ? work.audioLengths : [20, 40, 60, 120];
}

export function catalogWorks(works, {query = '', sort = 'title-asc'} = {}) {
  const needle = query.normalize('NFKC').trim().toLocaleLowerCase('ja');
  const matches = works.filter(work => {
    const text = [work.title, work.author, work.room, work.wing, work.catalogPriority]
      .filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('ja');
    return text.includes(needle);
  });
  const byTitle = (a, b) => japanese.compare(a.title, b.title);
  const byRoom = (a, b) => {
    const aRoom = Number(a.room), bRoom = Number(b.room);
    const aKnown = a.room != null && a.room !== '' && Number.isFinite(aRoom);
    const bKnown = b.room != null && b.room !== '' && Number.isFinite(bRoom);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (!aKnown) return byTitle(a, b);
    return (aRoom - bRoom) || byTitle(a, b);
  };
  matches.sort(sort.startsWith('room-') ? byRoom : byTitle);
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
