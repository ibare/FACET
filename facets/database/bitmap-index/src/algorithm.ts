/**
 * bitmap-index — 조건마다 비트 줄 하나를 읽고, 조건을 더할수록 AND 는 좁히고 OR 는 넓힌다.
 *
 * 비트 줄은 이미 있는 인덱스다 — 만드는 과정은 보이지 않는다 (bit-per-row 의 말). 알고리즘은 표의
 * 줄에서 조건마다 비트 줄(`0`·`1` 글자열, 첫 글자가 r1)을 셈하고, 앞에서부터 조건 k 개의 비트 줄을
 * 한 걸음에 하나씩 포갠다 (포개기는 비트 줄 전체에 한 걸음 — bitwise-combine 과 같다).
 * 끝으로 결과 줄의 1 인 자리의 줄만 표에서 읽는다.
 *
 * 세는 법
 *   - 읽은 비트 = 읽은 비트 줄 수 × 표의 줄 수 (조건마다 비트 줄 하나를 통째로 읽는다)
 *   - 읽은 줄   = 결과 줄의 1 의 수 (1 인 자리의 줄만 표에서 읽는다, 줄 하나 읽기 = 1)
 *   - 동률 규칙 — 이 셈에는 고르기 · 정렬이 없어 동률이 걸릴 자리가 없다. 읽는 줄의 차례는 표에 넣은
 *     차례(r1 → r12)다
 *
 * 한 판 (조건 수 k)
 *   걸음 0      처음 — 표 · 질의 SQL · 빈 결과 줄
 *   걸음 1      첫 조건의 비트 줄이 결과 자리에 놓인다          phase load-first
 *   걸음 2..k   조건마다 비트 줄 하나를 포갠다                 phase combine-and | combine-or
 *   걸음 k+1    결과 줄의 1 인 자리의 줄을 읽는다              phase fetch-rows
 *   → 걸음 수(걸음 0 포함) k + 2. 마지막 걸음의 경계는 입력 대기다
 *
 * 이벤트 (silent 가 아닌 것은 모두 걸음이다)
 *   round    { table: string, columns: string[], rows: string[][], clauses: string[],
 *              bitRows: string[], conditionCount: number, combineWord: string, sql: string }
 *            — 판의 처음. clauses · bitRows 는 조건 셋 전부, 앞의 conditionCount 개가 이 질의의 것
 *   load     { condition: number, result: string, bitsRead: number, ones: number }
 *            — condition 은 0 부터의 조건 색인
 *   combine  { condition: number, combineWord: string, result: string, changed: number[],
 *              bitsRead: number, ones: number }
 *            — changed 는 이 포개기로 값이 바뀐 결과 자리(0 부터)
 *   fetch    { rows: number[], rowsRead: number, bitsRead: number }
 *            — rows 는 읽은 줄의 자리(0 부터, 표 차례)
 *   phase    { phase: string }  silent
 *
 * phase 어휘: load-first · combine-and · combine-or · fetch-rows (irs.ts 와 같다)
 *
 * 계기
 *   bits-read  읽은 비트 — 비트 줄을 하나 읽을 때마다 표의 줄 수만큼
 *   rows-read  읽은 줄 — 걸음 k+1 에서
 *
 * 손잡이
 *   combine     0 = AND · 1 = OR (결합 낱말은 initialData.combineWords)
 *   conditions  조건 수 — initialData.conditionsLadder 의 값. 조건은 늘 앞에서부터 k 개
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BitmapCondition = { column: string; value: string };

export type BitmapIndexData = {
  type: 'bitmap-index';
  stepMs: number;
  /** 표 이름 (자료) */
  table: string;
  /** 열 이름 (자료) */
  columns: string[];
  /** 표의 줄, 넣은 차례 r1 → rN. 칸은 columns 차례 */
  rows: string[][];
  /** 조건, 이 차례로 앞에서부터 k 개를 쓴다 */
  conditions: BitmapCondition[];
  /** 결합 낱말 — 손잡이 combine 의 값이 색인 */
  combineWords: string[];
  /** 조건 수 사다리 — 손잡이 conditions 의 값 */
  conditionsLadder: number[];
  /** 처음 결합 (combineWords 의 색인) */
  combine: number;
  /** 처음 조건 수 */
  conditionCount: number;
};

