/**
 * normal-forms — 같은 표를 UNF 에서 BCNF 까지 떼어 가며, 사실 하나를 고칠 때 건드릴 줄이 어떻게 바뀌는지 센다.
 *
 * 손잡이 둘 (reactive):
 *   stage — 단계 번호 (0 UNF · 1 1NF · 2 2NF · 3 3NF · 4 BCNF). 값 = `data.stages` 의 색인
 *   fact  — 고칠 사실 번호 (0 title · 1 office · 2 subject). 값 = `data.facts` 의 색인
 * 짜임: 한 판(걸음 넷)을 끝까지 재생 → `waitForInput` → 받은 값으로 다시 한 판.
 *
 * 규약 (사양 · 공통 안내문):
 *   - 함수 종속은 **선언**이다. 줄에서 찾지 않는다 — 선언이 줄과 어긋나면 던진다
 *   - 떼어 낸 표의 줄 = 1NF 줄에서 그 표의 (nested 아닌) 열만 남기고 같은 줄은 처음 나온 것 하나, 차례는 처음 나온 차례.
 *     UNF 는 nested 아닌 열이 같은 줄들의 무리 하나가 한 줄이고, nested 칸 글자 = 무리 안 줄 차례로 값을 ", " 로 이은 것
 *   - 사실을 담은 표 = 표 차례로 처음, 고칠 열과 정하는 열을 둘 다 가진 표
 *   - 고칠 줄 = 담은 표에서 정하는 열 = 값 인 사실이 적힌 줄 수 (UNF 는 그런 1NF 줄을 하나라도 가진 무리 수)
 *   - 찾은 줄 = 조건 `<정하는 열> = '<값>'` 이 담은 표에서 집는 줄 수. 같음 = 칸 글자 **전체**가 같다 (목록 칸은 목록 글자 전체)
 *   - 잃은 종속 = 어느 한 표에도 왼쪽 · 오른쪽 열이 다 들지 않는 선언 종속 수. 집 = 표 차례로 처음, 다 가진 표
 *   - 동률 · 실수 없음. 모두 정수 셈
 *
 * 이벤트 (silent 가 아닌 것은 걸음 하나씩):
 *   layout  { stage: number, stageName: string, fact: { fix, key, value: string },
 *             tables: { name: string, cols: string[], nested: string[], slots: number[], lead: boolean[],
 *                       cells: string[][], rowCount: number }[], fds }
 *           — 걸음 0. 이 단계의 표들. slots[i] = 1NF 줄 i 가 앉는 줄 자리, lead[i] = 그 자리의 첫 줄인가,
 *             cells[c][i] = 열 cols[c] 의 줄 i 칸 글자 (접힌 줄은 앉은 자리의 글자와 같다)
 *             fds: { id: string, lhs: string[], rhs: string[] }[] — 선언된 종속 (걸음 0 에서는 아직 집이 없다)
 *   fix     { table: string, fix: string, key: string, value: string, slots: number[], count: number }
 *           — 걸음 1. 사실이 적힌 줄 자리들 (fix-rows)
 *   found   { table: string, key: string, value: string, slots: number[], count: number, fixCount: number,
 *             nestedKey: boolean, cell: string | null }
 *           — 걸음 2. 조건이 집은 줄 자리들 (found-rows). cell = 목록 칸이 값과 통째로 다른 첫 칸 (없으면 null)
 *   homes   { fds: { id: string, lhs: string[], rhs: string[], home: string | null }[], kept: number, lost: number }
 *           — 걸음 3. 종속마다 제 열을 다 가진 첫 표 (없으면 null)
 *   phase   { phase: string | null } — silent. 코드 패널 줄
 *
 * phase 어휘 (irs.ts 와 같다): fix-count · fd-check · fd-lost
 *   걸음 0 → 끔(null) · 걸음 1 → fix-count · 걸음 2 → 끔(찾은 줄은 IR 밖) · 걸음 3 → 잃은 종속이 있으면 fd-lost, 없으면 fd-check
 *
 * 계기 (판마다 — 지금 값을 들고 차이만 보낸다):
 *   tables (표 수) · fix-rows (고칠 줄) · found-rows (찾은 줄) · lost-fds (잃은 종속)
 *   걸음 0 에서 tables 를 이 판 값으로, 나머지 셋을 0 으로 → 걸음 1 · 2 · 3 에서 차례로 제 값
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NormalFormsTable = { name: string; cols: string[]; nested: string[] };
export type NormalFormsStage = { name: string; tables: NormalFormsTable[] };
export type NormalFormsDependency = { id: string; lhs: string[]; rhs: string[] };
export type NormalFormsFact = { fix: string; key: string; value: string };

export type NormalFormsData = {
  type: 'normal-forms';
  stepMs: number;
  /** 열 차례 — IR 의 열 번호 0.. */
  columns: string[];
  /** 1NF 줄, 이 차례 */
  rows: string[][];
  dependencies: NormalFormsDependency[];
  /** 단계 손잡이의 사다리 — 값 = 색인 */
  stages: NormalFormsStage[];
  /** 고칠 사실 손잡이의 사다리 — 값 = 색인 */
  facts: NormalFormsFact[];
  /** 손잡이 기본값 (facet.ts 의 segments default 와 같다) */
  initial: { stage: number; fact: number };
};

