/**
 * pick-one-out — 다른 브랜치의 커밋 하나만 가져오면 무엇이 오는가.
 *
 * 고른 커밋의 파일을 그 부모의 파일과 줄 단위로 견주어 차이(한 뭉치)를 셈하고,
 * 그 뭉치만 HEAD 가 가리키는 이름의 파일에 얹은 뒤 새 커밋을 만든다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 채운다 (이력 · 두 파일).
 * 걸음 0 이 이미 읽을 화면이라 첫 발신 앞에 stepMs 를 둔다.
 *
 * 이벤트 (모두 silent 아님):
 * - `diff`   { pick: string; parent: string; rows: { op: ' ' | '-' | '+'; text: string }[] }
 *            고른 커밋(pick)의 파일을 부모(parent)의 파일과 견준 줄 차이. rows 는 같은 줄까지 모두 담는다.
 * - `land`   { branch: string; result: string[]; hunks: { at: number; removed: string[]; added: string[] }[] }
 *            차이의 뭉치들을 branch 가 가리키는 커밋의 파일에 얹은 결과.
 *            at 은 얹기 직전 파일에서 뭉치가 놓인 줄 자리(0 부터).
 * - `commit` { id: string; parent: string; branch: string; from: string }
 *            새 커밋 id(부모 parent)가 생기고 이름 branch 가 from 에서 id 로 옮긴다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PickCommit = { id: string; parents: string[]; lines: string[] };
export type PickName = { name: string; commit: string };

export type PickOneOutFacetData = {
  type: 'pick-one-out';
  stepMs: number;
  commits: PickCommit[];
  names: PickName[];
  head: string;
  pick: string;
};

export type DiffOp = ' ' | '-' | '+';
export type DiffRow = { op: DiffOp; text: string };
export type Hunk = { at: number; removed: string[]; added: string[] };
export type HunkSpan = { start: number; end: number };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`pick-one-out: ${path} 는 빈 글자가 아닌 글자여야 한다`);
  return v;
}

function readStrings(v: unknown, path: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(v)) throw new Error(`pick-one-out: ${path} 는 목록이어야 한다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`pick-one-out: ${path}[${i}] 는 글자여야 한다`);
    if (!allowEmpty && x === '') throw new Error(`pick-one-out: ${path}[${i}] 가 비었다`);
    return x;
  });
}

/** initialData 를 좁힌다. 모르는 모양은 필드 경로를 담아 던진다. */
export function narrowPickData(raw: unknown): PickOneOutFacetData {
  if (!isRecord(raw)) throw new Error('pick-one-out: initialData 가 객체가 아니다');
  if (raw.type !== 'pick-one-out') throw new Error('pick-one-out: initialData.type 이 pick-one-out 이 아니다');
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('pick-one-out: initialData.stepMs 는 양수여야 한다');
  if (!Array.isArray(raw.commits)) throw new Error('pick-one-out: initialData.commits 는 목록이어야 한다');
  const commits: PickCommit[] = raw.commits.map((c, i) => {
    if (!isRecord(c)) throw new Error(`pick-one-out: initialData.commits[${i}] 가 객체가 아니다`);
    const id = readString(c.id, `initialData.commits[${i}].id`);
    const parents = readStrings(c.parents, `initialData.commits[${i}].parents`, false);
    if (parents.length > 1) throw new Error(`pick-one-out: 커밋 ${id} 는 부모가 둘 이상이다 — 이 조각은 병합 커밋을 다루지 않는다`);
    const lines = readStrings(c.lines, `initialData.commits[${i}].lines`, true);
    return { id, parents, lines };
  });
  const ids = new Set<string>();
  for (const c of commits) {
    if (ids.has(c.id)) throw new Error(`pick-one-out: 커밋 ${c.id} 가 두 번 나온다`);
    ids.add(c.id);
  }
  for (const c of commits) {
    for (const p of c.parents) {
      if (!ids.has(p)) throw new Error(`pick-one-out: 커밋 ${c.id} 의 부모 ${p} 가 자료에 없다`);
    }
  }
  if (!Array.isArray(raw.names)) throw new Error('pick-one-out: initialData.names 는 목록이어야 한다');
  const names: PickName[] = raw.names.map((n, i) => {
    if (!isRecord(n)) throw new Error(`pick-one-out: initialData.names[${i}] 가 객체가 아니다`);
    const name = readString(n.name, `initialData.names[${i}].name`);
    const commit = readString(n.commit, `initialData.names[${i}].commit`);
    if (!ids.has(commit)) throw new Error(`pick-one-out: 이름 ${name} 이 가리키는 ${commit} 가 자료에 없다`);
    return { name, commit };
  });
  const head = readString(raw.head, 'initialData.head');
  if (!names.some((n) => n.name === head)) throw new Error(`pick-one-out: HEAD 가 가리키는 이름 ${head} 가 names 에 없다`);
  const pick = readString(raw.pick, 'initialData.pick');
  if (!ids.has(pick)) throw new Error(`pick-one-out: 고를 커밋 ${pick} 가 자료에 없다`);
  return { type: 'pick-one-out', stepMs, commits, names, head, pick };
}

