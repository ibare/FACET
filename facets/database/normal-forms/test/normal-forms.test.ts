// @vitest-environment happy-dom
/**
 * normal-forms 고유의 주장:
 *   1. IR(rowsToFix · lostDependencies)의 답이 모든 손잡이 조합(5 × 3)에서 algorithm 이 화면에 싣는 수와 같다
 *   2. 사양 실측표와 같다 (표 수 · 담은 표 · 고칠 줄 · 찾은 줄 · 잃은 종속, 떼어 낸 표의 줄 수)
 *   3. 회차별 계기 — 손잡이를 A → B → A 로 돌려 회차마다 사양 표와 견준다
 *   4. 사다리가 segments[].value 와 같다, 매개변수 배열 길이
 *   5. stage 를 mountView 로 올려 칸이 접히는지 본다
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  computeNormalForms,
  normalFormsAlgorithm,
  normalFormsFacet,
  normalFormsImperativeIR,
  normalFormsProjector,
  normalFormsStageView,
  type NormalFormsData,
} from '../src/index.js';

const data = normalFormsFacet.initialData as NormalFormsData;

/** 부르는 쪽의 번호 매기기 — 열마다 값을 처음 나온 차례로 0.. */
function encode(d: NormalFormsData): { flat: number[]; codes: Map<string, number>[] } {
  const codes = d.columns.map(() => new Map<string, number>());
  const flat: number[] = [];
  for (const row of d.rows) {
    row.forEach((v, c) => {
      const m = codes[c]!;
      if (!m.has(v)) m.set(v, m.size);
      flat.push(m.get(v)!);
    });
  }
  return { flat, codes };
}

function irCounts(d: NormalFormsData, s: number, f: number): { fix: number; lost: number } {
  const { flat, codes } = encode(d);
  const nCol = d.columns.length;
  const stage = d.stages[s]!;
  const fact = d.facts[f]!;
  const holder = stage.tables.find((tb) => tb.cols.includes(fact.fix) && tb.cols.includes(fact.key))!;
  const mask = d.columns.map((c) => (holder.cols.includes(c) && !holder.nested.includes(c) ? 1 : 0));
  const keyCol = d.columns.indexOf(fact.key);
  const keyVal = codes[keyCol]!.get(fact.value)!;
  const fix = runIR(normalFormsImperativeIR, 'rowsToFix', [flat, d.rows.length, nCol, keyCol, keyVal, mask]);
  const tabs = stage.tables.flatMap((tb) => d.columns.map((c) => (tb.cols.includes(c) ? 1 : 0)));
  const lhs = d.dependencies.flatMap((fd) => d.columns.map((c) => (fd.lhs.includes(c) ? 1 : 0)));
  const rhs = d.dependencies.flatMap((fd) => d.columns.map((c) => (fd.rhs.includes(c) ? 1 : 0)));
  const lost = runIR(normalFormsImperativeIR, 'lostDependencies', [tabs, stage.tables.length, lhs, rhs, d.dependencies.length, nCol]);
  if (typeof fix !== 'number' || typeof lost !== 'number') throw new Error('IR 이 수를 내지 않았다');
  return { fix, lost };
}

// 사양 실측표 (sim.py normal-forms) — 대조용
const SPEC: Record<string, { tables: number; facts: [string, number, number][]; lost: number; rows: number[] }> = {
  UNF: { tables: 1, facts: [['enrollment', 4, 0], ['enrollment', 2, 2], ['enrollment', 3, 0]], lost: 0, rows: [4] },
  '1NF': { tables: 1, facts: [['enrollment', 4, 4], ['enrollment', 4, 4], ['enrollment', 3, 3]], lost: 0, rows: [8] },
  '2NF': { tables: 3, facts: [['subject', 1, 1], ['student', 2, 2], ['enrollment', 3, 3]], lost: 0, rows: [8, 4, 2] },
  '3NF': { tables: 4, facts: [['subject', 1, 1], ['major', 1, 1], ['enrollment', 3, 3]], lost: 0, rows: [8, 4, 2, 2] },
  BCNF: { tables: 5, facts: [['subject', 1, 1], ['major', 1, 1], ['tutor', 1, 1]], lost: 1, rows: [8, 4, 4, 2, 2] },
};

type Round = { events: FacetRuntimeEvent[]; metrics: Map<string, number> };

/** 가짜 reactive ctx 로 판마다 이벤트와 계기(누적)를 모은다 */
async function drive(inputs: { type: string; payload: { value: number } }[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let cur: Round = { events: [], metrics: totals };
  const queue = [...inputs];
  let cancelled = false;
  let done!: () => void;
  const finished = new Promise<void>((r) => (done = r));
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent) {
      cur.events.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ events: cur.events, metrics: new Map(totals) });
      const next = queue.shift();
      if (!next) {
        done();
        return new Promise<never>(() => {});
      }
      cur = { events: [], metrics: totals };
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([normalFormsAlgorithm(ctx as never), finished]);
  cancelled = true;
  return rounds;
}

const metricsOf = (r: Round) => [r.metrics.get('tables'), r.metrics.get('fix-rows'), r.metrics.get('found-rows'), r.metrics.get('lost-fds')];

