/**
 * separateComponents — "한 번의 탐색은 자기 덩어리 밖으로 나가지 못한다" 를
 * 말하는 조각(piece) facet 의 알고리즘.
 *
 * 정점 목록을 앞에서부터 훑다가 아직 켜지지 않은 것을 만나면 거기서 새로
 * 출발해 너비 우선으로 번진다. 한 번의 번짐이 끝나면 `sweep-end` 를 내고
 * **길게 멈춘다** — 탐색이 다 끝났는데도 켜지지 않은 것들이 그대로 남아 있는
 * 그 장면이 이 조각의 주장이다. 곧바로 다음 출발로 넘어가면 주장이 사라진다.
 *
 * 걸음표를 손으로 적지 않는다. 걸음은 인접 목록 순회에서 그대로 나오고,
 * 자동 재생과 한 걸음씩 보기는 **같은 순회를 서로 다른 `gate` 로 굴린 것**이다.
 * gate 는 언제나 emit 앞에 선다.
 *
 * ── 이벤트 (facet 고유 확장. 전부 silent 아님 = 걸음 경계)
 *
 * | type        | target      | payload                                                                             |
 * | ----------- | ----------- | ----------------------------------------------------------------------------------- |
 * | `seed`      | `node:<id>` | `{ node: string; round: number; component: number; lit: number; remaining: number }` |
 * | `spread`    | `node:<to>` | `{ from: string; to: string; component: number; lit: number; remaining: number }`    |
 * | `sweep-end` | 없음        | `{ round: number; size: number; lit: number; remaining: number }`                    |
 * | `done`      | 없음        | `{ starts: number; sizes: number[]; total: number }`                                 |
 * | `rewind`    | 없음        | 없음 — 자동 재생을 마친 뒤 처음으로 되감을 때                                        |
 *
 * `component` 는 0 부터 매기는 덩어리 번호 (round - 1). 화면의 색이 그것으로 갈린다.
 * `lit` · `remaining` · `size` · `sizes` · `starts` 는 전부 이 순회가 구조에서
 * 셈한 값이다. 선언에 적어 둔 것이 아니다 — 선언에 있는 것은 정점·간선·걸음 간격뿐.
 *
 * 메커니즘은 reactive. 조각이므로 metric 은 부르지 않는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SeparateComponentsData = {
  type: string;
  /** 정점 식별자. 이 순서가 곧 "남은 것 중 어디서 다시 출발할지" 를 정한다. */
  nodes: string[];
  /** 무방향 간선. `[a, b]` 두 칸짜리 배열. */
  edges: string[][];
  /** 걸음 간격 (ms). */
  stepMs: number;
  /** 한 번의 탐색이 끝난 뒤 멈춰 있는 시간 (ms). 이 조각의 주장이 서는 자리다. */
  holdMs: number;
};

/** 선언이 깨져 들어왔을 때만 쓰이는 값. 정상 경로에서는 initialData 가 이긴다. */
const FALLBACK_STEP_MS = 800;
const FALLBACK_HOLD_MS = 1500;

/**
 * 다음 걸음으로 넘어가도 되는지 묻는 문. `false` 면 취소된 것이므로 순회를 접는다.
 * `long` 이 참이면 오래 연다 (탐색이 끝난 자리에서 화면을 붙잡아 두는 용도).
 */
type Gate = (long?: boolean) => Promise<boolean>;

function adjacencyOf(data: SeparateComponentsData): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const id of data.nodes) adj.set(id, []);
  for (const edge of data.edges) {
    const a = edge[0];
    const b = edge[1];
    if (a === undefined || b === undefined) continue;
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  return adj;
}

/**
 * 정점 목록을 훑으며 아직 켜지지 않은 것마다 새로 출발해 번진다.
 * 자동 재생과 한 걸음씩 보기가 이 함수 하나를 공유한다.
 */
async function sweepAll(
  ctx: ReactiveContext<SeparateComponentsData>,
  gate: Gate,
): Promise<boolean> {
  const data = ctx.data;
  const adj = adjacencyOf(data);
  const total = data.nodes.length;
  const lit = new Set<string>();
  const sizes: number[] = [];
  let round = 0;
  /** 직전 걸음이 sweep-end 였는지. 참이면 다음 문을 오래 연다. */
  let holdNext = false;

  for (const start of data.nodes) {
    if (lit.has(start)) continue;

    if (!(await gate(holdNext))) return false;
    holdNext = false;
    round += 1;
    lit.add(start);
    await ctx.emit({
      type: 'seed',
      target: `node:${start}`,
      payload: {
        node: start,
        round,
        component: round - 1,
        lit: lit.size,
        remaining: total - lit.size,
      },
    });

    const queue: string[] = [start];
    let size = 1;
    while (queue.length > 0) {
      const from = queue.shift();
      if (from === undefined) break;
      for (const to of adj.get(from) ?? []) {
        if (lit.has(to)) continue;
        if (!(await gate())) return false;
        lit.add(to);
        size += 1;
        queue.push(to);
        await ctx.emit({
          type: 'spread',
          target: `node:${to}`,
          payload: {
            from,
            to,
            component: round - 1,
            lit: lit.size,
            remaining: total - lit.size,
          },
        });
      }
    }
    sizes.push(size);

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'sweep-end',
      payload: { round, size, lit: lit.size, remaining: total - lit.size },
    });
    // 여기서 화면이 멈춘다. 다 훑었는데 켜지지 않은 것들이 그대로 남아 있다.
    holdNext = true;
  }

  if (!(await gate(holdNext))) return false;
  await ctx.emit({
    type: 'done',
    payload: { starts: round, sizes: [...sizes], total: lit.size },
  });
  return true;
}

export async function separateComponents(
  ctx: FacetContext<SeparateComponentsData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<SeparateComponentsData>;
  const stepMs = Number.isFinite(rc.data.stepMs) ? rc.data.stepMs : FALLBACK_STEP_MS;
  const holdMs = Number.isFinite(rc.data.holdMs) ? rc.data.holdMs : FALLBACK_HOLD_MS;

  // 1) 자동 재생 — 아무것도 누르지 않아도 화면이 할 말을 마친다.
  const autoGate: Gate = async (long = false) => {
    if (rc.cancelled) return false;
    const ok = await rc.sleep(long ? holdMs : stepMs);
    return ok && !rc.cancelled;
  };
  if (!(await sweepAll(rc, autoGate))) return;

  // 2) 다 끝난 뒤 한 걸음씩 — 곱씹으며 읽고 싶은 사람을 위한 것.
  //    처음 누르는 advance 는 되감고 첫 걸음까지 보인다 (S-piece).
  for (;;) {
    const input = await rc.waitForInput();
    if (input.type !== 'advance') continue;
    await rc.emit({ type: 'rewind' });

    let firstGateIsFree = true;
    const manualGate: Gate = async () => {
      if (firstGateIsFree) {
        firstGateIsFree = false;
        return !rc.cancelled;
      }
      for (;;) {
        const next = await rc.waitForInput();
        if (next.type === 'advance') return !rc.cancelled;
      }
    };
    if (!(await sweepAll(rc, manualGate))) return;
  }
}
