/**
 * walkPerCharacter — 글자 단위 탐색.
 *
 * 담긴 말(`words`) 로 트라이를 실제로 짓고, 찾는 말(`queries`) 마다 글자를
 * 앞에서부터 하나씩 집어 그 글자가 붙은 가지를 따라 한 칸씩 내려간다. 글자를
 * 다 쓰면 멈추고(끝난 자리에 ● 가 있으면 "있다", 없으면 "말로는 없다"),
 * 도중에 그 글자의 가지가 없으면 거기서 "없다" 로 답이 난다. 세 결말은
 * `computeSteps` 가 트라이를 실제로 훑어 얻은 결과이며 미리 적어 두지 않는다.
 *
 * mechanismKind: 'reactive' — mount 즉시 자동 재생을 시작하고, 자동 재생이
 * 끝나면 `advance` 입력으로 처음부터 한 걸음씩 다시 훑을 수 있다.
 *
 * ── 이벤트 목록 (facet 고유 확장, C2) ────────────────────────────────────
 *
 * search-begin  (silent: false)
 *   이번에 찾을 말을 새로 시작. 커서를 뿌리로 되돌리고 이전 강조를 지운다.
 *   payload: { queryIndex: number; queryTotal: number; query: string }
 *
 * step-down     (silent: false)
 *   찾는 말의 글자 하나를 따라 그 가지를 타고 한 칸 내려간다.
 *   target: `node:<toId>`
 *   payload: {
 *     queryIndex: number; charIndex: number; char: string;
 *     fromId: string; toId: string;
 *   }
 *
 * search-result (silent: false)
 *   글자를 다 썼거나(글이 없어) 더 못 내려가 답이 난 자리.
 *   target: `node:<nodeId>` (답이 난 자리 — found/no-word 는 마지막으로 내려간
 *   노드, blocked 는 가지가 없던 그 부모 노드)
 *   payload: {
 *     queryIndex: number; query: string; nodeId: string; depth: number;
 *     verdict: 'found' | 'no-word' | 'blocked';
 *     blockedChar?: string;  // verdict === 'blocked' 일 때만, 없던 가지의 글자
 *   }
 */

