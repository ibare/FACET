/**
 * fail-link — 어긋났을 때 어디로 돌아가는가.
 *
 * 패턴 넷을 글자별로 이어 붙인 나무를 세우고, 텍스트를 훑다가 이어갈 길이 없을 때
 * 뿌리가 아니라 "이미 읽은 뒷부분" 이 놓인 마디로 미끄러지는 것을 보인다.
 *
 * 선언(`initialData`)에 있는 것은 패턴 목록과 텍스트와 걸음 간격뿐이다.
 * **나무 모양 · 실패 링크 · 훑기 자취는 전부 여기서 셈한다.**
 *
 * ── 이벤트 (`done` 만 표준, 나머지는 facet 고유 확장)
 *
 * | type             | silent | payload                                                                               |
 * |------------------|--------|---------------------------------------------------------------------------------------|
 * | tree-ready       | false  | `{ nodes: { id, parent, ch, word, depth, terminal }[] }`                                 |
 * | rewind           | false  | 없음                                                                                     |
 * | pattern-inserted | false  | `{ pattern: string; nodeIds: number[] }`                                                 |
 * | fail-linked      | false  | `{ from: number; to: number; word: string; suffix: string }`                              |
 * | scan-advanced    | false  | `{ index: number; ch: string; from: number; to: number; word: string; matched: string \| null }` |
 * | fail-slid        | false  | `{ index: number; ch: string; from: number; to: number; word: string; suffix: string }`   |
 * | naive-restart    | false  | `{ index: number; from: number; ch: string; missed: string }`                             |
 * | done             | false  | `{ rescued: string }`                                                                    |
 *
 * - `tree-ready` 는 그림이 자리를 미리 잡게 하는 이벤트다. **silent 가 아니다** —
 *   stage 가 이 이벤트에서 마디와 간선을 만들고 뿌리를 세우므로 시각 변화가
 *   있는 걸음이다 (C2). 한때 silent 로 적었다가 주석과 실제가 어긋나 고쳤다.
 * - `rewind` 는 자동 재생이 끝난 뒤 `advance` 를 처음 받아 처음으로 되돌아갈 때 발신한다.
 * - `word` 는 그 마디가 나타내는 글자열, `suffix` 는 미끄러져 닿는 마디의 글자열.
 * - `matched` 는 그 마디에서 끝나는 패턴. 없으면 `null`.
 * - `missed` · `rescued` 는 쉼표로 이은 패턴 이름이다.
 *
 * ── 범위
 *
 * 실패 링크가 무엇이고 왜 그리로 가는지까지다. 한 자리에서 여럿을 동시에 거두는
 * 이득(`she` 를 찾는 순간 그 안의 `he` 까지 함께 거두는 것)은 이 조각의 일이 아니라
 * 다루지 않는다. 그 전제는 `description.ts` 가 밝힌다 (S-piece).
 *
 * 메트릭은 부르지 않는다 — 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FailLinkData = {
  type: string;
  /** 나무에 이을 패턴들. 이 목록이 나무 모양을 정한다. */
  patterns: string[];
  /** 훑을 텍스트. */
  text: string;
  /** 걸음 사이의 정지 시간(ms). 애니메이션이 끝난 뒤부터 잰다 (S-piece). */
  stepMs: number;
};

type TrieNode = {
  id: number;
  /** 뿌리는 -1. */
  parent: number;
  /** 부모에서 이 마디로 들어오는 글자. 뿌리는 빈 문자열. */
  ch: string;
  /** 이 마디가 나타내는 글자열. */
  word: string;
  depth: number;
  /** 이 마디에서 끝나는 패턴. 없으면 null. */
  terminal: string | null;
  children: Map<string, number>;
};

type Trie = {
  nodes: TrieNode[];
  /** 마디마다의 실패 링크. 가리킬 곳이 없으면 뿌리(0). */
  fail: number[];
  /** 패턴별로, 그 패턴을 넣으며 새로 생긴 마디들. 자라는 차례 그대로. */
  grown: Map<string, number[]>;
};