/** 떼어 낸 표 한 장 — 걸음 0 의 payload 원소 */
export type NormalFormsProjected = {
  name: string;
  cols: string[];
  nested: string[];
  slots: number[];
  lead: boolean[];
  cells: string[][];
  rowCount: number;
};

/** 한 판의 셈 — 화면에 싣는 수 전부 */
export type NormalFormsRound = {
  tables: NormalFormsProjected[];
  holder: NormalFormsProjected;
  fixSlots: number[];
  foundSlots: number[];
  nestedKey: boolean;
  cell: string | null;
  homes: { id: string; lhs: string[]; rhs: string[]; home: string | null }[];
  lost: number;
};

function colIndex(data: NormalFormsData, col: string): number {
  const i = data.columns.indexOf(col);
  if (i < 0) throw new Error(`normal-forms: 모르는 열 '${col}'`);
  return i;
}

/** 선언과 줄이 어긋나지 않는지 — 어긋나면 던진다 (종속을 줄에서 찾지 않는다) */
export function validateNormalForms(data: NormalFormsData): void {
  for (const row of data.rows) {
    if (row.length !== data.columns.length) throw new Error(`normal-forms: 줄의 칸 수 ${row.length} ≠ 열 수 ${data.columns.length}`);
  }
  for (const fd of data.dependencies) {
    const l = fd.lhs.map((c) => colIndex(data, c));
    const r = fd.rhs.map((c) => colIndex(data, c));
    const seen = new Map<string, string>();
    for (const row of data.rows) {
      const k = JSON.stringify(l.map((i) => row[i]));
      const v = JSON.stringify(r.map((i) => row[i]));
      const prev = seen.get(k);
      if (prev === undefined) seen.set(k, v);
      else if (prev !== v) throw new Error(`normal-forms: 선언된 종속 ${fd.id} 이 줄과 어긋난다 (${k})`);
    }
  }
  for (const st of data.stages) {
    if (st.tables.length === 0) throw new Error(`normal-forms: 단계 ${st.name} 에 표가 없다`);
    for (const tb of st.tables) {
      for (const c of tb.cols) colIndex(data, c);
      for (const c of tb.nested) if (!tb.cols.includes(c)) throw new Error(`normal-forms: ${tb.name} 의 목록 열 ${c} 이 표에 없다`);
      if (tb.nested.length === tb.cols.length) throw new Error(`normal-forms: ${tb.name} 에 목록 아닌 열이 없다`);
    }
  }
  for (const f of data.facts) {
    colIndex(data, f.fix);
    const k = colIndex(data, f.key);
    if (!data.rows.some((row) => row[k] === f.value)) throw new Error(`normal-forms: 사실 ${f.key} = '${f.value}' 이 적힌 줄이 없다`);
  }
}

