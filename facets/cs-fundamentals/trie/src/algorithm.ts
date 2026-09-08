/**
 * trie — 접두사 나무 완결형 algorithm.
 *
 * 조각 둘(`sharePrefixPath` · `walkPerCharacter`)이 넣기와 찾기를 덮는다.
 * 이 완결형이 더하는 것은 **trie 를 쓰는 까닭** 자체다.
 *
 *   자동완성  접두사 하나를 주면 그것으로 시작하는 낱말을 전부 모은다. 나무를
 *             그 접두사 자리까지 내려간 뒤 그 아래를 훑으면 되므로, 담긴 낱말이
 *             몇이든 앞부분을 다시 견주지 않는다. 조각 둘 다 이 일을 안 보인다.
 *   지우기    `car` 를 지워도 `cart` 가 쓰는 c-a-r 은 남는다. 접두사를 공유한다는
 *             말의 결과가 여기서 드러난다 — 조각은 넣는 쪽만 보인다.
 *
 * ── 진행 모델
 *
 * `mechanismKind: 'reactive'`. mount 즉시 씨앗 낱말을 넣어 보이고, 그 뒤로는
 * `waitForInput` 루프에서 학습자의 조작을 받는다.
 *
 * ── 식별자 (C1)
 *
 *   `node:<id>`   나무의 한 자리. 뿌리는 `node:root`, 나머지는 뿌리에서
 *                 내려온 글자를 이은 문자열이다 (`node:ca`).
 *
 * ── 이벤트
 *
 * | type            | 표준 | target        | payload |
 * | --------------- | --- | ------------- | ------- |
 * | `state-changed` | O   | 없음           | `{ nodes, words }` 나무 전체 |
 * | `highlight`     | O   | `node:<id>`   | `{ id, ch }` 지금 밟는 자리 |
 * | `mark`          | O   | `node:<id>`   | `{ id }` 낱말이 끝나는 자리 |
 * | `done`          | O   | 없음           | `{ words, nodes }` 한 조작이 끝났다 |
 * | `ride`          | ✗   | `node:<id>`   | `{ id, ch }` 이미 난 길을 탄다 |
 * | `grow`          | ✗   | `node:<id>`   | `{ id, parent, ch }` 새 자리가 돋는다 |
 * | `miss`          | ✗   | `node:<id>`   | `{ id, ch }` 그 글자의 가지가 없다 |
 * | `collect`       | ✗   | 없음           | `{ prefix, found }` 접두사 아래를 훑어 모았다 |
 * | `prune`         | ✗   | 없음           | `{ removed, kept }` 지우고 남은 것 |
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *
 *   word-count · node-count · step-count
 *
 * `node-count` 가 이 화면의 조용한 논증이다 — 낱말을 넣을수록 자리는 그보다
 * 훨씬 덜 는다. 접두사를 공유하기 때문이다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TrieData = {
  type: 'trie';
  /** 시연에서 넣어 볼 낱말. */
  seed: string[];
  /** 받아들이는 낱말의 최대 길이. 나무의 깊이를 이것이 정한다. */
  maxLength: number;
  /** 걸음 간격(ms). */
  stepMs: number;
};

/** 한 자리. `id` 는 뿌리에서 내려온 글자를 이은 것이라 그 자체로 접두사다. */
type TrieNode = {
  id: string;
  parent: string | null;
  ch: string;
  end: boolean;
};

type TrieInput = { type: string; payload?: Record<string, unknown> };

const ROOT = 'root';

