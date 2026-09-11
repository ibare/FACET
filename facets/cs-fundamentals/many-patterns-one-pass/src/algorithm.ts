/**
 * 여러 패턴을 한 번의 훑기로 찾는다 (조각).
 *
 * 패턴을 글자별로 이어 붙여 한 나무(트라이)로 포갠 뒤, 텍스트를 왼쪽부터 한 번만
 * 지나가며 그 나무를 따라 내려간다. 한 마디가 두 패턴의 끝일 수 있으므로 한
 * 자리에서 둘이 함께 걸린다. 나무의 모양과 걸린 자리는 모두 여기서 셈한다 —
 * 선언에 있는 것은 패턴 목록과 텍스트뿐이다.
 *
 * ── 이벤트 (전부 facet 고유 확장. silent 이벤트 없음)
 *
 *   patterns-laid  { passes: number }
 *       패턴마다 따로 훑을 때의 지나감 횟수 (= 패턴 수).
 *
 *   trie-merged    { nodes: NodeWire[]; paths: PathWire[]; nodeCount: number }
 *       NodeWire = { id: string; parent: string | null; char: string;
 *                    depth: number; terminal: boolean }
 *       PathWire = { pattern: string; nodeIds: string[] }
 *           패턴의 글자 하나하나가 어느 마디에 앉는지.
 *       nodeCount 는 뿌리를 포함한 마디 수.
 *       마디 id 는 뿌리에서 그 마디까지의 글자를 이은 것이고 뿌리는 빈 문자열이다.
 *
 *   read           { index: number; char: string;
 *                    move: 'stay' | 'descend' | 'slide';
 *                    from: string; to: string; via?: string }
 *       index 는 텍스트에서 읽은 자리. from/to/via 는 마디 id.
 *       via 는 길이 끊겨 미끄러져 들른 마디 (미끄러지지 않았으면 없다).
 *
 *   match          { nodeId: string; hits: HitWire[] }
 *       HitWire = { pattern: string; start: number; end: number }
 *       start/end 는 텍스트에서의 자리이며 양끝을 포함한다.
 *       한 마디에서 둘 이상이 끝나면 hits 가 여럿인 채로 한 번에 온다.
 *
 *   done           { found: number; passes: number }
 *       passes 는 언제나 1 — 그것이 이 조각의 주장이다.
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
const ROOT = '';

type TrieNode = {
  id: string;
  parent: string | null;
  char: string;
  depth: number;
  terminal: boolean;
  children: Map<string, string>;
  /** 길이 끊겼을 때 미끄러질 마디. */
  fail: string;
  /** 이 마디에서 끝나는 패턴들 (미끄럼길로 이어진 것까지). */
  outputs: string[];
};

type NodeWire = {
  id: string;
  parent: string | null;
  char: string;
  depth: number;
  terminal: boolean;
};

type PathWire = { pattern: string; nodeIds: string[] };

type HitWire = { pattern: string; start: number; end: number };

type ReadStep = {
  index: number;
  char: string;
  move: 'stay' | 'descend' | 'slide';
  from: string;
  to: string;
  via?: string;
  hits: HitWire[];
};

type Scene = {
  nodes: NodeWire[];
  paths: PathWire[];
  steps: ReadStep[];
  found: number;
};

function nodeOf(nodes: Map<string, TrieNode>, id: string): TrieNode {
  const node = nodes.get(id);
  if (!node) throw new Error(`trie node missing: "${id}"`);
  return node;
}

function makeNode(id: string, parent: string | null, char: string, depth: number): TrieNode {
  return {
    id,
    parent,
    char,
    depth,
    terminal: false,
    children: new Map<string, string>(),
    fail: ROOT,
    outputs: [],
  };
}

/** 패턴을 글자별로 이어 붙여 한 나무로 포갠다. 같은 앞머리는 같은 마디가 된다. */
function buildTrie(patterns: string[]): { nodes: Map<string, TrieNode>; paths: PathWire[] } {
  const nodes = new Map<string, TrieNode>();
  nodes.set(ROOT, makeNode(ROOT, null, '', 0));
  const paths: PathWire[] = [];

  for (const pattern of patterns) {
    const nodeIds: string[] = [];
    let cursor = ROOT;
    for (let i = 0; i < pattern.length; i += 1) {
      const char = pattern.charAt(i);
      const id = pattern.slice(0, i + 1);
      const parent = nodeOf(nodes, cursor);
      const existing = parent.children.get(char);
      if (existing === undefined) {
        nodes.set(id, makeNode(id, cursor, char, i + 1));
        parent.children.set(char, id);
        cursor = id;
      } else {
        cursor = existing;
      }
      nodeIds.push(cursor);
    }
    if (pattern.length > 0) nodeOf(nodes, cursor).terminal = true;
    paths.push({ pattern, nodeIds });
  }

  return { nodes, paths };
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
    const from = cursor;
    let node = nodeOf(nodes, cursor);
    let next = node.children.get(char);
    let via: string | undefined;

    while (next === undefined && node.id !== ROOT) {
      node = nodeOf(nodes, node.fail);
      via = node.id;
      next = node.children.get(char);
    }

    cursor = next ?? ROOT;
    const move: ReadStep['move'] =
      via !== undefined ? 'slide' : cursor === from ? 'stay' : 'descend';

    const hits = nodeOf(nodes, cursor).outputs.map((pattern) => ({
      pattern,
      start: index - pattern.length + 1,
      end: index,
    }));

    steps.push({ index, char, move, from, to: cursor, via, hits });
  }

  return steps;
}

function computeScene(patterns: string[], text: string): Scene {
  const { nodes, paths } = buildTrie(patterns);
  linkFails(nodes);
  const steps = scan(nodes, text);
  const wire: NodeWire[] = [...nodes.values()].map((node) => ({
    id: node.id,
    parent: node.parent,
    char: node.char,
    depth: node.depth,
    terminal: node.terminal,
  }));
  const found = steps.reduce((sum, step) => sum + step.hits.length, 0);
  return { nodes: wire, paths, steps, found };
}

export async function manyPatternsOnePassAlgorithm(
  base: FacetContext<ManyPatternsOnePassData>,
): Promise<void> {
  const ctx = base as ReactiveContext<ManyPatternsOnePassData>;
  const scene = computeScene(ctx.data.patterns, ctx.data.text);
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
    await ctx.emit({
      type: 'patterns-laid',
      payload: { passes: ctx.data.patterns.length },
    });

    if (!(await gate())) return;
    await ctx.emit({
      type: 'trie-merged',
      payload: { nodes: scene.nodes, paths: scene.paths, nodeCount: scene.nodes.length },
    });

    for (const step of scene.steps) {
      if (!(await gate())) return;
      await ctx.emit({
        type: 'read',
        target: `index:${step.index}`,
        payload: {
          index: step.index,
          char: step.char,
          move: step.move,
          from: step.from,
          to: step.to,
          via: step.via,
        },
      });

      if (step.hits.length === 0) continue;
      if (!(await gate())) return;
      await ctx.emit({
        type: 'match',
        target: `node:${step.to}`,
        payload: { nodeId: step.to, hits: step.hits },
      });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: { found: scene.found, passes: 1 } });
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
