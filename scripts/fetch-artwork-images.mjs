import fs from 'node:fs';
import path from 'node:path';

/**
 * 展示室確認済みでまだローカル画像がない作品の Wikimedia Commons サムネイル画像と
 * 正式なライセンス出典（extmetadata）を取得し、
 * public/images/, src/artwork-images.json, src/image-credits.json を更新します。
 *
 * 実行例: node scripts/fetch-artwork-images.mjs
 */

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const worksPath = path.join(root, 'src/works.json');
const imagesJsonPath = path.join(root, 'src/artwork-images.json');
const creditsJsonPath = path.join(root, 'src/image-credits.json');
const imagesDir = path.join(root, 'public/images');

const WIKI_TITLES = {
  'catalog-0001': 'The_Coronation_of_Napoleon',
  'catalog-0002': 'The_Raft_of_the_Medusa',
  'catalog-0003': 'The_Wedding_at_Cana',
  'catalog-0004': 'Oath_of_the_Horatii',
  'catalog-0005': 'Psyche_Revived_by_Cupid%27s_Kiss',
  'catalog-0006': 'Code_of_Hammurabi',
  'catalog-0007': 'Lamassu',
  'catalog-0008': 'Grande_Odalisque',
  'catalog-0009': 'Rebellious_Slave',
  'catalog-0011': 'Great_Sphinx_of_Tanis',
  'catalog-0012': 'The_Virgin_and_Child_with_Saint_Anne_(Leonardo)',
  'catalog-0013': 'Virgin_of_the_Rocks',
  'catalog-0014': 'Saint_John_the_Baptist_(Leonardo)',
  'catalog-0015': 'The_Death_of_Sardanapalus',
  'catalog-0016': 'The_Turkish_Bath',
  'catalog-0017': 'Portrait_of_Baldassare_Castiglione',
  'catalog-0018': 'La_Belle_Ferronni%C3%A8re',
  'catalog-0019': 'Pierrot_(painting)',
  'catalog-0020': 'The_Embarkation_for_Cythera',
  'catalog-0021': 'The_Astronomer_(Vermeer)',
  'catalog-0022': 'Death_of_the_Virgin_(Caravaggio)',
  'catalog-0025': 'fr:Appartements_Napol%C3%A9on_III',
  'catalog-0026': 'The_Intervention_of_the_Sabine_Women',
  'catalog-0028': 'La_belle_jardini%C3%A8re',
  'catalog-0029': 'Madonna_of_Chancellor_Rolin',
  'catalog-0031': 'The_Fortune_Teller_(Caravaggio)',
  'catalog-0032': 'fr:Les_Bergers_d%27Arcadie',
  'catalog-0035': 'fr:Appartements_Napol%C3%A9on_III',
  'catalog-0037': 'Statue_of_Ebih-Il',
  'catalog-0038': 'Sarcophagus_of_the_Spouses',
  'catalog-0040': 'fr:Sainte_Marie-Madeleine_(Gregor_Erhart)',
  'catalog-0041': 'The_Four_Seasons_(Arcimboldo)',
  'catalog-0042': 'The_Four_Seasons_(Arcimboldo)',
  'catalog-0043': 'fr:Atala_au_tombeau',
  'catalog-0044': 'Oedipus_and_the_Sphinx',
  'catalog-0045': 'Portrait_of_Madame_R%C3%A9camier',
  'catalog-0049': 'Marie_de%27_Medici_cycle',
  'catalog-0051': 'St._Sebastian_(Mantegna)',
  'catalog-0052': 'An_Old_Man_and_his_Grandson',
  'catalog-0053': 'fr:Le_Condottiere_(Antonello_de_Messine)',
  'catalog-0054': 'Pastoral_Concert',
  'catalog-0055': 'Man_with_a_Glove',
  'catalog-0056': 'Madonna_of_the_Rabbit',
  'catalog-0077': 'The_Lock_(Fragonard)',
  'catalog-0079': 'Magdalene_with_the_Smoking_Flame',
  'catalog-0085': 'fr:Le_D%C3%A9barquement_de_la_reine_%C3%A0_Marseille',
  'catalog-0086': 'Marie_de%27_Medici_cycle'
};

const HEADERS = {'User-Agent': 'LouvreAudioMap/0.3 (https://sakai175.github.io/louvre-guide-jp/; educational)'};
const works = JSON.parse(fs.readFileSync(worksPath, 'utf8'));
const imagesMap = JSON.parse(fs.readFileSync(imagesJsonPath, 'utf8'));
const credits = JSON.parse(fs.readFileSync(creditsJsonPath, 'utf8'));
const creditFiles = new Set(credits.map(c => c.file));

