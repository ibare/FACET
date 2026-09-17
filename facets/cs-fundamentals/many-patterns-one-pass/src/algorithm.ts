/**
 * 여러 패턴을 한 번의 훑기로 찾는다 (조각).
 *
 * 패턴을 글자별로 이어 붙여 한 나무(트라이)로 포갠 뒤, 텍스트를 왼쪽부터 한 번만
 * 지나가며 그 나무를 따라 내려간다. 한 마디가 두 패턴의 끝일 수 있으므로 한
 * 자리에서 둘이 함께 걸린다.
 *
 * ── 발신에 무엇을 싣고 무엇을 안 싣나
 *
 * **나무의 모양은 싣지 않는다.** 어느 마디가 어느 글자로 이어지는지는 무늬 목록
 * 하나로 결정되는 순수한 셈이라, 같은 함수를 `manyPatternsOnePassNodes` 로 내주고
 * 장면이 그것을 부른다 (프로토콜 4절의 B 갈래). 실어 보내면 나무가 두 자리에서
 * 셈해져 언젠가 갈린다. 이 조각의 알고리즘은 나무 짓기가 아니라 **한 번만 지나가며
 * 훑기** 이므로, 나무 짓기를 떼어 내도 조각이 말하려는 바가 그대로 남는다.
 *
 * **셀 수 있는 수도 싣지 않는다.** 몇 번째 글자를 읽고 있나(읽은 글자가 하나씩
 * 쌓이므로 그 길이가 번호다) · 읽은 글자 · 어디서 왔나(앞 걸음의 커서) · 어떻게
 * 옮겼나(`via` 가 있으면 미끄러짐, 제자리면 머무름) · 찾은 것의 수 · 마디 수 —
 * 전부 장면이 센다.
 *
 * 남는 것은 **걸음이 내리는 판정** 둘뿐이다. 어느 마디로 가는가(`to` · `via`) 와
 * 어느 무늬가 여기서 걸리는가(`patterns`). 둘 다 미끄럼길이 정하는 것이라 장면이
 * 셀 수 없다.
 *
 * ── 이벤트 (전부 facet 고유 확장. silent 이벤트 없음)
 *
 *   patterns-laid  {}
 *       패턴 넉 줄을 늘어놓는다. 따로 훑을 때의 지나감 횟수는 무늬 수이므로
 *       장면이 센다.
 *
 *   trie-merged    {}
 *       같은 앞머리를 포개어 한 나무로 세운다. 나무의 모양은 장면이
 *       `manyPatternsOnePassNodes` 로 셈한다.
 *
 *   read           { to: string; via?: string }
 *       글자 하나를 읽고 커서가 `to` 마디로 간다. 길이 끊겨 물러났으면 들른
 *       마디가 `via`. 마디 id 는 뿌리에서 그 마디까지의 글자를 이은 것이고
 *       뿌리는 빈 문자열이다.
 *
 *   match          { patterns: string[] }
 *       지금 선 마디에서 끝나는 무늬들. 미끄럼길로 이어진 것까지 한 번에 온다 —
 *       한 마디에서 둘 이상이 끝나면 함께 걸리는 것이 이 조각의 주장이다.
 *
 *   done           {}
 *       훑기를 마쳤다. 찾은 수는 장면이 센다.
 *
 *   rewind         {}
 *       자동 재생을 마친 뒤 advance 를 받으면 처음으로 되감는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ManyPatternsOnePassData = {
  type: string;
  /** 함께 찾을 패턴 목록. */
  patterns: string[];
  /** 한 번만 지나갈 텍스트. */
  text: string;
  /** 걸음 사이의 정지 시간 (읽을 시간을 주는 저작 결정). */
  stepMs: number;
};

/** 뿌리의 마디 id. 뿌리까지 이어진 글자가 없으므로 빈 문자열이다. */
export const ROOT = '';

/**
 * 한 나무로 포갠 마디 하나.
 *
 * 부모 · 글자 · 깊이를 담지 않는다 — id 가 뿌리부터 이어진 글자 그 자체라
 * 셋 다 id 에서 나온다 (`id.slice(0, -1)` · `id.slice(-1)` · `id.length`).
 * 담아 두면 같은 사실이 두 자리에 적힌다.
 */
export type ManyPatternsOnePassNode = {
  /** 뿌리에서 이 마디까지 이은 글자. 그대로 식별자다. 뿌리는 `''`. */
  id: string;
  /** 이 마디에서 무늬 하나가 끝나는가. */
  terminal: boolean;
};

/**
 * 무늬들을 한 나무로 포갠다. 같은 앞머리는 같은 마디가 된다.
 *
 * 무늬 목록 하나로 결정되는 순수 함수라 **장면이 그대로 부른다.** 발신에 실어
 * 보내면 나무가 두 자리에서 셈해진다 (프로토콜 4절).
 *
 * 돌려주는 차례는 무늬를 훑는 차례 그대로다 — 형제의 앞뒤가 곧 그림의 위아래라
 * 차례가 흔들리면 나무가 흔들린다.
 */
