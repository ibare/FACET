/**
 * window-function — 윈도 함수는 줄을 남긴 채 이웃을 모은다.
 *
 * 표 `run (id, team, km)` 에 두 질의를 나란히 건다.
 *   - `SUM(km) OVER (PARTITION BY team ORDER BY id ROWS BETWEEN k PRECEDING AND k FOLLOWING) AS near`
 *   - `SELECT team, SUM(km) AS total FROM run GROUP BY team`
 * 손잡이 `frame` 이 k 를 고른다 (사다리 `frames` = [0, 1, 2, -1], -1 = UNBOUNDED). 틀이 묶음을 다 덮으면
 * 그 줄의 near 가 GROUP BY 가 접어 낸 total 과 같아진다. 윈도 쪽은 끝까지 아홉 줄, 접힌 쪽은 세 줄.
 *
 * 규약
 *   - 묶음 = team. 묶음 차례 = team 이 처음 나온 차례. 묶음 안 차례 = id 차례 (행은 id 차례로 주어져야 한다 — 아니면 던진다)
 *   - 틀 = 같은 묶음 안에서 자리 pos − k 이상 pos + k 이하 (`ROWS`). 묶음 밖 줄은 없는 줄 — 끝에서 틀이 준다
 *   - UNBOUNDED 는 k = 표의 줄 수로 셈한다 (어느 묶음이든 덮는 폭 — IR 과 같은 규약)
 *   - 같은 줄 = near == total 인 줄 (정수 견줌)
 *   - 동률 규칙이 필요한 자리는 없다 (차례는 모두 처음 나온 차례 · id 차례로 정해진다)
 *
 * 한 판 = 걸음 일곱. 손잡이를 받으면 판을 처음부터 다시 돈다 (줄은 앞 판의 자리에 남는다).
 *   0 처음        `table`   — 표 · 두 질의 · 이번 틀 절
 *   1 모여 섬     `gather`  — id 차례 → 묶음 차례
 *   2·3·4 틀      `frames`  — 묶음 하나의 모든 줄의 틀과 near        (phase frame-sum)
 *   5 접힘        `fold`    — GROUP BY 가 묶음마다 한 줄로 접는다    (phase fold-total)
 *   6 같은 줄     `same`    — near == total 인 줄이 제 묶음 줄과 이어진다 (phase same-total)
 *
 * 이벤트 (모두 걸음 이벤트, `phase` 만 silent)
 *   table   { frame: number (사다리 색인), reach: string (앞뒤 줄 수 또는 UNBOUNDED 낱말), clause: string,
 *             rows: { id: number; team: string; km: number }[], columns: string[], alias: string, groupAlias: string,
 *             windowSql: { head: string[]; close: string; tail: string[] }, groupSql: string[], windowRows: number }
 *   gather  { slots: { row: number; part: number; pos: number }[] (id 차례의 행마다), parts: { team: string; size: number }[],
 *             widest: number (가장 큰 묶음의 줄 수) }
 *   frames  { part: number, team: string, size: number, widest: number (이 묶음에서 가장 넓은 틀의 줄 수),
 *             rows: { row: number; lo: number; hi: number; near: number }[] (lo · hi = 틀 첫 · 끝 줄의 행 번호) }
 *   fold    { groups: { team: string; total: number; rows: number[] }[], from: number, to: number }
 *   same    { links: { row: number; part: number }[], same: number, rows: number, groups: number, distinct: number }
 *   phase   { phase: 'frame-sum' | 'fold-total' | 'same-total' }  silent
 *
 * phase 어휘: frame-sum · fold-total · same-total (irs.ts 와 같다). 걸음 0 · 1 은 켜지 않는다.
 *
 * 계기 (판마다 — 걸음 0 에서 되돌린다)
 *   window-rows    윈도 결과 줄 (걸음 0 에서 9)
 *   group-rows     GROUP BY 결과 줄 (걸음 5 에서)
 *   same-as-total  near == total 인 줄 (걸음 6 에서)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WindowFunctionRow = { id: number; team: string; km: number };

export type WindowFunctionData = {
  type: 'window-function';
  stepMs: number;
  /** 운동 한 번의 길이 — 걸음마다 stepMs 에 더해 기다린다 */
  motionMs: number;
  /** 표 이름 · 열 이름 (자료) */
  table: string;
  columns: string[];
  rows: WindowFunctionRow[];
  /** 윈도 값의 열 이름 · GROUP BY 합의 열 이름 (질의의 AS) */
  alias: string;
  groupAlias: string;
  /** 손잡이 사다리 — 앞뒤 줄 수. -1 = UNBOUNDED */
  frames: number[];
  /** 사다리와 같은 차례의 틀 절 (SQL 그대로) */
  frameClauses: string[];
  /** UNBOUNDED 틀 낱말 (SQL) */
  unbounded: string;
  /** 첫 판의 사다리 색인 */
  frame: number;
  windowSql: { head: string[]; close: string; tail: string[] };
  groupSql: string[];
};

