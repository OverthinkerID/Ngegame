export interface VdfObject {
  [key: string]: string | VdfObject;
}

/**
 * Parses Valve KeyValues (.vdf / .acf) text into a nested object.
 * Supports quoted tokens, nested braces, escaped quotes, and // comments.
 */
export function parseVdf(content: string): VdfObject {
  const tokens: string[] = [];
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i];
    if (ch === undefined) break;

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i += 1;
      continue;
    }

    // Skip // comments
    if (ch === '/' && content[i + 1] === '/') {
      while (i < len && content[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    if (ch === '{' || ch === '}') {
      tokens.push(ch);
      i += 1;
      continue;
    }

    if (ch === '"') {
      i += 1;
      let str = '';
      while (i < len) {
        const cur = content[i];
        if (cur === '\\' && i + 1 < len) {
          const next = content[i + 1];
          str += next ?? '';
          i += 2;
          continue;
        }
        if (cur === '"') {
          i += 1;
          break;
        }
        str += cur ?? '';
        i += 1;
      }
      tokens.push(str);
      continue;
    }

    // Unquoted token
    let word = '';
    while (i < len) {
      const cur = content[i];
      if (
        cur === undefined ||
        cur === ' ' ||
        cur === '\t' ||
        cur === '\r' ||
        cur === '\n' ||
        cur === '{' ||
        cur === '}'
      ) {
        break;
      }
      word += cur;
      i += 1;
    }
    if (word.length > 0) {
      tokens.push(word);
    }
  }

  let cursor = 0;

  function parseBlock(): VdfObject {
    const obj: VdfObject = {};
    while (cursor < tokens.length) {
      const key = tokens[cursor];
      if (key === undefined) break;
      if (key === '}') {
        cursor += 1;
        break;
      }
      cursor += 1;

      const next = tokens[cursor];
      if (next === '{') {
        cursor += 1;
        obj[key] = parseBlock();
      } else if (next !== undefined && next !== '}') {
        obj[key] = next;
        cursor += 1;
      }
    }
    return obj;
  }

  return parseBlock();
}