/** 화면으로 넘어가는 마디 — `children` 을 뺀 구조만. */
type WireNode = {
  id: number;
  parent: number;
  ch: string;
  word: string;
  depth: number;
  terminal: string | null;
};

function buildTrie(patterns: string[]): Trie {
  const nodes: TrieNode[] = [
    { id: 0, parent: -1, ch: '', word: '', depth: 0, terminal: null, children: new Map() },
  ];
  const grown = new Map<string, number[]>();

  for (const pattern of patterns) {
    const added: number[] = [];
    let cur = 0;
    for (const ch of pattern) {
      const next = nodes[cur].children.get(ch);
      if (next === undefined) {
        const node: TrieNode = {
          id: nodes.length,
          parent: cur,
          ch,
          word: nodes[cur].word + ch,
          depth: nodes[cur].depth + 1,
          terminal: null,
          children: new Map(),
        };
        nodes.push(node);
        nodes[cur].children.set(ch, node.id);
        added.push(node.id);
        cur = node.id;
      } else {
        cur = next;
      }
    }
    nodes[cur].terminal = pattern;
    grown.set(pattern, added);
  }

  // 실패 링크는 정의 그대로 셈한다 — 자기 자신을 뺀 접미사 가운데 나무에 있는
  // 가장 긴 것. 앞글자부터 하나씩 떼어 가므로 처음 맞는 것이 곧 가장 긴 것이다.
  const byWord = new Map<string, number>();
  for (const node of nodes) byWord.set(node.word, node.id);
  const fail = nodes.map((node) => {
    for (let i = 1; i < node.word.length; i += 1) {
      const found = byWord.get(node.word.slice(i));
      if (found !== undefined) return found;
    }
    return 0;
  });

  return { nodes, fail, grown };
}

/**
 * 텍스트를 한 번 훑어 찾은 패턴들.
 *
 * `slide` 가 참이면 어긋날 때 실패 링크로 미끄러지고, 거짓이면 처음(뿌리)으로
 * 돌아간다. 둘의 차이가 이 조각이 말하려는 것이므로 한 함수에 두 길을 담는다.
 * 뿌리로 돌아가는 쪽도 그 글자를 뿌리에서 한 번 더 본다 — 더 너그러운 쪽으로
 * 재야 대비가 허수아비가 되지 않는다.
 */
function foundBy(trie: Trie, text: string, slide: boolean): string[] {
  const out: string[] = [];
  let cur = 0;
  for (const ch of text) {
    if (slide) {
      while (cur !== 0 && !trie.nodes[cur].children.has(ch)) cur = trie.fail[cur];
    } else if (!trie.nodes[cur].children.has(ch)) {
      cur = 0;
    }
    const next = trie.nodes[cur].children.get(ch);
    cur = next === undefined ? 0 : next;
    const hit = trie.nodes[cur].terminal;
    if (hit !== null) out.push(hit);
  }
  return out;
}

