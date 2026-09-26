/**
 * cost-model — 막대 통계의 통 수가 추정 줄을 바꾸고, 추정이 고른 길을 바꾼다.
 *
 * 한 판 = 걸음 다섯 (걸음 0 포함, 손잡이와 무관). 손잡이를 받을 때마다 한 판을 처음부터 다시 재생한다.
 *   0 통계 쌓기      — 참 분포(10 살 칸)를 같은 폭 통 k 개로 묶는다
 *   1 잘라 모으기    — 범위에 걸친 통마다 `통의 줄 × 겹친 폭 ÷ 통 폭` 을 잘라 추정으로 모은다
 *   2 길 고르기      — 두 길의 **추정** 비용을 견주어 작은 쪽을 고른다
 *   3 실제 줄        — 참 분포가 드러난다 (범위 안 10 살 칸의 줄 합)
 *   4 실제 비용      — 고른 길의 **실제** 페이지 (다른 길의 실제 페이지를 곁에)
 *
 * 규약
 *   - 통 경계는 왼쪽 닫힘 · 오른쪽 열림 `[a, b)`. 통 안은 고르게 퍼져 있다고 본다
 *   - Seq Scan 비용 = 표 페이지 전부 (줄 수 ÷ 페이지당 줄, 올림). Index Scan 비용 = 내려가기 + 줄마다 표 페이지 하나 (캐시 없음)
 *   - 고르기는 추정으로, 값 매기기는 실제로. 고른 뒤 길을 바꾸지 않는다
 *   - 동률: 두 추정 비용이 같으면 먼저 적힌 길(Seq Scan). 이 데이터에서는 걸리지 않는다
 *   - 범위는 10 살 경계에 맞춘다 — 실제 줄이 참 분포의 칸 합으로 정해진다. 어긋나면 던진다
 *
 * 이벤트 (전부 silent 아님, phase 만 silent)
 *   round   { bins: number, binWidth: number, span: number, decadeWidth: number, binRows: number[], lo: number, hi: number, sql: string, column: string }
 *   cut     { pieces: { bin: number, from: number, to: number, binRows: number, binWidth: number, rows: number }[], estimate: number }
 *           (rows = binRows × (to − from) ÷ binWidth — 그 통에서 잘라 낸 추정 줄)
 *   pick    { seqName: string, indexName: string, seqEstimate: number, indexEstimate: number, chosen: 0 | 1 }
 *   actual  { decades: number[], decadeWidth: number, actualRows: number, error: number, estimate: number }
 *   cost    { seqName: string, indexName: string, seqActual: number, indexActual: number, chosen: 0 | 1, better: 0 | 1, chosenWasBetter: boolean, pagesRead: number }
 *           (chosenWasBetter = 고른 길이 실제로도 나은 길이었나 — 무대는 이 값으로 표지 색을 고른다)
 *   phase   { phase: string }  — silent
 *   (길의 번호 0 = Seq Scan, 1 = Index Scan)
 *
 * phase 어휘: build-bins · cut-bins · pick-path · actual-rows · actual-cost (irs.ts 와 같다)
 *
 * 계기: estimated-rows (걸음 1) · actual-rows (걸음 3) · pages-read (걸음 4).
 *   누적 채널이라 지금 보이는 값을 들고 차이만 보낸다. 판이 시작하면 0 으로 되돌리고 첫 판에는 차이 0 도 보낸다.
 *
 * 손잡이: bins (통 수 사다리 binLadder 의 값) · range (ranges 의 순번)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CostModelRange = { lo: number; hi: number };

export type CostModelData = {
  type: 'cost-model';
  stepMs: number;
  /** 열 이름 — 번역하지 않는 자료 */
  column: string;
  /** 페이지 하나에 드는 줄 수 */
  rowsPerPage: number;
  /** 값의 폭 — 열 값은 [0, span) */
  span: number;
  /** 참 분포 칸 하나의 폭 */
  decadeWidth: number;
  /** 참 분포 — [0, decadeWidth) 부터 칸마다 줄 수. 표를 훑어야 알 수 있는 것 */
  decades: number[];
  /** Index Scan 이 인덱스를 내려가며 읽는 페이지 */
  descend: number;
  /** 길 이름 — EXPLAIN 표기 그대로 자료 */
  seqName: string;
  indexName: string;
  /** 손잡이 사다리 — 통 수 */
  binLadder: number[];
  /** 손잡이 사다리 — 범위 (순번이 손잡이 값) */
  ranges: CostModelRange[];
  /** 범위마다 질의 SQL — 자료 (글자 그대로) */
  queries: string[];
  /** 첫 판의 손잡이 값 */
  startBins: number;
  startRange: number;
};