fs.mkdirSync(imagesDir, {recursive: true});

async function fetchCommonsMetadata(fileTitle) {
  try {
    const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=extmetadata&format=json`;
    const res = await fetch(api, {headers: HEADERS});
    if (!res.ok) return null;
    const data = await res.json();
    const page = Object.values(data?.query?.pages || {})[0];
    const meta = page?.imageinfo?.[0]?.extmetadata;
    if (!meta) return null;
    return {
      artist: meta.Artist?.value || meta.Credit?.value || 'Wikimedia Commons contributor',
      license: meta.LicenseShortName?.value || meta.UsageTerms?.value || 'Public domain / Wikimedia Commons',
      licenseUrl: meta.LicenseUrl?.value || null
    };
  } catch {
    return null;
  }
}

function extractCommonsFileTitle(url) {
  const decoded = decodeURIComponent(url.split('?')[0]);
  // Handle .../thumb/a/ab/FileName.jpg/640px-FileName.jpg or .../a/ab/FileName.jpg
  const thumbMatch = decoded.match(/\/thumb\/[^/]+\/[^/]+\/([^/]+)\/[^/]+$/);
  if (thumbMatch) return `File:${thumbMatch[1].replace(/_/g, ' ')}`;
  const directMatch = decoded.match(/\/([^/]+\.(?:jpg|jpeg|png|webp))$/i);
  if (directMatch) return `File:${directMatch[1].replace(/^\d+px-/, '').replace(/_/g, ' ')}`;
  return null;
}

let fetched = 0;
let skipped = 0;
const failed = [];

for (const [id, wikiTitle] of Object.entries(WIKI_TITLES)) {
  if (imagesMap[id]?.src && fs.existsSync(path.join(root, 'public', imagesMap[id].src))) {
    skipped += 1;
    continue;
  }
  try {
    const isFr = wikiTitle.startsWith('fr:');
    const lang = isFr ? 'fr' : 'en';
    const slug = isFr ? wikiTitle.slice(3) : wikiTitle;
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`;
    const res = await fetch(summaryUrl, {headers: HEADERS});
    if (!res.ok) { failed.push(`${id} (summary ${res.status})`); continue; }
    const summary = await res.json();
    const origUrl = summary?.originalimage?.source;
    const rawThumb = summary?.thumbnail?.source || origUrl;
    if (!rawThumb) { failed.push(`${id} (no image)`); continue; }
    const thumbUrl = rawThumb.replace(/\/\d+px-/, '/640px-');

    let imgRes = await fetch(thumbUrl, {headers: HEADERS});
    if (!imgRes.ok && rawThumb !== thumbUrl) {
      imgRes = await fetch(rawThumb, {headers: HEADERS});
    }
    if (!imgRes.ok) { failed.push(`${id} (img ${imgRes.status})`); continue; }

    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length < 1500) { failed.push(`${id} (tiny ${buf.length}B)`); continue; }

    const filename = `${id}.jpg`;
    fs.writeFileSync(path.join(imagesDir, filename), buf);
    imagesMap[id] = {
      original: origUrl || rawThumb,
      source: summary?.content_urls?.desktop?.page || summaryUrl,
      src: `images/${filename}`
    };

    const fileTitle = extractCommonsFileTitle(origUrl || rawThumb);
    if (fileTitle && !creditFiles.has(fileTitle)) {
      const meta = await fetchCommonsMetadata(fileTitle);
      credits.push({
        artist: meta?.artist || works.find(w => w.id === id)?.author || 'Wikimedia Commons contributor',
        licenseUrl: meta?.licenseUrl ?? null,
        file: fileTitle,
        license: meta?.license || 'Public domain / Wikimedia Commons'
      });
      creditFiles.add(fileTitle);
    }
    fetched += 1;
    console.log(`Fetched ${id} -> images/${filename} (${(buf.length / 1024).toFixed(1)} KB)`);
    await new Promise(r => setTimeout(r, 120));
  } catch (err) {
    failed.push(`${id} (${err.message})`);
  }
}

fs.writeFileSync(imagesJsonPath, JSON.stringify(imagesMap, null, 2) + '\n', 'utf8');
fs.writeFileSync(creditsJsonPath, JSON.stringify(credits, null, 2) + '\n', 'utf8');
console.log(`Done. fetched=${fetched}, alreadyHad=${skipped}, failed=${failed.length}`);
if (failed.length) console.log('Failed:', failed.join(', '));