export const failLinkAlgorithm = async (ctx: FacetContext<FailLinkData>): Promise<void> => {
  const rc = ctx as ReactiveContext<FailLinkData>;
  const { patterns, text, stepMs } = ctx.data;

  const trie = buildTrie(patterns);
  const wire: WireNode[] = trie.nodes.map((node) => ({
    id: node.id,
    parent: node.parent,
    ch: node.ch,
    word: node.word,
    depth: node.depth,
    terminal: node.terminal,
  }));

  // 미끄러짐이 살려 낸 패턴 — 미끄러지는 쪽이 찾은 것에서 처음으로 돌아가는 쪽이
  // 찾은 것을 뺀다. 이 조각의 값이 바로 이 차집합이다.
  const naiveFound = new Set(foundBy(trie, text, false));
  const rescued = [...new Set(foundBy(trie, text, true).filter((p) => !naiveFound.has(p)))];

  /**
   * 걸음 하나를 내보내기 전에 지나는 문.
   *
   * 참을 돌려주면 나아가고, 거짓이면 그만둔다. 자동 재생과 한 걸음씩이 이 문
   * 하나로 갈린다.
   */
  type Gate = () => Promise<boolean>;

  const runOnce = async (gate: Gate): Promise<boolean> => {
    // 그림이 자리를 먼저 잡아야 마디가 자라도 배치가 흔들리지 않는다.
    // silent 를 붙이지 않는다 — stage 가 이 이벤트에서 마디와 간선을 만들고
    // 뿌리를 세우므로 시각 변화가 있는 걸음이다 (C2).
    await ctx.emit({ type: 'tree-ready', payload: { nodes: wire } });

    for (const pattern of patterns) {
      if (!(await gate())) return false;
      await ctx.emit({
        type: 'pattern-inserted',
        payload: { pattern, nodeIds: trie.grown.get(pattern) ?? [] },
      });
    }

    // 뿌리를 가리키는 링크는 그리지 않는다 — "어긋나면 처음으로" 라는 뜻이라
    // 이 조각이 말하려는 것과 반대다. 나무를 훑어 나온 목록이지 손으로 적은
    // 걸음표가 아니다.
    for (const node of trie.nodes) {
      const to = trie.fail[node.id];
      if (node.id === 0 || to === 0) continue;
      if (!(await gate())) return false;
      await ctx.emit({
        type: 'fail-linked',
        target: `node:${node.id}`,
        payload: { from: node.id, to, word: node.word, suffix: trie.nodes[to].word },
      });
    }

    let cur = 0;
    let firstSlide: { index: number; from: number; ch: string } | null = null;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];

      while (cur !== 0 && !trie.nodes[cur].children.has(ch)) {
        const to = trie.fail[cur];
        if (firstSlide === null) firstSlide = { index: i, from: cur, ch };
        if (!(await gate())) return false;
        await ctx.emit({
          type: 'fail-slid',
          target: `node:${to}`,
          payload: {
            index: i,
            ch,
            from: cur,
            to,
            word: trie.nodes[cur].word,
            suffix: trie.nodes[to].word,
          },
        });
        cur = to;
      }

      const from = cur;
      const next = trie.nodes[cur].children.get(ch);
      cur = next === undefined ? 0 : next;
      if (!(await gate())) return false;
      await ctx.emit({
        type: 'scan-advanced',
        target: `node:${cur}`,
        payload: {
          index: i,
          ch,
          from,
          to: cur,
          word: trie.nodes[cur].word,
          matched: trie.nodes[cur].terminal,
        },
      });
    }

    // 대비 — 그 자리에서 처음으로 돌아갔다면 무엇을 놓쳤을까.
    // 미끄러진 적이 없으면 보일 대비도 없다.
    if (firstSlide !== null && rescued.length > 0) {
      if (!(await gate())) return false;
      await ctx.emit({
        type: 'naive-restart',
        target: `node:${firstSlide.from}`,
        payload: {
          index: firstSlide.index,
          from: firstSlide.from,
          ch: firstSlide.ch,
          missed: rescued.join(', '),
        },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: { rescued: rescued.join(', ') } });
    return true;
  };

  // 자동 재생 한 바퀴. 마운트 직후의 첫 걸음은 문을 지나지 않는다 — 첫 문 앞에는
  // 기다릴 앞걸음이 없고, 문을 먼저 두면 stepMs 만큼 빈 화면이 보인다 (S-piece).
  let opened = false;
  const autoGate: Gate = async () => {
    if (!opened) {
      opened = true;
      return true;
    }
    return rc.sleep(stepMs);
  };
  if (!(await runOnce(autoGate))) return;

  // 그 뒤로는 `advance` 를 받아 한 걸음씩. 받은 것의 종류를 본다 (S-piece).
  for (;;) {
    if (ctx.cancelled) return;
    const input = await rc.waitForInput();
    if (input.type !== 'advance') continue;

    await ctx.emit({ type: 'rewind' });

    // 되감기 직후의 첫 문만 그냥 통과시킨다 — 첫 누름이 되감기로만 끝나면
    // 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    let passed = false;
    const stepGate: Gate = async () => {
      if (!passed) {
        passed = true;
        return true;
      }
      for (;;) {
        const next = await rc.waitForInput();
        if (next.type === 'advance') return !ctx.cancelled;
      }
    };
    if (!(await runOnce(stepGate))) return;
  }
};
