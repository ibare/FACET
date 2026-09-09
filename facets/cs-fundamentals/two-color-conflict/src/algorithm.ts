/**
 * twoColorConflict — 홀수 길이 고리에서 두 색 칠하기가 부딪히는 순간.
 *
 * 고리를 돌며 이웃끼리 다른 색을 칠해 나가다가, 마지막 남은 변에서 두 끝이
 * 같은 색으로 맞선다. 길이가 홀수라는 사실이 그 충돌의 원인이다.
 *
 * ── 식별자
 *   node:<id>        정점 (P · Q · R · S · T)
 *   edge:<a>-<b>     무방향 변. a·b 는 선언된 방향 그대로 쓴다.
 *
 * ── 이벤트 (전부 facet 고유 확장. 화면 변화가 있으므로 silent 를 쓰지 않는다)
 *   walk-step   target node:<id>
 *               { node: string; prev: string | null; edge: string | null;
 *                 color: number; step: number; total: number }
 *               prev 자리에서 변을 타고 건너와 node 를 color 로 칠한다.
 *               prev 가 null 이면 출발 정점이라 건너올 변이 없다.
 *
 *   close-edge  target edge:<a>-<b>
 *               { a: string; b: string; edge: string;
 *                 colorA: number; colorB: number; same: boolean }
 *               마지막 남은 변. 양 끝에서 각자의 색이 마주 온다.
 *
 *   done        { ringLength: number; odd: boolean; conflict: boolean;
 *                 conflictEdge: string; a: string; b: string }
 *               고리의 길이와 홀짝. 둘 다 구조에서 셈한 값이다. `conflict` 는
 *               닫는 변의 두 끝이 실제로 같은 색이었는가 — 홀짝에서 따라 나오는
 *               값이지만, 화면이 말하는 것은 셈한 홀짝이 아니라 이쪽이다.
 *
 *   rewind      payload 없음. 처음 상태로 되감는다 (advance 진입 시).
 *
 * 화면 문안은 하나도 싣지 않는다 — 캡션 문구는 projector 가 정한다 (C10).
 *
 * ── 메커니즘
 *   reactive. 마운트 즉시 자동 재생하고, 끝난 뒤 advance 입력을 기다린다 (S-piece).
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece / C5).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TwoColorEdge = { a: string; b: string };

export type TwoColorConflictData = {
  type: 'two-color-ring';
  /** 고리를 이루는 정점. 이름은 선언이 정한다. */
  nodes: string[];
  /** 무방향 간선. 순서·방향은 선언 그대로 보존한다. */
  edges: TwoColorEdge[];
  /** 칠하기를 시작할 정점. */
  start: string;
  /** 걸음 간격 (S-piece — 읽을 시간을 주는 것은 저작 결정이다). */
  stepMs: number;
};

/** 구조에서 셈해 낸 값. 사람이 적은 걸음표가 아니라 답사의 결과다. */
export type TwoColorWalk = {
  /** start 에서 이웃을 따라간 방문 순서. */
  order: string[];
  /** order 와 같은 길이. 이웃끼리 달라야 하므로 번갈아 0 / 1. */
  colors: number[];
  /** 답사가 끝난 뒤 남는 변 — 끝 정점과 시작 정점을 잇는 변. */
  closing: TwoColorEdge | null;
  /** 그 변의 두 끝이 같은 색인가. 고리의 길이가 홀수일 때 참이 된다. */
  conflict: boolean;
};

function adjacency(edges: TwoColorEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const link = (from: string, to: string): void => {
    const list = adj.get(from);
    if (list) list.push(to);
    else adj.set(from, [to]);
  };
  for (const e of edges) {
    link(e.a, e.b);
    link(e.b, e.a);
  }
  return adj;
}

/**
 * 고리를 한 바퀴 답사하며 색을 번갈아 매긴다.
 *
 * 화면에 뜨는 값 — 고리의 길이 · 홀짝 · 마지막 변의 두 끝 색 — 은 전부 여기서
 * 구조를 셈해 얻는다. 어느 것도 미리 적어 두지 않는다 (S-piece).
 */
