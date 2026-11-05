// Small, safe Markdown renderer for goal contents. Everything is HTML-escaped first;
// only the syntax below turns into markup. Checklist items carry data-line so a click can
// toggle the matching line in the source.
// shortcut: no tables, nested lists or HTML passthrough; swap in a full parser if goals need them.

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

const CHECK_RE = /^\s*[-*] \[( |x|X)\]\s?(.*)$/;

export function renderMarkdown(md = '') {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol' | 'check'
  let para = [];

  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(list === 'ol' ? '</ol>' : '</ul>'); list = null; } };
  const openList = kind => {
    if (list === kind) return;
    closeList();
    out.push(kind === 'ol' ? '<ol>' : kind === 'check' ? '<ul class="checklist">' : '<ul>');
    list = kind;
  };

  lines.forEach((line, i) => {
    let m;
    if ((m = line.match(CHECK_RE))) {
      flushPara(); openList('check');
      const done = m[1] !== ' ';
      out.push(`<li class="check${done ? ' done' : ''}"><label><input type="checkbox" data-line="${i}"${done ? ' checked' : ''}> <span>${inline(m[2])}</span></label></li>`);
    } else if ((m = line.match(/^\s*[-*] (.*)$/))) {
      flushPara(); openList('ul'); out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)] (.*)$/))) {
      flushPara(); openList('ol'); out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(); closeList();
      const level = Math.min(m[1].length + 2, 6);
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushPara(); closeList(); out.push('<hr>');
    } else if (!line.trim()) {
      flushPara(); closeList();
    } else {
      closeList(); para.push(line);
    }
  });
  flushPara(); closeList();
  return out.join('\n');
}

export function toggleCheck(md, lineIndex) {
  const lines = md.split('\n');
  const line = lines[lineIndex];
  if (line === undefined || !CHECK_RE.test(line)) return md;
  lines[lineIndex] = line.replace(/\[( |x|X)\]/, m => (m === '[ ]' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

export function progress(md = '') {
  const done = (md.match(/^\s*[-*] \[[xX]\]/gm) || []).length;
  const open = (md.match(/^\s*[-*] \[ \]/gm) || []).length;
  return { done, total: done + open };
}

/** First plain line, for compact idea cards. */
export function summary(md = '', max = 90) {
  const line = md.split('\n').map(l => l.replace(/^[#>\-*\d.)\s[\]xX]+/, '').trim()).find(Boolean) || '';
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

export { esc };