/** 결과 줄을 0/1 배열로 다룬다. 글자열은 화면으로 보낼 때만 만든다. */
function bitString(bits: readonly number[]): string {
  return bits.map((b) => (b === 1 ? '1' : '0')).join('');
}

function countOnes(bits: readonly number[]): number {
  let n = 0;
  for (const b of bits) n += b;
  return n;
}

/** 조건의 SQL 식 — `color = 'red'` */
export function clauseSql(cond: BitmapCondition): string {
  return `${cond.column} = '${cond.value}'`;
}

/** 질의 SQL — 앞에서부터 k 개 조건을 결합 낱말로 잇는다 */
export function querySql(data: BitmapIndexData, k: number, word: string): string {
  const clauses = data.conditions.slice(0, k).map(clauseSql);
  return `SELECT * FROM ${data.table} WHERE ${clauses.join(` ${word} `)}`;
}

/** 조건 하나의 비트 줄 — 표에서 셈한다. 첫 자리가 r1 */
export function bitRowOf(data: BitmapIndexData, cond: BitmapCondition): number[] {
  const col = data.columns.indexOf(cond.column);
  if (col < 0) throw new Error(`bitmap-index: 표에 없는 열 ${cond.column}`);
  return data.rows.map((row, i) => {
    const cell = row[col];
    if (cell === undefined) throw new Error(`bitmap-index: r${i + 1} 에 ${cond.column} 칸이 없다`);
    return cell === cond.value ? 1 : 0;
  });
}

/** 조건 셋의 비트 줄을 조건 차례로 이어 편 0/1 배열 — IR 에 건네는 모양 (조건 c 의 줄 r 은 c * 줄 수 + r) */
export function flatBits(data: BitmapIndexData): number[] {
  return data.conditions.flatMap((c) => bitRowOf(data, c));
}

export type BitmapOutcome = {
  result: number[];
  bitsRead: number;
  rowsRead: number;
  picked: number[];
};

/** 한 판의 셈 — 포개기 차례 그대로 (테스트가 IR 과 견준다) */
export function combineRows(data: BitmapIndexData, k: number, useOr: boolean): BitmapOutcome {
  if (k < 1 || k > data.conditions.length) throw new Error(`bitmap-index: 조건 수 ${k} 가 범위 밖`);
  const first = data.conditions[0];
  if (first === undefined) throw new Error('bitmap-index: 조건이 없다');
  let result = bitRowOf(data, first);
  for (let c = 1; c < k; c += 1) {
    const cond = data.conditions[c];
    if (cond === undefined) throw new Error(`bitmap-index: 조건 ${c + 1} 이 없다`);
    const next = bitRowOf(data, cond);
    result = result.map((b, r) => {
      const nb = next[r];
      if (nb === undefined) throw new Error(`bitmap-index: 비트 줄 길이가 다르다`);
      return useOr ? Math.max(b, nb) : b * nb;
    });
  }
  const picked: number[] = [];
  result.forEach((b, r) => {
    if (b === 1) picked.push(r);
  });
  return { result, bitsRead: k * data.rows.length, rowsRead: countOnes(result), picked };
}

function checkData(data: BitmapIndexData): void {
  if (data.rows.length === 0) throw new Error('bitmap-index: 표에 줄이 없다');
  if (data.conditions.length === 0) throw new Error('bitmap-index: 조건이 없다');
  for (const row of data.rows) {
    if (row.length !== data.columns.length) throw new Error('bitmap-index: 줄의 칸 수가 열 수와 다르다');
  }
  for (const k of data.conditionsLadder) {
    if (k < 1 || k > data.conditions.length) throw new Error(`bitmap-index: 사다리 값 ${k} 가 조건 수 밖`);
  }
  if (!data.conditionsLadder.includes(data.conditionCount)) {
    throw new Error('bitmap-index: 처음 조건 수가 사다리에 없다');
  }
  if (data.combineWords[data.combine] === undefined) throw new Error('bitmap-index: 처음 결합이 없다');
}

