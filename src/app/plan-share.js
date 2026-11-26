// Compact serverless plan sharing (URL + QR Code SVG, zero external dependencies).

const NAMED_WORK_CODES = Object.freeze([
  ['m0', 'mona'],
  ['m1', 'venus'],
  ['m2', 'victory'],
  ['m3', 'liberty'],
  ['m4', 'scribe'],
  ['m5', 'lacemaker'],
  ['m6', 'dying'],
  ['m7', 'money'],
  ['m8', 'marly'],
  ['m9', 'cheat'],
  ['ma', 'bather'],
  ['mb', 'clubfoot']
]);

const CODE_TO_WORK = Object.fromEntries(NAMED_WORK_CODES);
const WORK_TO_CODE = Object.fromEntries(NAMED_WORK_CODES.map(([code, id]) => [id, code]));

export const MAX_SHARED_TITLE_LEN = 40;
export const MAX_SHARED_WORKS = 60;
export const PENDING_SHARE_SESSION_KEY = 'louvre-pending-shared-plan-v1';

export function savePendingSharedPlan(plan, storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  try {
    if (plan?.ids?.length) storage?.setItem(PENDING_SHARE_SESSION_KEY, JSON.stringify({ids: plan.ids, title: plan.title || ''}));
    else storage?.removeItem(PENDING_SHARE_SESSION_KEY);
  } catch { /* sessionStorage optional */ }
}

export function readPendingSharedPlan(byId = null, storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  try {
    const raw = storage?.getItem(PENDING_SHARE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.ids)) return null;
    const ids = parsed.ids.filter(id => !byId || Boolean(byId[id]));
    if (!ids.length) return null;
    return {ids, title: sanitizeSharedTitle(parsed.title || ''), token: encodeSharedPlanToken(ids)};
  } catch {
    return null;
  }
}

export function encodeWorkId(id) {
  const raw = String(id || '').trim();
  if (!raw) return '';
  if (WORK_TO_CODE[raw]) return WORK_TO_CODE[raw];
  const cat = /^catalog-(\d{1,4})$/.exec(raw);
  if (cat) return String(Number(cat[1]));
  return raw;
}

export function decodeWorkId(token) {
  const raw = String(token || '').trim();
  if (!raw) return '';
  if (CODE_TO_WORK[raw]) return CODE_TO_WORK[raw];
  if (/^\d{1,4}$/.test(raw)) return `catalog-${raw.padStart(4, '0')}`;
  return raw;
}

export function encodeSharedPlanToken(ids) {
  if (!Array.isArray(ids)) return '';
  const unique = [];
  const seen = new Set();
  for (const id of ids) {
    const encoded = encodeWorkId(id);
    if (!encoded || seen.has(encoded)) continue;
    seen.add(encoded);
    unique.push(encoded);
    if (unique.length >= MAX_SHARED_WORKS) break;
  }
  return unique.join('.');
}

export function sanitizeSharedTitle(title) {
  return String(title || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SHARED_TITLE_LEN);
}

export function buildSharedPlanUrl(baseHref, {ids, title = ''} = {}) {
  const token = encodeSharedPlanToken(ids);
  if (!token) return '';
  const url = new URL(baseHref);
  url.hash = '';
  url.searchParams.delete('sp');
  url.searchParams.delete('sn');
  url.searchParams.set('sp', token);
  const cleanTitle = sanitizeSharedTitle(title);
  if (cleanTitle) url.searchParams.set('sn', cleanTitle);
  return url.toString();
}

