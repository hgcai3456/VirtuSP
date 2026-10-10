const zlib = require('zlib');

const MAX_STREAM = 8e6;
const MAX_INFLATED = 2e6;
const MAX_TEXT = 20000;

function unescapePdf(raw) {
  return String(raw || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function cleanLine(value) {
  return unescapePdf(value)
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function stringsFrom(content) {
  const found = [];
  const text = String(content || '');
  const shown = /\(((?:\\.|[^\\)]){1,500})\)\s*(?:Tj|'|")/g;
  let match = shown.exec(text);
  while (match) {
    const line = cleanLine(match[1]);
    if (line.length >= 2) {
      found.push(line);
    }
    match = shown.exec(text);
  }

  const arrays = /\[((?:[^\]\\]|\\.){1,4000})\]\s*TJ/g;
  match = arrays.exec(text);
  while (match) {
    const parts = [];
    const piece = /\(((?:\\.|[^\\)]){0,500})\)/g;
    let part = piece.exec(match[1]);
    while (part) {
      parts.push(unescapePdf(part[1]));
      part = piece.exec(match[1]);
    }
    const line = cleanLine(parts.join(''));
    if (line.length >= 2) {
      found.push(line);
    }
    match = arrays.exec(text);
  }

  return found;
}

function streams(buffer) {
  const src = buffer.toString('latin1');
  const out = [];
  let index = 0;

  while (index < src.length && out.length < 40) {
    const streamAt = src.indexOf('stream', index);
    if (streamAt < 0) {
      break;
    }

    const dictStart = src.lastIndexOf('<<', streamAt);
    const dict = dictStart >= 0 ? src.slice(dictStart, streamAt) : '';
    let start = streamAt + 6;
    if (src.charCodeAt(start) === 13) {
      start += 1;
    }
    if (src.charCodeAt(start) === 10) {
      start += 1;
    }

    const end = src.indexOf('endstream', start);
    if (end < 0) {
      break;
    }

    let raw = Buffer.from(src.slice(start, end), 'latin1');
    if (raw.length && raw[raw.length - 1] === 10) {
      raw = raw.subarray(0, raw.length - (raw.length > 1 && raw[raw.length - 2] === 13 ? 2 : 1));
    }
    if (raw.length && raw.length <= MAX_STREAM && /FlateDecode/.test(dict)) {
      try {
        const inflated = zlib.inflateSync(raw);
        if (inflated.length <= MAX_INFLATED) {
          out.push(inflated.toString('latin1'));
        }
      } catch (err) {
        try {
          const inflated = zlib.inflateRawSync(raw);
          if (inflated.length <= MAX_INFLATED) {
            out.push(inflated.toString('latin1'));
          }
        } catch (err2) {
          out.push(raw.toString('latin1'));
        }
      }
    } else if (raw.length && raw.length <= MAX_STREAM) {
      out.push(raw.toString('latin1'));
    }

    index = end + 9;
  }

  return out;
}

function extractPdfText(buffer) {
  if (!buffer || buffer.length < 8) {
    return '';
  }

  const lines = [];
  streams(buffer).forEach((part) => {
    stringsFrom(part).forEach((line) => lines.push(line));
  });
  if (!lines.length) {
    stringsFrom(buffer.toString('latin1')).forEach((line) => lines.push(line));
  }

  return [...new Set(lines)].join('\n').trim().slice(0, MAX_TEXT);
}

module.exports = {
  extractPdfText,
  stringsFrom
};
