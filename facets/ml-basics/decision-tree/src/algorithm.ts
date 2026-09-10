/**
 * 의사결정 트리 — 질문을 거듭해 가르는 나무는 언제 멈춰야 하는가.
 *
 * 이름표 붙은 점 열여덟을 (축, 자름값) 후보로 갈라 가며 나무를 기른다. 한 번
 * 가르는 일은 조각 둘(`splitByQuestion` · `impurityDrops`)이 이미 말한 것이고,
 * 여기서는 그 한 번이 **되풀이되며 나무가 되고 멈추는 조건이 생긴다.**
 *
 * 진행 모델: 입력 반응형(`ReactiveMechanism`). mount 직후 기본 깊이 상한으로
 * 한 번 자라는 것을 보이고, 그 뒤로는 컨트롤바가 진행을 준다.
 *
 * ── 식별자 (원칙 4)
 *
 * `node:<id>` — 나무의 노드. id 는 전위 번호 (뿌리가 0, 왼쪽 자식이 부모+1).
 *
 * ── 이벤트 목록 + payload 스키마 (C2)
 *
 * | type              | payload                                           | silent |
 * |-------------------|---------------------------------------------------|--------|
 * | `phase`           | `{ phase: string }`                               | O      |
 * | `tree-reset`      | `{ depthLimit: number }`                          | X      |
 * | `node-open`       | `NodeOpened`                                      | X      |
 * | `axis-sorted`     | `{ id: number; axis: 0 \| 1 }`                     | X      |
 * | `cut-try`         | `{ id; axis; cut; wgini }`                        | X      |
 * | `cut-best`        | `{ id; axis; cut; wgini; drop }`                  | X      |
 * | `node-partition`  | `{ id; axis; cut }`                               | X      |
 * | `node-split`      | `{ id; axis; cut; wgini; drop }`                  | X      |
 * | `recurse-into`    | `{ id: number; side: 'L' \| 'R' }`                 | X      |
 * | `node-leaf`       | `{ id; label; a; b }`                             | X      |
 * | `tree-snapshot`   | `TreeSummary & { nodes: TreeNodeShape[] }`        | X      |
 * | `done`            | `TreeSummary`                                     | X      |
 *
 * `tree-snapshot` 은 **깊이 상한 슬라이더가 움직였을 때** 나간다. 재생을 처음부터
 * 돌리는 대신 그 깊이에서 다 자란 나무를 통째로 갈아 끼운다 — 3 과 4 와 5 를
 * 오가며 견주는 것이 이 완제품의 조작이라, 처음으로 돌아가면 견줄 수가 없다.
 *
 * 화면 문안은 이 파일에 없다. `done` / `tree-snapshot` 이 `verdictKey` 라는
 * **키**만 실어 보내고 projector 가 `tr` 로 해석한다 (C10).
 *
 * ── 받는 입력 (`mechanism.dispatch` → `ctx.pollInput` / `ctx.waitForInput`)
 *
 * `depth` — 깊이 상한 슬라이더 (`{ value: number, ... }`). **그것 하나뿐이다.**
 *
 * 재생 · 멈춤 · 한 걸음 · 되돌리기 · 속도는 전부 `ReactiveMechanism` 이 진다.
 * 알고리즘은 걸음마다 `ctx.sleep` 을 부르는 것으로 족하다 — 멈춤은 그 sleep 의
 * 경계에서 걸리고, 한 걸음은 그 경계를 한 번만 열어 준다. 알고리즘이 재생
 * 상태를 스스로 들고 있으면 메커니즘의 것과 둘로 갈린다.
 *
 * ── phase 어휘 (C3 — `irs.ts` 와 글자까지 같다)
 *
 * `'node-open' | 'impurity' | 'depth-check' | 'sort-axis' | 'try-cut' |
 *  'keep-best' | 'leaf' | 'partition' | 'split' | 'recurse'`
 *
 * ── 메트릭 (C5)
 *
 * `candidate-count` 시험한 자름 후보 수 · `leaf-count` 지금 나무의 잎 수 ·
 * `correct-count` 지금 깊이 상한에서 맞힌 수.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 이름표 붙은 점 하나. `label` 0 이 A, 1 이 B. */
