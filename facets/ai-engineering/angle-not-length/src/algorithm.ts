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
 *   place         {}                            질의와 후보 셋이 평면에 선다
 *   length-shown  {}                            화살의 길이가 제각각임을 보인다
 *   sweep         { deg: number; cos: number }  q 에서 후보까지 각이 벌어진다
 *   angle-ranked  { order: string[] }           각이 좁은 순서
 *   chord-shown   { dists: number[] }           끝점 사이의 직선 거리
 *   dist-ranked   { order: string[] }           거리가 가까운 순서
 *   done          {}                            두 줄을 나란히 놓고 결론을 말한다
 *   rewind        {}                            처음으로 되돌린다
 *
 * ── 싣는 것과 싣지 않는 것
 *
 * **재고 줄 세우는 셈이 이 조각의 알고리즘 그 자체**라 `deg` · `cos` · `dists` ·
 * 두 `order` 는 싣는다 (판정). 반대로 **바탕에서 곧바로 나오는 것**은 싣지 않는다.
 *
 * - 길이 `|v|` 는 후보 제 좌표만으로 나온다. `vectorLength` 를 내주고 장면이 부른다 —
 *   길이는 이 조각이 셈에서 **빼는** 것이라 재는 법의 알맹이가 아니다.
 * - **누구를 짚었는가**는 발신이 온 차례가 말한다. `sweep` 은 후보 차례대로 하나씩
 *   오므로 쌓인 수가 곧 그 후보의 자리다. `dists` 도 바탕과 같은 차례다.
 * - **각 1등이 거리 꼴찌인가**는 두 `order` 에서 나온다. 그 결론을 여기서 적어
 *   보내면 그림이 쓰는 자료와 갈릴 자리가 생긴다 — 같은 자료에서 나오게 둔다.
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

/**
 * 화살의 길이. 바탕에서 곧바로 나오는 값이라 발신에 싣지 않고 여기서 내준다 —
 * 좁히는 규칙과 마찬가지로 **한 벌만** 두려는 것이다 (scene.ts 가 부른다).
 */
export function vectorLength(p: AngleNotLengthPoint): number {
  return Math.hypot(p.x, p.y);
}

function dot(a: AngleNotLengthPoint, b: AngleNotLengthPoint): number {
  return a.x * b.x + a.y * b.y;
}

function cosine(a: AngleNotLengthPoint, b: AngleNotLengthPoint): number {
  const scale = vectorLength(a) * vectorLength(b);
  return scale === 0 ? 0 : dot(a, b) / scale;
}

function angleDeg(a: AngleNotLengthPoint, b: AngleNotLengthPoint): number {
  // 떠돌이 오차로 acos 의 정의역을 벗어나는 것을 막는다.
  return Math.acos(Math.min(1, Math.max(-1, cosine(a, b)))) * DEG_PER_RAD;
}

function gapOf(a: AngleNotLengthPoint, b: AngleNotLengthPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** unknown → 점 하나. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function readPoint(v: unknown): AngleNotLengthPoint | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  if (typeof r.x !== 'number' || typeof r.y !== 'number') return null;
  return { id: r.id, x: r.x, y: r.y };
}

function asRecord(initialData: unknown): Record<string, unknown> {
  return typeof initialData === 'object' && initialData !== null
    ? (initialData as Record<string, unknown>)
    : {};
}

/**
 * 선언의 질의점. 좁히는 규칙을 한 벌만 두려고 여기서 내준다 — 장면이 첫 화면을
 * 세울 때 부른다.
 */
export function readAngleQuery(initialData: unknown): AngleNotLengthPoint | null {
  return readPoint(asRecord(initialData).query);
}

/**
 * 선언의 후보들. **새 배열을 돌려준다** — 넘겨받은 것을 참조로 쥐면 장면이 이미
 * 굴러간 자료를 바탕으로 삼게 된다 (S-scene).
 */
export function readAngleCandidates(initialData: unknown): AngleNotLengthPoint[] {
  const raw = asRecord(initialData).candidates;
  const rows: unknown[] = Array.isArray(raw) ? (raw as unknown[]) : [];
  const out: AngleNotLengthPoint[] = [];
  for (const row of rows) {
    const p = readPoint(row);
    if (p !== null) out.push(p);
  }
  return out;
}

export async function angleNotLengthAlgorithm(
  base: FacetContext<AngleNotLengthData>,
): Promise<void> {
  const ctx = base as ReactiveContext<AngleNotLengthData>;
  const { query, candidates, stepMs } = ctx.data;

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
    // 길이는 바탕에서 나온다 — 싣지 않는다. `type` 은 리터럴이라 어휘를 grep 으로
    // 찾을 수 있다. 본문이 같아졌다고 앞 발신과 삼항으로 합치지 않는다 (C2).
    await ctx.emit({ type: 'length-shown' });

    // 후보를 도는 순회다 — 걸음표를 손으로 적은 배열이 아니라 데이터가 순서를
    // 정한다 (S-piece). 문이 루프 바디의 첫 줄이라 취소 검사를 겸한다 (C8).
    for (let i = 0; i < candidates.length; i += 1) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'sweep', payload: { deg: degrees[i], cos: cosines[i] } });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'angle-ranked', payload: { order: byAngle } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'chord-shown', payload: { dists } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'dist-ranked', payload: { order: byDist } });

    if (!(await gate())) return false;
    // 뒤집힘의 판정은 두 `order` 에 이미 다 있다. 결론을 따로 적어 보내지 않는다.
    await ctx.emit({ type: 'done' });
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
