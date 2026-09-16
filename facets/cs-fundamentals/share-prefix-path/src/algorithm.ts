/**
 * sharePrefixPath — 접두사 공유 조각(piece) facet 알고리즘.
 *
 * 낱말을 순서대로 트라이(trie)에 넣는다. 이미 난 길과 글자가 같은 동안은 그
 * 자리를 그대로 타고(ride), 글자가 갈라지는 첫 자리에서만 새 자리를 낸다(grow).
 * `ctx.data.words` 를 실제로 순회해 트라이를 만들며, 그 결과로 나온 사실
 * (누가 타고 누가 새로 났는지) 을 걸음으로 옮긴다 — 걸음표를 손으로 적지 않는다.
 *
 * ── 이벤트 어휘 (C2) — 전부 리터럴로 emit, silent 없음 (전부 화면 변화 동반)
 *
 * payload 는 **장면이 읽는 것만** 싣는다. 낱말 이름·깊이·탄 자리 수·총 자리 수는
 * 한때 여기 실려 있었으나 장면이 자기 트라이에서 셈하므로 걷어냈다 — 같은 수를 두
 * 자리에서 내보내면 언젠가 갈린다 (`scene.ts` 의 `tallyWord` · `tallySeats`).
 * 낱말 이름도 마찬가지로 `wordIndex` 로 `initialData.words` 에서 찾는다.
 *
 *   prefix-word-begin  { wordIndex: number }
 *     새 낱말을 넣기 시작. 커서를 뿌리로 되돌리고 낱말 칩을 활성화.
 *
 *   prefix-ride         target: 'tree:<nodeId>'
 *                        { nodeId: string; wordIndex: number }
 *     이미 난 자리를 그대로 탄다 — 새 자리를 만들지 않는다.
 *
 *   prefix-grow          target: 'tree:<nodeId>'
 *                        { nodeId: string; parentId: string; char: string; wordIndex: number }
 *     글자가 갈라져 새 자리가 돋는다. 깊이는 싣지 않는다 — 부모에서 셈해진다.
 *
 *   prefix-mark           target: 'tree:<nodeId>'
 *                        { nodeId: string; wordIndex: number }
 *     그 자리에서 낱말이 끝난다는 표시.
 *
 *   prefix-word-end     { wordIndex: number }
 *     한 낱말을 다 넣었다. 탄 자리 수와 새 자리 수는 장면이 센다.
 *
 *   prefix-summary      payload 없음
 *     넷을 다 넣었다. 총 자리 수 · 따로 담았을 글자 수 · 아낀 수는 장면이 센다.
 *
 *   rewind              payload 없음
 *     `advance` 를 처음 누른 순간 화면을 뿌리만 남은 처음 상태로 되돌린다
 *     (S-piece: 되감기 직후 첫 걸음까지 보인다 — 이 이벤트 뒤 곧장 첫 사실을 emit).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type SharePrefixPathData = {
  type: 'share-prefix-path';
  words: string[];
  stepMs: number;
};

/** 트라이를 실제로 짓는 데 필요한 것만 남는다. 깊이·부모·글자는 걸음이 안 싣는다. */
type TrieNode = {
  id: string;
  children: Map<string, string>;
  isWord: boolean;
};

type StepFact =
  | { kind: 'wordBegin'; wordIndex: number }
  | { kind: 'ride'; nodeId: string; wordIndex: number }
  | { kind: 'grow'; nodeId: string; parentId: string; char: string; wordIndex: number }
  | { kind: 'mark'; nodeId: string; wordIndex: number }
  | { kind: 'wordEnd'; wordIndex: number }
  | { kind: 'summary' };