export async function bitmapIndexAlgorithm(ctx0: FacetContext<BitmapIndexData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<BitmapIndexData>;
  const data = ctx.data;
  checkData(data);
  const stepMs = data.stepMs;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다
  const shown = new Map<string, number>();
  const showMetric = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev === undefined) ctx.metric(name, value);
    else if (prev !== value) ctx.metric(name, value - prev);
    shown.set(name, value);
  };

  const clauses = data.conditions.map(clauseSql);
  const bitRows = data.conditions.map((c) => bitRowOf(data, c));
  const n = data.rows.length;

  /** 한 판을 끝까지. 취소되면 false */
  const playRound = async (combine: number, k: number): Promise<boolean> => {
    const word = data.combineWords[combine];
    if (word === undefined) throw new Error(`bitmap-index: 결합 ${combine} 이 없다`);
    if (word !== 'AND' && word !== 'OR') throw new Error(`bitmap-index: 모르는 결합 ${word}`);
    const useOr = word === 'OR';
    showMetric('bits-read', 0);
    showMetric('rows-read', 0);
    await ctx.emit({
      type: 'round',
      payload: {
        table: data.table,
        columns: [...data.columns],
        rows: data.rows.map((r) => [...r]),
        clauses: [...clauses],
        bitRows: bitRows.map(bitString),
        conditionCount: k,
        combineWord: word,
        sql: querySql(data, k, word),
      },
    });
    if (!(await ctx.sleep(stepMs))) return false;

    const firstRow = bitRows[0];
    if (firstRow === undefined) throw new Error('bitmap-index: 첫 비트 줄이 없다');
    let result = [...firstRow];
    let bitsRead = n;
    await phase('load-first');
    showMetric('bits-read', bitsRead);
    await ctx.emit({
      type: 'load',
      payload: { condition: 0, result: bitString(result), bitsRead, ones: countOnes(result) },
    });
    if (!(await ctx.sleep(stepMs))) return false;

    for (let c = 1; c < k; c += 1) {
      if (ctx.cancelled) return false;
      const next = bitRows[c];
      if (next === undefined) throw new Error(`bitmap-index: 조건 ${c + 1} 의 비트 줄이 없다`);
      const merged = result.map((b, r) => {
        const nb = next[r];
        if (nb === undefined) throw new Error('bitmap-index: 비트 줄 길이가 다르다');
        return useOr ? Math.max(b, nb) : b * nb;
      });
      const changed: number[] = [];
      merged.forEach((b, r) => {
        if (b !== result[r]) changed.push(r);
      });
      result = merged;
      bitsRead += n;
      if (useOr) await phase('combine-or');
      else await phase('combine-and');
      showMetric('bits-read', bitsRead);
      await ctx.emit({
        type: 'combine',
        payload: {
          condition: c,
          combineWord: word,
          result: bitString(result),
          changed,
          bitsRead,
          ones: countOnes(result),
        },
      });
      if (!(await ctx.sleep(stepMs))) return false;
    }

    const picked: number[] = [];
    result.forEach((b, r) => {
      if (b === 1) picked.push(r);
    });
    await phase('fetch-rows');
    showMetric('rows-read', picked.length);
    await ctx.emit({ type: 'fetch', payload: { rows: picked, rowsRead: picked.length, bitsRead } });
    return true;
  };

  let combine = data.combine;
  let k = data.conditionCount;
  try {
    if (!(await playRound(combine, k))) return;
    while (!ctx.cancelled) {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      const payload = input.payload;
      if (typeof payload !== 'object' || payload === null) continue;
      const value = (payload as { value?: unknown }).value;
      if (typeof value !== 'number') continue;
      if (input.type === 'combine') {
        if (data.combineWords[value] === undefined) continue;
        combine = value;
      } else if (input.type === 'conditions') {
        if (!data.conditionsLadder.includes(value)) continue;
        k = value;
      } else {
        continue;
      }
      if (!(await playRound(combine, k))) return;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
