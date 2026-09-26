/**
 * estimate-from-stats — 옵티마이저가 막대 통계만으로 결과 줄 수를 추정한다.
 *
 * 자료는 예로 정한 작은 통계다 (실제 데이터베이스가 낸 통계가 아니다). 표의 줄은 자료에 없고
 * 알고리즘도 읽지 않는다 — 가진 것은 전체 줄 수와 한 열의 같은 폭 막대 통계뿐이다.
 *
 * 규약 (사양 그대로):
 *   - 통 경계는 왼쪽 닫힘 · 오른쪽 열림 `[lo, hi)`. 조건 범위도 `col >= lo AND col < hi` 라 같은 꼴이다
 *   - 통 안은 고르게 퍼져 있다고 본다 — 몫 = 통의 줄 수 × (조건 범위와 겹친 폭 ÷ 통의 폭)
 *   - 통을 왼쪽부터 하나씩 본다. 걸음 = 통 하나 (안 걸친 통도 한 걸음). 마지막 걸음이 합과 선택도
 *   - 선택도 = 추정 줄 수 ÷ 전체 줄 수
 *   - 줄 수는 정수로 보인다. 몫이 정수가 아니면 표시 규약이 깨지므로 던진다
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *   bucket   { index: number, from: number, to: number, share: number, sum: number }
 *            index — 통 차례 (0 부터). from/to — 통 안에서 조건 범위와 겹친 구간 (겹침이 없으면 from === to).
 *            share — 이 통에서 잘려 나온 몫. sum — 이 걸음까지의 누적 추정치
 *   estimate { total: number, selectivity: number }
 *            total — 추정 줄 수. selectivity — total ÷ 전체 줄 수 (반올림하지 않은 참값)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type StatBucket = { lo: number; hi: number; rows: number };

export type EstimateFromStatsFacetData = {
  type: 'estimate-from-stats';
  stepMs: number;
  /** 화면에 그대로 뜨는 SQL (자료 — 번역하지 않는다) */
  sql: string;
  /** 표 이름 (자료) */
  table: string;
  /** 통계가 말하는 전체 줄 수 */
  rows: number;
  /** 막대 통계가 걸린 열 이름 (자료) */
  column: string;
  /** WHERE 의 범위 — `column >= lo AND column < hi` */
  range: { lo: number; hi: number };
  /** 같은 폭 막대 통계. 왼쪽부터 빈틈없이 잇닿는다 */
  buckets: StatBucket[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`estimate-from-stats: ${where} 가 수가 아니다`);
  }
  return v;
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new Error(`estimate-from-stats: ${where} 가 비었거나 글자가 아니다`);
  }
  return v;
}

/**
 * 자료를 좁히고 규약을 확인한다. 장면도 이것으로 바탕을 읽는다 — 두 자리에서 따로 읽으면 갈린다.
 * 모르는 모양 · 잇닿지 않는 통 · SQL 과 어긋나는 범위는 던진다.
 */
export function readEstimateData(raw: unknown): EstimateFromStatsFacetData {
  if (!isRecord(raw)) throw new Error('estimate-from-stats: initialData 가 객체가 아니다');
  const range = raw.range;
  if (!isRecord(range)) throw new Error('estimate-from-stats: range 가 없다');
  const lo = num(range.lo, 'range.lo');
  const hi = num(range.hi, 'range.hi');
  if (!(lo < hi)) throw new Error(`estimate-from-stats: 범위 [${lo}, ${hi}) 가 비었다`);

  const list = raw.buckets;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('estimate-from-stats: buckets 가 비었다');
  }
  const buckets: StatBucket[] = list.map((b: unknown, i: number) => {
    if (!isRecord(b)) throw new Error(`estimate-from-stats: buckets[${i}] 가 객체가 아니다`);
    const bucket = {
      lo: num(b.lo, `buckets[${i}].lo`),
      hi: num(b.hi, `buckets[${i}].hi`),
      rows: num(b.rows, `buckets[${i}].rows`),
    };
    if (!(bucket.lo < bucket.hi)) {
      throw new Error(`estimate-from-stats: buckets[${i}] 의 폭이 0 이하다`);
    }
    if (bucket.rows < 0) throw new Error(`estimate-from-stats: buckets[${i}] 의 줄 수가 음수다`);
    return bucket;
  });
  for (let i = 1; i < buckets.length; i += 1) {
    const before = buckets[i - 1];
    const here = buckets[i];
    if (before === undefined || here === undefined || before.hi !== here.lo) {
      throw new Error(`estimate-from-stats: buckets[${i}] 가 앞 통에 잇닿지 않는다`);
    }
  }

  const rows = num(raw.rows, 'rows');
  const inBuckets = buckets.reduce((acc, b) => acc + b.rows, 0);
  if (inBuckets !== rows) {
    throw new Error(`estimate-from-stats: 통의 줄 수 합 ${inBuckets} 가 전체 줄 수 ${rows} 와 다르다`);
  }

  const column = str(raw.column, 'column');
  const sql = str(raw.sql, 'sql');
  // 화면의 SQL 과 셈하는 범위가 갈리지 않게 — SQL 글자에 그 조건이 그대로 있어야 한다
  if (!sql.includes(`${column} >= ${lo}`) || !sql.includes(`${column} < ${hi}`)) {
    throw new Error(`estimate-from-stats: SQL 에 ${column} >= ${lo} · ${column} < ${hi} 가 없다`);
  }

  return {
    type: 'estimate-from-stats',
    stepMs: num(raw.stepMs, 'stepMs'),
    sql,
    table: str(raw.table, 'table'),
    rows,
    column,
    range: { lo, hi },
    buckets,
  };
}

/** 통 하나가 조건 범위와 겹친 구간. 겹침이 없으면 길이 0 인 구간 (통 안의 한 점) */
export function overlapOf(bucket: StatBucket, range: { lo: number; hi: number }): {
  from: number;
  to: number;
} {
  const from = Math.min(Math.max(bucket.lo, range.lo), bucket.hi);
  const to = Math.max(from, Math.min(bucket.hi, range.hi));
  return { from, to };
}

export async function estimateFromStats(
  ctx: FacetContext<EstimateFromStatsFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<EstimateFromStatsFacetData>;
  const data = readEstimateData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let sum = 0;
  for (let index = 0; index < data.buckets.length; index += 1) {
    // 걸음 0 은 SQL 과 통계가 이미 선 화면이다 — 첫 통 앞에서도 읽을 틈을 둔다
    if (!(await pause())) return;
    const bucket = data.buckets[index];
    if (bucket === undefined) throw new Error(`estimate-from-stats: buckets[${index}] 가 없다`);
    const { from, to } = overlapOf(bucket, data.range);
    const share = (bucket.rows * (to - from)) / (bucket.hi - bucket.lo);
    if (!Number.isInteger(share)) {
      throw new Error(`estimate-from-stats: buckets[${index}] 의 몫 ${share} 가 정수가 아니다`);
    }
    sum += share;
    await ctx.emit({ type: 'bucket', payload: { index, from, to, share, sum } });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'estimate', payload: { total: sum, selectivity: sum / data.rows } });
}