/** 떼어 내기 — 목록 아닌 열이 같은 줄은 한 자리에 앉는다 (처음 나온 차례) */
export function projectTable(data: NormalFormsData, table: NormalFormsTable): NormalFormsProjected {
  const ident = table.cols.filter((c) => !table.nested.includes(c)).map((c) => colIndex(data, c));
  const keys: string[] = [];
  const slots: number[] = [];
  const lead: boolean[] = [];
  for (const row of data.rows) {
    const k = JSON.stringify(ident.map((i) => row[i]));
    let s = keys.indexOf(k);
    if (s < 0) {
      s = keys.length;
      keys.push(k);
      lead.push(true);
    } else {
      lead.push(false);
    }
    slots.push(s);
  }
  const cells = table.cols.map((c) => {
    const ci = colIndex(data, c);
    const nested = table.nested.includes(c);
    return data.rows.map((_, i) => {
      const own = data.rows[i];
      if (own === undefined) throw new Error('normal-forms: 줄이 없다');
      const v = own[ci];
      if (v === undefined) throw new Error('normal-forms: 칸이 없다');
      if (!nested) return v;
      const members = data.rows.filter((_, j) => slots[j] === slots[i]).map((r) => {
        const x = r[ci];
        if (x === undefined) throw new Error('normal-forms: 칸이 없다');
        return x;
      });
      return members.join(', ');
    });
  });
  return { name: table.name, cols: [...table.cols], nested: [...table.nested], slots, lead, cells, rowCount: keys.length };
}

/** 한 판의 셈 — 손잡이 두 값에서 화면에 싣는 수 전부 */
export function computeNormalForms(data: NormalFormsData, stageIndex: number, factIndex: number): NormalFormsRound {
  const stage = data.stages[stageIndex];
  const fact = data.facts[factIndex];
  if (!stage) throw new Error(`normal-forms: 사다리 밖의 단계 ${stageIndex}`);
  if (!fact) throw new Error(`normal-forms: 사다리 밖의 사실 ${factIndex}`);
  const tables = stage.tables.map((tb) => projectTable(data, tb));
  const holder = tables.find((tb) => tb.cols.includes(fact.fix) && tb.cols.includes(fact.key));
  if (!holder) throw new Error(`normal-forms: ${stage.name} 에 ${fact.key} → ${fact.fix} 를 담은 표가 없다`);
  const k = colIndex(data, fact.key);
  const fixSet = new Set<number>();
  data.rows.forEach((row, i) => {
    const s = holder.slots[i];
    if (s === undefined) throw new Error('normal-forms: 줄 자리가 없다');
    if (row[k] === fact.value) fixSet.add(s);
  });
  const fixSlots = [...fixSet].sort((a, b) => a - b);
  const keyCells = holder.cells[holder.cols.indexOf(fact.key)];
  if (!keyCells) throw new Error('normal-forms: 담은 표에 정하는 열이 없다');
  const foundSet = new Set<number>();
  let cell: string | null = null;
  const nestedKey = holder.nested.includes(fact.key);
  for (let i = 0; i < keyCells.length; i += 1) {
    const text = keyCells[i];
    const s = holder.slots[i];
    if (text === undefined || s === undefined) throw new Error('normal-forms: 칸이나 줄 자리가 없다');
    if (text === fact.value) foundSet.add(s);
    else if (nestedKey && cell === null && fixSet.has(s)) cell = text;
  }
  const foundSlots = [...foundSet].sort((a, b) => a - b);
  const homes = data.dependencies.map((fd) => {
    const need = [...fd.lhs, ...fd.rhs];
    const home = tables.find((tb) => need.every((c) => tb.cols.includes(c)));
    return { id: fd.id, lhs: [...fd.lhs], rhs: [...fd.rhs], home: home ? home.name : null };
  });
  const lost = homes.filter((h) => h.home === null).length;
  return { tables, holder, fixSlots, foundSlots, nestedKey, cell, homes, lost };
}

