/**
 * subquery — 괄호 안 질의가 몇 번 도는가.
 *
 * 비상관 서브쿼리는 바깥과 무관하게 한 번 돌아 값 하나를 괄호 자리에 놓고, 바깥 줄은 모두 그 값과
 * 견준다. 상관 서브쿼리는 바깥 줄의 값(`s.dept`)을 가리키므로 바깥 줄마다 다시 돈다 — 괄호 자리의
 * 값이 줄마다 갈아 끼워지고, 읽는 줄이 n + n × n 으로 는다.
 *
 * algorithm 은 SQL 을 파싱하지 않는다. `forms[k].sql` 은 보이기용 글자이고, 셈은 구조
 * (`query.select` · `query.compare` · `query.op` · `forms[k].correlateOn`)로 한다. 결과 기억(캐시)은
 * 없다고 본다 — 상관은 바깥 줄마다 안쪽을 처음부터 돈다.
 *
 * 규약
 *   - 안쪽 한 번 = 표 n 줄을 모두 읽는다 (상관도 같은 dept 줄을 고르려고 n 줄을 다 훑는다)
 *   - 바깥 줄 하나 = 1 줄 읽음. 읽은 줄 = 바깥 n + 안쪽이 읽은 줄
 *   - `pay > AVG(pay)` 는 정수로 견준다: `pay × cnt > total` (엄격 `>` — 같으면 걸리지 않는다)
 *   - 괄호 자리 값(AVG)은 total / cnt 가 나누어떨어질 때만 보인다. 떨어지지 않으면 던진다
 *     (화면에 정수로 보일 수 없는 값을 반올림해 지어내지 않는다)
 *   - 결과 줄 차례 = 표 차례
 *   - 부서 번호(group) = 표 전체에서 처음 나온 차례로 0 부터 (lab 0 · desk 1) — IR 의 dept 와 같다
 *
 * 이벤트 (payload 스키마 · silent 여부)
 *   round    (걸음 0)  { correlated: boolean, n: number, table: string, columns: string[],
 *                        sql: string[], rows: { cells: string[] (columns 차례), group: number (비상관이면 -1) }[] }
 *   inner    (걸음)    { run: number (1 부터), outer: number (바깥 줄 색인 0 부터, 비상관이면 -1),
 *                        outerName: string (비상관이면 ''), key: string (묶는 값, 비상관이면 ''),
 *                        group: number (묶는 값의 부서 번호, 비상관이면 -1), picked: number[] (쌓은 줄 색인),
 *                        read: number (이번에 읽은 줄), total: number, count: number, value: number }
 *   compare  (걸음)    { index: number, name: string, pay: number, value: number, passed: boolean,
 *                        kept: number (지금까지 결과 줄 수) }
 *   phase    (silent)  { phase: string }
 *
 * phase 어휘 — irs.ts 와 정확히 같다
 *   inner-scan     안쪽 질의가 표를 훑는 걸음 (비상관 걸음 1 · 상관 [안쪽] 걸음)
 *   outer-compare  바깥 줄을 괄호 자리 값과 견주는 걸음
 *
 * 걸음 — 비상관 2 + n (0 처음 · 1 안쪽 한 번 · 바깥 줄마다 하나), 상관 1 + 2n (0 처음 · 바깥 줄마다 [안쪽 · 견줌])
 *
 * 계기 (판마다 0 에서 다시 — 지금 보이는 값을 들고 차이만 보낸다)
 *   inner-runs   안쪽이 돈 수      — 안쪽 걸음에 +1
 *   rows-read    읽은 줄           — 안쪽 걸음에 +n, 견줌 걸음에 +1
 *   result-rows  결과 줄           — 견줌 걸음에 걸리면 +1
 *
 * 손잡이 — `form` (0 비상관 · 1 상관) · `rows` (표의 앞 n 줄, 사다리 `rowLadder`)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SubqueryForm = {
  /** 화면에 보이는 SQL 한 줄씩 — 보이기용 자료, 파싱하지 않는다 */
  sql: string[];
  /** 안쪽이 바깥 줄의 이 열과 같은 줄만 고른다. null 이면 비상관 */
  correlateOn: string | null;
};

