// Minimal frontmatter for item files: flat "key: value" pairs and "key: |" blocks.
// shortcut: no nested YAML, lists or comments; upgrade to a YAML parser if items ever need them.

export function parse(text) {
  const src = text.replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n')) return { data: {}, body: src };
  const end = src.indexOf('\n---', 4);
  if (end === -1) return { data: {}, body: src };

  const data = {};
  const lines = src.slice(4, end).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (raw.trim() === '|') {
      const block = [];
      while (i + 1 < lines.length && (lines[i + 1].startsWith('  ') || lines[i + 1] === '')) {
        block.push(lines[++i].slice(2));
      }
      data[key] = block.join('\n').replace(/\n+$/, '');
    } else {
      data[key] = unquote(raw.trim());
    }
  }
  const body = src.slice(end + 4).replace(/^\n/, '');
  return { data, body };
}

export function stringify(data, body = '') {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    const str = String(value);
    if (str.includes('\n')) {
      lines.push(`${key}: |`, ...str.split('\n').map(l => '  ' + l));
    } else {
      lines.push(`${key}: ${needsQuotes(str) ? JSON.stringify(str) : str}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n') + body.replace(/^\n+/, '');
}

function unquote(v) {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

function needsQuotes(s) {
  return /^[\s"'|>]|[:#]\s|\s$/.test(s) || s === '';
}
