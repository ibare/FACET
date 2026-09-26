import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 이번 걸음. 문안이 아니라 종류와 인자다. */
export type NobodyCanBeFirstStep =
  | { kind: 'start' }
  | { kind: 'enter'; name: string; from: string | null }
  /** was — 쌓인 것에서 빠지기 전 자리 */
  | { kind: 'checked'; name: string; was: number }
  | { kind: 'confirmed'; name: string; from: string }
  | { kind: 'revisit'; name: string; from: string }
  | { kind: 'report'; length: number; built: number };

export type NobodyCanBeFirstScene = {
  // 바탕
  rules: { target: string; inputs: string[] }[];
  sources: string[];
  goal: string;
  // 자취
  /** "기다리는 중" 으로 쌓인 것, 아래부터 */
  stack: string[];
  /** 쌓인 데서 빠져 "확인됨" 이 된 것, 빠진 차례 */
  checked: string[];
  /** 다시 닿은 대상과 그 자리에서 닿게 한 대상 */
  revisit: { name: string; from: string } | null;
  /** 잘려 나온 고리 — 그 대상부터 끝까지 + 그 대상. at 은 쌓인 것에서 고리가 시작하던 자리 */
  cut: { cycle: string[]; at: number } | null;
  // 이번 걸음
  step: NobodyCanBeFirstStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(p: Record<string, unknown>, key: string, type: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`nobody-can-be-first: ${type}.${key} 가 글자가 아니다`);
  return v;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`nobody-can-be-first: ${type}.${key} 가 수가 아니다`);
  return v;
}

function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new Error(`nobody-can-be-first: ${what} 가 글자 목록이 아니다`);
  }
  return [...(v as string[])];
}

export const nobodyCanBeFirstScene: ScenePlan<NobodyCanBeFirstScene> = {
  initial(initialData: unknown): NobodyCanBeFirstScene {
    if (!isRecord(initialData)) throw new Error('nobody-can-be-first: initialData 가 없다');
    const rulesRaw = initialData.rules;
    if (!Array.isArray(rulesRaw)) throw new Error('nobody-can-be-first: rules 가 목록이 아니다');
    const rules = rulesRaw.map((r) => {
      if (!isRecord(r)) throw new Error('nobody-can-be-first: 규칙 모양이 틀렸다');
      return { target: str(r, 'target', 'rule'), inputs: strList(r.inputs, 'rule.inputs') };
    });
    return {
      rules,
      sources: strList(initialData.sources, 'sources'),
      goal: str(initialData, 'goal', 'initialData'),
      stack: [],
      checked: [],
      revisit: null,
      cut: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: NobodyCanBeFirstScene, event: FacetRuntimeEvent): NobodyCanBeFirstScene {
    const p = event.payload;
    if (!isRecord(p)) throw new Error(`nobody-can-be-first: ${event.type} 의 payload 가 객체가 아니다`);
    switch (event.type) {
      case 'enter': {
        const name = str(p, 'name', 'enter');
        const from = p.from === null ? null : str(p, 'from', 'enter');
        return { ...scene, stack: [...scene.stack, name], step: { kind: 'enter', name, from } };
      }
      case 'checked': {
        const name = str(p, 'name', 'checked');
        const was = scene.stack.length - 1;
        if (scene.stack[was] !== name) {
          throw new Error(`nobody-can-be-first: 맨 위가 아닌 ${name} 가 빠진다`);
        }
        return {
          ...scene,
          stack: scene.stack.slice(0, was),
          checked: [...scene.checked, name],
          step: { kind: 'checked', name, was },
        };
      }
      case 'confirmed': {
        const name = str(p, 'name', 'confirmed');
        return { ...scene, step: { kind: 'confirmed', name, from: str(p, 'from', 'confirmed') } };
      }
      case 'revisit': {
        const name = str(p, 'name', 'revisit');
        const from = str(p, 'from', 'revisit');
        return { ...scene, revisit: { name, from }, step: { kind: 'revisit', name, from } };
      }
      case 'report': {
        const cycle = strList(p.cycle, 'report.cycle');
        const at = num(p, 'at', 'report');
        return {
          ...scene,
          stack: scene.stack.slice(0, at),
          cut: { cycle, at },
          step: { kind: 'report', length: cycle.length - 1, built: num(p, 'built', 'report') },
        };
      }
      default:
        throw new Error(`nobody-can-be-first: 모르는 이벤트 ${event.type}`);
    }
  },
};