describe('normal-forms', () => {
  it('IR 과 algorithm 이 모든 손잡이 조합에서 같은 수를 낸다', () => {
    for (let s = 0; s < data.stages.length; s += 1) {
      for (let f = 0; f < data.facts.length; f += 1) {
        const r = computeNormalForms(data, s, f);
        const ir = irCounts(data, s, f);
        expect(ir.fix, `${data.stages[s]!.name} × ${data.facts[f]!.fix}`).toBe(r.fixSlots.length);
        expect(ir.lost, `${data.stages[s]!.name}`).toBe(r.lost);
      }
    }
  });

  it('사양 실측표와 같다', () => {
    data.stages.forEach((st, s) => {
      const spec = SPEC[st.name]!;
      data.facts.forEach((_, f) => {
        const r = computeNormalForms(data, s, f);
        const [holder, fix, found] = spec.facts[f]!;
        expect(r.tables.length).toBe(spec.tables);
        expect(r.holder.name, `${st.name} × ${f}`).toBe(holder);
        expect(r.fixSlots.length, `${st.name} × ${f} 고칠 줄`).toBe(fix);
        expect(r.foundSlots.length, `${st.name} × ${f} 찾은 줄`).toBe(found);
        expect(r.lost).toBe(spec.lost);
        expect(r.tables.map((tb) => tb.rowCount)).toEqual(spec.rows);
      });
    });
    // BCNF 에서 잃는 것은 FD1
    expect(computeNormalForms(data, 4, 0).homes.filter((h) => h.home === null).map((h) => h.id)).toEqual(['FD1']);
    // UNF 목록 칸 — 무리 안 줄 차례로 ", " 로 잇는다
    const unf = computeNormalForms(data, 0, 0).tables[0]!;
    expect(unf.cells[unf.cols.indexOf('tutor')]![2]).toBe('Kwon, Jung');
    expect(unf.cells[unf.cols.indexOf('title')]![0]).toBe('Organic, Sketching');
  });

  it('회차마다 계기가 사양 표와 같다 — stage 1NF → 2NF → 1NF, 이어 fact title → office → title', async () => {
    const rounds = await drive([
      { type: 'stage', payload: { value: 2 } },
      { type: 'stage', payload: { value: 1 } },
      { type: 'fact', payload: { value: 1 } },
      { type: 'fact', payload: { value: 0 } },
      { type: 'stage', payload: { value: 4 } },
      { type: 'fact', payload: { value: 2 } },
    ]);
    expect(rounds.map(metricsOf)).toEqual([
      [1, 4, 4, 0], // 1NF · title
      [3, 1, 1, 0], // 2NF · title
      [1, 4, 4, 0], // 1NF · title
      [1, 4, 4, 0], // 1NF · office
      [1, 4, 4, 0], // 1NF · title
      [5, 1, 1, 1], // BCNF · title
      [5, 1, 1, 1], // BCNF · subject
    ]);
    // 걸음은 판마다 넷 (silent 아닌 발신)
    for (const r of rounds) expect(r.events.filter((e) => e.silent !== true).map((e) => e.type)).toEqual(['layout', 'fix', 'found', 'homes']);
  });

  it('사다리가 segments 와 같고 매개변수 배열 길이가 사양대로다', () => {
    const controls = (normalFormsFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)!.segments!;
    expect(seg('stage').map((s) => s.value)).toEqual(data.stages.map((_, i) => i));
    expect(seg('fact').map((s) => s.value)).toEqual(data.facts.map((_, i) => i));
    expect(seg('stage').find((s) => s.default)!.value).toBe(data.initial.stage);
    expect(seg('fact').find((s) => s.default)!.value).toBe(data.initial.fact);
    expect(data.stages.map((s) => s.name)).toEqual(['UNF', '1NF', '2NF', '3NF', 'BCNF']);
    const { flat } = encode(data);
    expect(flat.length).toBe(56);
    expect(data.dependencies.length * data.columns.length).toBe(35);
  });

  it('stage — 2NF 에서 subject 표의 줄 여덟이 두 자리로 접힌다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('en');
    const stage = mountView(normalFormsStageView, container, { config: {}, t });
    const projector = normalFormsProjector({ stage }, { getSpeed: () => 1, t });
    const rounds = await drive([{ type: 'stage', payload: { value: 2 } }]);
    const texts = (): (string | null)[] => [...container.querySelectorAll('text')].map((n) => n.textContent);
    for (const e of rounds[1]!.events) {
      await projector.onEvent(e);
      if (e.type === 'layout') expect(texts()).toContain('Rows per table: enrollment 8 · student 4 · subject 2');
      if (e.type === 'fix') expect(texts()).toContain("Fact title ← subject = 'chem' · held in subject · rows to fix: 1");
    }
    expect(texts()).toContain('Dependencies with a home table: 5 · lost: 0');
    const organic = [...container.querySelectorAll('g')].filter(
      (g) => g.querySelector(':scope > text')?.textContent === 'Organic' && g.style.opacity === '1',
    );
    expect(organic.length).toBe(1);
    stage.destroy();
  });
});
