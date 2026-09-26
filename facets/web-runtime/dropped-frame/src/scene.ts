/**
 * dropped-frame 의 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 했다.
 *
 * 바탕: 박자 줄 · 그려야 했던 자리
 * 자취: 장마다의 일 · 박자마다 화면에 나온 것 · 그려진 자리 · 건너뛴 자리
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type FrameWork = {
  frame: number;
  beat: number;
  startMs: number;
  endMs: number;
  /** 화면에 나온 박자. 아직이면 null */
  shownK: number | null;
  /** 일하는 동안 박자 하나가 새 장 없이 지나갔다 */
  late: boolean;
};

export type ScreenCell = {
  k: number;
  pos: number;
  /** 새로 나온 장. null 이면 앞 화면의 되풀이 */
  frame: number | null;
};

export type DroppedFrameSummary = {
  beats: number;
  newFrames: number;
  repeats: number;
  never: number[];
  maxJump: number;
};

export type DroppedFrameStep =
  | { kind: 'none' }
  | { kind: 'init'; started: number }
  | {
      kind: 'beat';
      k: number;
      ms: number;
      frame: number | null;
      from: number | null;
      pos: number;
      working: number | null;
      started: number | null;
      skipped: number[];
      jump: number | null;
      summary: DroppedFrameSummary | null;
    };

export type DroppedFrameScene = {
  beats: { k: number; ms: number }[];
  intended: number[];
  works: FrameWork[];
  cells: ScreenCell[];
  drawn: number[];
  skipped: number[];
  /** 지금 박자 */
  k: number;
  /** 지금 화면 자리. 아직 빈 화면이면 null */
  pos: number | null;
  step: DroppedFrameStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`dropped-frame 장면: ${what} 이 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`dropped-frame 장면: ${key} 가 수가 아니다`);
  return v;
}

function numOrNull(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  if (v === null) return null;
  return num(o, key);
}

function nums(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`dropped-frame 장면: ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`dropped-frame 장면: ${what} 에 수가 아닌 것`);
    return x;
  });
}

function readStart(v: unknown): FrameWork {
  const o = rec(v, 'started');
  return {
    frame: num(o, 'frame'),
    beat: num(o, 'beat'),
    startMs: num(o, 'startMs'),
    endMs: num(o, 'endMs'),
    shownK: null,
    late: false,
  };
}

function readSummary(v: unknown): DroppedFrameSummary | null {
  if (v === null) return null;
  const o = rec(v, 'summary');
  return {
    beats: num(o, 'beats'),
    newFrames: num(o, 'newFrames'),
    repeats: num(o, 'repeats'),
    never: nums(o['never'], 'never'),
    maxJump: num(o, 'maxJump'),
  };
}

export const droppedFrameScene: ScenePlan<DroppedFrameScene> = {
  initial(): DroppedFrameScene {
    return {
      beats: [],
      intended: [],
      works: [],
      cells: [],
      drawn: [],
      skipped: [],
      k: 0,
      pos: null,
      step: { kind: 'none' },
    };
  },

  reduce(scene: DroppedFrameScene, event: FacetRuntimeEvent): DroppedFrameScene {
    if (event.type === 'init') {
      const p = rec(event.payload, 'init payload');
      if (!Array.isArray(p['beats'])) throw new Error('dropped-frame 장면: beats 가 배열이 아니다');
      const beats = p['beats'].map((b: unknown) => {
        const o = rec(b, 'beat');
        return { k: num(o, 'k'), ms: num(o, 'ms') };
      });
      const started = readStart(p['started']);
      return {
        beats,
        intended: nums(p['intended'], 'intended'),
        works: [started],
        cells: [],
        drawn: [],
        skipped: [],
        k: 0,
        pos: null,
        step: { kind: 'init', started: started.frame },
      };
    }
    if (event.type === 'beat') {
      const p = rec(event.payload, 'beat payload');
      const k = num(p, 'k');
      const frame = numOrNull(p, 'frame');
      const from = numOrNull(p, 'from');
      const pos = num(p, 'pos');
      const working = numOrNull(p, 'working');
      const started = p['started'] === null ? null : readStart(p['started']);
      const skipped = nums(p['skipped'], 'skipped');
      const works = scene.works.map((w) => {
        if (frame !== null && w.frame === frame) return { ...w, shownK: k };
        if (working !== null && w.frame === working) return { ...w, late: true };
        return { ...w };
      });
      if (started) works.push(started);
      return {
        beats: scene.beats.map((b) => ({ ...b })),
        intended: [...scene.intended],
        works,
        cells: [...scene.cells.map((c) => ({ ...c })), { k, pos, frame }],
        drawn: frame !== null ? [...scene.drawn, pos] : [...scene.drawn],
        skipped: [...scene.skipped, ...skipped],
        k,
        pos,
        step: {
          kind: 'beat',
          k,
          ms: num(p, 'ms'),
          frame,
          from,
          pos,
          working,
          started: started ? started.frame : null,
          skipped,
          jump: numOrNull(p, 'jump'),
          summary: readSummary(p['summary']),
        },
      };
    }
    return scene;
  },
};