export function computeTwoColorWalk(data: TwoColorConflictData): TwoColorWalk {
  const adj = adjacency(data.edges);
  const order: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = data.start;
  while (cur !== undefined && !seen.has(cur)) {
    seen.add(cur);
    order.push(cur);
    const next: string | undefined = (adj.get(cur) ?? []).find((n) => !seen.has(n));
    cur = next;
  }

  const colors = order.map((_, i) => i % 2);
  const first = order[0];
  const last = order[order.length - 1];
  const closing =
    order.length > 2 && first !== undefined && last !== undefined
      ? (data.edges.find(
          (e) => (e.a === last && e.b === first) || (e.a === first && e.b === last),
        ) ?? null)
      : null;
  const conflict =
    closing !== null && colors[0] === colors[colors.length - 1];

  return { order, colors, closing, conflict };
}

/** 걸음을 내보내기 전에 통과해야 하는 문. false 면 취소된 것이다. */
type Gate = () => Promise<boolean>;

/**
 * 답사 한 바퀴를 걸음으로 펴 낸다.
 *
 * 배열을 도는 것은 사람이 적은 걸음표를 되풀이하는 것이 아니라 고리를 도는
 * 연산 그 자체다 (S-piece). emit 의 type 은 자리마다 리터럴로 적는다 (C2).
 */
async function playRing(
  ctx: ReactiveContext<TwoColorConflictData>,
  walk: TwoColorWalk,
  gate: Gate,
): Promise<void> {
  const { order, colors, closing, conflict } = walk;
  const total = order.length;

  for (let i = 0; i < total; i += 1) {
    const node = order[i];
    const color = colors[i];
    if (node === undefined || color === undefined) continue;
    if (!(await gate())) return;
    const prev = i === 0 ? null : (order[i - 1] ?? null);
    await ctx.emit({
      type: 'walk-step',
      target: `node:${node}`,
      payload: {
        node,
        prev,
        edge: prev === null ? null : `${prev}-${node}`,
        color,
        step: i + 1,
        total,
      },
    });
  }

  if (closing === null) return;
  const colorA = colors[order.indexOf(closing.a)] ?? 0;
  const colorB = colors[order.indexOf(closing.b)] ?? 0;

  if (!(await gate())) return;
  await ctx.emit({
    type: 'close-edge',
    target: `edge:${closing.a}-${closing.b}`,
    payload: {
      a: closing.a,
      b: closing.b,
      edge: `${closing.a}-${closing.b}`,
      colorA,
      colorB,
      same: colorA === colorB,
    },
  });

  if (!(await gate())) return;
  await ctx.emit({
    type: 'done',
    payload: {
      ringLength: total,
      odd: total % 2 === 1,
      conflictEdge: `${closing.a}-${closing.b}`,
      a: closing.a,
      b: closing.b,
      conflict,
    },
  });
}

export const twoColorConflictAlgorithm = async (
  ctx: FacetContext<TwoColorConflictData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<TwoColorConflictData>;
  const walk = computeTwoColorWalk(rctx.data);
  const stepMs = rctx.data.stepMs;

  // 1) 자동 재생. 마운트하면 스스로 시작하므로 누를 것이 없다.
  await playRing(rctx, walk, () => rctx.sleep(stepMs));

  // 2) 끝난 뒤에는 advance 로 곱씹는다. 처음 누르는 advance 는 되감고 첫 걸음까지
  //    보인다 — 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
  while (!rctx.cancelled) {
    const signal = await rctx.waitForInput();
    if (signal.type !== 'advance') continue;
    await rctx.emit({ type: 'rewind' });

    let passFirstGate = true;
    await playRing(rctx, walk, async () => {
      if (passFirstGate) {
        passFirstGate = false;
        return true;
      }
      while (!rctx.cancelled) {
        const next = await rctx.waitForInput();
        if (next.type === 'advance') return true;
      }
      return false;
    });
  }
};
