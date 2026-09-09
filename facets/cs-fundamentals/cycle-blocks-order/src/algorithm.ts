/**
 * cycleBlocksOrder — 고리가 있으면 순서가 없다.
 *
 * 방향 그래프에서 "이고 있는 수"(들어오는 화살표의 수, 진입차수) 가 0 인 것만
 * 꺼낼 수 있다. 꺼내면 그것이 보낸 화살표가 사라져 남은 것들의 짐이 줄어든다.
 * 고리가 없으면 이 과정이 전부를 꺼내고, 고리가 있으면 **어느 순간 0 이 하나도
 * 남지 않아 멈춘다** — 그 멈추는 순간이 이 조각의 주장이다.
 *
 * 화면에 뜨는 수는 전부 여기서 `data.edges` 를 세어 얻는다. 손으로 적은 표를
 * 쓰지 않는다 (S-piece "화면에 쓰는 값은 실측한다").
 *
 * ── 식별자
 *   node:<정점 id>     — 정점 하나
 *
 * ── 발신 이벤트 (전부 facet 고유 확장. C2 에 따라 여기 적는다)
 *
 * | type      | payload                                                    | silent |
 * |-----------|------------------------------------------------------------|--------|
 * | `survey`  | `{ loads: { id: string; load: number }[] }`                  | 아니오 |
 * |           | 간선을 세어 얻은 각 정점의 짐. 첫 걸음이자 전제.             |        |
 * | `scan`    | `{ ready: string[]; remaining: string[] }`                   | 아니오 |
 * |           | 지금 꺼낼 수 있는 것(짐 0)들. `ready` 가 비면 그것이 멈춤이다. |        |
 * | `extract` | `{ id: string; slot: number;`                                | 아니오 |
 * |           | `  released: { to: string; load: number }[] }`               |        |
 * |           | `id` 를 꺼내 `slot` 번째 자리에 놓는다. `released` 는 그 바람에 |        |
 * |           | 짐이 줄어든 정점과 줄어든 뒤의 값.                            |        |
 * | `wait`    | `{ from: string; on: string; closes: boolean;`               | 아니오 |
 * |           | `  trailing: boolean; ring: string[] }`                      |        |
 * |           | `from` 이 `on` 을 기다린다. `closes` 면 이 한 발로 고리가 닫힌다. |      |
 * |           | `trailing` 이면 `from` 은 고리 밖에서 고리 뒤에 매달린 것.     |        |
 * | `done`    | `{ extracted: string[]; stuck: string[]; total: number }`     | 아니오 |
 * |           | 끝난 자리. 꺼낸 것과 끝내 못 꺼낸 것.                         |        |
 * | `rewind`  | 없음                                                          | 아니오 |
 * |           | 자동 재생이 끝난 뒤 `advance` 를 받아 처음으로 되감는다.       |        |
 *
 * ── phase / metric
 * 조각이므로 코드 패널도 metric 도 없다 (S-piece). `ctx.metric` 을 부르지 않는다.
 */

