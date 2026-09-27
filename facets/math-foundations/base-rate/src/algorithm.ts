/**
 * 기저율 — 같은 검사를 기저율만 다른 두 무리에 건다.
 *
 * 기대 도수로 센다 (무작위 없음). 무리마다
 *   병 = 사람 수 × 기저율 · 참 양성 = 병 × 병일 때 양성률 · 거짓 양성 = (사람 수 − 병) × 병 아닐 때 양성률.
 * 모두 정수로 떨어져야 한다 — 아니면 던진다.
 * 양성 가운데 병 = 참 양성 / (참 양성 + 거짓 양성).
 *
 * 걸음 하나에 두 무리가 함께 간다 (이벤트 하나에 무리 둘의 값).
 *
 * 이벤트:
 * - `init` (silent) — 걸음 0. 무리를 병 / 병 없음으로 가른다.
 *     payload: { groups: Array<{ id: string; ratePct: number; people: number; sick: number; healthy: number }>;
 *               pileMax: number }   // pileMax = 더미 하나가 가장 클 때의 사람 수 (무대의 세로 축척)
 * - `test-sick` — 걸음 1. 병 있는 사람에게 검사.
 *     payload: { groups: Array<{ id: string; tp: number; fn: number }> }      // 참 양성 · 놓침
 * - `test-healthy` — 걸음 2. 병 없는 사람에게 검사.
 *     payload: { groups: Array<{ id: string; fp: number; tn: number }> }      // 거짓 양성 · 음성
 * - `pool` — 걸음 3. 양성을 한 더미로 모은다.
 *     payload: { groups: Array<{ id: string; pos: number }> }                 // 양성 모두 = 참 양성 + 거짓 양성
 * - `share` — 걸음 4. 양성 가운데 병의 몫.
 *     payload: { groups: Array<{ id: string; sharePct: number }> }            // 100 × 참 양성 / 양성 모두 (반올림 전)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface BaseRateGroupData {
  /** 식별자 — 표시 이름은 messages 의 label.<id> */
  id: string;
  /** 기저율 (퍼센트 정수) */
  ratePct: number;
}

export interface BaseRateFacetData {
  type: 'base-rate';
  stepMs: number;
  /** 무리마다 사람 수 */
  people: number;
  groups: BaseRateGroupData[];
  /** 검사 — 병이 있을 때 양성 퍼센트 · 병이 없을 때 양성 퍼센트 (정수) */
  test: { sickPositivePct: number; healthyPositivePct: number };
}

/** 한 무리의 기대 도수. */
export interface BaseRateCounts {
  id: string;
  ratePct: number;
  people: number;
  sick: number;
  healthy: number;
  tp: number;
  fn: number;
  fp: number;
  tn: number;
  pos: number;
  sharePct: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function wholeNumber(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new Error(`base-rate: ${path} 는 ${min}..${max} 의 정수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

/** initialData 좁히개 — 모양이 어긋나면 던진다. 알고리즘과 장면이 함께 쓴다. */
export function narrowBaseRateData(raw: unknown): BaseRateFacetData {
  if (!isRecord(raw)) throw new Error('base-rate: initialData 가 객체가 아니다');
  if (raw.type !== 'base-rate') throw new Error(`base-rate: initialData.type 이 'base-rate' 가 아니다`);
  const stepMs = wholeNumber(raw.stepMs, 'initialData.stepMs', 800, 60000);
  const people = wholeNumber(raw.people, 'initialData.people', 1, 100000);
  if (!Array.isArray(raw.groups) || raw.groups.length !== 2) {
    throw new Error('base-rate: initialData.groups 는 무리 둘의 배열이어야 한다');
  }
  const groups = raw.groups.map((g: unknown, i: number): BaseRateGroupData => {
    if (!isRecord(g)) throw new Error(`base-rate: initialData.groups[${i}] 가 객체가 아니다`);
    if (typeof g.id !== 'string' || g.id === '') {
      throw new Error(`base-rate: initialData.groups[${i}].id 가 빈 글자다`);
    }
    return { id: g.id, ratePct: wholeNumber(g.ratePct, `initialData.groups[${i}].ratePct`, 0, 100) };
  });
  if (groups[0]!.id === groups[1]!.id) throw new Error('base-rate: 두 무리의 id 가 같다');
  if (!isRecord(raw.test)) throw new Error('base-rate: initialData.test 가 객체가 아니다');
  const test = {
    sickPositivePct: wholeNumber(raw.test.sickPositivePct, 'initialData.test.sickPositivePct', 0, 100),
    healthyPositivePct: wholeNumber(raw.test.healthyPositivePct, 'initialData.test.healthyPositivePct', 0, 100),
  };
  return { type: 'base-rate', stepMs, people, groups, test };
}

/** 정수 × 퍼센트 — 정수로 떨어지지 않으면 던진다 (기대 도수가 사람 수가 아니게 된다). */
function percentOf(n: number, pct: number, path: string): number {
  if ((n * pct) % 100 !== 0) {
    throw new Error(`base-rate: ${path} = ${n} × ${pct}% 가 정수로 떨어지지 않는다`);
  }
  return (n * pct) / 100;
}

/** 무리 하나의 기대 도수를 센다. */
export function expectedCounts(data: BaseRateFacetData, group: BaseRateGroupData): BaseRateCounts {
  const sick = percentOf(data.people, group.ratePct, `${group.id}.sick`);
  const healthy = data.people - sick;
  const tp = percentOf(sick, data.test.sickPositivePct, `${group.id}.truePositive`);
  const fp = percentOf(healthy, data.test.healthyPositivePct, `${group.id}.falsePositive`);
  const pos = tp + fp;
  if (pos === 0) throw new Error(`base-rate: ${group.id} 에 양성이 하나도 없어 몫을 셀 수 없다`);
  return {
    id: group.id,
    ratePct: group.ratePct,
    people: data.people,
    sick,
    healthy,
    tp,
    fn: sick - tp,
    fp,
    tn: healthy - fp,
    pos,
    sharePct: (100 * tp) / pos,
  };
}

export async function baseRate(context: FacetContext<BaseRateFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<BaseRateFacetData>;
  const data = narrowBaseRateData(ctx.data);
  const counts = data.groups.map((g) => expectedCounts(data, g));
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      groups: counts.map((c) => ({
        id: c.id,
        ratePct: c.ratePct,
        people: c.people,
        sick: c.sick,
        healthy: c.healthy,
      })),
      pileMax: Math.max(...counts.map((c) => Math.max(c.tp, c.fp))),
    },
  });

  // 걸음 0 은 이미 두 무리를 보여 준다 — 읽을 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({
    type: 'test-sick',
    payload: { groups: counts.map((c) => ({ id: c.id, tp: c.tp, fn: c.fn })) },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'test-healthy',
    payload: { groups: counts.map((c) => ({ id: c.id, fp: c.fp, tn: c.tn })) },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'pool',
    payload: { groups: counts.map((c) => ({ id: c.id, pos: c.pos })) },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'share',
    payload: { groups: counts.map((c) => ({ id: c.id, sharePct: c.sharePct })) },
  });
}
