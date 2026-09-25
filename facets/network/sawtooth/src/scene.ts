/**
 * sawtooth 장면 — 이벤트를 잇기만 한다. 다음 창 · 톱니 평균은 알고리즘이 셈해 보낸다.
 *
 * - 바탕: 용량 · 왕복 수 · 처음 창 (initialData 에서 베낀다)
 * - 자취: 왕복마다 시간 축에 남은 창 (`marks`) · 닫힌 톱니 (`teeth`)
 * - 이번 걸음: `step` — 펜이 어디서(`was`) 어디로 갔는가
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SawtoothMark = { round: number; window: number; loss: boolean };
export type SawtoothTooth = { from: number; to: number; mean: number; ratio: number };
export type SawtoothStep = {
  kind: 'rise' | 'drop';
  round: number;
  window: number;
  next: number;
  /** 앞 왕복의 창 — 첫 왕복이면 null */
  was: number | null;
};

export type SawtoothScene = {
  capacity: number;
  rounds: number;
  startWindow: number;
  marks: SawtoothMark[];
  teeth: SawtoothTooth[];
  step: SawtoothStep | null;
};

function num(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`sawtooth 장면: ${where} 의 ${key} 가 수가 아니다 (받은 값 ${String(v)})`);
  }
  return v;
}

function record(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) {
    throw new Error(`sawtooth 장면: ${where} 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

export const sawtoothScene: ScenePlan<SawtoothScene> = {
  initial(initialData: unknown): SawtoothScene {
    const d = record(initialData, 'initialData');
    return {
      capacity: num(d, 'capacity', 'initialData'),
      rounds: num(d, 'rounds', 'initialData'),
      startWindow: num(d, 'startWindow', 'initialData'),
      marks: [],
      teeth: [],
      step: null,
    };
  },

  reduce(scene: SawtoothScene, event: FacetRuntimeEvent): SawtoothScene {
    if (event.type !== 'rise' && event.type !== 'drop') return scene;
    const p = record(event.payload, event.type);
    const round = num(p, 'round', event.type);
    const window = num(p, 'window', event.type);
    const next = num(p, 'next', event.type);
    const last = scene.marks[scene.marks.length - 1];
    const was = last ? last.window : null;
    const loss = event.type === 'drop';
    const marks = [...scene.marks, { round, window, loss }];
    let teeth = scene.teeth;
    if (loss) {
      const tp = record(p.tooth, 'drop.tooth');
      teeth = [
        ...scene.teeth,
        {
          from: num(tp, 'from', 'drop.tooth'),
          to: num(tp, 'to', 'drop.tooth'),
          mean: num(tp, 'mean', 'drop.tooth'),
          ratio: num(tp, 'ratio', 'drop.tooth'),
        },
      ];
    }
    return {
      ...scene,
      marks,
      teeth,
      step: { kind: loss ? 'drop' : 'rise', round, window, next, was },
    };
  },
};