type KnobInput = { type: string; payload?: unknown };

function readKnob(input: KnobInput, size: number): number {
  const p = input.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`normal-forms: ${input.type} 입력에 payload 가 없다`);
  const v = (p as { value?: unknown }).value;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= size) {
    throw new Error(`normal-forms: 사다리 밖의 ${input.type} 값 ${String(v)}`);
  }
  return v;
}

export async function normalFormsAlgorithm(context: FacetContext<NormalFormsData>): Promise<void> {
  const ctx = context as ReactiveContext<NormalFormsData>;
  const data = ctx.data;
  validateNormalForms(data);
  const stepMs = data.stepMs;
  const motionMs = 700;

  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    shown.set(name, value);
    ctx.metric(name, prev === undefined ? value : value - prev);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let stageIndex = data.initial.stage;
  let factIndex = data.initial.fact;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const round = computeNormalForms(data, stageIndex, factIndex);
      const stage = data.stages[stageIndex];
      const fact = data.facts[factIndex];
      if (!stage || !fact) throw new Error('normal-forms: 사다리 밖의 손잡이 값');

      // 걸음 0 — 이 단계의 표들이 자리에 선다
      await ctx.emit({ type: 'phase', payload: { phase: null }, silent: true });
      setMetric('tables', round.tables.length);
      setMetric('fix-rows', 0);
      setMetric('found-rows', 0);
      setMetric('lost-fds', 0);
      await ctx.emit({
        type: 'layout',
        payload: {
          stage: stageIndex,
          stageName: stage.name,
          fact: { ...fact },
          tables: round.tables,
          fds: data.dependencies.map((fd) => ({ id: fd.id, lhs: [...fd.lhs], rhs: [...fd.rhs] })),
        },
      });
      if (!(await ctx.sleep(stepMs + motionMs))) return;

      // 걸음 1 — 사실이 적힌 줄
      setMetric('fix-rows', round.fixSlots.length);
      await ctx.emit({
        type: 'fix',
        payload: {
          table: round.holder.name,
          fix: fact.fix,
          key: fact.key,
          value: fact.value,
          slots: round.fixSlots,
          count: round.fixSlots.length,
        },
      });
      await phase('fix-count');
      if (!(await ctx.sleep(stepMs + motionMs))) return;

      // 걸음 2 — 조건이 집은 줄 (IR 밖이라 코드 줄을 끈다)
      setMetric('found-rows', round.foundSlots.length);
      await ctx.emit({
        type: 'found',
        payload: {
          table: round.holder.name,
          key: fact.key,
          value: fact.value,
          slots: round.foundSlots,
          count: round.foundSlots.length,
          fixCount: round.fixSlots.length,
          nestedKey: round.nestedKey,
          cell: round.cell,
        },
      });
      await ctx.emit({ type: 'phase', payload: { phase: null }, silent: true });
      if (!(await ctx.sleep(stepMs + motionMs))) return;

      // 걸음 3 — 종속의 집
      setMetric('lost-fds', round.lost);
      await ctx.emit({
        type: 'homes',
        payload: { fds: round.homes, kept: round.homes.length - round.lost, lost: round.lost },
      });
      if (round.lost > 0) await phase('fd-lost');
      else await phase('fd-check');
      if (!(await ctx.sleep(stepMs + motionMs))) return;

      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'stage') {
          stageIndex = readKnob(input, data.stages.length);
          break;
        }
        if (input.type === 'fact') {
          factIndex = readKnob(input, data.facts.length);
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
