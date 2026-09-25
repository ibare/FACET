/**
 * 장면 — 이벤트를 잇기만 한다. 줄의 셈은 알고리즘이 하고 장면은 실린 수를 옮겨 담는다.
 *
 * - 바탕: 프로그램들의 줄 (initialData 에서 베낀다)
 * - 자취: CPU 칸 · 기록 · 보인 값
 * - 이번 걸음: `step` — 운동이 출발할 수(`before` · `was`)를 함께 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneCells = { pc: number; r: number };

export type SaveAndRestoreStep =
  | { kind: 'start' }
  | { kind: 'run'; prog: string; line: number; before: SceneCells; shown: number | null }
  | { kind: 'save'; prog: string; was: SceneCells | null }
  | { kind: 'restore'; prog: string; was: SceneCells; wasOf: string };

export type SaveAndRestoreScene = {
  programs: { id: string; lines: string[] }[];
  /** owner — 지금 CPU 를 쓰는 쪽 (없으면 null). of — 칸에 든 수가 누구의 것인가 */
  cpu: { owner: string | null; of: string; pc: number; r: number };
  records: { id: string; cells: SceneCells | null }[];
  shown: { id: string; line: number; value: number }[];
  step: SaveAndRestoreStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`장면: ${what} 가 수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`장면: ${what} 가 글자가 아니다`);
  return v;
}

function cellsOf(v: unknown, what: string): SceneCells | null {
  if (v === null) return null;
  if (!isRecord(v)) throw new Error(`장면: ${what} 가 기록 모양이 아니다`);
  return { pc: num(v.pc, `${what}.pc`), r: num(v.r, `${what}.r`) };
}

export const saveAndRestoreScene: ScenePlan<SaveAndRestoreScene> = {
  initial(initialData: unknown): SaveAndRestoreScene {
    if (!isRecord(initialData)) throw new Error('장면: initialData 가 없다');
    const rawProgs = initialData.programs;
    if (!Array.isArray(rawProgs)) throw new Error('장면: programs 가 목록이 아니다');
    const programs = rawProgs.map((p: unknown, i) => {
      if (!isRecord(p) || !Array.isArray(p.lines)) throw new Error(`장면: programs[${i}] 모양이 틀렸다`);
      return {
        id: str(p.id, `programs[${i}].id`),
        lines: p.lines.map((l: unknown, j) => str(l, `programs[${i}].lines[${j}]`)),
      };
    });
    const start = initialData.start;
    if (!isRecord(start)) throw new Error('장면: start 가 없다');
    const owner = str(start.owner, 'start.owner');
    const rawRecs = initialData.records;
    if (!isRecord(rawRecs)) throw new Error('장면: records 가 없다');
    const records = programs.map((p) => {
      if (!(p.id in rawRecs)) throw new Error(`장면: ${p.id} 의 시작 기록이 없다`);
      return { id: p.id, cells: cellsOf(rawRecs[p.id], `records.${p.id}`) };
    });
    return {
      programs,
      cpu: { owner, of: owner, pc: num(start.pc, 'start.pc'), r: num(start.r, 'start.r') },
      records,
      shown: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: SaveAndRestoreScene, event: FacetRuntimeEvent): SaveAndRestoreScene {
    const p = event.payload;
    if (!isRecord(p)) return scene;
    if (event.type === 'run') {
      const prog = str(p.prog, 'run.prog');
      const line = num(p.line, 'run.line');
      const shownRaw = p.shown;
      const shown = shownRaw === null ? null : num(shownRaw, 'run.shown');
      return {
        ...scene,
        cpu: { owner: prog, of: prog, pc: num(p.pc, 'run.pc'), r: num(p.r, 'run.r') },
        shown:
          shown === null
            ? scene.shown
            : [...scene.shown.filter((s) => s.id !== prog), { id: prog, line, value: shown }],
        step: {
          kind: 'run',
          prog,
          line,
          before: { pc: scene.cpu.pc, r: scene.cpu.r },
          shown,
        },
      };
    }
    if (event.type === 'save') {
      const prog = str(p.prog, 'save.prog');
      const cells = { pc: num(p.pc, 'save.pc'), r: num(p.r, 'save.r') };
      const old = scene.records.find((rec) => rec.id === prog);
      if (old === undefined) throw new Error(`장면: ${prog} 의 기록 자리가 없다`);
      return {
        ...scene,
        cpu: { ...scene.cpu, owner: null },
        records: scene.records.map((rec) => (rec.id === prog ? { id: prog, cells } : rec)),
        step: { kind: 'save', prog, was: old.cells === null ? null : { ...old.cells } },
      };
    }
    if (event.type === 'restore') {
      const prog = str(p.prog, 'restore.prog');
      return {
        ...scene,
        cpu: { owner: prog, of: prog, pc: num(p.pc, 'restore.pc'), r: num(p.r, 'restore.r') },
        step: { kind: 'restore', prog, was: { pc: scene.cpu.pc, r: scene.cpu.r }, wasOf: scene.cpu.of },
      };
    }
    return scene;
  },
};
