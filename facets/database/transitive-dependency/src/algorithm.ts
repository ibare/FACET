/**
 * transitive-dependency — 열쇠에서 출발한 정해짐이 열쇠가 아닌 열을 건너 다른 열에 닿고,
 * 그 가운데 고리가 끊겨 떼어 나간다.
 *
 * 셈은 전부 여기서 한다 (선언 확인 · 폐포 · 건넌 고리 수 · 떼어 내기). 장면은 이벤트만 잇는다.
 *
 * - 선언된 함수 종속은 1차 데이터다. 줄에서 종속을 찾아내지 않는다 — 선언이 줄과 어긋나는지만 보고,
 *   어긋나면(왼쪽 값이 같은데 오른쪽 값이 갈리는 첫 짝) 던진다.
 * - 폐포: 열쇠 열 모음에서 출발해 선언을 적힌 차례대로 훑고, 왼쪽 열이 모두 모음에 있으면 오른쪽 열을
 *   더한다. 한 바퀴 동안 더해진 것이 없으면 멈춘다. 더할 것이 없는 적용은 걸음이 아니다.
 * - 건넌 고리 수: 열쇠 열은 0. 적용으로 더해진 열은 1 + (그 적용 왼쪽 열들의 건넌 고리 수 가운데 가장 큰 것).
 * - 떼어 내기: 이행 고리 = 건넌 고리 수 2 이상을 낳은 적용 가운데 왼쪽이 슈퍼키가 아닌 것. 정확히 하나여야
 *   한다. 떼어 낸 표 = 왼쪽 ∪ 오른쪽 열, 같은 줄은 처음 나온 것 하나만 (데이터 차례).
 *   남은 표 = 원래 열에서 오른쪽 열을 뺀 것, 줄 수는 그대로.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나가 emit 하나)
 *
 * - `reach`  { fd: number, lhs: string[], added: string[], hops: number, groups: number[] | null }
 *            선언 fd(0 부터) 하나의 적용. added 는 이번에 더해진 열, hops 는 그 열들의 건넌 고리 수.
 *            groups 는 lhs 가 슈퍼키가 아닐 때 줄마다 lhs 값이 처음 나온 차례의 번호(같은 값 = 같은 번호),
 *            lhs 가 슈퍼키면 null.
 * - `cut`    { fd: number, via: string[], to: string[], distinct: number, total: number }
 *            이행 고리 via → to 가 끊긴다. distinct 는 via 값의 서로 다른 수, total 은 줄 수.
 * - `split`  { name: string, cols: string[], keyCols: string[], keep: number[], slots: number[], hops: number[], remain: string[] }
 *            떼어 낸 표 name(cols, 열쇠 keyCols). keep 은 남는 줄의 원래 번호(처음 나온 차례).
 *            slots 는 원래 줄마다 포개지는 새 표의 줄 자리. hops 는 cols 마다 새 표의 열쇠에서 건넌 고리 수
 *            (선언 가운데 왼쪽이 새 표 안에 있는 것으로 셈한 폐포).
 *            remain 은 남은 표의 열.
 *
 * 걸음 0(표 · 열쇠 · 선언)은 장면의 initial 이 initialData 에서 채운다. 읽을 것이 있는 화면이라
 * 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FunctionalDependency = { lhs: string[]; rhs: string[] };

export type TransitiveDependencyFacetData = {
  type: 'transitive-dependency';
  stepMs: number;
  table: string;
  columns: string[];
  key: string[];
  rows: string[][];
  fds: FunctionalDependency[];
  splitName: string;
};

export type ClosureEntry = { fd: number; lhs: string[]; added: string[]; hops: number };

function fail(msg: string): never {
  throw new Error(`[transitive-dependency] ${msg}`);
}

function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || v.length === 0) fail(`${what} 는 비지 않은 글자 목록이어야 한다`);
  return v.map((x, i) => {
    if (typeof x !== 'string' || x === '') fail(`${what}[${i}] 가 빈 값이거나 글자가 아니다`);
    return x;
  });
}

/** initialData 를 좁힌다. 모르는 모양 · 빈 값은 던진다. */
export function narrowTransitiveData(raw: unknown): TransitiveDependencyFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'transitive-dependency') fail(`type 이 다르다: ${String(d.type)}`);
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) fail('stepMs 가 양수가 아니다');
  if (typeof d.table !== 'string' || d.table === '') fail('table 이름이 없다');
  if (typeof d.splitName !== 'string' || d.splitName === '') fail('splitName 이 없다');
  const columns = strList(d.columns, 'columns');
  if (new Set(columns).size !== columns.length) fail('열 이름이 겹친다');
  const has = (c: string, what: string): void => {
    if (!columns.includes(c)) fail(`${what} 의 열 ${c} 가 표에 없다`);
  };
  const key = strList(d.key, 'key');
  for (const c of key) has(c, 'key');
  if (!Array.isArray(d.rows) || d.rows.length === 0) fail('rows 가 비었다');
  const rows = d.rows.map((r, i) => {
    const row = strList(r, `rows[${i}]`);
    if (row.length !== columns.length) fail(`rows[${i}] 의 칸 수 ${row.length} 가 열 수 ${columns.length} 와 다르다`);
    return row;
  });
  if (!Array.isArray(d.fds) || d.fds.length === 0) fail('fds 가 비었다');
  const fds = d.fds.map((f, i) => {
    if (typeof f !== 'object' || f === null) fail(`fds[${i}] 가 객체가 아니다`);
    const o = f as Record<string, unknown>;
    const lhs = strList(o.lhs, `fds[${i}].lhs`);
    const rhs = strList(o.rhs, `fds[${i}].rhs`);
    for (const c of [...lhs, ...rhs]) has(c, `fds[${i}]`);
    return { lhs, rhs };
  });
  return { type: 'transitive-dependency', stepMs: d.stepMs, table: d.table, columns, key, rows, fds, splitName: d.splitName };
}

