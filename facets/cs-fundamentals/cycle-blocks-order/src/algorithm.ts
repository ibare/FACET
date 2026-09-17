/**
 * cycleBlocksOrder — 고리가 있으면 순서가 없다.
 *
 * 방향 그래프에서 "이고 있는 수"(들어오는 화살표의 수, 진입차수) 가 0 인 것만
 * 꺼낼 수 있다. 꺼내면 그것이 보낸 화살표가 사라져 남은 것들의 짐이 줄어든다.
 * 고리가 없으면 이 과정이 전부를 꺼내고, 고리가 있으면 **어느 순간 0 이 하나도
 * 남지 않아 멈춘다** — 그 멈추는 순간이 이 조각의 주장이다.
 *
 * 화면에 뜨는 수는 전부 `data.edges` 를 세어 얻는다. 손으로 적은 표를 쓰지 않는다
 * (S-piece "화면에 쓰는 값은 실측한다"). 세는 함수는 `remainingLoads` 하나뿐이고
 * **장면도 같은 함수를 부른다** — 두 자리에서 세면 언젠가 갈린다.
 *
 * ── 식별자
 *   node:<정점 id>     — 정점 하나
 *
 * ── 발신 이벤트 (전부 facet 고유 확장. C2 에 따라 여기 적는다)
 *
 * 싣는 것은 **걸음이 내리는 판정**뿐이다. 구조에서 세지는 것(각자 이고 있는 수,
 * 꺼낼 수 있는 것, 몇 번째 자리, 짐이 준 것, 고리, 끝내 못 꺼낸 것)은 하나도
 * 싣지 않는다 — 바탕과 지금까지 꺼낸 목록만 있으면 전부 셈으로 나온다.
 *
 * | type      | payload                                                      | silent |
 * |-----------|--------------------------------------------------------------|--------|
 * | `survey`  | 없음                                                          | 아니오 |
 * |           | 각 정점이 무엇을 이고 있는지 드러난다. 첫 걸음이자 전제.       |        |
 * | `scan`    | 없음                                                          | 아니오 |
 * |           | 지금 꺼낼 수 있는 것을 훑는다. `target` 이 그것들이고,        |        |
 * |           | **비어 있으면 그 자리가 멈춤이다.**                           |        |
 * | `extract` | `{ id: string }`                                              | 아니오 |
 * |           | 꺼낼 수 있는 것이 여럿일 때 **어느 것을 꺼내는가** — 판정이다. |        |
 * | `wait`    | `{ from: string; on: string }`                                | 아니오 |
 * |           | `from` 이 `on` 을 기다린다. 화살표를 거슬러 올라간 한 발이고,  |        |
 * |           | **어느 발을 딛는가**가 판정이다. 고리인지 아닌지는 발자국이    |        |
 * |           | 제자리로 돌아오는 것을 보고 장면이 안다.                       |        |
 * | `done`    | 없음                                                          | 아니오 |
 * |           | 끝난 자리. 꺼낸 것도 못 꺼낸 것도 장면이 쥐고 있다.            |        |
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
 * 아직 안 나간 것들이 **지금** 이고 있는 수.
 *
 * 이미 꺼낸 것에서 나가는 화살표는 사라진 것이므로 세지 않는다. 그래서 바탕(정점과
 * 간선) 과 지금까지 꺼낸 목록만 있으면 어느 시점의 짐이든 이 함수 하나로 나온다 —
 * 걸음을 밟아 오며 하나씩 깎아 둘 필요가 없다.
 *
 * **화면에 뜨는 모든 수의 출처가 이 함수 하나다.** 장면(`scene.ts`) 이 배지의 수도
 * 꺼낼 수 있는 것도 여기서 얻고, 알고리즘도 같은 함수로 제 차례를 고른다. 두 자리에서
 * 세면 언젠가 갈린다 (프로토콜 4 절 "바탕에서 결정되는 셈은 싣지 말고 같은 함수를
 * 부르게 한다").
 *
 * @returns 아직 안 나간 정점만 담는다. 나간 것은 이고 있는 수라는 것이 없다.
 */
export function remainingLoads(
  vertices: readonly string[],
  edges: readonly CycleBlocksOrderEdge[],
  taken: Iterable<string>,
): Map<string, number> {
  const gone = new Set(taken);
  const load = new Map<string, number>();
  for (const v of vertices) if (!gone.has(v)) load.set(v, 0);
  for (const e of edges) {
    if (gone.has(e.from)) continue;
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

  // ── 전제. 각 정점이 무엇을 이고 있는지부터 보인다.
  if (!(await gate())) return false;
  await rc.emit({ type: 'survey', target: vertices.map((v) => `node:${v}`) });

  // ── 꺼낼 수 있는 것을 꺼낸다. 꺼낼 것이 없어지면 그 자리가 멈춤이다.
  const removed = new Set<string>();
  for (;;) {
    // 짐은 깎아 두지 않고 매번 다시 센다. 지금까지 꺼낸 것만 알면 나오는 값이라
    // 장면도 같은 함수로 같은 수를 얻는다.
    const load = remainingLoads(vertices, edges, removed);
    const ready = vertices.filter((v) => !removed.has(v) && (load.get(v) ?? 0) === 0);

    if (!(await gate())) return false;
    await rc.emit({ type: 'scan', target: ready.map((v) => `node:${v}`) });
    if (ready.length === 0) break;

    // 꺼낼 수 있는 것이 여럿이면 알파벳 순으로 고른다. 이 고름이 걸음의 판정이라
    // 유일하게 싣는 값이다 — 몇 번째 자리에 놓이는지도, 그 바람에 짐이 준 것이
    // 무엇인지도 꺼낸 목록에서 나온다.
    const pick = ready[0]!;
    removed.add(pick);

    if (!(await gate())) return false;
    await rc.emit({ type: 'extract', target: `node:${pick}`, payload: { id: pick } });
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
    for (;;) {
      if (path.includes(cur)) break; // 제자리로 돌아왔다 — 고리다.
      path.push(cur);
      const preds = waitsOn(cur);
      // 짐이 0 이 아닌데 기다릴 것이 없을 수는 없다. 방어적으로만 둔다.
      if (preds.length === 0) break;
      cur = preds[0]!;
    }

    // 한 발씩 거슬러 올라간다. 마지막 발이 이미 지나온 정점을 가리키면 그것이
    // 고리가 닫히는 자리인데, **그 판정은 장면이 제 발자국을 보고 내린다** —
    // 여기서 함께 적으면 같은 것을 두 자리에서 말하게 된다.
    for (let i = 0; i < path.length; i += 1) {
      const from = path[i]!;
      const on = i + 1 < path.length ? path[i + 1]! : cur;
      if (!(await gate())) return false;
      await rc.emit({
        type: 'wait',
        target: [`node:${from}`, `node:${on}`],
        payload: { from, on },
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
        payload: { from: v, on },
      });
    }
  }

  if (!(await gate())) return false;
  await rc.emit({ type: 'done' });
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