export type SubqueryData = {
  type: 'subquery';
  stepMs: number;
  /** 걸음마다 운동에 주는 시간 (재생 속도 1 기준) */
  motionMs: number;
  table: string;
  columns: string[];
  rows: Array<Record<string, string | number>>;
  query: { select: string; compare: string; op: '>'; aggregate: 'AVG' };
  forms: SubqueryForm[];
  rowLadder: number[];
  start: { form: number; rows: number };
};

/** 화면에 싣는 줄 — 칸 글자(columns 차례)와 묶음 번호(비상관이면 -1) */
export type SubqueryRow = { cells: string[]; group: number };

function textCell(row: Record<string, string | number>, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw new Error(`subquery: 열 '${column}' 이 글자가 아니다`);
  return value;
}

function intCell(row: Record<string, string | number>, column: string): number {
  const value = row[column];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`subquery: 열 '${column}' 이 정수가 아니다`);
  return value;
}

/** 표 전체에서 처음 나온 차례로 부서 번호를 매긴다 */
export function groupIndex(data: SubqueryData, column: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of data.rows) {
    const key = textCell(row, column);
    if (!out.has(key)) out.set(key, out.size);
  }
  return out;
}

/** 손잡이 값 — 돌린 손잡이는 value, 다른 손잡이는 payload 의 지금 값(문자열), 없으면 지금 값 그대로 */
function readKnob(payload: Record<string, unknown>, name: string, current: number, turned: boolean): number {
  if (turned) {
    const value = payload.value;
    if (typeof value !== 'number') throw new Error(`subquery: 손잡이 '${name}' 의 값이 수가 아니다`);
    return value;
  }
  const raw = payload[name];
  if (typeof raw === 'string' && raw.length > 0) return Number(raw);
  if (typeof raw === 'number') return raw;
  return current;
}