import type { FacetContext } from '@ffacet/core/runtime';
import type { ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type WalkPerCharacterData = {
  type: string;
  /** 트라이에 담긴 말들. */
  words: string[];
  /** 차례로 찾아볼 말들. */
  queries: string[];
  /** 걸음 사이 간격(ms). 자동 재생의 읽을 시간. */
  stepMs: number;
};

type TrieNode = {
  id: string;
  letter: string | null;
  isEnd: boolean;
  children: Map<string, TrieNode>;
};

function buildTrie(words: string[]): TrieNode {
  const root: TrieNode = { id: 'root', letter: null, isEnd: false, children: new Map() };
  for (const word of words) {
    let node = root;
    let prefix = '';
    for (const ch of word) {
      prefix += ch;
      let child = node.children.get(ch);
      if (!child) {
        child = { id: prefix, letter: ch, isEnd: false, children: new Map() };
        node.children.set(ch, child);
      }
      node = child;
    }
    node.isEnd = true;
  }
  return root;
}

type Step =
  | { kind: 'search-begin'; queryIndex: number; queryTotal: number; query: string }
  | {
      kind: 'step-down';
      queryIndex: number;
      charIndex: number;
      char: string;
      fromId: string;
      toId: string;
    }
  | {
      kind: 'search-result';
      queryIndex: number;
      query: string;
      nodeId: string;
      depth: number;
      verdict: 'found' | 'no-word' | 'blocked';
      blockedChar?: string;
    };

/**
 * 실제 트라이를 실제로 훑어 걸음표를 얻는다. 세 결말(있다/말로는 없다/없다)은
 * 여기서 계산된 결과이지 미리 적어 둔 값이 아니다.
 */
function computeSteps(root: TrieNode, queries: string[]): Step[] {
  const steps: Step[] = [];
  const queryTotal = queries.length;
  queries.forEach((query, queryIndex) => {
    steps.push({ kind: 'search-begin', queryIndex, queryTotal, query });
    let node = root;
    let depth = 0;
    let blockedChar: string | undefined;
    for (let i = 0; i < query.length; i++) {
      const ch = query[i];
      const child = node.children.get(ch);
      if (!child) {
        blockedChar = ch;
        break;
      }
      steps.push({ kind: 'step-down', queryIndex, charIndex: i, char: ch, fromId: node.id, toId: child.id });
      node = child;
      depth++;
    }
    if (blockedChar !== undefined) {
      steps.push({ kind: 'search-result', queryIndex, query, nodeId: node.id, depth, verdict: 'blocked', blockedChar });
    } else {
      steps.push({
        kind: 'search-result',
        queryIndex,
        query,
        nodeId: node.id,
        depth,
        verdict: node.isEnd ? 'found' : 'no-word',
      });
    }
  });
  return steps;
}

/**
 * 한 걸음 앞의 문(gate). 자동 재생이면 `stepMs` 만큼 읽을 시간을 두고,
 * 수동(advance) 이면 사용자 입력을 기다린다. `skipOnce` 가 true 인 첫 호출은
 * 곧바로 통과한다 — 되감기를 일으킨 그 누름이 곧 첫 걸음을 보이는 누름이기도
 * 하기 때문이다.
 *
 * @returns 정상 통과 시 true, 취소로 깨어났으면 false.
 */
async function gate(
  ctx: ReactiveContext<WalkPerCharacterData>,
  mode: 'auto' | 'manual',
  stepMs: number,
  skipOnce: { value: boolean },
): Promise<boolean> {
  if (ctx.cancelled) return false;
  if (skipOnce.value) {
    skipOnce.value = false;
    return true;
  }
  if (mode === 'auto') {
    return ctx.sleep(stepMs);
  }
  while (true) {
    if (ctx.cancelled) return false;
    let ev: ReactiveInputEvent;
    try {
      ev = await ctx.waitForInput();
    } catch {
      return false;
    }
    if (ev.type === 'advance') return true;
  }
}

/** 걸음표를 순서대로 밟으며 리터럴 type 으로 emit 한다 (C2). */
async function runSteps(
  ctx: ReactiveContext<WalkPerCharacterData>,
  steps: Step[],
  mode: 'auto' | 'manual',
  stepMs: number,
  skipFirstGate: boolean,
): Promise<boolean> {
  const skipOnce = { value: skipFirstGate };
  for (const step of steps) {
    const ok = await gate(ctx, mode, stepMs, skipOnce);
    if (!ok) return false;
    switch (step.kind) {
      case 'search-begin':
        await ctx.emit({
          type: 'search-begin',
          payload: { queryIndex: step.queryIndex, queryTotal: step.queryTotal, query: step.query },
        });
        break;
      case 'step-down':
        await ctx.emit({
          type: 'step-down',
          target: `node:${step.toId}`,
          payload: {
            queryIndex: step.queryIndex,
            charIndex: step.charIndex,
            char: step.char,
            fromId: step.fromId,
            toId: step.toId,
          },
        });
        break;
      case 'search-result':
        await ctx.emit({
          type: 'search-result',
          target: `node:${step.nodeId}`,
          payload: {
            queryIndex: step.queryIndex,
            query: step.query,
            nodeId: step.nodeId,
            depth: step.depth,
            verdict: step.verdict,
            blockedChar: step.blockedChar,
          },
        });
        break;
    }
  }
  return true;
}

export async function walkPerCharacterAlgorithm(ctx: FacetContext<WalkPerCharacterData>): Promise<void> {
  const rc = ctx as ReactiveContext<WalkPerCharacterData>;
  const { words, queries, stepMs } = rc.data;
  const root = buildTrie(words);
  const steps = computeSteps(root, queries);

  const finishedAuto = await runSteps(rc, steps, 'auto', stepMs, false);
  if (!finishedAuto) return;

  // 자동 재생 종료 — 이후로는 advance 로만 처음부터 다시 훑는다.
  // 자동 재생 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다(S-piece) —
  // 그 누름 자체가 아래 runSteps 의 skipFirstGate 로 전달되어 첫 문을 그냥
  // 통과시킨다.
  while (true) {
    if (rc.cancelled) return;
    let ev: ReactiveInputEvent;
    try {
      ev = await rc.waitForInput();
    } catch {
      return;
    }
    if (ev.type !== 'advance') continue;
    const finishedManual = await runSteps(rc, steps, 'manual', stepMs, true);
    if (!finishedManual) return;
  }
}
