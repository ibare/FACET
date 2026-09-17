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
 * | type             | silent | payload                                          |
 * |------------------|--------|--------------------------------------------------|
 * | tree-ready       | false  | `{ nodes: { id, parent, ch, terminal }[] }`         |
 * | rewind           | false  | 없음                                               |
 * | pattern-inserted | false  | 없음                                               |
 * | fail-linked      | false  | `{ from: number; to: number }`                     |
 * | scan-advanced    | false  | `{ to: number }`                                   |
 * | fail-slid        | false  | `{ to: number }`                                   |
 * | naive-restart    | false  | `{ missed: string[] }`                             |
 * | done             | false  | 없음                                               |
 *
 * - `tree-ready` 는 그림이 자리를 미리 잡게 하는 이벤트다. **silent 가 아니다** —
 *   장면이 이 이벤트에서 나무를 쥐고 뿌리를 세우므로 시각 변화가 있는 걸음이다 (C2).
 * - `rewind` 는 자동 재생이 끝난 뒤 `advance` 를 처음 받아 처음으로 되돌아갈 때 발신한다.
 *
 * ── payload 를 얇게 두는 까닭
 *
 * 화면에 함께 뜨는 수가 두 자리에서 셈해지면 언젠가 갈린다. 그래서 **장면이 셀 수
 * 있는 것은 싣지 않는다** — 몇 번째 무늬를 넣는지(`pattern` · `nodeIds`), 몇 번째
 * 글자를 읽는지(`index`), 그 글자가 무엇인지(`ch`), 마디가 나타내는 글자열
 * (`word` · `suffix`), 마디의 깊이(`depth`), 거기서 끝나는 무늬(`matched`) 는
 * 전부 `scene.ts` 가 나무와 글줄에서 셈한다.
 *
 * 남긴 셋은 모두 **걸음이 내리는 판정**이다.
 *
 * - 나무의 모양(`tree-ready` 의 `nodes`) — 구조에서 셀 수 없는 바탕 그 자체.
 * - 어디로 떨어지고 어디로 나아가는가(`to`, `from`) — **실패 링크는 이 조각의
 *   알고리즘 그 자체다.** 순수 함수라 내줄 수는 있으나 내주면 장면이 알고리즘을
 *   되풀이하고 발신이 장식이 된다. 조각의 이름이 `fail-link` 인 이유가 그것이다.
 * - 놓쳤을 무늬(`missed`) — **뿌리로 돌아가는 쪽의 주행 결과**라 이 화면의 자취에는
 *   없다. `done` 에서 같은 값을 다시 싣던 것은 걷어냈다 — 장면이 이미 쥐고 있다.
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
  /** 이 마디가 나타내는 글자열. 실패 링크를 셈하는 데만 쓴다. */
  word: string;
  /** 이 마디에서 끝나는 패턴. 없으면 null. */
  terminal: string | null;
  children: Map<string, number>;
};

type Trie = {
  nodes: TrieNode[];
  /** 마디마다의 실패 링크. 가리킬 곳이 없으면 뿌리(0). */
  fail: number[];
};

/**
 * 화면으로 넘어가는 마디 — 구조만.
 *
 * `word` 도 `depth` 도 넘기지 않는다. 부모와 글자만 있으면 둘 다 파생되므로,
 * 실어 보내면 같은 것을 두 자리에서 세는 문을 열어 두는 꼴이다.
 */
type WireNode = {
  id: number;
  parent: number;
  ch: string;
  terminal: string | null;
};

function buildTrie(patterns: string[]): Trie {
  const nodes: TrieNode[] = [
    { id: 0, parent: -1, ch: '', word: '', terminal: null, children: new Map() },
  ];

  for (const pattern of patterns) {
    let cur = 0;
    for (const ch of pattern) {
      const next = nodes[cur].children.get(ch);
      if (next === undefined) {
        const node: TrieNode = {
          id: nodes.length,
          parent: cur,
          ch,
          word: nodes[cur].word + ch,
          terminal: null,
          children: new Map(),
        };
        nodes.push(node);
        nodes[cur].children.set(ch, node.id);
        cur = node.id;
      } else {
        cur = next;
      }
    }
    nodes[cur].terminal = pattern;
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

  return { nodes, fail };
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
    // silent 를 붙이지 않는다 — 장면이 이 이벤트에서 나무를 쥐고 뿌리를 세우므로
    // 시각 변화가 있는 걸음이다 (C2).
    await ctx.emit({ type: 'tree-ready', payload: { nodes: wire } });

    // 몇 번째 무늬를 넣고 있는지도, 그 무늬가 새로 내는 마디가 무엇인지도 싣지
    // 않는다 — 무늬 목록과 나무만 있으면 장면이 센다.
    for (let left = patterns.length; left > 0; left -= 1) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'pattern-inserted' });
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
        payload: { from: node.id, to },
      });
    }

    let cur = 0;
    let slidOnce = false;

    for (const ch of text) {
      while (cur !== 0 && !trie.nodes[cur].children.has(ch)) {
        const to = trie.fail[cur];
        slidOnce = true;
        if (!(await gate())) return false;
        await ctx.emit({ type: 'fail-slid', target: `node:${to}`, payload: { to } });
        cur = to;
      }

      const next = trie.nodes[cur].children.get(ch);
      cur = next === undefined ? 0 : next;
      if (!(await gate())) return false;
      await ctx.emit({ type: 'scan-advanced', target: `node:${cur}`, payload: { to: cur } });
    }

    // 대비 — 그 자리에서 처음으로 돌아갔다면 무엇을 놓쳤을까.
    // 미끄러진 적이 없으면 보일 대비도 없다. 어느 마디에서 돌아가는지는 싣지
    // 않는다 — 처음으로 미끄러진 자리를 장면이 이미 쥐고 있다.
    if (slidOnce && rescued.length > 0) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'naive-restart', payload: { missed: rescued } });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done' });
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