export function parseSharedPlanInput(rawInput, byId = null) {
  const text = String(rawInput || '').trim();
  if (!text) return null;

  let params = null;
  try {
    if (/^https?:\/\//i.test(text)) {
      params = new URL(text).searchParams;
    } else if (text.includes('?')) {
      params = new URLSearchParams(text.slice(text.indexOf('?') + 1).split('#')[0]);
    } else if (text.includes('sp=')) {
      params = new URLSearchParams(text.replace(/^[?#]/, '').split('#')[0]);
    }
  } catch {
    return null;
  }

  let token = params?.get('sp') || '';
  const title = sanitizeSharedTitle(params?.get('sn') || '');

  // Also allow pasting bare compact token like "m0.m1.3"
  if (!token && /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(text)) {
    token = text;
  }
  if (!token) return null;

  const ids = [];
  const seen = new Set();
  for (const part of token.split('.')) {
    const decoded = decodeWorkId(part);
    if (!decoded || seen.has(decoded)) continue;
    if (byId && !byId[decoded]) continue;
    seen.add(decoded);
    ids.push(decoded);
    if (ids.length >= MAX_SHARED_WORKS) break;
  }

  if (!ids.length) return null;
  return {
    ids,
    title,
    token: encodeSharedPlanToken(ids)
  };
}

// ==================== ZERO-DEPENDENCY QR CODE (ISO/IEC 18004, BYTE MODE, EC LEVEL M) ====================

// Versions 1..14, Error Correction Level M:
// [version, dataCodewords, ecPerBlock, [[blockCount, dataPerBlock], ...], alignmentCoords]
const QR_VERSIONS_M = [
  null,
  [1, 16, 10, [[1, 16]], []],
  [2, 28, 16, [[1, 28]], [6, 18]],
  [3, 44, 26, [[1, 44]], [6, 22]],
  [4, 64, 18, [[2, 32]], [6, 26]],
  [5, 86, 24, [[2, 43]], [6, 30]],
  [6, 108, 16, [[4, 27]], [6, 34]],
  [7, 124, 18, [[4, 31]], [6, 22, 38]],
  [8, 154, 22, [[2, 38], [2, 39]], [6, 24, 42]],
  [9, 182, 22, [[3, 36], [2, 37]], [6, 26, 46]],
  [10, 216, 26, [[4, 43], [1, 44]], [6, 28, 50]],
  [11, 254, 30, [[1, 50], [4, 51]], [6, 30, 54]],
  [12, 290, 22, [[6, 36], [2, 37]], [6, 32, 58]],
  [13, 334, 22, [[8, 37], [1, 38]], [6, 34, 62]],
  [14, 365, 24, [[4, 40], [5, 41]], [6, 26, 46, 66]]
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeRemainder(data, ecCount) {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i += 1) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j += 1) {
        res[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return res;
}

function bchFormatBits(ecLevelBits, maskPattern) {
  const data = (ecLevelBits << 3) | maskPattern;
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function bchVersionBits(version) {
  let rem = version << 12;
  for (let i = 17; i >= 12; i -= 1) {
    if ((rem >> i) & 1) rem ^= 0x1f25 << (i - 12);
  }
  return (version << 12) | rem;
}

function maskCondition(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function penaltyScore(grid, size) {
  let score = 0;
  // Rule 1: adjacent runs >= 5
  for (let r = 0; r < size; r += 1) {
    let runColor = grid[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c += 1) {
      if (grid[r][c] === runColor) {
        runLen += 1;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = grid[r][c];
        runLen = 1;
      }
    }
  }
  for (let c = 0; c < size; c += 1) {
    let runColor = grid[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r += 1) {
      if (grid[r][c] === runColor) {
        runLen += 1;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = grid[r][c];
        runLen = 1;
      }
    }
  }
  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
    }
  }
  // Rule 3: finder-like patterns
  const matchFinder = (arr) => {
    let hits = 0;
    for (let i = 0; i <= arr.length - 11; i += 1) {
      const p1 = arr[i] === 1 && arr[i + 1] === 0 && arr[i + 2] === 1 && arr[i + 3] === 1 && arr[i + 4] === 1
        && arr[i + 5] === 0 && arr[i + 6] === 1 && arr[i + 7] === 0 && arr[i + 8] === 0 && arr[i + 9] === 0 && arr[i + 10] === 0;
      const p2 = arr[i] === 0 && arr[i + 1] === 0 && arr[i + 2] === 0 && arr[i + 3] === 0 && arr[i + 4] === 1
        && arr[i + 5] === 0 && arr[i + 6] === 1 && arr[i + 7] === 1 && arr[i + 8] === 1 && arr[i + 9] === 0 && arr[i + 10] === 1;
      if (p1 || p2) hits += 40;
    }
    return hits;
  };
  for (let r = 0; r < size; r += 1) score += matchFinder(grid[r]);
  const colBuf = new Uint8Array(size);
  for (let c = 0; c < size; c += 1) {
    for (let r = 0; r < size; r += 1) colBuf[r] = grid[r][c];
    score += matchFinder(colBuf);
  }
  // Rule 4: dark ratio balance
  let dark = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) dark += grid[r][c];
  }
  const pct = (dark * 100) / (size * size);
  const k = Math.floor(Math.abs(pct - 50) / 5);
  score += k * 10;
  return score;
}

function drawFormatInfo(grid, size, formatBits) {
  // Top-left horizontal & vertical
  for (let i = 0; i <= 5; i += 1) grid[8][i] = (formatBits >> (14 - i)) & 1;
  grid[8][7] = (formatBits >> 8) & 1;
  grid[8][8] = (formatBits >> 7) & 1;
  grid[7][8] = (formatBits >> 6) & 1;
  for (let i = 9; i < 15; i += 1) grid[14 - i][8] = (formatBits >> (14 - i)) & 1;
  // Bottom-left vertical & top-right horizontal
  for (let i = 0; i < 7; i += 1) grid[size - 1 - i][8] = (formatBits >> (14 - i)) & 1;
  for (let i = 7; i < 15; i += 1) grid[8][size - 15 + i] = (formatBits >> (14 - i)) & 1;
}

export function generateQrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  let spec = null;
  for (let v = 1; v < QR_VERSIONS_M.length; v += 1) {
    const cand = QR_VERSIONS_M[v];
    const countBits = v < 10 ? 8 : 16;
    const totalBitsNeeded = 4 + countBits + bytes.length * 8;
    if (totalBitsNeeded <= cand[1] * 8) {
      spec = cand;
      break;
    }
  }
  if (!spec) return null;

  const [version, dataCodewords, ecPerBlock, blockSpecs, alignCoords] = spec;
  const size = version * 4 + 17;

  // Build data bit stream (Byte mode = 0100)
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);

  const maxDataBits = dataCodewords * 8;
  const termLen = Math.min(4, maxDataBits - bits.length);
  pushBits(0, termLen);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(dataCodewords);
  let byteIdx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j += 1) v = (v << 1) | bits[i + j];
    dataBytes[byteIdx++] = v;
  }
  const padCycle = [0xec, 0x11];
  let padIdx = 0;
  while (byteIdx < dataCodewords) {
    dataBytes[byteIdx++] = padCycle[padIdx++ & 1];
  }

  // Split into RS blocks and interleave
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (const [count, len] of blockSpecs) {
    for (let i = 0; i < count; i += 1) {
      const slice = dataBytes.subarray(offset, offset + len);
      offset += len;
      dataBlocks.push(slice);
      ecBlocks.push(rsComputeRemainder(slice, ecPerBlock));
    }
  }

  const finalCodewords = [];
  const maxBlockLen = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxBlockLen; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) finalCodewords.push(block[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const ec of ecBlocks) finalCodewords.push(ec[i]);
  }

  // Build function-module reservation map
  const base = Array.from({length: size}, () => new Uint8Array(size));
  const reserved = Array.from({length: size}, () => new Uint8Array(size));
  const setFunc = (r, c, val) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    base[r][c] = val ? 1 : 0;
    reserved[r][c] = 1;
  };

  // Finder patterns + separators
  const drawFinder = (top, left) => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const border = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunc(r, c, inside && (border || core));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Alignment patterns
  for (const ar of alignCoords) {
    for (const ac of alignCoords) {
      const overlapsFinder = (ar <= 8 && ac <= 8)
        || (ar <= 8 && ac >= size - 9)
        || (ar >= size - 9 && ac <= 8);
      if (overlapsFinder) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(ar + dr, ac + dc, dist !== 1);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Dark module & reserve format info areas
  setFunc(4 * version + 9, 8, 1);
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      reserved[8][i] = 1;
      reserved[i][8] = 1;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = 1;
    reserved[size - 1 - i][8] = 1;
  }

  // Version info (version >= 7)
  if (version >= 7) {
    const vBits = bchVersionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = (vBits >> i) & 1;
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      setFunc(a, b, bit);
      setFunc(b, a, bit);
    }
  }

  // Place data bits in zigzag order
  const dataGrid = base.map(row => new Uint8Array(row));
  let bitPos = 0;
  const totalPayloadBits = finalCodewords.length * 8;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol -= 1;
    for (let step = 0; step < size; step += 1) {
      const r = upward ? (size - 1 - step) : step;
      for (let dx = 0; dx < 2; dx += 1) {
        const c = rightCol - dx;
        if (reserved[r][c]) continue;
        let bit = 0;
        if (bitPos < totalPayloadBits) {
          bit = (finalCodewords[bitPos >> 3] >> (7 - (bitPos & 7))) & 1;
          bitPos += 1;
        }
        dataGrid[r][c] = bit;
      }
    }
    upward = !upward;
  }

  // Try all 8 masks and choose lowest penalty
  let bestGrid = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const cand = dataGrid.map(row => new Uint8Array(row));
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (!reserved[r][c] && maskCondition(mask, r, c)) {
          cand[r][c] ^= 1;
        }
      }
    }
    // Level M = 0b00
    drawFormatInfo(cand, size, bchFormatBits(0b00, mask));
    const s = penaltyScore(cand, size);
    if (s < bestScore) {
      bestScore = s;
      bestGrid = cand;
    }
  }

  return {version, size, modules: bestGrid};
}

export function renderQrSvg(text, {margin = 3, label = 'QR Code'} = {}) {
  const qr = generateQrMatrix(text);
  if (!qr) return '';
  const total = qr.size + margin * 2;
  const parts = [];
  for (let r = 0; r < qr.size; r += 1) {
    for (let c = 0; c < qr.size; c += 1) {
      if (qr.modules[r][c]) {
        parts.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }
  const safeLabel = String(label).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  return `<svg class="share-qr-svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="${safeLabel}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff" rx="2"/><path d="${parts.join('')}" fill="#172024"/></svg>`;
}