/** ctx.data.words 를 실제로 순회하며 트라이를 짓고, 그 결과를 걸음 사실로 모은다. */
function buildFacts(words: string[]): StepFact[] {
  const nodes = new Map<string, TrieNode>();
  nodes.set('', { id: '', children: new Map(), isWord: false });

  const facts: StepFact[] = [];

  words.forEach((word, wordIndex) => {
    facts.push({ kind: 'wordBegin', wordIndex });

    let cur = nodes.get('');
    if (!cur) return;

    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const prefix = word.slice(0, i + 1);
      const existingId = cur.children.get(ch);

      if (existingId !== undefined) {
        facts.push({ kind: 'ride', nodeId: existingId, wordIndex });
        const next = nodes.get(existingId);
        if (!next) break;
        cur = next;
        continue;
      }

      const node: TrieNode = { id: prefix, children: new Map(), isWord: false };
      nodes.set(prefix, node);
      cur.children.set(ch, prefix);
      facts.push({ kind: 'grow', nodeId: prefix, parentId: cur.id, char: ch, wordIndex });
      cur = node;
    }

    if (!cur.isWord) {
      cur.isWord = true;
      facts.push({ kind: 'mark', nodeId: cur.id, wordIndex });
    }
    facts.push({ kind: 'wordEnd', wordIndex });
  });

  facts.push({ kind: 'summary' });

  return facts;
}

/** 취소 검사와 sleep 을 한 번에 묶는다 (S-piece). */
async function pause(ctx: ReactiveContext<SharePrefixPathData>, ms: number): Promise<boolean> {
  if (ctx.cancelled) return false;
  return ctx.sleep(ms);
}

/** 도메인 사실 → ctx.emit 리터럴 (C2: type 은 항상 리터럴 문자열). */
async function emitFact(ctx: ReactiveContext<SharePrefixPathData>, fact: StepFact): Promise<void> {
  switch (fact.kind) {
    case 'wordBegin':
      await ctx.emit({ type: 'prefix-word-begin', payload: { wordIndex: fact.wordIndex } });
      return;
    case 'ride':
      await ctx.emit({
        type: 'prefix-ride',
        target: `tree:${fact.nodeId}`,
        payload: { nodeId: fact.nodeId, wordIndex: fact.wordIndex },
      });
      return;
    case 'grow':
      await ctx.emit({
        type: 'prefix-grow',
        target: `tree:${fact.nodeId}`,
        payload: {
          nodeId: fact.nodeId,
          parentId: fact.parentId,
          char: fact.char,
          wordIndex: fact.wordIndex,
        },
      });
      return;
    case 'mark':
      await ctx.emit({
        type: 'prefix-mark',
        target: `tree:${fact.nodeId}`,
        payload: { nodeId: fact.nodeId, wordIndex: fact.wordIndex },
      });
      return;
    case 'wordEnd':
      await ctx.emit({ type: 'prefix-word-end', payload: { wordIndex: fact.wordIndex } });
      return;
    case 'summary':
      await ctx.emit({ type: 'prefix-summary', payload: {} });
      return;
  }
}

export async function sharePrefixPathAlgorithm(ctx: FacetContext<SharePrefixPathData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SharePrefixPathData>;
  const { words, stepMs } = rctx.data;
  const facts = buildFacts(words);

  // 1) 자동 재생 — 사실을 순서대로 발신하고 걸음마다 읽을 시간을 준다.
  for (const fact of facts) {
    if (rctx.cancelled) return;
    await emitFact(rctx, fact);
    if (rctx.cancelled) return;
    const ok = await pause(rctx, stepMs);
    if (!ok) return;
  }

  // 2) 자동 재생이 끝난 뒤 — advance 로 한 걸음씩 다시 짚어 본다.
  //    처음 누르는 advance 는 되감고(rewind) 첫 사실까지 그 자리에서 보인다.
  let idx = 0;
  while (!rctx.cancelled) {
    let input: ReactiveInputEvent;
    try {
      input = await rctx.waitForInput();
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다 (C6).
      return;
    }
    if (rctx.cancelled) return;
    if (input.type !== 'advance') continue;

    if (idx === 0) {
      await rctx.emit({ type: 'rewind', payload: {} });
      if (rctx.cancelled) return;
    }

    await emitFact(rctx, facts[idx]);
    if (rctx.cancelled) return;
    idx = (idx + 1) % facts.length;
  }
}