import type { AlgorithmFn, FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CycleBlocksOrderEdge = { from: string; to: string };

export type CycleBlocksOrderData = {
  type: 'digraph';
  /** 정점 id 목록. 꺼낼 수 있는 것이 둘 이상이면 알파벳 순으로 고른다. */
  vertices: string[];
  /** 방향 간선. `from` 이 `to` 에게 짐 하나를 지운다. */
  edges: CycleBlocksOrderEdge[];
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const FALLBACK_STEP_MS = 850;

/** 진행을 한 걸음 허락하는 문. 자동 재생이면 재우고, 손으로 짚는 중이면 누름을 기다린다. */
type Gate = () => Promise<boolean>;

/**
 * 간선을 세어 각 정점이 이고 있는 수를 구한다.
 * 화면에 뜨는 모든 수의 출처가 이 함수 하나다.
 */
function countLoads(vertices: string[], edges: CycleBlocksOrderEdge[]): Map<string, number> {
  const load = new Map<string, number>();
  for (const v of vertices) load.set(v, 0);
  for (const e of edges) {
    const cur = load.get(e.to);
    if (cur !== undefined) load.set(e.to, cur + 1);
  }
  return load;
}

/**
 * 한 번의 재생. 걸음마다 `gate()` 를 먼저 통과시키고 이벤트 하나를 발신한다.
 * @returns 끝까지 갔으면 true, 중간에 취소되었으면 false.
 */
async function playOnce(rc: ReactiveContext<CycleBlocksOrderData>, gate: Gate): Promise<boolean> {
  const data = rc.data;
  const vertices = [...data.vertices].sort();
  const edges = data.edges;
  const load = countLoads(vertices, edges);

  // ── 전제. 각 정점이 무엇을 이고 있는지부터 보인다.
  if (!(await gate())) return false;
  await rc.emit({
    type: 'survey',
    target: vertices.map((v) => `node:${v}`),
    payload: { loads: vertices.map((id) => ({ id, load: load.get(id) ?? 0 })) },
  });

  // ── 꺼낼 수 있는 것을 꺼낸다. 꺼낼 것이 없어지면 그 자리가 멈춤이다.
  const extracted: string[] = [];
  const removed = new Set<string>();
  for (;;) {
    const ready = vertices.filter((v) => !removed.has(v) && (load.get(v) ?? 0) === 0);
    const remaining = vertices.filter((v) => !removed.has(v));

    if (!(await gate())) return false;
    await rc.emit({
      type: 'scan',
      target: ready.map((v) => `node:${v}`),
      payload: { ready, remaining },
    });
    if (ready.length === 0) break;

    const pick = ready[0]!;
    const dropped = new Map<string, number>();
    for (const e of edges) {
      if (e.from !== pick || e.to === pick || removed.has(e.to)) continue;
      const next = (load.get(e.to) ?? 0) - 1;
      load.set(e.to, next);
      dropped.set(e.to, next);
    }
    removed.add(pick);
    extracted.push(pick);

    if (!(await gate())) return false;
    await rc.emit({
      type: 'extract',
      target: `node:${pick}`,
      payload: {
        id: pick,
        slot: extracted.length - 1,
        released: [...dropped].map(([to, value]) => ({ to, load: value })),
      },
    });
  }

  const stuck = vertices.filter((v) => !removed.has(v));

  // ── 왜 멈췄는가. 남은 것에서 들어오는 화살표를 거슬러 올라가면 제자리로 돌아온다.
  if (stuck.length > 0) {
    const stuckSet = new Set(stuck);
    /** `v` 가 기다리고 있는 것들 — 아직 안 나간 선행 정점. 여럿이면 알파벳 순. */
    const waitsOn = (v: string): string[] =>
      [...new Set(edges.filter((e) => e.to === v && stuckSet.has(e.from)).map((e) => e.from))].sort();

    const path: string[] = [];
    let cur = stuck[0]!;
    let deadEnd = false;
    for (;;) {
      if (path.includes(cur)) break; // 제자리로 돌아왔다 — 고리다.
      path.push(cur);
      const preds = waitsOn(cur);
      if (preds.length === 0) {
        // 짐이 0 이 아닌데 기다릴 것이 없을 수는 없다. 방어적으로만 둔다.
        deadEnd = true;
        break;
      }
      cur = preds[0]!;
    }
    const ring = deadEnd ? [] : path.slice(path.indexOf(cur));
    const ringSet = new Set(ring);

    for (let i = 0; i < path.length; i += 1) {
      const from = path[i]!;
      const on = i + 1 < path.length ? path[i + 1]! : cur;
      if (!(await gate())) return false;
      await rc.emit({
        type: 'wait',
        target: [`node:${from}`, `node:${on}`],
        payload: {
          from,
          on,
          closes: !deadEnd && i === path.length - 1,
          trailing: !ringSet.has(from),
          ring,
        },
      });
    }

    // 고리 밖에서 고리 뒤에 매달린 것들.
    for (const v of stuck) {
      if (path.includes(v)) continue;
      const on = waitsOn(v)[0];
      if (on === undefined) continue;
      if (!(await gate())) return false;
      await rc.emit({
        type: 'wait',
        target: [`node:${v}`, `node:${on}`],
        payload: { from: v, on, closes: false, trailing: true, ring },
      });
    }
  }

  if (!(await gate())) return false;
  await rc.emit({
    type: 'done',
    payload: { extracted, stuck, total: vertices.length },
  });
  return true;
}

/**
 * reactive 알고리즘 본체.
 *
 * mount 하면 스스로 한 번 재생하고, 그 뒤로는 `advance` 를 받을 때마다 한 걸음씩
 * 짚는다. 자동 재생이 끝난 뒤 **처음 누르는 `advance` 는 되감고 첫 걸음까지** 간다
 * (S-piece) — `skipGate` 가 되감기 직후의 첫 문만 그냥 통과시킨다.
 */
export const cycleBlocksOrder: AlgorithmFn<CycleBlocksOrderData> = async (
  ctx: FacetContext<CycleBlocksOrderData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<CycleBlocksOrderData>;
  const stepMs =
    typeof rc.data.stepMs === 'number' && rc.data.stepMs > 0 ? rc.data.stepMs : FALLBACK_STEP_MS;

  let byHand = false;
  let skipGate = false;

  const gate: Gate = async () => {
    if (rc.cancelled) return false;
    if (skipGate) {
      skipGate = false;
      return true;
    }
    if (!byHand) return rc.sleep(stepMs);
    // `advance` 만 걸음으로 친다 — 위젯 입력이 붙어도 걸음이 어긋나지 않게.
    while ((await rc.waitForInput()).type !== 'advance') {
      if (rc.cancelled) return false;
    }
    return !rc.cancelled;
  };

  for (;;) {
    if (!(await playOnce(rc, gate))) return;
    // 다 보여 준 뒤의 첫 누름.
    while ((await rc.waitForInput()).type !== 'advance') {
      if (rc.cancelled) return;
    }
    if (rc.cancelled) return;
    await rc.emit({ type: 'rewind' });
    byHand = true;
    skipGate = true;
  }
};
