/**
 * immutable-copy 의 장면 — 이벤트를 잇기만 한다. 셈(해석)은 알고리즘이 했다.
 *
 * - 바탕: 프로그램들의 줄 글자 (`init` 이 한 번 정한다)
 * - 자취: 지금 있는 목록들(정체 · 쥔 이름 · 값) · 내보낸 출력들
 * - 이번 걸음: `step` — 무엇이 일어났는지와, 운동이 출발할 계기값(`was` · `from`)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ImmutableCopyCodeLine = { indent: number; text: string };
export type ImmutableCopyProgramView = { id: string; lines: ImmutableCopyCodeLine[] };

export type ImmutableCopyList = {
  /** 목록의 정체 번호 */
  id: number;
  /** 이 목록이 생긴 프로그램 */
  prog: number;
  /** 이 목록을 쥔 이름 */
  name: string;
  items: number[];
  /** 마지막으로 값이 들어간 자리 (덮어썼거나 베끼며 넣은 자리). 없으면 null */
  written: number | null;
};

export type ImmutableCopyOutput = { prog: number; line: number; list: number; items: number[] };

export type ImmutableCopyStep =
  | { kind: 'create'; prog: number; line: number; list: number }
  | { kind: 'overwrite'; prog: number; line: number; list: number; index: number; was: number; value: number }
  | { kind: 'copy'; prog: number; line: number; from: number; list: number; index: number; was: number; value: number }
  | { kind: 'show'; prog: number; line: number; list: number; output: number };

export type ImmutableCopyScene = {
  programs: ImmutableCopyProgramView[];
  lists: ImmutableCopyList[];
  outputs: ImmutableCopyOutput[];
  step: ImmutableCopyStep | null;
};

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function int(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => int(x)) : [];
}

function programsOf(v: unknown): ImmutableCopyProgramView[] {
  if (!Array.isArray(v)) return [];
  return v.map((p) => {
    const r = rec(p);
    const lines = Array.isArray(r.lines) ? r.lines : [];
    return {
      id: str(r.id),
      lines: lines.map((l) => {
        const lr = rec(l);
        return { indent: int(lr.indent), text: str(lr.text) };
      }),
    };
  });
}

export const immutableCopyScene: ScenePlan<ImmutableCopyScene> = {
  initial(): ImmutableCopyScene {
    return { programs: [], lists: [], outputs: [], step: null };
  },

  reduce(scene: ImmutableCopyScene, event: FacetRuntimeEvent): ImmutableCopyScene {
    const p = rec(event.payload);
    switch (event.type) {
      case 'init':
        return { programs: programsOf(p.programs), lists: [], outputs: [], step: null };

      case 'create': {
        const list: ImmutableCopyList = {
          id: int(p.list),
          prog: int(p.prog),
          name: str(p.name),
          items: nums(p.items),
          written: null,
        };
        return {
          ...scene,
          lists: [...scene.lists, list],
          step: { kind: 'create', prog: list.prog, line: int(p.line), list: list.id },
        };
      }

      case 'overwrite': {
        const id = int(p.list);
        const index = int(p.index);
        return {
          ...scene,
          lists: scene.lists.map((l) => (l.id === id ? { ...l, items: nums(p.items), written: index } : l)),
          step: {
            kind: 'overwrite',
            prog: int(p.prog),
            line: int(p.line),
            list: id,
            index,
            was: int(p.was),
            value: int(p.value),
          },
        };
      }

      case 'copy': {
        const index = int(p.index);
        const list: ImmutableCopyList = {
          id: int(p.list),
          prog: int(p.prog),
          name: str(p.name),
          items: nums(p.items),
          written: index,
        };
        return {
          ...scene,
          lists: [...scene.lists, list],
          step: {
            kind: 'copy',
            prog: list.prog,
            line: int(p.line),
            from: int(p.from),
            list: list.id,
            index,
            was: int(p.was),
            value: int(p.value),
          },
        };
      }

      case 'show': {
        const out: ImmutableCopyOutput = {
          prog: int(p.prog),
          line: int(p.line),
          list: int(p.list),
          items: nums(p.items),
        };
        return {
          ...scene,
          outputs: [...scene.outputs, out],
          step: { kind: 'show', prog: out.prog, line: out.line, list: out.list, output: scene.outputs.length },
        };
      }

      default:
        return scene;
    }
  },
};

/** 한 프로그램 안에서 지금 있는 목록들 — 그림과 캡션이 같은 셈을 쓴다 */
export function listsOfProgram(scene: ImmutableCopyScene, prog: number): ImmutableCopyList[] {
  return scene.lists.filter((l) => l.prog === prog);
}

/** 한 프로그램 안에서 값 `v` 를 담은 목록 수 */
export function listsHolding(scene: ImmutableCopyScene, prog: number, v: number): number {
  return listsOfProgram(scene, prog).filter((l) => l.items.includes(v)).length;
}
