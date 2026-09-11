/**
 * aho-corasick — 패턴을 더 넣어도 글은 한 번만 읽는다.
 *
 * 손잡이는 **패턴 개수** 하나다. 1 에서 5 로 밀어도 읽은 글자 수는 21 에서
 * 꿈쩍하지 않고, 그 옆에서 "따로 훑으면" 이 32 → 135 로 는다. 움직이지 않는
 * 수가 이 화면의 주장이고, 그래서 reactive 다 — 독자가 미는 것이 곧 다음 판이다.
 *
 * ── 셈 (1차 데이터는 패턴 목록과 글뿐이다. 나무·실패 링크·찾은 자리는 여기서 센다)
 *
 *   트라이를 `노드 × 알파벳` 2차원 배열 하나로 편다: `next[node * alpha + c]`.
 *   맵을 쓰지 않는 까닭은 irs.ts 와 같은 셈을 하기 위해서다 (IR 에 맵이 없다).
 *   편 덕에 실패 링크가 **배열 색인**으로 드러난다 — `fail[v]` 는 마디 번호다.
 *
 *   알파벳은 글과 패턴에 쓰인 글자만 모아 좁게 잡는다. 넓게 잡으면 배열이
 *   쓸데없이 커지고 코드 패널이 빈 칸 셈을 보이게 된다.
 *
 * ── 식별자
 *   index:<n>   글의 n 번째 자리
 *   node:<id>   트라이의 마디 (뿌리는 0)
 *
 * ── 이벤트 (표준은 `done` 뿐. 나머지는 이 facet 고유 — C2)
 *   setup         { patternCount, patterns, text, separate, nodeCount }
 *   trie-built    { nodes: WireNode[] }
 *       WireNode = { id, parent, ch, depth, ends: string | null }
 *   fails-linked  { links: WireLink[] }
 *       WireLink = { from, to, word, suffix }  — 뿌리를 가리키는 것은 빼고 보낸다
 *   read          { index, char, from, to, word, slides: number[] }  target index:<n>
 *       slides 는 이 글자에서 미끄러져 지난 마디들. 비어 있으면 그냥 내려갔다.
 *       word 는 이 걸음을 마친 자리의 마디가 나타내는 글자열 (뿌리면 빈 문자열).
 *       문안이 아니라 자료다 — projector 가 그것으로 캡션을 가른다.
 *   match         { nodeId, hits: WireHit[] }                  target node:<id>
 *       WireHit = { pattern, start, end }  — 양끝을 포함하는 자리
 *   done          { charsRead, separate, matches, nodeCount }
 *   phase         { phase }                                    silent: true
 *
 * ── phase 어휘 (irs.ts 와 집합이 완전히 일치한다 — C3)
 *   'extend' | 'link' | 'read' | 'slide' | 'hit'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *   chars-read · separate-reads · match-count · node-count
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 손잡이가 줄 수 있는 값. facet.ts 의 segmented-slider 와 같아야 한다. */
export const AHO_PATTERN_COUNT_CHOICES: readonly number[] = [1, 2, 3, 4, 5];

/** 뿌리의 마디 번호. 편 배열이라 이름이 아니라 색인이다. */
const ROOT = 0;

/** 길이 없다는 표시. IR 도 같은 값을 쓴다. */
const NONE = -1;

export type AhoCorasickData = {
  type: string;
  /** 한 나무에 포갤 패턴들. 앞에서부터 손잡이가 정한 개수만큼 쓴다. */
  patterns: string[];
  /** 한 번만 읽을 글. */
  text: string;
  /** 이번 판에 쓸 패턴 개수. 손잡이가 민다. */
  patternCount: number;
  /** 한 걸음의 길이 (ms). */
  stepMs: number;
};

export type AhoTrie = {
  /** 글과 패턴에 쓰인 글자만 모은 것. 열의 차례가 곧 글자 번호다. */
  alphabet: string;
  /** 노드 × 알파벳을 편 배열. 값은 마디 번호, 길이 없으면 -1. */
  next: number[];
  /** 마디마다의 실패 링크. 뿌리는 0. */
  fail: number[];
  /** 그 마디에서 끝나는 패턴의 번호. 없으면 -1. */
  ends: number[];
  /** 그린 나무의 부모·글자·깊이. 셈이 아니라 그림을 위한 것이다. */
  parent: number[];
  ch: string[];
  depth: number[];
  nodeCount: number;
};

