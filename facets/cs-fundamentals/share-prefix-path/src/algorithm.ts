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
 *   prefix-word-begin  { word: string; wordIndex: number }
 *     새 낱말을 넣기 시작. 커서를 뿌리로 되돌리고 낱말 칩을 활성화.
 *
 *   prefix-ride         target: 'tree:<nodeId>'
 *                        { nodeId: string; parentId: string; char: string; word: string; wordIndex: number }
 *     이미 난 자리를 그대로 탄다 — 새 자리를 만들지 않는다.
 *
 *   prefix-grow          target: 'tree:<nodeId>'
 *                        { nodeId: string; parentId: string; char: string; depth: number; word: string; wordIndex: number }
 *     글자가 갈라져 새 자리가 돋는다.
 *
 *   prefix-mark           target: 'tree:<nodeId>'
 *                        { nodeId: string; word: string; wordIndex: number }
 *     그 자리에서 낱말이 끝난다는 표시.
 *
 *   prefix-word-end     { word: string; wordIndex: number; rode: number; grown: number }
 *     한 낱말을 다 넣었다 — 이번 낱말이 탄 자리 수 / 새로 낸 자리 수.
 *
 *   prefix-summary      { wordCount: number; totalSeats: number; rawChars: number; saved: number }
 *     넷을 다 넣은 뒤의 총결산 — 뿌리를 포함한 총 자리 수, 낱말 글자를 따로
 *     담았다면 들었을 자리 수, 아낀 자리 수.
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

type TrieNode = {
  id: string;
  parentId: string | null;
  char: string;
  depth: number;
  children: Map<string, string>;
  isWord: boolean;
};

type StepFact =
  | { kind: 'wordBegin'; word: string; wordIndex: number }
  | { kind: 'ride'; nodeId: string; parentId: string; char: string; word: string; wordIndex: number }
  | { kind: 'grow'; nodeId: string; parentId: string; char: string; depth: number; word: string; wordIndex: number }
  | { kind: 'mark'; nodeId: string; word: string; wordIndex: number }
  | { kind: 'wordEnd'; word: string; wordIndex: number; rode: number; grown: number }
  | { kind: 'summary'; wordCount: number; totalSeats: number; rawChars: number; saved: number };

/** ctx.data.words 를 실제로 순회하며 트라이를 짓고, 그 결과를 걸음 사실로 모은다. */
function buildFacts(words: string[]): StepFact[] {
  const nodes = new Map<string, TrieNode>();
  nodes.set('', { id: '', parentId: null, char: '', depth: 0, children: new Map(), isWord: false });

  const facts: StepFact[] = [];
  let rawChars = 0;

  words.forEach((word, wordIndex) => {
    rawChars += word.length;
    facts.push({ kind: 'wordBegin', word, wordIndex });

    let cur = nodes.get('');
    if (!cur) return;
    let rode = 0;
    let grown = 0;

    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const prefix = word.slice(0, i + 1);
      const existingId = cur.children.get(ch);

      if (existingId !== undefined) {
        facts.push({ kind: 'ride', nodeId: existingId, parentId: cur.id, char: ch, word, wordIndex });
        rode += 1;
        const next = nodes.get(existingId);
        if (!next) break;
        cur = next;
        continue;
      }

      const node: TrieNode = {
        id: prefix,
        parentId: cur.id,
        char: ch,
        depth: cur.depth + 1,
        children: new Map(),
        isWord: false,
      };
      nodes.set(prefix, node);
      cur.children.set(ch, prefix);
      facts.push({ kind: 'grow', nodeId: prefix, parentId: cur.id, char: ch, depth: node.depth, word, wordIndex });
      grown += 1;
      cur = node;
    }

    if (!cur.isWord) {
      cur.isWord = true;
      facts.push({ kind: 'mark', nodeId: cur.id, word, wordIndex });
    }
    facts.push({ kind: 'wordEnd', word, wordIndex, rode, grown });
  });

  facts.push({
    kind: 'summary',
    wordCount: words.length,
    totalSeats: nodes.size,
    rawChars,
    saved: rawChars - nodes.size,
  });

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
      await ctx.emit({
        type: 'prefix-word-begin',
        payload: { word: fact.word, wordIndex: fact.wordIndex },
      });
      return;
    case 'ride':
      await ctx.emit({
        type: 'prefix-ride',
        target: `tree:${fact.nodeId}`,
        payload: {
          nodeId: fact.nodeId,
          parentId: fact.parentId,
          char: fact.char,
          word: fact.word,
          wordIndex: fact.wordIndex,
        },
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
          depth: fact.depth,
          word: fact.word,
          wordIndex: fact.wordIndex,
        },
      });
      return;
    case 'mark':
      await ctx.emit({
        type: 'prefix-mark',
        target: `tree:${fact.nodeId}`,
        payload: { nodeId: fact.nodeId, word: fact.word, wordIndex: fact.wordIndex },
      });
      return;
    case 'wordEnd':
      await ctx.emit({
        type: 'prefix-word-end',
        payload: { word: fact.word, wordIndex: fact.wordIndex, rode: fact.rode, grown: fact.grown },
      });
      return;
    case 'summary':
      await ctx.emit({
        type: 'prefix-summary',
        payload: {
          wordCount: fact.wordCount,
          totalSeats: fact.totalSeats,
          rawChars: fact.rawChars,
          saved: fact.saved,
        },
      });
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