export function manyPatternsOnePassNodes(patterns: string[]): ManyPatternsOnePassNode[] {
  const ids: string[] = [ROOT];
  const seen = new Set<string>([ROOT]);
  for (const pattern of patterns) {
    for (let i = 0; i < pattern.length; i += 1) {
      const id = pattern.slice(0, i + 1);
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  const ends = new Set(patterns.filter((pattern) => pattern.length > 0));
  return ids.map((id) => ({ id, terminal: ends.has(id) }));
}

type TrieNode = {
  id: string;
  terminal: boolean;
  children: Map<string, string>;
  /** 길이 끊겼을 때 미끄러질 마디. */
  fail: string;
  /** 이 마디에서 끝나는 패턴들 (미끄럼길로 이어진 것까지). */
  outputs: string[];
};

/** 한 걸음 — 커서가 어디로 가고 거기서 무엇이 걸리나. 나머지는 장면이 센다. */
type ReadStep = {
  to: string;
  via?: string;
  hits: string[];
};

function nodeOf(nodes: Map<string, TrieNode>, id: string): TrieNode {
  const node = nodes.get(id);
  if (!node) throw new Error(`trie node missing: "${id}"`);
  return node;
}

/** 내주는 마디 목록에 훑기에 필요한 것(자식 · 미끄럼길 · 출력)을 얹는다. */
function buildTrie(patterns: string[]): Map<string, TrieNode> {
  const nodes = new Map<string, TrieNode>();
  for (const node of manyPatternsOnePassNodes(patterns)) {
    nodes.set(node.id, {
      id: node.id,
      terminal: node.terminal,
      children: new Map<string, string>(),
      fail: ROOT,
      outputs: [],
    });
  }
  // 부모와 이어 주는 글자는 id 의 마지막 글자다.
  for (const node of nodes.values()) {
    if (node.id === ROOT) continue;
    nodeOf(nodes, node.id.slice(0, -1)).children.set(node.id.slice(-1), node.id);
  }
  return nodes;
}

/**
 * 미끄럼길을 잇는다 — 길이 끊겼을 때 어느 마디로 물러날지.
 *
 * 이 조각은 미끄러짐의 장치 자체를 설명하지 않는다. 다만 한 번만 지나가려면
 * 물러날 곳을 알아야 하므로 셈은 여기서 온전히 한다.
 */
function linkFails(nodes: Map<string, TrieNode>): void {
  const root = nodeOf(nodes, ROOT);
  const queue: string[] = [];

  for (const childId of root.children.values()) {
    const child = nodeOf(nodes, childId);
    child.fail = ROOT;
    child.outputs = child.terminal ? [child.id] : [];
    queue.push(childId);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const current = nodeOf(nodes, queue[head] ?? ROOT);
    for (const [char, childId] of current.children) {
      const child = nodeOf(nodes, childId);
      let back = current.fail;
      for (;;) {
        const candidate = nodeOf(nodes, back);
        const next = candidate.children.get(char);
        if (next !== undefined && next !== childId) {
          child.fail = next;
          break;
        }
        if (back === ROOT) {
          child.fail = ROOT;
          break;
        }
        back = candidate.fail;
      }
      child.outputs = [
        ...(child.terminal ? [child.id] : []),
        ...nodeOf(nodes, child.fail).outputs,
      ];
      queue.push(childId);
    }
  }
}

/** 텍스트를 왼쪽부터 한 번만 지나가며 걸음을 기록한다. */
function scan(nodes: Map<string, TrieNode>, text: string): ReadStep[] {
  const steps: ReadStep[] = [];
  let cursor = ROOT;

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    let node = nodeOf(nodes, cursor);
    let next = node.children.get(char);
    let via: string | undefined;

    while (next === undefined && node.id !== ROOT) {
      node = nodeOf(nodes, node.fail);
      via = node.id;
      next = node.children.get(char);
    }

    cursor = next ?? ROOT;
    steps.push({ to: cursor, via, hits: nodeOf(nodes, cursor).outputs });
  }

  return steps;
}

export async function manyPatternsOnePassAlgorithm(
  base: FacetContext<ManyPatternsOnePassData>,
): Promise<void> {
  const ctx = base as ReactiveContext<ManyPatternsOnePassData>;
  const nodes = buildTrie(ctx.data.patterns);
  linkFails(nodes);
  const steps = scan(nodes, ctx.data.text);
  const stepMs = ctx.data.stepMs;

  /** 자동 재생을 마치면 손으로 짚는 차례가 된다. */
  let manual = false;
  /**
   * 첫 걸음은 문을 지나지 않는다 (S-piece). 문을 먼저 두면 stepMs 만큼 빈 화면이
   * 보인 뒤에야 그림이 선다. 되감은 직후의 첫 문도 같은 이유로 그냥 통과시킨다.
   */
  let skipGate = true;

  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (skipGate) {
      skipGate = false;
      return true;
    }
    if (!manual) return await ctx.sleep(stepMs);
    for (;;) {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 걸음으로 세지 않게.
      if (input.type === 'advance') return true;
    }
  }

  async function runPass(): Promise<void> {
    if (!(await gate())) return;
    await ctx.emit({ type: 'patterns-laid', payload: {} });

    if (!(await gate())) return;
    await ctx.emit({ type: 'trie-merged', payload: {} });

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (!step) continue;
      if (!(await gate())) return;
      await ctx.emit({
        type: 'read',
        target: `index:${index}`,
        payload: { to: step.to, via: step.via },
      });

      if (step.hits.length === 0) continue;
      if (!(await gate())) return;
      await ctx.emit({
        type: 'match',
        target: `node:${step.to}`,
        payload: { patterns: step.hits },
      });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: {} });
  }

  await runPass();

  manual = true;
  for (;;) {
    if (ctx.cancelled) return;
    const input = await ctx.waitForInput();
    if (input.type !== 'advance') continue;
    await ctx.emit({ type: 'rewind', payload: {} });
    skipGate = true;
    await runPass();
  }
}
