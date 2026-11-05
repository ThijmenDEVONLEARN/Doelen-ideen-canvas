// "Wanneer" is a vague period instead of an exact date: "voorjaar 2027", "medio 2028", "Q2 2027".
// Periods are stored as plain text and converted to a month range { from, to } for the timeline,
// where a month is counted as year * 12 + monthIndex.

export const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTH_ALIASES = {
  januari: 0, februari: 1, maart: 2, mar: 2, april: 3, juni: 5, juli: 6, augustus: 7, sept: 8,
  september: 8, oktober: 9, oct: 9, november: 10, december: 11,
};
const SEASONS = { voorjaar: [2, 4], lente: [2, 4], zomer: [5, 7], najaar: [8, 10], herfst: [8, 10], winter: [11, 13] };
const PARTS = { begin: [0, 3], medio: [4, 7], midden: [4, 7], eind: [8, 11] };

export const MODES = [
  { id: 'maand', label: 'Maand', parts: MONTHS },
  { id: 'kwartaal', label: 'Kwartaal', parts: ['Q1', 'Q2', 'Q3', 'Q4'] },
  { id: 'seizoen', label: 'Seizoen', parts: ['voorjaar', 'zomer', 'najaar', 'winter'] },
  { id: 'deel', label: 'Begin / medio / eind', parts: ['begin', 'medio', 'eind'] },
  { id: 'jaar', label: 'Jaar', parts: [] },
  { id: 'geen', label: 'Geen', parts: [] },
];

function monthIndex(word) {
  const i = MONTHS.indexOf(word);
  return i >= 0 ? i : MONTH_ALIASES[word];
}

/** @returns {{ mode: string, part: string, year: number, from: number, to: number } | null} */
export function parsePeriod(text) {
  const s = String(text || '').trim().toLowerCase().replace(/^(ergens in|ergens|rond|in)\s+/, '').replace(/\./g, '');
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/))) {
    const y = +m[1], mo = +m[2] - 1;
    if (mo < 0 || mo > 11) return null;
    return { mode: 'maand', part: MONTHS[mo], year: y, from: y * 12 + mo, to: y * 12 + mo };
  }
  if ((m = s.match(/^(\d{4})$/))) {
    const y = +m[1];
    return { mode: 'jaar', part: '', year: y, from: y * 12, to: y * 12 + 11 };
  }
  if (!(m = s.match(/^([a-z]+|q[1-4])\s+'?(\d{2}|\d{4})$/))) return null;
  const word = m[1];
  const y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
  if (/^q[1-4]$/.test(word)) {
    const q = +word[1] - 1;
    return { mode: 'kwartaal', part: word.toUpperCase(), year: y, from: y * 12 + q * 3, to: y * 12 + q * 3 + 2 };
  }
  if (PARTS[word]) {
    const [a, b] = PARTS[word];
    return { mode: 'deel', part: word === 'midden' ? 'medio' : word, year: y, from: y * 12 + a, to: y * 12 + b };
  }
  if (SEASONS[word]) {
    const [a, b] = SEASONS[word];
    const part = { lente: 'voorjaar', herfst: 'najaar' }[word] || word;
    return { mode: 'seizoen', part, year: y, from: y * 12 + a, to: y * 12 + b };
  }
  const mo = monthIndex(word);
  if (mo === undefined) return null;
  return { mode: 'maand', part: MONTHS[mo], year: y, from: y * 12 + mo, to: y * 12 + mo };
}

export function formatPeriod(mode, part, year) {
  if (mode === 'geen' || !year) return '';
  if (mode === 'jaar') return String(year);
  return `${part} ${year}`;
}

/** Short label for the timeline: "voorjaar '27". */
export function shortPeriod(text) {
  const p = parsePeriod(text);
  if (!p) return text || '';
  const yy = "'" + String(p.year).slice(2);
  return p.mode === 'jaar' ? `ergens in ${p.year}` : `${p.part} ${yy}`;
}