export type CostModelPiece = { bin: number; from: number; to: number; binRows: number; binWidth: number; rows: number };

export type CostModelRound = {
  bins: number;
  binWidth: number;
  binRows: number[];
  lo: number;
  hi: number;
  sql: string;
  pieces: CostModelPiece[];
  estimate: number;
  tablePages: number;
  seqEstimate: number;
  indexEstimate: number;
  chosen: 0 | 1;
  actualRows: number;
  error: number;
  seqActual: number;
  indexActual: number;
  better: 0 | 1;
  pagesRead: number;
};

function checkInt(name: string, n: number, min: number): void {
  if (!Number.isInteger(n) || n < min) throw new Error(`cost-model: ${name} 가 ${min} 이상의 정수가 아니다 (${n})`);
}

/** 한 판의 셈 — 구조(참 분포 · 통 수 · 범위)에서 모든 값을 낸다. */
export function costModelRound(data: CostModelData, bins: number, rangeIndex: number): CostModelRound {
  checkInt('통 수', bins, 1);
  checkInt('span', data.span, 1);
  checkInt('decadeWidth', data.decadeWidth, 1);
  checkInt('rowsPerPage', data.rowsPerPage, 1);
  checkInt('descend', data.descend, 0);
  const decades = data.decades;
  if (decades.length * data.decadeWidth !== data.span) {
    throw new Error('cost-model: 참 분포 칸이 값의 폭을 덮지 않는다');
  }
  for (const n of decades) checkInt('참 분포 칸', n, 0);
  if (decades.length % bins !== 0) throw new Error(`cost-model: 통 ${bins} 개로 참 분포 칸을 고르게 묶을 수 없다`);
  const range = data.ranges[rangeIndex];
  const sql = data.queries[rangeIndex];
  if (range === undefined || sql === undefined) throw new Error(`cost-model: 범위 ${rangeIndex} 가 없다`);
  const { lo, hi } = range;
  if (lo % data.decadeWidth !== 0 || hi % data.decadeWidth !== 0 || lo < 0 || hi > data.span || lo >= hi) {
    throw new Error(`cost-model: 범위 [${lo}, ${hi}) 가 참 분포 칸 경계에 맞지 않는다`);
  }

  // 0 — 통계: 참 분포 칸을 차례대로 같은 수씩 묶는다
  const per = decades.length / bins;
  const binWidth = per * data.decadeWidth;
  const binRows: number[] = [];
  for (let i = 0; i < bins; i++) {
    let sum = 0;
    for (let d = 0; d < per; d++) sum += decades[i * per + d] as number;
    binRows.push(sum);
  }

  // 1 — 추정: 걸친 통마다 통의 줄 × 겹친 폭 ÷ 통 폭 (IR 과 같은 차례로 더한다)
  const pieces: CostModelPiece[] = [];
  let estimate = 0;
  for (let i = 0; i < bins; i++) {
    const a = i * binWidth;
    const b = a + binWidth;
    const from = Math.max(a, lo);
    const to = Math.min(b, hi);
    const overlap = Math.max(0, to - from);
    const share = (binRows[i] as number) * overlap;
    estimate = estimate + share / binWidth;
    if (overlap > 0) pieces.push({ bin: i, from, to, binRows: binRows[i] as number, binWidth, rows: share / binWidth });
  }

  // 2 — 고르기: 추정 비용이 작은 쪽. 같으면 먼저 적힌 길(Seq Scan)
  let totalRows = 0;
  for (const n of decades) totalRows += n;
  const tablePages = Math.floor((totalRows + data.rowsPerPage - 1) / data.rowsPerPage);
  const seqEstimate = tablePages;
  const indexEstimate = data.descend + estimate;
  const chosen: 0 | 1 = indexEstimate < seqEstimate ? 1 : 0;

  // 3 — 실제 줄: 범위 안 참 분포 칸의 합
  let actualRows = 0;
  for (let d = 0; d < decades.length; d++) {
    if (d * data.decadeWidth >= lo && (d + 1) * data.decadeWidth <= hi) actualRows += decades[d] as number;
  }

  // 4 — 값 매기기: 실제 줄로
  const seqActual = tablePages;
  const indexActual = data.descend + actualRows;
  const pagesRead = chosen === 1 ? indexActual : seqActual;
  const better: 0 | 1 = indexActual < seqActual ? 1 : 0;

  return {
    bins,
    binWidth,
    binRows,
    lo,
    hi,
    sql,
    pieces,
    estimate,
    tablePages,
    seqEstimate,
    indexEstimate,
    chosen,
    actualRows,
    error: Math.abs(estimate - actualRows),
    seqActual,
    indexActual,
    better,
    pagesRead,
  };
}