export type AhoHit = { pattern: string; patternIndex: number; start: number; end: number };

export type AhoStep = {
  index: number;
  char: string;
  from: number;
  to: number;
  /** 미끄러져 지난 마디들. 비어 있으면 곧장 내려갔다. */
  slides: number[];
  hits: AhoHit[];
};

/** 글과 패턴에 쓰인 글자만 모아 좁은 알파벳을 만든다. */
export function ahoAlphabet(text: string, patterns: string[]): string {
  return [...new Set([...text, ...patterns.join('')])].sort().join('');
}

/**
 * 트라이를 세우고 실패 링크를 잇는다.
 *
 * 마디 번호는 **넣는 차례**로 붙는다 — 패턴 차례로, 글자 차례로, 없을 때만 새로.
 * irs.ts 의 `build_trie` 가 같은 차례로 붙이므로 두 쪽의 번호가 같고, 그래서
 * 실패 링크와 찾은 자리를 곧바로 견줄 수 있다.
 *
 * 실패 링크는 **너비 우선**으로 잇는다. 얕은 마디의 링크가 먼저 정해져야 깊은
 * 마디가 그것을 타고 올라갈 수 있기 때문이다. 큐는 배열 하나와 머리·꼬리 색인
 * 둘로 편다 — IR 에 큐가 없어서인데, 펴 놓고 보면 자료구조가 따로 필요했던 것이
 * 아니라 **차례가 필요했을 뿐**임이 드러난다.
 */
export function buildAhoTrie(patterns: string[], alphabet: string): AhoTrie {
  const alpha = alphabet.length;
  const code = new Map<string, number>([...alphabet].map((c, i) => [c, i]));
  const cap = patterns.reduce((sum, p) => sum + p.length, 0) + 1;

  const next = new Array<number>(cap * alpha).fill(NONE);
  const ends = new Array<number>(cap).fill(NONE);
  const parent = new Array<number>(cap).fill(NONE);
  const depth = new Array<number>(cap).fill(0);
  const ch = new Array<string>(cap).fill('');
  let nodeCount = 1;

  patterns.forEach((pattern, patternIndex) => {
    let cur = ROOT;
    for (const letter of pattern) {
      const c = code.get(letter);
      if (c === undefined) continue;
      const nxt = next[cur * alpha + c] ?? NONE;
      if (nxt === NONE) {
        next[cur * alpha + c] = nodeCount;
        parent[nodeCount] = cur;
        ch[nodeCount] = letter;
        depth[nodeCount] = (depth[cur] ?? 0) + 1;
        cur = nodeCount;
        nodeCount += 1;
      } else {
        cur = nxt;
      }
    }
    ends[cur] = patternIndex;
  });

  const fail = new Array<number>(cap).fill(ROOT);
  const order = new Array<number>(cap).fill(ROOT);
  let head = 0;
  let tail = 0;
  for (let c = 0; c < alpha; c += 1) {
    const v = next[ROOT * alpha + c] ?? NONE;
    if (v === NONE) continue;
    fail[v] = ROOT;
    order[tail] = v;
    tail += 1;
  }
  while (head < tail) {
    const u = order[head] ?? ROOT;
    head += 1;
    for (let c = 0; c < alpha; c += 1) {
      const v = next[u * alpha + c] ?? NONE;
      if (v === NONE) continue;
      let f = fail[u] ?? ROOT;
      while (f !== ROOT && (next[f * alpha + c] ?? NONE) === NONE) f = fail[f] ?? ROOT;
      const w = next[f * alpha + c] ?? NONE;
      fail[v] = w === NONE || w === v ? ROOT : w;
      order[tail] = v;
      tail += 1;
    }
  }

  return {
    alphabet,
    next: next.slice(0, nodeCount * alpha),
    fail: fail.slice(0, nodeCount),
    ends: ends.slice(0, nodeCount),
    parent: parent.slice(0, nodeCount),
    ch: ch.slice(0, nodeCount),
    depth: depth.slice(0, nodeCount),
    nodeCount,
  };
}

