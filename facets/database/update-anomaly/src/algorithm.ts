/**
 * update-anomaly — 같은 사실의 사본 가운데 하나만 고치면 답이 갈라진다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 의 표를 그대로 세운다. 그 화면에 읽을 것이
 * 있으므로 첫 발신 앞에 stepMs 만큼 머문다.
 *
 * 이벤트 (셋 다 silent 아님 — 하나가 한 걸음)
 * - `copies` payload `{ rows: number[] }`
 *     물음(`ask`)의 WHERE 에 맞는 줄들 — 같은 사실의 사본이 적힌 줄. 데이터 차례.
 * - `update` payload `{ rows: number[]; column: number; value: string; was: string[]; stale: number[] }`
 *     고치기의 WHERE 에 맞아 실제로 바뀐 줄(`rows`), 바뀐 열의 자리(`column`), 새 값(`value`),
 *     그 줄들의 옛 값(`was`, `rows` 와 같은 차례), 사본 가운데 옛 값이 그대로 남은 줄(`stale`).
 * - `ask` payload `{ answers: { value: string; rows: number[] }[] }`
 *     고친 뒤 물음을 던졌을 때 사본 줄들이 내놓는 서로 다른 값. 데이터 차례로 처음 나온 값 먼저.
 *
 * 규약 (공통 안내문)
 * - 같음 견주기는 값 전체가 같은지 본다. 대소문자를 가린다.
 * - 빈 값은 없다. 셈하는 코드가 빈 값을 만나면 던진다.
 * - 기본 키는 선언이다. 줄이 그 선언과 어긋나면(같은 키 값이 둘) 던진다.
 * - 고치기는 WHERE 에 맞는 줄에만 닿는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** `UPDATE <table> SET <set> = '<value>' WHERE <where> = '<equals>'` 한 줄. */
export type UpdateAnomalyUpdate = {
  readonly set: string;
  readonly value: string;
  readonly where: string;
  readonly equals: string;
};

/** 물음 — `<where>` 가 `<equals>` 인 줄들의 `<column>` 값은 무엇인가. */
export type UpdateAnomalyAsk = {
  readonly column: string;
  readonly where: string;
  readonly equals: string;
};

export type UpdateAnomalyFacetData = {
  readonly type: 'update-anomaly';
  readonly stepMs: number;
  readonly table: string;
  readonly columns: readonly string[];
  readonly key: string;
  readonly rows: readonly (readonly string[])[];
  readonly update: UpdateAnomalyUpdate;
  readonly ask: UpdateAnomalyAsk;
};

export type UpdateAnomalyAnswer = { readonly value: string; readonly rows: readonly number[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function needText(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new Error(`update-anomaly: ${where} 는 빈 값이 아닌 글자여야 한다`);
  }
  return v;
}

/** 열 이름의 자리. 없는 열이면 던진다. */
export function columnIndex(columns: readonly string[], name: string): number {
  const i = columns.indexOf(name);
  if (i < 0) throw new Error(`update-anomaly: 표에 없는 열 "${name}"`);
  return i;
}

/**
 * initialData 를 좁히고 선언이 줄과 어긋나지 않는지 본다. 장면도 같은 함수로 바탕을 읽는다.
 */
export function readUpdateAnomalyData(raw: unknown): UpdateAnomalyFacetData {
  if (!isRecord(raw)) throw new Error('update-anomaly: initialData 가 객체가 아니다');
  if (raw.type !== 'update-anomaly') throw new Error('update-anomaly: type 이 맞지 않는다');
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs >= 0)) {
    throw new Error('update-anomaly: stepMs 는 0 이상의 수여야 한다');
  }
  const table = needText(raw.table, 'table');
  if (!Array.isArray(raw.columns) || raw.columns.length === 0) {
    throw new Error('update-anomaly: columns 가 비었다');
  }
  const columns = raw.columns.map((c, i) => needText(c, `columns[${i}]`));
  if (new Set(columns).size !== columns.length) {
    throw new Error('update-anomaly: 열 이름이 겹친다');
  }
  const key = needText(raw.key, 'key');
  const keyAt = columnIndex(columns, key);
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
    throw new Error('update-anomaly: rows 가 비었다');
  }
  const rows = raw.rows.map((r, i) => {
    if (!Array.isArray(r) || r.length !== columns.length) {
      throw new Error(`update-anomaly: rows[${i}] 의 칸 수가 열 수와 다르다`);
    }
    return r.map((cell, j) => needText(cell, `rows[${i}][${j}]`));
  });
  const seen = new Set<string>();
  for (const r of rows) {
    const k = r[keyAt] as string;
    if (seen.has(k)) throw new Error(`update-anomaly: 기본 키 ${key} 의 값 "${k}" 가 두 줄에 있다`);
    seen.add(k);
  }
  const u = raw.update;
  if (!isRecord(u)) throw new Error('update-anomaly: update 가 객체가 아니다');
  const update: UpdateAnomalyUpdate = {
    set: needText(u.set, 'update.set'),
    value: needText(u.value, 'update.value'),
    where: needText(u.where, 'update.where'),
    equals: needText(u.equals, 'update.equals'),
  };
  columnIndex(columns, update.set);
  columnIndex(columns, update.where);
  const a = raw.ask;
  if (!isRecord(a)) throw new Error('update-anomaly: ask 가 객체가 아니다');
  const ask: UpdateAnomalyAsk = {
    column: needText(a.column, 'ask.column'),
    where: needText(a.where, 'ask.where'),
    equals: needText(a.equals, 'ask.equals'),
  };
  columnIndex(columns, ask.column);
  columnIndex(columns, ask.where);
  return { type: 'update-anomaly', stepMs, table, columns, key, rows, update, ask };
}