function project(data: TransitiveDependencyFacetData, row: string[], cols: string[]): string {
  return JSON.stringify(cols.map((c) => row[data.columns.indexOf(c)]));
}

/** 선언이 줄과 어긋나면(왼쪽이 같고 오른쪽이 갈리는 첫 짝) 던진다. */
function checkDeclared(data: TransitiveDependencyFacetData): void {
  data.fds.forEach((fd, n) => {
    const seen = new Map<string, { at: number; v: string }>();
    data.rows.forEach((row, i) => {
      const k = project(data, row, fd.lhs);
      const v = project(data, row, fd.rhs);
      const first = seen.get(k);
      if (first === undefined) seen.set(k, { at: i, v });
      else if (first.v !== v) fail(`선언 FD${n + 1} 가 줄 ${first.at + 1} · ${i + 1} 에서 어긋난다`);
    });
  });
}

/** 폐포와 적용 기록. 더할 것이 없는 적용은 기록하지 않는다. */
export function closureOf(start: string[], fds: FunctionalDependency[]): { cols: string[]; log: { fd: number; lhs: string[]; added: string[] }[] } {
  const cur = [...start];
  const log: { fd: number; lhs: string[]; added: string[] }[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    fds.forEach((fd, n) => {
      if (!fd.lhs.every((a) => cur.includes(a))) return;
      const added = fd.rhs.filter((a) => !cur.includes(a));
      if (added.length === 0) return;
      cur.push(...added);
      log.push({ fd: n, lhs: fd.lhs, added });
      changed = true;
    });
  }
  return { cols: cur, log };
}

function isSuperkey(data: TransitiveDependencyFacetData, cols: string[]): boolean {
  return closureOf(cols, data.fds).cols.length === data.columns.length;
}

/** 줄마다 cols 값이 처음 나온 차례의 번호. */
function groupsBy(data: TransitiveDependencyFacetData, cols: string[]): number[] {
  const order = new Map<string, number>();
  return data.rows.map((row) => {
    const k = project(data, row, cols);
    const seen = order.get(k);
    if (seen !== undefined) return seen;
    order.set(k, order.size);
    return order.size - 1;
  });
}