export type LabeledPoint = { x: number; y: number; label: 0 | 1 };

export type DecisionTreeData = {
  type: 'decision-tree';
  points: LabeledPoint[];
  /** 깊이 상한 슬라이더의 눈금. */
  depthChoices: number[];
  /** 슬라이더의 처음 자리. */
  initialDepthLimit: number;
  timings: {
    /** 자름 후보 하나를 시험하는 데 드는 시간. */
    scanMs: number;
    /** 노드를 열고 · 가르고 · 잎으로 마감하는 걸음의 시간. */
    structureMs: number;
  };
};

/** 배열 넷으로 편 나무의 한 칸. `leaf` 면 `label` 이, 아니면 `axis`/`cut` 이 뜻을 가진다. */
export type TreeNodeShape = {
  id: number;
  parent: number;
  side: 'root' | 'L' | 'R';
  depth: number;
  /** 이 노드에 든 A 의 수. */
  a: number;
  /** 이 노드에 든 B 의 수. */
  b: number;
  gini: number;
  leaf: boolean;
  /** 잎일 때의 이름표. 내부 노드에서는 다수결 이름표. */
  label: 0 | 1;
  axis: 0 | 1;
  cut: number;
  /** 가른 뒤의 크기 가중 지니. 잎이면 자기 지니 그대로. */
  wgini: number;
  /** 지니가 줄어든 폭. */
  drop: number;
  left: number;
  right: number;
};

/** `node-open` 이 싣는 것 — 아직 잎인지 가를지 정해지지 않은 상태다. */
export type NodeOpened = {
  id: number;
  parent: number;
  side: 'root' | 'L' | 'R';
  depth: number;
  a: number;
  b: number;
  gini: number;
};

export type TreeSummary = {
  depthLimit: number;
  leafCount: number;
  correct: number;
  total: number;
  /** 이 깊이가 무엇을 말하는지 — 문안이 아니라 키다 (C10). */
  verdictKey: string;
};

type Step =
  | { kind: 'open'; node: NodeOpened }
  | { kind: 'axis'; id: number; axis: 0 | 1 }
  | { kind: 'try'; id: number; axis: 0 | 1; cut: number; wgini: number }
  | { kind: 'best'; id: number; axis: 0 | 1; cut: number; wgini: number; drop: number }
  | { kind: 'part'; id: number; axis: 0 | 1; cut: number }
  | { kind: 'split'; id: number; axis: 0 | 1; cut: number; wgini: number; drop: number }
  | { kind: 'recurse'; id: number; side: 'L' | 'R' }
  | { kind: 'leaf'; id: number; label: 0 | 1; a: number; b: number };

type Grown = { nodes: TreeNodeShape[]; steps: Step[]; candidates: number };

/** 섞임. `1 - (a/n)² - ((n-a)/n)²` 를 펼쳐 쓴다 — IR 과 같은 식이다. */
function gini(a: number, cnt: number): number {
  if (cnt <= 0) return 0;
  const pa = a / cnt;
  const pb = (cnt - a) / cnt;
  return 1 - pa * pa - pb * pb;
}

/**
 * 탐욕적으로 나무를 기르고, 기르는 동안 일어난 일을 걸음으로 적어 둔다.
 *
 * `irs.ts` 의 `growTree` 와 같은 셈이다 — 색인 배열을 축으로 줄 세운 뒤 이웃
 * 한가운데마다 가중 지니를 재고, 가장 작은 것으로 구간을 제자리에서 두 토막
 * 내어 자기 자신을 두 번 부른다.
 */