export function commitById(commits: readonly PickCommit[], id: string): PickCommit {
  const c = commits.find((x) => x.id === id);
  if (!c) throw new Error(`pick-one-out: 커밋 ${id} 가 없다`);
  return c;
}

/** 첫 부모. 뿌리면 null. 부모가 둘 이상이면 던진다. */
export function parentOf(commits: readonly PickCommit[], id: string): string | null {
  const c = commitById(commits, id);
  if (c.parents.length > 1) throw new Error(`pick-one-out: 커밋 ${id} 는 병합 커밋이다`);
  return c.parents.length === 1 ? c.parents[0]! : null;
}

export function nameTarget(names: readonly PickName[], name: string): string {
  const n = names.find((x) => x.name === name);
  if (!n) throw new Error(`pick-one-out: 이름 ${name} 이 없다`);
  return n.commit;
}

/** start 에서 첫 부모를 따라 거슬러 닿는 커밋 (start 포함, 가까운 것부터). 본 커밋은 다시 보지 않는다. */
export function reachable(commits: readonly PickCommit[], start: string): string[] {
  const seen: string[] = [];
  let at: string | null = start;
  while (at !== null) {
    if (seen.includes(at)) throw new Error(`pick-one-out: 커밋 ${at} 에서 고리가 생겼다`);
    seen.push(at);
    at = parentOf(commits, at);
  }
  return seen;
}

/** 뿌리에서 떨어진 칸 수. */
export function depthOf(commits: readonly PickCommit[], id: string): number {
  return reachable(commits, id).length - 1;
}

/**
 * LCS 로 줄 차이를 셈한다. 줄은 글자 그대로 같아야 같은 줄이다.
 * 되짚을 때 동률이면 지움을 먼저 둔다.
 */
export function diffLines(oldLines: readonly string[], newLines: readonly string[]): DiffRow[] {
  const n = oldLines.length;
  const m = newLines.length;
  const lcs: number[][] = [];
  for (let i = 0; i <= n; i += 1) lcs.push(new Array<number>(m + 1).fill(0));
  const at = (i: number, j: number): number => {
    const row = lcs[i];
    const v = row === undefined ? undefined : row[j];
    if (v === undefined) throw new Error(`pick-one-out: LCS 표의 칸 (${i}, ${j}) 가 없다`);
    return v;
  };
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] = oldLines[i] === newLines[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const a = oldLines[i]!;
    const b = newLines[j]!;
    if (a === b) {
      rows.push({ op: ' ', text: a });
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      rows.push({ op: '-', text: a });
      i += 1;
    } else {
      rows.push({ op: '+', text: b });
      j += 1;
    }
  }
  for (; i < n; i += 1) rows.push({ op: '-', text: oldLines[i]! });
  for (; j < m; j += 1) rows.push({ op: '+', text: newLines[j]! });
  return rows;
}