/** 한 틀 값의 셈 — 화면이 싣는 수 전부. test 가 IR 과 견준다 */
export type WindowFunctionResult = {
  /** id 차례의 행마다 묶음 번호 (처음 나온 차례, 0 부터) */
  part: number[];
  /** id 차례의 행마다 묶음 안 자리 (0 부터) */
  pos: number[];
  teams: string[];
  near: number[];
  total: number[];
  same: number;
  distinct: number;
};

/** 앞뒤 줄 수 → 셈에 쓰는 k. UNBOUNDED(-1) 는 표의 줄 수 */
export function reachOf(data: WindowFunctionData, frame: number): number {
  const k = data.frames[frame];
  if (typeof k !== 'number') throw new Error(`window-function: 사다리 밖의 틀 색인 ${frame}`);
  if (k === -1) return data.rows.length;
  if (k < 0 || !Number.isInteger(k)) throw new Error(`window-function: 셈할 수 없는 틀 ${k}`);
  return k;
}

/**
 * 묶음을 실제로 지어(team 별 줄 목록) 틀을 잘라 더한다 — IR 의 "자리를 세며 훑기" 와 다른 길.
 * 두 길의 답이 같다는 것은 test 가 보인다.
 */
export function computeWindow(data: WindowFunctionData, frame: number): WindowFunctionResult {
  const rows = data.rows;
  if (rows.length === 0) throw new Error('window-function: 줄이 없다');
  for (let i = 1; i < rows.length; i += 1) {
    if (!(rows[i - 1].id < rows[i].id)) throw new Error('window-function: 줄이 id 차례가 아니다');
  }
  const k = reachOf(data, frame);
  const teams: string[] = [];
  const groups: number[][] = [];
  const part: number[] = [];
  const pos: number[] = [];
  rows.forEach((r, i) => {
    if (!Number.isInteger(r.km) || r.km <= 0) throw new Error(`window-function: km 가 양의 정수가 아니다 (id ${r.id})`);
    let p = teams.indexOf(r.team);
    if (p < 0) {
      p = teams.length;
      teams.push(r.team);
      groups.push([]);
    }
    part.push(p);
    pos.push(groups[p].length);
    groups[p].push(i);
  });
  const near: number[] = [];
  const total: number[] = [];
  let same = 0;
  rows.forEach((_r, i) => {
    const members = groups[part[i]];
    const lo = Math.max(0, pos[i] - k);
    const hi = Math.min(members.length - 1, pos[i] + k);
    let s = 0;
    for (const j of members.slice(lo, hi + 1)) s += rows[j].km;
    let g = 0;
    for (const j of members) g += rows[j].km;
    near.push(s);
    total.push(g);
    if (s === g) same += 1;
  });
  const distinct = new Set(near).size;
  return { part, pos, teams, near, total, same, distinct };
}