export async function costModelAlgorithm(base: FacetContext<CostModelData>): Promise<void> {
  const ctx = base as ReactiveContext<CostModelData>;
  const data = ctx.data;
  if (!data.binLadder.includes(data.startBins)) throw new Error('cost-model: 첫 통 수가 사다리에 없다');
  if (data.ranges.length !== data.queries.length) throw new Error('cost-model: 범위와 질의의 수가 다르다');

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  // 계기는 0 에서 시작한다
  const shown: Record<'estimated-rows' | 'actual-rows' | 'pages-read', number> = {
    'estimated-rows': 0,
    'actual-rows': 0,
    'pages-read': 0,
  };
  const show = (name: keyof typeof shown, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };

  let bins = data.startBins;
  let rangeIndex = data.startRange;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const r = costModelRound(data, bins, rangeIndex);

      // 걸음 0 — 통계 쌓기
      await ctx.emit({
        type: 'round',
        payload: {
          bins: r.bins,
          binWidth: r.binWidth,
          span: data.span,
          decadeWidth: data.decadeWidth,
          binRows: r.binRows,
          lo: r.lo,
          hi: r.hi,
          sql: r.sql,
          column: data.column,
        },
      });
      show('estimated-rows', 0);
      show('actual-rows', 0);
      show('pages-read', 0);
      await phase('build-bins');
      if (!(await ctx.sleep(data.stepMs))) return;

      // 걸음 1 — 잘라 모으기
      await ctx.emit({ type: 'cut', payload: { pieces: r.pieces, estimate: r.estimate } });
      show('estimated-rows', r.estimate);
      await phase('cut-bins');
      if (!(await ctx.sleep(data.stepMs))) return;

      // 걸음 2 — 추정 비용으로 고르기
      await ctx.emit({
        type: 'pick',
        payload: {
          seqName: data.seqName,
          indexName: data.indexName,
          seqEstimate: r.seqEstimate,
          indexEstimate: r.indexEstimate,
          chosen: r.chosen,
        },
      });
      await phase('pick-path');
      if (!(await ctx.sleep(data.stepMs))) return;

      // 걸음 3 — 실제 줄
      await ctx.emit({
        type: 'actual',
        payload: {
          decades: data.decades,
          decadeWidth: data.decadeWidth,
          actualRows: r.actualRows,
          error: r.error,
          estimate: r.estimate,
        },
      });
      show('actual-rows', r.actualRows);
      await phase('actual-rows');
      if (!(await ctx.sleep(data.stepMs))) return;

      // 걸음 4 — 실제 비용
      await ctx.emit({
        type: 'cost',
        payload: {
          seqName: data.seqName,
          indexName: data.indexName,
          seqActual: r.seqActual,
          indexActual: r.indexActual,
          chosen: r.chosen,
          better: r.better,
          chosenWasBetter: r.chosen === r.better,
          pagesRead: r.pagesRead,
        },
      });
      show('pages-read', r.pagesRead);
      await phase('actual-cost');

      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      let taken = false;
      while (!taken) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'bins' && input.type !== 'range') continue;
        const p: unknown = input.payload;
        if (typeof p !== 'object' || p === null || !('value' in p)) continue;
        const v = p.value;
        if (typeof v !== 'number') continue;
        if (input.type === 'bins') {
          if (!data.binLadder.includes(v)) throw new Error(`cost-model: 통 수 ${v} 가 사다리에 없다`);
          bins = v;
        } else {
          if (!Number.isInteger(v) || v < 0 || v >= data.ranges.length) {
            throw new Error(`cost-model: 범위 ${v} 가 사다리에 없다`);
          }
          rangeIndex = v;
        }
        taken = true;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
