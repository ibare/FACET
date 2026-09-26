import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Edit, Side } from './algorithm';

/** 자리 하나의 판정 — 누가 고쳤고 어떤 모양인가. */
export type Verdict = { spot: number; changer: Side; edit: Edit };

export type AncestorAsRefereeStep =
  | { kind: 'start' }
  | { kind: 'compare' }
  | { kind: 'ancestor' }
  | { kind: 'verdict'; spot: number };

export type AncestorAsRefereeScene = {
  /** 바탕 — 세 파일의 줄. 조상은 처음부터 알지만 들어오기 전에는 그리지 않는다 */
  base: string[];
  ours: string[];
  theirs: string[];
  /** 자취 — 두 쪽만 견준 다른 자리의 수 (견주기 전 null) */
  spots: number | null;
  /** 자취 — 조상이 들어왔는가 */
  ancestorIn: boolean;
  /** 자취 — 선 판정, 선 차례대로 */
  verdicts: Verdict[];
  /** 이번 걸음 */
  step: AncestorAsRefereeStep;
};

function readLines(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (!Array.isArray(v)) throw new Error(`ancestorAsRefereeScene: initialData.${key} 가 배열이 아니다`);
  return v.map((line, k) => {
    if (typeof line !== 'string') throw new Error(`ancestorAsRefereeScene: initialData.${key}[${k}] 가 문자열이 아니다`);
    return line;
  });
}

function readSide(v: unknown, path: string): Side {
  if (v === 'ours' || v === 'theirs') return v;
  throw new Error(`ancestorAsRefereeScene: ${path} 가 'ours' · 'theirs' 가 아니다`);
}

function readEdit(v: unknown, path: string): Edit {
  if (v === 'change' || v === 'delete' || v === 'insert') return v;
  throw new Error(`ancestorAsRefereeScene: ${path} 가 'change' · 'delete' · 'insert' 가 아니다`);
}

function readCount(v: unknown, path: string): number {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  throw new Error(`ancestorAsRefereeScene: ${path} 가 0 이상의 정수가 아니다`);
}

export const ancestorAsRefereeScene: ScenePlan<AncestorAsRefereeScene> = {
  initial(initialData: unknown): AncestorAsRefereeScene {
    if (typeof initialData !== 'object' || initialData === null) {
      throw new Error('ancestorAsRefereeScene: initialData 가 객체가 아니다');
    }
    const data = initialData as Record<string, unknown>;
    return {
      base: readLines(data, 'base'),
      ours: readLines(data, 'ours'),
      theirs: readLines(data, 'theirs'),
      spots: null,
      ancestorIn: false,
      verdicts: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: AncestorAsRefereeScene, event: FacetRuntimeEvent): AncestorAsRefereeScene {
    const p: Record<string, unknown> =
      typeof event.payload === 'object' && event.payload !== null ? (event.payload as Record<string, unknown>) : {};
    switch (event.type) {
      case 'compare':
        if (scene.spots !== null) throw new Error('ancestorAsRefereeScene: compare 가 두 번 왔다');
        return { ...scene, spots: readCount(p.spots, 'compare.payload.spots'), step: { kind: 'compare' } };
      case 'ancestor':
        if (scene.spots === null) throw new Error('ancestorAsRefereeScene: ancestor 가 compare 보다 먼저 왔다');
        if (scene.ancestorIn) throw new Error('ancestorAsRefereeScene: ancestor 가 두 번 왔다');
        return { ...scene, ancestorIn: true, step: { kind: 'ancestor' } };
      case 'verdict': {
        const spot = readCount(p.spot, 'verdict.payload.spot');
        if (scene.spots === null) throw new Error('ancestorAsRefereeScene: verdict 가 compare 보다 먼저 왔다');
        if (!scene.ancestorIn) throw new Error('ancestorAsRefereeScene: verdict 가 ancestor 보다 먼저 왔다');
        if (spot >= scene.spots) {
          throw new Error(`ancestorAsRefereeScene: verdict.payload.spot ${spot} 이 다른 자리 수 ${scene.spots} 밖이다`);
        }
        if (scene.verdicts.some((v) => v.spot === spot)) {
          throw new Error(`ancestorAsRefereeScene: verdict.payload.spot ${spot} 의 판정이 두 번 왔다`);
        }
        const verdict: Verdict = {
          spot,
          changer: readSide(p.changer, 'verdict.payload.changer'),
          edit: readEdit(p.edit, 'verdict.payload.edit'),
        };
        return { ...scene, verdicts: [...scene.verdicts, verdict], step: { kind: 'verdict', spot } };
      }
      default:
        throw new Error(`ancestorAsRefereeScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
