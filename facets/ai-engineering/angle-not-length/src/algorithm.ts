/**
 * 각도로 재는 닮음 — 길이를 빼고 방향만 견준다.
 *
 * 조각(piece). 질의에서 뻗은 화살과 후보들 사이에서 **각이 벌어지는 것**을 보이고,
 * 그 각이 순위를 정한다는 것 하나만 말한다. 후보가 수백만일 때 어떻게 빨리
 * 찾는지(전수 탐색 · 색인 · 그래프)는 다른 조각의 몫이고, 임베딩이 어디서 오는지도
 * 여기서 다루지 않는다. 후보 셋을 다 재고 순위만 본다.
 *
 * ── 선언에 있는 것과 여기서 셈하는 것
 *
 * 선언에 있는 것은 **점 넷의 좌표**뿐이다. 길이 · 코사인 · 각 · 유클리드 거리는
 * 전부 이 파일이 그 좌표에서 셈한다. 파생값을 선언에 박으면 좌표를 고쳤을 때
 * 둘이 소리 없이 어긋나고, 화면은 그중 틀린 쪽을 보인다.
 *
 *   길이    |v| = sqrt(vx^2 + vy^2)
 *   코사인  cos(q,v) = (qx*vx + qy*vy) / (|q| * |v|)
 *   거리    d(q,v)   = sqrt((qx-vx)^2 + (qy-vy)^2)
 *
 * ── 이벤트 (전부 이 facet 고유. silent 는 하나도 없다 — 모두 걸음의 경계다)
 *
 *   place         {}                                       질의와 후보 셋이 평면에 선다
 *   length-shown  { ids: string[]; lengths: number[] }      화살의 길이가 제각각임을 보인다
 *   sweep         { id: string; deg: number; cos: number }  q 에서 후보까지 각이 벌어진다
 *   angle-ranked  { order: string[] }                       각이 좁은 순서
 *   chord-shown   { ids: string[]; dists: number[] }        끝점 사이의 직선 거리
 *   dist-ranked   { order: string[] }                       거리가 가까운 순서
 *   done          { id: string }                            각 1등이 거리 꼴찌다. 뒤집힘이 없으면 빈 문자열
 *   rewind        {}                                        처음으로 되돌린다
 *
 * `ids` 와 `lengths`, `ids` 와 `dists` 는 자리를 맞춘 나란한 배열이다 (C2 평탄 payload).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AngleNotLengthPoint = { id: string; x: number; y: number };

export type AngleNotLengthData = {
  type: string;
  /** 걸음 사이의 정지 시간. 읽을 틈을 주는 일이라 저작 결정이다 (S-piece). */
  stepMs: number;
  query: AngleNotLengthPoint;
  candidates: AngleNotLengthPoint[];
};

const DEG_PER_RAD = 180 / Math.PI;

function norm(p: AngleNotLengthPoint): number {
  return Math.hypot(p.x, p.y);
}

function dot(a: AngleNotLengthPoint, b: AngleNotLengthPoint): number {
  return a.x * b.x + a.y * b.y;
}

function cosine(a: AngleNotLengthPoint, b: AngleNotLengthPoint): number {
  const scale = norm(a) * norm(b);
  return scale === 0 ? 0 : dot(a, b) / scale;
}

function angleDeg(a: AngleNotLengthPoint, b: AngleNotLengthPoint): number {
  // 떠돌이 오차로 acos 의 정의역을 벗어나는 것을 막는다.
  return Math.acos(Math.min(1, Math.max(-1, cosine(a, b)))) * DEG_PER_RAD;
}