/** `col` 열의 값이 `val` 과 통째로 같은 줄의 자리들. 데이터 차례. */
function matching(rows: readonly (readonly string[])[], col: number, val: string): number[] {
  const out: number[] = [];
  rows.forEach((r, i) => {
    if (r[col] === val) out.push(i);
  });
  return out;
}

export async function updateAnomaly(ctx: FacetContext<UpdateAnomalyFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<UpdateAnomalyFacetData>;
  const data = readUpdateAnomalyData(ctx.data);
  const { stepMs, columns, update, ask } = data;
  const rows = data.rows.map((r) => [...r]);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const askWhere = columnIndex(columns, ask.where);
  const askCol = columnIndex(columns, ask.column);
  const setCol = columnIndex(columns, update.set);
  const updWhere = columnIndex(columns, update.where);

  // 사본 — 물음이 가리키는 줄들.
  const copies = matching(rows, askWhere, ask.equals);
  if (copies.length === 0) {
    throw new Error(`update-anomaly: ${ask.where} 가 "${ask.equals}" 인 줄이 없다`);
  }

  // 걸음 0 (표) 을 읽을 틈.
  if (!(await pause())) return;
  await ctx.emit({ type: 'copies', payload: { rows: copies } });

  // 고치기 — WHERE 에 맞는 줄에만 닿는다.
  if (!(await pause())) return;
  const hit = matching(rows, updWhere, update.equals);
  if (hit.length === 0) {
    throw new Error(`update-anomaly: 고치기의 WHERE ${update.where} = "${update.equals}" 에 맞는 줄이 없다`);
  }
  const was = hit.map((i) => (rows[i] as string[])[setCol] as string);
  for (const i of hit) (rows[i] as string[])[setCol] = update.value;
  const oldValues = new Set(copies.map((i) => (data.rows[i] as readonly string[])[askCol] as string));
  const stale = copies.filter(
    (i) => !hit.includes(i) && oldValues.has((rows[i] as string[])[askCol] as string),
  );
  await ctx.emit({
    type: 'update',
    payload: { rows: hit, column: setCol, value: update.value, was, stale },
  });

  // 물음 — 사본 줄들이 내놓는 서로 다른 값.
  if (!(await pause())) return;
  const answers: { value: string; rows: number[] }[] = [];
  for (const i of copies) {
    const v = (rows[i] as string[])[askCol] as string;
    const found = answers.find((a) => a.value === v);
    if (found) found.rows.push(i);
    else answers.push({ value: v, rows: [i] });
  }
  await ctx.emit({ type: 'ask', payload: { answers } });
}