/**
 * 글을 왼쪽부터 한 번만 읽는다.
 *
 * 미끄러짐은 **읽는 자리를 옮기지 않는다** — 같은 글자를 다른 마디에서 다시 볼
 * 뿐이라 읽은 글자 수는 언제나 글의 길이다. 그것이 손잡이를 밀어도 움직이지
 * 않는 그 수다.
 */
export function ahoScan(trie: AhoTrie, patterns: string[], text: string): AhoStep[] {
  const alpha = trie.alphabet.length;
  const code = new Map<string, number>([...trie.alphabet].map((c, i) => [c, i]));
  const steps: AhoStep[] = [];
  let cur = ROOT;

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    const c = code.get(char);
    const from = cur;
    const slides: number[] = [];
    if (c !== undefined) {
      while (cur !== ROOT && (trie.next[cur * alpha + c] ?? NONE) === NONE) {
        cur = trie.fail[cur] ?? ROOT;
        slides.push(cur);
      }
      const nxt = trie.next[cur * alpha + c] ?? NONE;
      cur = nxt === NONE ? ROOT : nxt;
    } else {
      cur = ROOT;
    }

    const hits: AhoHit[] = [];
    let u = cur;
    while (u !== ROOT) {
      const patternIndex = trie.ends[u] ?? NONE;
      if (patternIndex !== NONE) {
        const pattern = patterns[patternIndex] ?? '';
        hits.push({ pattern, patternIndex, start: index - pattern.length + 1, end: index });
      }
      u = trie.fail[u] ?? ROOT;
    }

    steps.push({ index, char, from, to: cur, slides, hits });
  }

  return steps;
}

/**
 * 따로 훑었다면 글자를 몇 번 보았을까.
 *
 * 패턴마다 글을 처음부터 훑으며 자리마다 견준다. 어긋나면 한 칸 밀고 다시
 * 보므로 **같은 글자를 여러 번 읽게 된다** — 그 되읽기까지 세는 것이 한 번
 * 훑기와의 정직한 대비다. 패턴이 늘면 이 수만 는다.
 */
export function separateReadCount(patterns: string[], text: string): number {
  let reads = 0;
  for (const pattern of patterns) {
    for (let s = 0; s + pattern.length <= text.length; s += 1) {
      for (let j = 0; j < pattern.length; j += 1) {
        reads += 1;
        if (text.charAt(s + j) !== pattern.charAt(j)) break;
      }
    }
  }
  return reads;
}

function pick(value: number, choices: readonly number[], fallback: number): number {
  return choices.includes(value) ? value : fallback;
}

/** 손잡이가 보낸 값을 데이터에 반영한다. 모르는 값이면 그대로 둔다. */
function applyInput(data: AhoCorasickData, input: ReactiveInputEvent): void {
  const p = input.payload as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null) return;
  const raw = p.value;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return;
  if (input.type === 'patterns') {
    data.patternCount = pick(value, AHO_PATTERN_COUNT_CHOICES, data.patternCount);
  }
}