function gapOf(a: AngleNotLengthPoint, b: AngleNotLengthPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export async function angleNotLengthAlgorithm(
  base: FacetContext<AngleNotLengthData>,
): Promise<void> {
  const ctx = base as ReactiveContext<AngleNotLengthData>;
  const { query, candidates, stepMs } = ctx.data;

  const ids = candidates.map((c) => c.id);
  const lengths = candidates.map((c) => norm(c));
  const cosines = candidates.map((c) => cosine(query, c));
  const degrees = candidates.map((c) => angleDeg(query, c));
  const dists = candidates.map((c) => gapOf(query, c));

  // 코사인은 큰 것이 닮은 것이고, 거리는 작은 것이 가까운 것이다. 두 자가 서로
  // 다른 것을 재므로 순위가 뒤집힐 수 있다 — 그 뒤집힘이 이 조각의 주장이다.
  const byAngle = [...candidates]
    .sort((a, b) => cosine(query, b) - cosine(query, a))
    .map((c) => c.id);
  const byDist = [...candidates]
    .sort((a, b) => gapOf(query, a) - gapOf(query, b))
    .map((c) => c.id);

  // 각으로 1등인 것이 거리로는 꼴찌인가. 그런 좌표일 때만 마지막 캡션이 뜬다 —
  // 아니라면 화면이 없는 말을 하게 되므로 빈 문자열로 두고 입을 다문다.
  const flipped = byAngle[0] === byDist[byDist.length - 1] ? byAngle[0] : '';

  /** 자동 재생을 마쳤는가. 마친 뒤로는 `advance` 한 번이 한 걸음이다. */
  let manual = false;
  /**
   * 그냥 지나가는 문. 마운트 직후의 첫 걸음과 되감기 직후의 첫 걸음 앞에는
   * 기다릴 앞걸음이 없다 (S-piece). 문을 먼저 두면 `stepMs` 만큼 빈 화면이
   * 보인 뒤에야 그림이 선다.
   */
  let freeGate = true;

  /**
   * 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8 정본).
   *
   * C8 의 예시와 한 줄 순서가 다르다 — 거기서는 `sleep` 분기가 먼저지만, 그러면
   * 자동 재생의 첫 걸음이 문을 지나 버린다. S-piece 가 그것을 금하므로 그냥 지나는
   * 문을 자동/수동 갈림보다 앞에 둔다.
   */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (freeGate) {
      freeGate = false;
      return true;
    }
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      if (ctx.cancelled) return false;        // 앞 — continue 로 돌아와도 여기를 지난다
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return false;        // 뒤 — throw 규약에 기대지 않는다
      if (input.type !== 'advance') continue;
      return true;
    }
  }

  /** 한 바퀴를 처음부터 끝까지. 도중에 취소됐으면 false. */
  async function play(): Promise<boolean> {
    if (!(await gate())) return false;
    await ctx.emit({ type: 'place' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'length-shown', payload: { ids, lengths } });

    // 후보를 도는 순회다 — 걸음표를 손으로 적은 배열이 아니라 데이터가 순서를
    // 정한다 (S-piece). 문이 루프 바디의 첫 줄이라 취소 검사를 겸한다 (C8).
    for (let i = 0; i < candidates.length; i += 1) {
      if (!(await gate())) return false;
      await ctx.emit({
        type: 'sweep',
        payload: { id: ids[i], deg: degrees[i], cos: cosines[i] },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'angle-ranked', payload: { order: byAngle } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'chord-shown', payload: { ids, dists } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'dist-ranked', payload: { order: byDist } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: { id: flipped } });
    return true;
  }

  try {
    if (!(await play())) return;

    // 자동 재생이 끝났다. 이제 누를 때마다 한 걸음이고, 처음 누르는 것은
    // 되감고 **첫 걸음까지** 간다 — 되감기만 하면 눌러도 반응이 없어 보인다.
    for (;;) {
      if (ctx.cancelled) return;
      manual = true;
      if (!(await gate())) return;
      await ctx.emit({ type: 'rewind' });
      freeGate = true;
      if (!(await play())) return;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다. 그 밖의
    // 오류는 그대로 올려 러너가 드러내게 둔다 (C8 정본).
    if (!ctx.cancelled) throw err;
  }
}
