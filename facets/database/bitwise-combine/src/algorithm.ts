/**
 * bitwise-combine — 조건 둘의 비트 줄을 AND 한 번으로 포개 읽을 줄만 남긴다.
 *
 * 비트 줄은 이미 있는 인덱스다. 알고리즘은 표에서 조건마다 비트 줄을 셈해 두지만,
 * 화면은 그것을 처음부터 다 된 모양으로 보인다 (만드는 과정을 걸음으로 두지 않는다).
 * 포개기는 비트 줄 전체에 한 번에 걸리는 연산이라 한 걸음이다.
 *
 * 이벤트 (발신 순서대로)
 *   init     silent  { bits: string[]; total: number }
 *            조건마다의 비트 줄 ('0' · '1' 글자열, 첫 글자가 r1) 과 표의 줄 수. 걸음 0 을 갈아 끼운다
 *   combine          { result: string; ones: number }
 *            비트 줄 전부를 자리마다 AND 한 결과와 그 안의 1 의 수
 *   read             { rows: { index: number; values: string[] }[] }
 *            결과가 1 인 자리의 줄만 읽는다. index 는 0 부터 (r 번호 = index + 1),
 *            values 는 그 줄의 칸 값 (열 차례대로)
 *   done             { read: number; total: number; skipped: number }
 *            읽은 줄 수 · 표의 줄 수 · 한 번도 열지 않은 줄 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BitwiseCombineCondition = {
  /** 열 이름 (자료) */
  column: string;
  /** 같아야 하는 값 (자료) */
  value: string;
};

export type BitwiseCombineFacetData = {
  type: 'bitwise-combine';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 표 이름 (자료) */
  table: string;
  /** 열 이름 차례 */
  columns: string[];
  /** 표에 넣은 차례의 줄. 줄마다 열 차례의 칸 값 */
  rows: string[][];
  /** 화면에 둘 SQL 질의 글자 그대로 */
  query: string;
  /** AND 로 묶인 같음 조건들 — 조건마다 비트맵 인덱스가 하나 있다 */
  conditions: BitwiseCombineCondition[];
};

/** 조건 하나의 비트 줄 — 줄마다 그 열이 값과 같으면 '1'. */
function bitStringOf(data: BitwiseCombineFacetData, cond: BitwiseCombineCondition): string {
  const col = data.columns.indexOf(cond.column);
  if (col < 0) throw new Error(`bitwise-combine: 열 ${cond.column} 이 표 ${data.table} 에 없다`);
  const bits: string[] = [];
  data.rows.forEach((row, ri) => {
    if (row.length !== data.columns.length) {
      throw new Error(`bitwise-combine: r${ri + 1} 의 칸 수가 열 수와 다르다`);
    }
    const cell = row[col];
    if (typeof cell !== 'string') throw new Error(`bitwise-combine: r${ri + 1} 에 ${cond.column} 칸이 없다`);
    bits.push(cell === cond.value ? '1' : '0');
  });
  return bits.join('');
}

/** 비트 줄 전부를 자리마다 AND. 길이가 다르면 자리가 어긋나므로 던진다. */
function andAll(bitStrings: string[]): string {
  const first = bitStrings[0];
  if (first === undefined) throw new Error('bitwise-combine: 포갤 비트 줄이 없다');
  const out: string[] = [];
  for (let i = 0; i < first.length; i += 1) {
    let bit = '1';
    for (const s of bitStrings) {
      if (s.length !== first.length) throw new Error('bitwise-combine: 비트 줄 길이가 서로 다르다');
      if (s[i] !== '1') bit = '0';
    }
    out.push(bit);
  }
  return out.join('');
}

export async function bitwiseCombine(context: FacetContext<BitwiseCombineFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<BitwiseCombineFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  if (!(stepMs > 0)) throw new Error('bitwise-combine: stepMs 가 없다');
  if (data.conditions.length < 2) throw new Error('bitwise-combine: 조건이 둘 이상이어야 포갤 수 있다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const bits = data.conditions.map((c) => bitStringOf(data, c));
  const total = data.rows.length;

  // 걸음 0 — 이미 있는 비트 줄 둘과 질의. 읽을 것이 있는 화면이라 첫 발신 앞에 한 번 머문다
  await ctx.emit({ type: 'init', payload: { bits, total }, silent: true });
  if (!(await pause())) return;

  // 걸음 1 — 포개기. 비트 줄 전체에 AND 한 번
  const result = andAll(bits);
  let ones = 0;
  for (const ch of result) {
    if (ctx.cancelled) return;
    if (ch === '1') ones += 1;
  }
  await ctx.emit({ type: 'combine', payload: { result, ones } });
  if (!(await pause())) return;

  // 걸음 2 — 1 로 남은 자리의 줄만 읽는다
  const read: { index: number; values: string[] }[] = [];
  for (let i = 0; i < result.length; i += 1) {
    if (ctx.cancelled) return;
    if (result[i] !== '1') continue;
    const row = data.rows[i];
    if (row === undefined) throw new Error(`bitwise-combine: r${i + 1} 이 표에 없다`);
    read.push({ index: i, values: [...row] });
  }
  await ctx.emit({ type: 'read', payload: { rows: read } });
  if (!(await pause())) return;

  // 걸음 3 — 끝
  await ctx.emit({ type: 'done', payload: { read: read.length, total, skipped: total - read.length } });
}