export function growDecisionTree(points: LabeledPoint[], depthLimit: number): Grown {
  const nodes: TreeNodeShape[] = [];
  const steps: Step[] = [];
  let candidates = 0;
  const order = points.map((_, i) => i);

  const coord = (axis: 0 | 1, i: number): number => (axis === 0 ? points[i].x : points[i].y);

  function grow(
    lo: number,
    hi: number,
    depth: number,
    me: number,
    parent: number,
    side: 'root' | 'L' | 'R',
  ): number {
    const cnt = hi - lo;
    let a = 0;
    for (let j = lo; j < hi; j++) if (points[order[j]].label === 0) a += 1;
    const g = gini(a, cnt);

    const node: TreeNodeShape = {
      id: me,
      parent,
      side,
      depth,
      a,
      b: cnt - a,
      gini: g,
      leaf: true,
      label: a * 2 >= cnt ? 0 : 1,
      axis: 0,
      cut: 0,
      wgini: g,
      drop: 0,
      left: -1,
      right: -1,
    };
    nodes.push(node);
    steps.push({
      kind: 'open',
      node: { id: me, parent, side, depth, a, b: cnt - a, gini: g },
    });

    let bestG = 2;
    let bestF = -1;
    let bestT = 0;
    if (depth < depthLimit && g > 0) {
      for (const axis of [0, 1] as const) {
        for (let j = lo + 1; j < hi; j++) {
          let k = j;
          while (k > lo && coord(axis, order[k]) < coord(axis, order[k - 1])) {
            const t = order[k];
            order[k] = order[k - 1];
            order[k - 1] = t;
            k -= 1;
          }
        }
        steps.push({ kind: 'axis', id: me, axis });
        let la = 0;
        let lc = 0;
        for (let j = lo + 1; j < hi; j++) {
          if (points[order[j - 1]].label === 0) la += 1;
          lc += 1;
          const v0 = coord(axis, order[j - 1]);
          const v1 = coord(axis, order[j]);
          if (v0 < v1) {
            const cut = (v0 + v1) / 2;
            const ra = a - la;
            const rc = cnt - lc;
            const wg = (lc / cnt) * gini(la, lc) + (rc / cnt) * gini(ra, rc);
            candidates += 1;
            steps.push({ kind: 'try', id: me, axis, cut, wgini: wg });
            if (wg < bestG) {
              bestG = wg;
              bestF = axis;
              bestT = cut;
              steps.push({ kind: 'best', id: me, axis, cut, wgini: wg, drop: g - wg });
            }
          }
        }
      }
    }

    if (bestF < 0) {
      steps.push({ kind: 'leaf', id: me, label: node.label, a, b: cnt - a });
      return me + 1;
    }

    const chosen: 0 | 1 = bestF === 0 ? 0 : 1;
    let mid = lo;
    for (let j = lo; j < hi; j++) {
      if (coord(chosen, order[j]) < bestT) {
        const t = order[mid];
        order[mid] = order[j];
        order[j] = t;
        mid += 1;
      }
    }
    node.leaf = false;
    node.axis = chosen;
    node.cut = bestT;
    node.wgini = bestG;
    node.drop = g - bestG;
    node.left = me + 1;
    steps.push({ kind: 'part', id: me, axis: chosen, cut: bestT });
    steps.push({ kind: 'split', id: me, axis: chosen, cut: bestT, wgini: bestG, drop: g - bestG });
    steps.push({ kind: 'recurse', id: me, side: 'L' });
    const nxt = grow(lo, mid, depth + 1, me + 1, me, 'L');
    node.right = nxt;
    steps.push({ kind: 'recurse', id: me, side: 'R' });
    return grow(mid, hi, depth + 1, nxt, me, 'R');
  }

  grow(0, points.length, 0, 0, -1, 'root');
  return { nodes, steps, candidates };
}

/** 다 자란 나무로 열여덟 점을 떨어뜨려 맞힌 수를 센다. */
export function countCorrect(nodes: TreeNodeShape[], points: LabeledPoint[]): number {
  let ok = 0;
  for (const p of points) {
    let i = 0;
    // 잎을 만날 때까지 내려간다. 배열 넷이 나무의 전부다.
    while (!nodes[i].leaf) {
      i = (nodes[i].axis === 0 ? p.x : p.y) < nodes[i].cut ? nodes[i].left : nodes[i].right;
    }
    if (nodes[i].label === p.label) ok += 1;
  }
  return ok;
}

