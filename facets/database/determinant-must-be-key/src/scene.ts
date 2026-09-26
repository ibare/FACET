/**
 * determinant-must-be-key 장면.
 *
 * 바탕  — 표(이름 · 열 · 줄) · 선언된 종속 · 번지게 할 결정자. `initial()` 이 initialData 에서 베낀다.
 * 자취  — 결정자 칸마다 씨앗을 두었는가 · 닿은 열(더해진 차례) · 번진 물길 · 멈췄는가 · 닿지 못한 열,
 *         그리고 되풀이된 짝.
 * 이번 걸음 — `step`.
 *
 * 폐포 셈은 알고리즘이 한다. 장면은 이벤트가 말한 것만 잇는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneDependency = { lhs: string[]; rhs: string[] };

export type SceneBase = {
  table: string;
  columns: string[];
  rows: string[][];
  dependencies: SceneDependency[];
  determinants: string[][];
};

/** 번진 물길 하나 — 종속 fd 의 왼쪽 열들에서 새로 더해진 열로. */
export type Stream = { fd: number; to: string[] };

export type Panel = {
  planted: boolean;
  /** 닿은 열. 씨앗이 먼저, 그 뒤로 더해진 차례. */
  reached: string[];
  streams: Stream[];
  halted: boolean;
  missing: string[];
};

export type RepeatGroup = { values: string[]; rows: number[] };

export type Repeat = { determinant: number; columns: string[]; groups: RepeatGroup[] };

export type Step =
  | { kind: 'seed'; panel: number }
  | { kind: 'spread'; panel: number; stream: number }
  | { kind: 'halt'; panel: number }
  | { kind: 'repeat'; panel: number };

export type DeterminantScene = {
  base: SceneBase;
  panels: Panel[];
  repeat: Repeat | null;
  step: Step | null;
};

function bad(msg: string): never {
  throw new Error(`determinantMustBeKeyScene: ${msg}`);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function strings(x: unknown, where: string): string[] {
  if (!Array.isArray(x)) bad(`${where} 가 배열이 아니다`);
  return x.map((v, i) => {
    if (typeof v !== 'string' || v === '') bad(`${where}[${i}] 가 글자가 아니다`);
    return v;
  });
}

function readBase(x: unknown): SceneBase {
  if (!isRecord(x)) bad('initialData 가 없다');
  const table = x['table'];
  if (typeof table !== 'string' || table === '') bad('table 이 없다');
  const rowsRaw = x['rows'];
  if (!Array.isArray(rowsRaw)) bad('rows 가 배열이 아니다');
  const depsRaw = x['dependencies'];
  if (!Array.isArray(depsRaw)) bad('dependencies 가 배열이 아니다');
  const detsRaw = x['determinants'];
  if (!Array.isArray(detsRaw)) bad('determinants 가 배열이 아니다');
  return {
    table,
    columns: strings(x['columns'], 'columns'),
    rows: rowsRaw.map((r, i) => strings(r, `rows[${i}]`)),
    dependencies: depsRaw.map((d, i) => {
      if (!isRecord(d)) bad(`dependencies[${i}] 가 객체가 아니다`);
      return {
        lhs: strings(d['lhs'], `dependencies[${i}].lhs`),
        rhs: strings(d['rhs'], `dependencies[${i}].rhs`),
      };
    }),
    determinants: detsRaw.map((d, i) => strings(d, `determinants[${i}]`)),
  };
}

function num(p: Record<string, unknown>, k: string): number {
  const v = p[k];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) bad(`payload.${k} 가 번호가 아니다`);
  return v;
}

function panelAt(scene: DeterminantScene, i: number): Panel {
  const p = scene.panels[i];
  if (p === undefined) bad(`결정자 ${i} 가 없다`);
  return p;
}

function withPanel(scene: DeterminantScene, i: number, next: Panel): Panel[] {
  return scene.panels.map((p, j) => (j === i ? next : p));
}

export const determinantMustBeKeyScene: ScenePlan<DeterminantScene> = {
  initial(initialData: unknown): DeterminantScene {
    const base = readBase(initialData);
    return {
      base,
      panels: base.determinants.map(() => ({
        planted: false,
        reached: [],
        streams: [],
        halted: false,
        missing: [],
      })),
      repeat: null,
      step: null,
    };
  },

  reduce(scene: DeterminantScene, event: FacetRuntimeEvent): DeterminantScene {
    const p = event.payload;
    if (!isRecord(p)) return scene;
    if (event.type === 'seed') {
      const i = num(p, 'determinant');
      const panel = panelAt(scene, i);
      const seed = scene.base.determinants[i]!;
      return {
        ...scene,
        panels: withPanel(scene, i, { ...panel, planted: true, reached: [...seed] }),
        step: { kind: 'seed', panel: i },
      };
    }
    if (event.type === 'spread') {
      const i = num(p, 'determinant');
      const fd = num(p, 'fd');
      if (scene.base.dependencies[fd] === undefined) bad(`종속 ${fd} 가 없다`);
      const added = strings(p['added'], 'payload.added');
      const panel = panelAt(scene, i);
      return {
        ...scene,
        panels: withPanel(scene, i, {
          ...panel,
          reached: [...panel.reached, ...added],
          streams: [...panel.streams, { fd, to: added }],
        }),
        step: { kind: 'spread', panel: i, stream: panel.streams.length },
      };
    }
    if (event.type === 'halt') {
      const i = num(p, 'determinant');
      const missing = strings(p['missing'], 'payload.missing');
      const panel = panelAt(scene, i);
      return {
        ...scene,
        panels: withPanel(scene, i, { ...panel, halted: true, missing }),
        step: { kind: 'halt', panel: i },
      };
    }
    if (event.type === 'repeat') {
      const i = num(p, 'determinant');
      panelAt(scene, i);
      const columns = strings(p['columns'], 'payload.columns');
      const groupsRaw = p['groups'];
      if (!Array.isArray(groupsRaw)) bad('payload.groups 가 배열이 아니다');
      if (groupsRaw.length === 0) bad('payload.groups 가 비었다');
      const groups = groupsRaw.map((g, gi) => {
        if (!isRecord(g)) bad(`payload.groups[${gi}] 가 객체가 아니다`);
        const rowsRaw = g['rows'];
        if (!Array.isArray(rowsRaw)) bad(`payload.groups[${gi}].rows 가 배열이 아니다`);
        return {
          values: strings(g['values'], `payload.groups[${gi}].values`),
          rows: rowsRaw.map((r) => {
            if (typeof r !== 'number' || !Number.isInteger(r) || r < 0) bad('줄 번호가 아니다');
            return r;
          }),
        };
      });
      return {
        ...scene,
        repeat: { determinant: i, columns, groups },
        step: { kind: 'repeat', panel: i },
      };
    }
    return scene;
  },
};