/** 차이 행에서 바뀐 줄 뭉치(이어진 지움 뒤 이어진 넣음)의 행 범위 [start, end). */
export function hunkSpans(rows: readonly DiffRow[]): HunkSpan[] {
  const spans: HunkSpan[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i]!.op === ' ') {
      i += 1;
      continue;
    }
    const start = i;
    while (i < rows.length && rows[i]!.op === '-') i += 1;
    while (i < rows.length && rows[i]!.op === '+') i += 1;
    spans.push({ start, end: i });
  }
  return spans;
}

/**
 * 뭉치들을 대상 파일에 얹는다. 지울 줄은 대상에 글자 그대로 딱 한 번 있어야 하고,
 * 넣을 줄은 지운 자리에 선다. 지움이 없는 뭉치는 바로 앞 같은 줄 뒤에 선다.
 */
export function applyChange(target: readonly string[], rows: readonly DiffRow[]): { result: string[]; hunks: Hunk[] } {
  const out = [...target];
  const hunks: Hunk[] = [];
  for (const span of hunkSpans(rows)) {
    const chunk = rows.slice(span.start, span.end);
    const removed = chunk.filter((r) => r.op === '-').map((r) => r.text);
    const added = chunk.filter((r) => r.op === '+').map((r) => r.text);
    let at: number;
    if (removed.length > 0) {
      const first = removed[0]!;
      const count = out.filter((l) => l === first).length;
      if (count !== 1) throw new Error(`pick-one-out: 지울 줄 "${first}" 이 대상에 ${count} 번 있다 — 딱 한 번이어야 한다`);
      at = out.indexOf(first);
      const seg = out.slice(at, at + removed.length);
      if (seg.length !== removed.length || seg.some((l, k) => l !== removed[k])) {
        throw new Error(`pick-one-out: 지울 줄 묶음 "${first}" … 이 대상에서 이어져 있지 않다`);
      }
      out.splice(at, removed.length, ...added);
    } else {
      const before = span.start > 0 ? rows[span.start - 1] : undefined;
      if (before === undefined || before.op !== ' ') throw new Error('pick-one-out: 넣을 자리를 정할 앞 줄이 없다');
      const count = out.filter((l) => l === before.text).length;
      if (count !== 1) throw new Error(`pick-one-out: 앞 줄 "${before.text}" 이 대상에 ${count} 번 있다 — 넣을 자리를 정할 수 없다`);
      at = out.indexOf(before.text) + 1;
      out.splice(at, 0, ...added);
    }
    hunks.push({ at, removed, added });
  }
  return { result: out, hunks };
}

/** 다시 만든 커밋의 이름 — 따옴표 하나. */
export function remadeId(id: string): string {
  return `${id}'`;
}

export async function pickOneOut(ctxBase: FacetContext<PickOneOutFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<PickOneOutFacetData>;
  const data = narrowPickData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const headAt = nameTarget(data.names, data.head);
  const parent = parentOf(data.commits, data.pick);
  if (parent === null) throw new Error(`pick-one-out: 고른 커밋 ${data.pick} 는 부모가 없어 견줄 것이 없다`);
  if (reachable(data.commits, headAt).includes(data.pick)) {
    throw new Error(`pick-one-out: 고른 커밋 ${data.pick} 는 이미 ${data.head} 에서 닿는다`);
  }
  const made = remadeId(data.pick);
  if (data.commits.some((c) => c.id === made)) throw new Error(`pick-one-out: 새 커밋 이름 ${made} 가 이미 있다`);

  // 걸음 0 (처음 화면) 을 읽을 틈.
  if (!(await pause())) return;

  const rows = diffLines(commitById(data.commits, parent).lines, commitById(data.commits, data.pick).lines);
  if (hunkSpans(rows).length === 0) throw new Error(`pick-one-out: 고른 커밋 ${data.pick} 에 바뀐 줄이 없다`);
  await ctx.emit({ type: 'diff', payload: { pick: data.pick, parent, rows } });
  if (!(await pause())) return;

  const landed = applyChange(commitById(data.commits, headAt).lines, rows);
  await ctx.emit({ type: 'land', payload: { branch: data.head, result: landed.result, hunks: landed.hunks } });
  if (!(await pause())) return;

  await ctx.emit({ type: 'commit', payload: { id: made, parent: headAt, branch: data.head, from: headAt } });
}