export async function trie(ctx: FacetContext<TrieData>): Promise<void> {
  const rc = ctx as ReactiveContext<TrieData>;
  const { stepMs, maxLength } = rc.data;

  /** id → 자리. 뿌리는 늘 있다. */
  let nodes = new Map<string, TrieNode>();
  let lastInput = '';

  const reset = (): void => {
    nodes = new Map([[ROOT, { id: ROOT, parent: null, ch: '', end: false }]]);
  };

  const pause = async (): Promise<boolean> => {
    if (rc.cancelled) return false;
    return rc.sleep(stepMs);
  };

  /** 자리 id — 뿌리 아래로 내려온 글자를 그대로 이은 것. */
  const childId = (parentId: string, ch: string): string =>
    parentId === ROOT ? ch : parentId + ch;

  const wordCount = (): number => {
    let n = 0;
    for (const node of nodes.values()) if (node.end) n += 1;
    return n;
  };

  const publish = async (): Promise<void> => {
    await rc.emit({
      type: 'state-changed',
      payload: { nodes: [...nodes.values()], words: wordCount() },
      silent: true,
    });
  };

  const finish = async (): Promise<void> => {
    await publish();
    // 자리 수에서 뿌리는 뺀다 — 담은 것이 아니라 시작점이다.
    await rc.emit({ type: 'done', payload: { words: wordCount(), nodes: nodes.size - 1 } });
  };

  /**
   * 낱말을 넣는다.
   *
   * 이미 난 길과 글자가 같은 동안은 새 자리를 만들지 않고 그 길을 탄다
   * (`ride`). 갈라지는 첫 글자에서만 가지가 돋는다 (`grow`).
   */
  const insert = async (word: string): Promise<boolean> => {
    let cur = ROOT;
    for (const ch of word) {
      if (rc.cancelled) return false;
      const id = childId(cur, ch);
      const existing = nodes.get(id);
      if (existing) {
        await rc.emit({ type: 'ride', target: `node:${id}`, payload: { id, ch } });
      } else {
        nodes.set(id, { id, parent: cur, ch, end: false });
        await rc.emit({ type: 'grow', target: `node:${id}`, payload: { id, parent: cur, ch } });
        await publish();
      }
      ctx.metric('step-count', 'inc');
      if (!(await pause())) return false;
      cur = id;
    }
    const node = nodes.get(cur);
    if (node && !node.end) {
      node.end = true;
      ctx.metric('word-count', 'inc');
    }
    await rc.emit({ type: 'mark', target: `node:${cur}`, payload: { id: cur } });
    await publish();
    return pause();
  };

  /**
   * 그 낱말이 담겨 있는가.
   *
   * 세 결말이 갈린다 — 길이 끊기거나(`miss`), 길은 있는데 끝 표시가 없거나,
   * 표시가 있어 낱말이거나.
   */
  const search = async (word: string): Promise<boolean> => {
    let cur = ROOT;
    for (const ch of word) {
      if (rc.cancelled) return false;
      const id = childId(cur, ch);
      if (!nodes.has(id)) {
        await rc.emit({ type: 'miss', target: `node:${cur}`, payload: { id: cur, ch } });
        ctx.metric('step-count', 'inc');
        return pause();
      }
      await rc.emit({ type: 'highlight', target: `node:${id}`, payload: { id, ch } });
      ctx.metric('step-count', 'inc');
      if (!(await pause())) return false;
      cur = id;
    }
    const node = nodes.get(cur);
    if (node?.end) {
      await rc.emit({ type: 'mark', target: `node:${cur}`, payload: { id: cur } });
    } else {
      // 길은 있는데 낱말은 아니다 — trie 에서만 갈리는 두 번째 종류의 "없다".
      await rc.emit({ type: 'miss', target: `node:${cur}`, payload: { id: cur, ch: '' } });
    }
    return pause();
  };

  /**
   * 접두사로 시작하는 낱말을 모두 모은다 — trie 를 쓰는 까닭.
   *
   * 접두사 자리까지 내려간 뒤 그 **아래만** 훑는다. 담긴 낱말이 몇이든 앞부분을
   * 다시 견주지 않는다는 것이 요점이다.
   */
  const complete = async (prefix: string): Promise<boolean> => {
    let cur = ROOT;
    for (const ch of prefix) {
      if (rc.cancelled) return false;
      const id = childId(cur, ch);
      if (!nodes.has(id)) {
        await rc.emit({ type: 'miss', target: `node:${cur}`, payload: { id: cur, ch } });
        ctx.metric('step-count', 'inc');
        await rc.emit({ type: 'collect', payload: { prefix, found: [] } });
        return pause();
      }
      await rc.emit({ type: 'highlight', target: `node:${id}`, payload: { id, ch } });
      ctx.metric('step-count', 'inc');
      if (!(await pause())) return false;
      cur = id;
    }

    // 그 자리 아래를 훑는다. id 가 곧 그 자리까지의 글자라 낱말을 따로 잇지
    // 않아도 된다.
    const found: string[] = [];
    const stack = [cur];
    while (stack.length > 0) {
      const id = stack.pop()!;
      const node = nodes.get(id);
      if (!node) continue;
      if (node.end) found.push(id === ROOT ? '' : id);
      for (const other of nodes.values()) {
        if (other.parent === id) stack.push(other.id);
      }
    }
    found.sort();
    await rc.emit({ type: 'collect', payload: { prefix, found } });
    return pause();
  };

  /**
   * 낱말을 지운다.
   *
   * 끝 표시만 지우고, 자리는 **아무도 쓰지 않게 된 것만** 걷는다. `car` 를
   * 지워도 `cart` 가 쓰는 c-a-r 은 남는다 — 접두사를 공유한다는 말의 결과다.
   */
  const remove = async (word: string): Promise<boolean> => {
    const id = word.length === 0 ? ROOT : word;
    const node = nodes.get(id);
    if (!node?.end) {
      await rc.emit({ type: 'miss', target: `node:${ROOT}`, payload: { id: ROOT, ch: '' } });
      return pause();
    }
    node.end = false;
    ctx.metric('word-count', -1);

    // 잎에서 위로 걷는다. 자식이 있거나 스스로 낱말이면 거기서 멈춘다.
    const removed: string[] = [];
    let cur: string | null = id;
    while (cur !== null && cur !== ROOT) {
      const here: TrieNode | undefined = nodes.get(cur);
      if (!here) break;
      const hasChild = [...nodes.values()].some((o) => o.parent === cur);
      if (hasChild || here.end) break;
      nodes.delete(cur);
      removed.push(cur);
      cur = here.parent;
    }
    await rc.emit({ type: 'prune', payload: { word, removed, kept: nodes.size - 1 } });
    await publish();
    return pause();
  };

  const cleanWord = (raw: string): string =>
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .slice(0, maxLength);

  // ── 1. 시연.
  reset();
  await publish();
  for (const w of rc.data.seed) {
    if (rc.cancelled) return;
    if (!(await insert(w))) return;
  }
  if (rc.cancelled) return;
  await finish();

  // ── 2. 학습자 차례.
  for (;;) {
    if (rc.cancelled) return;
    let ev: TrieInput;
    try {
      ev = await rc.waitForInput<TrieInput>();
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다 (C6).
      return;
    }

    const raw = ev.payload?.word;
    if (typeof raw === 'string') lastInput = raw;
    if (ev.type === 'input') continue;

    const word = cleanWord(lastInput);
    if (word.length === 0 && ev.type !== 'complete') continue;

    if (ev.type === 'insert') {
      if (!(await insert(word))) return;
      await finish();
      continue;
    }
    if (ev.type === 'search') {
      if (!(await search(word))) return;
      await finish();
      continue;
    }
    if (ev.type === 'complete') {
      if (!(await complete(word))) return;
      await finish();
      continue;
    }
    if (ev.type === 'remove') {
      if (!(await remove(word))) return;
      await finish();
      continue;
    }
  }
}