function leafCountOf(nodes: TreeNodeShape[]): number {
  let n = 0;
  for (const node of nodes) if (node.leaf) n += 1;
  return n;
}

function smallestLeaf(nodes: TreeNodeShape[]): number {
  let m = Number.POSITIVE_INFINITY;
  for (const node of nodes) if (node.leaf) m = Math.min(m, node.a + node.b);
  return Number.isFinite(m) ? m : 0;
}

/**
 * 이 깊이가 무엇을 말하는지 — 셋 중 하나.
 *
 * 상수를 박아 두지 않는다. 한 걸음 얕은 나무를 실제로 다시 길러 견준다.
 */
function verdictKeyOf(points: LabeledPoint[], depthLimit: number, nodes: TreeNodeShape[]): string {
  const correct = countCorrect(nodes, points);
  if (depthLimit >= 2) {
    const shallower = growDecisionTree(points, depthLimit - 1).nodes;
    if (correct === countCorrect(shallower, points)) return 'verdict.noGain';
    if (smallestLeaf(nodes) === 1) return 'verdict.onePoint';
  }
  return 'verdict.gain';
}

/** 다 자란 나무의 요약. 화면에 뜨는 수는 전부 여기서 온다. */
export function summarize(points: LabeledPoint[], depthLimit: number, nodes: TreeNodeShape[]): TreeSummary {
  return {
    depthLimit,
    leafCount: leafCountOf(nodes),
    correct: countCorrect(nodes, points),
    total: points.length,
    verdictKey: verdictKeyOf(points, depthLimit, nodes),
  };
}

/** 눈금 밖의 값은 눈금 안으로 눌러 담는다. */
function clampDepth(value: number, choices: number[]): number {
  return Math.min(Math.max(...choices), Math.max(Math.min(...choices), Math.round(value)));
}

/** 슬라이더가 보낸 `{ value, segmentIndex, ... }` 에서 깊이를 꺼낸다 (C9). */
function readDepth(payload: unknown, choices: number[], fallback: number): number {
  if (typeof payload !== 'object' || payload === null) return fallback;
  const raw = (payload as Record<string, unknown>).value;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return clampDepth(raw, choices);
}