/** 폐포 기록에 건넌 고리 수를 단다. 열쇠 열은 0, 더해진 열은 1 + 왼쪽 열들의 고리 수 가운데 가장 큰 것. */
function hopEntries(key: string[], log: { fd: number; lhs: string[]; added: string[] }[]): ClosureEntry[] {
  const hops = new Map<string, number>(key.map((k) => [k, 0]));
  return log.map(({ fd, lhs, added }) => {
    const h =
      1 +
      Math.max(
        ...lhs.map((c) => {
          const v = hops.get(c);
          if (v === undefined) fail(`FD${fd + 1} 의 왼쪽 열 ${c} 에 아직 닿지 않았다`);
          return v;
        }),
      );
    for (const c of added) hops.set(c, h);
    return { fd, lhs, added, hops: h };
  });
}

export async function transitiveDependency(ctx0: FacetContext<TransitiveDependencyFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<TransitiveDependencyFacetData>;
  const data = narrowTransitiveData(ctx.data);
  const stepMs = data.stepMs;

  checkDeclared(data);
  const keyVals = new Set(data.rows.map((r) => project(data, r, data.key)));
  if (keyVals.size !== data.rows.length) fail(`열쇠 값이 겹친다: 서로 다른 ${keyVals.size} / 줄 ${data.rows.length}`);

  const { cols: reached, log } = closureOf(data.key, data.fds);
  if (reached.length !== data.columns.length) fail(`열쇠의 폐포가 표를 덮지 않는다: ${reached.join(', ')}`);

  const entries = hopEntries(data.key, log);

  const transitive = entries.filter((e) => e.hops >= 2 && !isSuperkey(data, e.lhs));
  const [link] = transitive;
  if (link === undefined || transitive.length !== 1) fail(`이행 고리가 하나가 아니다: ${transitive.length}`);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (const e of entries) {
    if (!(await pause())) return;
    const groups = isSuperkey(data, e.lhs) ? null : groupsBy(data, e.lhs);
    await ctx.emit({ type: 'reach', payload: { fd: e.fd, lhs: e.lhs, added: e.added, hops: e.hops, groups } });
  }

  if (!(await pause())) return;
  const distinct = new Set(data.rows.map((r) => project(data, r, link.lhs))).size;
  await ctx.emit({
    type: 'cut',
    payload: { fd: link.fd, via: link.lhs, to: link.added, distinct, total: data.rows.length },
  });

  if (!(await pause())) return;
  const splitCols = [...link.lhs, ...link.added];
  // 줄마다 포개지는 자리 = 그 줄의 (via, to) 값이 처음 나온 차례
  const slotByValue = new Map<string, number>();
  const keep: number[] = [];
  const slots = data.rows.map((row, i) => {
    const k = project(data, row, splitCols);
    const seen = slotByValue.get(k);
    if (seen !== undefined) return seen;
    slotByValue.set(k, keep.length);
    keep.push(i);
    return keep.length - 1;
  });
  // 떼어 낸 표 안의 고리 수 — 선언 가운데 왼쪽이 그 표 안에 있는 것만, 오른쪽은 그 표의 열로 좁힌다
  const inner = data.fds
    .filter((f) => f.lhs.every((c) => splitCols.includes(c)))
    .map((f) => ({ lhs: f.lhs, rhs: f.rhs.filter((c) => splitCols.includes(c)) }))
    .filter((f) => f.rhs.length > 0);
  const innerClosure = closureOf(link.lhs, inner);
  if (innerClosure.cols.length !== splitCols.length) fail(`떼어 낸 표의 열쇠가 표를 덮지 않는다: ${innerClosure.cols.join(', ')}`);
  const innerHop = new Map<string, number>(link.lhs.map((c) => [c, 0]));
  for (const e of hopEntries(link.lhs, innerClosure.log)) for (const c of e.added) innerHop.set(c, e.hops);
  const splitHops = splitCols.map((c) => {
    const h = innerHop.get(c);
    if (h === undefined) fail(`떼어 낸 표의 열 ${c} 에 고리 수가 없다`);
    return h;
  });
  const remain = data.columns.filter((c) => !link.added.includes(c));
  await ctx.emit({
    type: 'split',
    payload: { name: data.splitName, cols: splitCols, keyCols: link.lhs, keep, slots, hops: splitHops, remain },
  });
}
