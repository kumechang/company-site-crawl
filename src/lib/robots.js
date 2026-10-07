// 最小限の robots.txt パーサ（User-agent: * のグループ、Allow/Disallow、* と $ に対応）

export function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      lastWasAgent = false;
      if (val) cur.rules.push({ allow: key === 'allow', pattern: val });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function patternToRegex(p) {
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

/** path は pathname+search。最長一致のルールが勝つ（同長なら Allow 優先） */
export function isAllowed(groups, path, agent = '*') {
  const a = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((x) => x !== '*' && a.includes(x)));
  const use = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const g of use) {
    for (const r of g.rules) {
      if (patternToRegex(r.pattern).test(path)) {
        if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
      }
    }
  }
  return best ? best.allow : true;
}