export const decisionTree = async (ctxBase: FacetContext<DecisionTreeData>): Promise<void> => {
  const ctx = ctxBase as ReactiveContext<DecisionTreeData>;
  const data = ctx.data;
  const points = data.points;
  const choices = data.depthChoices;
  const scanMs = data.timings.scanMs;
  const structureMs = data.timings.structureMs;

  let depthLimit = clampDepth(data.initialDepthLimit, choices);
  let tree = growDecisionTree(points, depthLimit);
  let cursor = 0;

  // 기르는 동안 한 칸씩 자라는 셈. 슬라이더로 갈아 끼울 때는 다 자란 값으로 민다.
  let liveCandidates = 0;
  let liveLeaves = 0;
  let liveCorrect = 0;

  /** ctx.metric 은 더하기라, 값을 갈아 끼우려면 지금 값과의 차를 보낸다. */
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    const cur = shown[name] ?? 0;
    if (value === cur) return;
    ctx.metric(name, value - cur);
    shown[name] = value;
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  async function playStep(s: Step): Promise<void> {
    switch (s.kind) {
      case 'open':
        await phase('node-open');
        await phase('impurity');
        await phase('depth-check');
        await ctx.emit({ type: 'node-open', target: `node:${s.node.id}`, payload: s.node });
        return;
      case 'axis':
        await phase('sort-axis');
        await ctx.emit({
          type: 'axis-sorted',
          target: `node:${s.id}`,
          payload: { id: s.id, axis: s.axis },
        });
        return;
      case 'try':
        await phase('try-cut');
        liveCandidates += 1;
        setMetric('candidate-count', liveCandidates);
        await ctx.emit({
          type: 'cut-try',
          target: `node:${s.id}`,
          payload: { id: s.id, axis: s.axis, cut: s.cut, wgini: s.wgini },
        });
        return;
      case 'best':
        await phase('keep-best');
        await ctx.emit({
          type: 'cut-best',
          target: `node:${s.id}`,
          payload: { id: s.id, axis: s.axis, cut: s.cut, wgini: s.wgini, drop: s.drop },
        });
        return;
      case 'part':
        await phase('partition');
        await ctx.emit({
          type: 'node-partition',
          target: `node:${s.id}`,
          payload: { id: s.id, axis: s.axis, cut: s.cut },
        });
        return;
      case 'split':
        await phase('split');
        await ctx.emit({
          type: 'node-split',
          target: `node:${s.id}`,
          payload: { id: s.id, axis: s.axis, cut: s.cut, wgini: s.wgini, drop: s.drop },
        });
        return;
      case 'recurse':
        await phase('recurse');
        await ctx.emit({
          type: 'recurse-into',
          target: `node:${s.id}`,
          payload: { id: s.id, side: s.side },
        });
        return;
      case 'leaf':
        await phase('leaf');
        liveLeaves += 1;
        liveCorrect += Math.max(s.a, s.b);
        setMetric('leaf-count', liveLeaves);
        setMetric('correct-count', liveCorrect);
        await ctx.emit({
          type: 'node-leaf',
          target: `node:${s.id}`,
          payload: { id: s.id, label: s.label, a: s.a, b: s.b },
        });
        return;
    }
  }

  /**
   * 슬라이더가 움직였을 때 — 그 깊이에서 **다 자란** 나무를 통째로 갈아 끼운다.
   *
   * 재생을 처음부터 돌리지 않는 것이 요점이다. 3 과 4 와 5 를 오가며 견주는
   * 것이 이 완제품의 조작이라, 처음으로 돌아가면 견줄 수가 없다.
   */
  async function showFinished(limit: number): Promise<void> {
    depthLimit = limit;
    tree = growDecisionTree(points, limit);
    cursor = tree.steps.length;
    const summary = summarize(points, limit, tree.nodes);
    setMetric('candidate-count', tree.candidates);
    setMetric('leaf-count', summary.leafCount);
    setMetric('correct-count', summary.correct);
    await ctx.emit({ type: 'tree-snapshot', payload: { ...summary, nodes: tree.nodes } });
  }

  /** 위젯 입력을 가른다. 재생 셋은 메커니즘의 것이라 여기 오지 않는다. */
  async function handle(ev: ReactiveInputEvent): Promise<boolean> {
    if (ev.type !== 'depth') return false;
    await showFinished(readDepth(ev.payload, choices, depthLimit));
    return true;
  }

  await ctx.emit({ type: 'tree-reset', payload: { depthLimit } });

  try {
    // 이 나무를 다 기른 것을 이미 알렸는가. 슬라이더로 갈아 끼운 나무는
    // `tree-snapshot` 이 이미 요약을 실어 갔으므로 다시 알리지 않는다.
    let announced = false;

    for (;;) {
      if (ctx.cancelled) return;

      if (cursor >= tree.steps.length) {
        if (!announced) {
          announced = true;
          await ctx.emit({ type: 'done', payload: summarize(points, depthLimit, tree.nodes) });
        }
        // 여기서부터는 위젯 말고 할 일이 없다. 메커니즘이 이 기다림을 보고
        // control-bar 를 "되돌리기만 남은" 꼴로 바꾼다.
        if (await handle(await ctx.waitForInput())) announced = true;
        continue;
      }

      // 걸음 사이에 들어온 위젯 입력을 먼저 치운다.
      for (let queued = ctx.pollInput(); queued !== null; queued = ctx.pollInput()) {
        if (await handle(queued)) announced = true;
        if (ctx.cancelled) return;
      }
      if (cursor >= tree.steps.length) continue;

      const step = tree.steps[cursor++];
      await playStep(step);
      // 멈춤과 한 걸음은 이 sleep 의 경계에서 걸린다 (ReactiveMechanism).
      const alive = await ctx.sleep(step.kind === 'try' ? scanMs : structureMs);
      if (!alive) return;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