export async function windowFunctionAlgorithm(
  context: FacetContext<WindowFunctionData>,
): Promise<void> {
  const ctx = context as ReactiveContext<WindowFunctionData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const shown = new Map<string, number>();
  const show = (name: string, value: number) => {
    const before = shown.get(name);
    ctx.metric(name, value - (before === undefined ? 0 : before));
    shown.set(name, value);
  };
  const pause = () => ctx.sleep(data.stepMs + data.motionMs);

  let frame = data.frame;
  reachOf(data, frame);

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const res = computeWindow(data, frame);
      const n = data.rows.length;
      const k = data.frames[frame];
      const clause = data.frameClauses[frame];
      if (typeof clause !== 'string') throw new Error(`window-function: 틀 절이 없다 (${frame})`);

      // 걸음 0 — 처음 모습
      show('window-rows', n);
      show('group-rows', 0);
      show('same-as-total', 0);
      await ctx.emit({
        type: 'table',
        payload: {
          frame,
          reach: k === -1 ? data.unbounded : String(k),
          clause,
          rows: data.rows.map((r) => ({ id: r.id, team: r.team, km: r.km })),
          columns: [...data.columns],
          alias: data.alias,
          groupAlias: data.groupAlias,
          windowSql: data.windowSql,
          groupSql: [...data.groupSql],
          windowRows: n,
        },
      });
      if (!(await pause())) return;

      // 걸음 1 — 묶음으로 모여 선다
      const sizes = res.teams.map((_team, p) => res.part.filter((q) => q === p).length);
      await ctx.emit({
        type: 'gather',
        payload: {
          slots: res.part.map((p, row) => ({ row, part: p, pos: res.pos[row] })),
          parts: res.teams.map((team, p) => ({ team, size: sizes[p] })),
          widest: Math.max(...sizes),
        },
      });
      if (!(await pause())) return;

      // 걸음 2 · 3 · 4 — 묶음 하나씩, 그 묶음의 모든 줄의 틀
      for (let p = 0; p < res.teams.length; p += 1) {
        if (ctx.cancelled) return;
        const members = res.part.flatMap((q, row) => (q === p ? [row] : []));
        const reach = reachOf(data, frame);
        const frameRows = members.map((row) => {
          const lo = members[Math.max(0, res.pos[row] - reach)];
          const hi = members[Math.min(members.length - 1, res.pos[row] + reach)];
          return { row, lo, hi, near: res.near[row] };
        });
        const widest = Math.max(...frameRows.map((f) => res.pos[f.hi] - res.pos[f.lo] + 1));
        await ctx.emit({
          type: 'frames',
          payload: { part: p, team: res.teams[p], size: members.length, widest, rows: frameRows },
        });
        await phase('frame-sum');
        if (!(await pause())) return;
      }

      // 걸음 5 — GROUP BY 가 접는다
      const groups = res.teams.map((team, p) => {
        const members = res.part.flatMap((q, row) => (q === p ? [row] : []));
        return { team, total: res.total[members[0]], rows: members };
      });
      await ctx.emit({ type: 'fold', payload: { groups, from: n, to: groups.length } });
      show('group-rows', groups.length);
      await phase('fold-total');
      if (!(await pause())) return;

      // 걸음 6 — 같은 줄이 제 묶음 줄과 이어진다
      const links = res.near.flatMap((v, row) => (v === res.total[row] ? [{ row, part: res.part[row] }] : []));
      await ctx.emit({
        type: 'same',
        payload: { links, same: res.same, rows: n, groups: groups.length, distinct: res.distinct },
      });
      show('same-as-total', res.same);
      await phase('same-total');

      // 한 판 끝 — 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'frame') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) throw new Error('window-function: frame 입력에 payload 가 없다');
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= data.frames.length) {
          throw new Error(`window-function: 사다리 밖의 손잡이 값 ${String(value)}`);
        }
        frame = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