export async function subqueryAlgorithm(base: FacetContext<SubqueryData>): Promise<void> {
  const ctx = base as ReactiveContext<SubqueryData>;
  const data = ctx.data;
  if (data.query.op !== '>' || data.query.aggregate !== 'AVG') throw new Error('subquery: 모르는 비교 · 집계');
  for (const col of [data.query.select, data.query.compare]) {
    if (!data.columns.includes(col)) throw new Error(`subquery: 모르는 열 '${col}'`);
  }

  const shown = { 'inner-runs': 0, 'rows-read': 0, 'result-rows': 0 };
  const setMetric = (name: keyof typeof shown, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const wait = () => ctx.sleep(data.stepMs + data.motionMs);

  /** 한 판을 끝까지 돈다. 취소되면 false */
  const playRound = async (formIndex: number, n: number): Promise<boolean> => {
    const form = data.forms[formIndex];
    if (form === undefined) throw new Error(`subquery: 꼴 ${formIndex} 이 없다`);
    if (n > data.rows.length) throw new Error(`subquery: 표에 ${n} 줄이 없다`);
    const keyColumn = form.correlateOn;
    if (keyColumn !== null && !data.columns.includes(keyColumn)) throw new Error(`subquery: 모르는 열 '${keyColumn}'`);
    const table = data.rows.slice(0, n);
    const pays = table.map((r) => intCell(r, data.query.compare));
    const names = table.map((r) => textCell(r, data.query.select));
    // 묶는 열 — 상관일 때만 있다. 비상관이면 묶음이 없으므로 번호도 -1
    const groups = keyColumn === null ? null : groupIndex(data, keyColumn);
    const keys = table.map((r) => (keyColumn === null ? '' : textCell(r, keyColumn)));
    const rows: SubqueryRow[] = table.map((r, i) => {
      let group = -1;
      if (groups !== null) {
        const found = groups.get(keys[i]);
        if (found === undefined) throw new Error('subquery: 부서 번호가 없다');
        group = found;
      }
      const cells = data.columns.map((c) => {
        const cell = r[c];
        if (cell === undefined) throw new Error(`subquery: 줄 ${i + 1} 에 열 '${c}' 이 없다`);
        return String(cell);
      });
      return { cells, group };
    });

    let runs = 0;
    let reads = 0;
    let kept = 0;

    await ctx.emit({
      type: 'round',
      payload: { correlated: keyColumn !== null, n, table: data.table, columns: data.columns, sql: form.sql, rows },
    });
    setMetric('inner-runs', 0);
    setMetric('rows-read', 0);
    setMetric('result-rows', 0);
    if (!(await wait())) return false;

    /** 안쪽 질의 한 번 — outer 가 -1 이면 모든 줄, 아니면 outer 와 같은 묶음 줄만 쌓는다 */
    const innerRun = async (outer: number): Promise<{ total: number; count: number } | null> => {
      runs += 1;
      let total = 0;
      let count = 0;
      const picked: number[] = [];
      for (let j = 0; j < n; j += 1) {
        if (ctx.cancelled) return null;
        reads += 1;
        if (outer === -1 || keys[j] === keys[outer]) {
          total += pays[j];
          count += 1;
          picked.push(j);
        }
      }
      if (count === 0) throw new Error('subquery: 안쪽이 고른 줄이 없다 — 평균이 없다');
      if (total % count !== 0) throw new Error(`subquery: 평균 ${total}/${count} 이 나누어떨어지지 않는다`);
      await ctx.emit({
        type: 'inner',
        payload: {
          run: runs,
          outer,
          outerName: outer === -1 ? '' : names[outer],
          key: outer === -1 ? '' : keys[outer],
          group: outer === -1 ? -1 : rows[outer].group,
          picked,
          read: n,
          total,
          count,
          value: total / count,
        },
      });
      setMetric('inner-runs', runs);
      setMetric('rows-read', reads);
      await phase('inner-scan');
      return { total, count };
    };

    let avg: { total: number; count: number } | null = null;
    if (keyColumn === null) {
      avg = await innerRun(-1);
      if (avg === null) return false;
      if (!(await wait())) return false;
    }
    for (let i = 0; i < n; i += 1) {
      if (ctx.cancelled) return false;
      if (keyColumn !== null) {
        avg = await innerRun(i);
        if (avg === null) return false;
        if (!(await wait())) return false;
      }
      if (avg === null) throw new Error('subquery: 괄호 자리 값이 없다');
      reads += 1;
      const passed = pays[i] * avg.count > avg.total;
      if (passed) kept += 1;
      await ctx.emit({
        type: 'compare',
        payload: { index: i, name: names[i], pay: pays[i], value: avg.total / avg.count, passed, kept },
      });
      setMetric('rows-read', reads);
      setMetric('result-rows', kept);
      await phase('outer-compare');
      if (!(await wait())) return false;
    }
    return true;
  };

  let form = data.start.form;
  let n = data.start.rows;
  if (!data.rowLadder.includes(n)) throw new Error(`subquery: 시작 줄 수 ${n} 이 사다리에 없다`);
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(form, n))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'form' && input.type !== 'rows') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const p = payload as Record<string, unknown>;
        const nextForm = readKnob(p, 'form', form, input.type === 'form');
        const nextRows = readKnob(p, 'rows', n, input.type === 'rows');
        if (!Number.isInteger(nextForm) || data.forms[nextForm] === undefined) {
          throw new Error(`subquery: 꼴 ${String(nextForm)} 이 사다리에 없다`);
        }
        if (!data.rowLadder.includes(nextRows)) throw new Error(`subquery: 줄 수 ${String(nextRows)} 이 사다리에 없다`);
        form = nextForm;
        n = nextRows;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
