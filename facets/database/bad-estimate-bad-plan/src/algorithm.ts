/**
 * bad-estimate-bad-plan — 줄 수 짐작이 틀리면 옵티마이저의 선택은 어떻게 되는가.
 *
 * 표 · 통계 · 분포는 예로 정한 작은 자료다. 실제 데이터베이스가 낸 통계나 EXPLAIN 이 아니다.
 *
 * 규약 (사양 그대로):
 *  - 추정 = 줄 수 ÷ 서로 다른 값 수 (값마다 고르다고 본다). 값마다 몇 줄인지는 통계에 없다
 *  - 비용 단위 = 읽은 페이지 수 (두 길 같은 단위)
 *      Seq Scan   = 표의 페이지 전부 (줄 수와 무관)
 *      Index Scan = 인덱스를 내려가는 descent + 가리킨 줄마다 표 페이지 한 번 (캐시 없음)
 *  - 고르기 = 추정 비용이 작은 길. 같으면 사양에 먼저 적힌 길(paths 앞쪽)이 이긴다
 *  - 고른 뒤 실제 줄 수로 두 길의 비용을 다시 셈한다. 고른 길은 바꾸지 않는다
 *  - 실제 줄 수 = 분포에서 찾는 값의 줄. 분포 합이 통계의 줄 수와 다르면 던진다
 *
 * 이벤트 (전부 silent 아님 — 걸음 하나씩):
 *  - estimate       { rows: number; distinct: number; est: number }
 *                   통계만으로 셈한 값 하나의 줄 수
 *  - estimatedCost  { costs: PathCost[]; pick: string }
 *                   추정 줄 수로 셈한 길마다의 읽을 페이지 수와 고른 길 (costs 는 paths 차례)
 *                   PathCost = { path: string; indexPages: number; tablePages: number; pages: number }
 *                   (pages = indexPages + tablePages. 인덱스 페이지와 표 페이지를 가른 것)
 *  - actual         { rows: number }
 *                   분포에서 센 실제 줄 수
 *  - actualCost     { costs: PathCost[] }
 *                   실제 줄 수로 다시 셈한 길마다의 읽을 페이지 수 (paths 차례). 고른 길은 그대로
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface BadEstimateBadPlanFacetData {
  type: 'bad-estimate-bad-plan';
  stepMs: number;
  /** SQL 문장 — 자료, 번역하지 않는다 */
  sql: string;
  table: string;
  column: string;
  /** 찾는 값 (SQL 안의 'Seoul' 과 같은 글자) */
  value: string;
  /** 옵티마이저가 가진 통계 */
  stats: { rows: number; pages: number; distinct: number };
  /** 실제 분포 — 표를 훑어야 알 수 있는 것. 나머지 값들은 이름 없이 수만 */
  actual: { match: number; otherValues: number; rowsPerOther: number };
  /** 인덱스를 내려가며 읽는 페이지 수 */
  descent: number;
  /** 길 이름 (EXPLAIN 표기 그대로). 사양 차례 */
  paths: string[];
}

export interface PathCost {
  path: string;
  /** 인덱스를 내려가며 읽은 페이지 */
  indexPages: number;
  /** 표에서 읽은 페이지 (캐시 없음 — 같은 페이지도 다시 센다) */
  tablePages: number;
  /** indexPages + tablePages */
  pages: number;
}

/** 한 길이 줄 n 개를 가져오려면 읽는 페이지. 모르는 길은 던진다 (C6). */
function costFor(path: string, n: number, data: BadEstimateBadPlanFacetData): PathCost {
  if (path === 'Seq Scan') {
    const tablePages = data.stats.pages;
    return { path, indexPages: 0, tablePages, pages: tablePages };
  }
  if (path === 'Index Scan') {
    return { path, indexPages: data.descent, tablePages: n, pages: data.descent + n };
  }
  throw new Error(`bad-estimate-bad-plan: 비용을 셈할 줄 모르는 길 "${path}"`);
}

function costsFor(n: number, data: BadEstimateBadPlanFacetData): PathCost[] {
  return data.paths.map((path) => costFor(path, n, data));
}

/** 가장 싼 길. 같으면 앞의 길 (strict <). */
function cheapest(costs: PathCost[]): string {
  let best: PathCost | undefined;
  for (const c of costs) {
    if (best === undefined || c.pages < best.pages) best = c;
  }
  if (best === undefined) throw new Error('bad-estimate-bad-plan: 길이 하나도 없다');
  return best.path;
}

export async function badEstimateBadPlan(
  context: FacetContext<BadEstimateBadPlanFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<BadEstimateBadPlanFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const { rows, distinct } = data.stats;
  if (distinct <= 0) throw new Error('bad-estimate-bad-plan: 서로 다른 값 수가 0 이하');
  const tableRows = data.actual.match + data.actual.otherValues * data.actual.rowsPerOther;
  if (tableRows !== rows) {
    throw new Error(`bad-estimate-bad-plan: 분포 합 ${tableRows} 이 통계의 줄 수 ${rows} 와 다르다`);
  }
  if (data.actual.otherValues + 1 !== distinct) {
    throw new Error('bad-estimate-bad-plan: 분포의 값 수가 통계의 서로 다른 값 수와 다르다');
  }

  // 걸음 0 (SQL · 통계) 이 이미 읽을 것이 있는 화면이라 첫 발신 앞에 틈을 둔다
  if (!(await pause())) return;

  const est = rows / distinct;
  if (!Number.isInteger(est)) {
    throw new Error(`bad-estimate-bad-plan: 추정 ${est} 이 정수가 아니라 페이지를 셀 수 없다`);
  }
  await ctx.emit({ type: 'estimate', payload: { rows, distinct, est } });
  if (!(await pause())) return;

  const estCosts = costsFor(est, data);
  const pick = cheapest(estCosts);
  await ctx.emit({ type: 'estimatedCost', payload: { costs: estCosts, pick } });
  if (!(await pause())) return;

  const actualRows = data.actual.match;
  await ctx.emit({ type: 'actual', payload: { rows: actualRows } });
  if (!(await pause())) return;

  const actCosts = costsFor(actualRows, data);
  await ctx.emit({ type: 'actualCost', payload: { costs: actCosts } });
}