export const ahoCorasickAlgorithm = async (ctx: FacetContext<AhoCorasickData>): Promise<void> => {
  const rc = ctx as ReactiveContext<AhoCorasickData>;

  /**
   * 메트릭을 절대값으로 맞춘다.
   *
   * `ctx.metric` 은 누적이고 메커니즘은 되돌릴 때만 비운다. 손잡이를 밀어 다시
   * 짓는 것은 되돌리기가 아니므로, 그냥 더하면 두 번째 판부터 수가 불어난다.
   * 지난번에 알린 값과의 차만 보내 화면이 늘 이번 판의 수를 보이게 한다.
   */
  const reported = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = reported.get(name) ?? 0;
    if (value === prev) return;
    ctx.metric(name, value - prev);
    reported.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const beat = (ratio: number): Promise<boolean> =>
    rc.sleep(Math.max(40, ctx.data.stepMs * ratio));

  /** 한 판. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  const runOnce = async (): Promise<boolean> => {
    const data = ctx.data;
    const all = [...data.patterns];
    const count = pick(data.patternCount, AHO_PATTERN_COUNT_CHOICES, 1);
    const patterns = all.slice(0, count);
    const text = data.text;

    // 알파벳은 **패턴 전부**에서 뽑는다. 손잡이를 밀 때마다 열이 늘었다 줄었다
    // 하면 같은 글자가 판마다 다른 칸을 뜻하게 되어 코드 패널이 흔들린다.
    const alphabet = ahoAlphabet(text, all);
    const trie = buildAhoTrie(patterns, alphabet);
    const steps = ahoScan(trie, patterns, text);
    const separate = separateReadCount(patterns, text);

    let charsRead = 0;
    let matches = 0;
    setMetric('chars-read', 0);
    setMetric('match-count', 0);
    setMetric('separate-reads', separate);
    setMetric('node-count', trie.nodeCount);

    await ctx.emit({
      type: 'setup',
      payload: {
        patternCount: count,
        patterns: all,
        text,
        separate,
        nodeCount: trie.nodeCount,
      },
    });
    if (!(await beat(1))) return false;

    // 나무를 세운다. 같은 앞머리가 한 마디로 포개지는 것이 여기서 보인다.
    await phase('extend');
    await ctx.emit({
      type: 'trie-built',
      payload: {
        nodes: Array.from({ length: trie.nodeCount }, (_, id) => ({
          id,
          parent: trie.parent[id] ?? NONE,
          ch: trie.ch[id] ?? '',
          depth: trie.depth[id] ?? 0,
          ends: (trie.ends[id] ?? NONE) === NONE ? null : (patterns[trie.ends[id] ?? 0] ?? null),
        })),
      },
    });
    if (!(await beat(1.2))) return false;

    // 장치를 단다. 뿌리를 가리키는 링크는 보내지 않는다 — "어긋나면 처음으로"
    // 라는 뜻이라 이 화면이 말하려는 것과 반대이고, 그리면 나무가 화살표로 덮인다.
    await phase('link');
    const links: Array<{ from: number; to: number; word: string; suffix: string }> = [];
    const wordOf = (id: number): string => {
      let out = '';
      let cur = id;
      while (cur !== ROOT) {
        out = (trie.ch[cur] ?? '') + out;
        cur = trie.parent[cur] ?? ROOT;
      }
      return out;
    };
    for (let v = 1; v < trie.nodeCount; v += 1) {
      const to = trie.fail[v] ?? ROOT;
      if (to === ROOT) continue;
      links.push({ from: v, to, word: wordOf(v), suffix: wordOf(to) });
    }
    await ctx.emit({ type: 'fails-linked', payload: { links } });
    if (!(await beat(1.2))) return false;

    // 한 번 훑기. 미끄러짐이 있어도 읽는 자리는 왼쪽으로 가지 않는다.
    for (const step of steps) {
      // 문(`beat`)이 바디 끝에 있어 취소는 거기서도 걸리지만, 루프 진입부의
      // 검사를 따로 둔다 (C8 의 MUST). 한 걸음 안에서 phase·emit 이 여럿 나가므로
      // 취소된 뒤 그것들을 훑고 나서 멎는 것보다 여기서 끊는 편이 곧다.
      if (ctx.cancelled) return false;
      if (step.slides.length > 0) await phase('slide');
      else await phase('read');
      charsRead += 1;
      setMetric('chars-read', charsRead);
      await ctx.emit({
        type: 'read',
        target: `index:${step.index}`,
        payload: {
          index: step.index,
          char: step.char,
          from: step.from,
          to: step.to,
          // 지금 선 마디가 나타내는 글자열. 문안이 아니라 자료다 — 무엇이라
          // 말할지는 projector 가 정한다 (C10).
          word: wordOf(step.to),
          slides: [...step.slides],
        },
      });
      if (!(await beat(1))) return false;

      if (step.hits.length === 0) continue;
      matches += step.hits.length;
      setMetric('match-count', matches);
      await phase('hit');
      await ctx.emit({
        type: 'match',
        target: `node:${step.to}`,
        payload: {
          nodeId: step.to,
          hits: step.hits.map((h) => ({ pattern: h.pattern, start: h.start, end: h.end })),
        },
      });
      if (!(await beat(0.8))) return false;
    }

    await ctx.emit({
      type: 'done',
      payload: { charsRead, separate, matches, nodeCount: trie.nodeCount },
    });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await runOnce())) return;
      // 손잡이를 밀 때까지 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와
      // 위젯만 남는다 (메커니즘의 입력 대기 상태).
      const input = await rc.waitForInput();
      if (ctx.cancelled) return;
      applyInput(ctx.data, input);
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
