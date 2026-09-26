/**
 * dropout projector — algorithm 이벤트를 무대 메서드와 코드 패널 강조로 옮긴다.
 *
 * 운동 길이는 재생 속도를 그때그때 읽어 정한다 (걸음 = 운동 + stepMs).
 * payload 는 typeof 로 좁혀 읽고, 비거나 모양이 다르면 던진다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type {
  DropoutAllOnView,
  DropoutInitView,
  DropoutMaskView,
  DropoutMasksView,
  DropoutStage,
  DropoutSummaryView,
} from './dropout-stage.js';

/** 속도 1 에서의 운동 길이 (ms) — 사양의 운동 상한 600 안. */
const MOTION_HEAD_MS = 500;
const MOTION_MASKS_MS = 600;
const MOTION_SUMMARY_MS = 500;

type CodePanel = { highlightPhase?(phase: string | null): void };

type Obj = Record<string, unknown>;

function obj(x: unknown, where: string): Obj {
  if (typeof x !== 'object' || x === null) throw new Error(`dropout: ${where} payload 가 객체가 아니다`);
  return x as Obj;
}

function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`dropout: payload.${key} 가 수가 아니다`);
  return v;
}

function nums(o: Obj, key: string): number[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(`dropout: payload.${key} 가 수의 배열이 아니다`);
  }
  return v as number[];
}

function bools(o: Obj, key: string): boolean[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'boolean')) {
    throw new Error(`dropout: payload.${key} 가 참거짓의 배열이 아니다`);
  }
  return v as boolean[];
}

function readInit(p: Obj): DropoutInitView {
  return {
    cells: num(p, 'cells'),
    shares: nums(p, 'shares'),
    shareMax: num(p, 'shareMax'),
    yLo: num(p, 'yLo'),
    yHi: num(p, 'yHi'),
    ticks: nums(p, 'ticks'),
    maskCount: num(p, 'maskCount'),
  };
}

function readAllOn(p: Obj): DropoutAllOnView {
  return {
    p: num(p, 'p'),
    rescale: num(p, 'rescale'),
    allOn: num(p, 'allOn'),
    expected: num(p, 'expected'),
    shares: nums(p, 'shares'),
  };
}

function readMask(x: unknown): DropoutMaskView {
  const m = obj(x, 'masks[]');
  return {
    k: num(m, 'k'),
    y: num(m, 'y'),
    binY: num(m, 'binY'),
    slot: num(m, 'slot'),
    on: bools(m, 'on'),
    shares: nums(m, 'shares'),
  };
}

function readMasks(p: Obj): DropoutMasksView {
  const list = p['masks'];
  if (!Array.isArray(list) || list.length === 0) throw new Error('dropout: payload.masks 가 비었다');
  return {
    p: num(p, 'p'),
    rescale: num(p, 'rescale'),
    from: num(p, 'from'),
    to: num(p, 'to'),
    masks: list.map(readMask),
    off: num(p, 'off'),
  };
}

function readSummary(p: Obj): DropoutSummaryView {
  return {
    mean: num(p, 'mean'),
    sd: num(p, 'sd'),
    expected: num(p, 'expected'),
    allOn: num(p, 'allOn'),
    pct: num(p, 'pct'),
  };
}

export const dropoutProjector: ProjectorFactory = (views, runtime) => {
  const stage = views['stage'] as unknown as DropoutStage | undefined;
  if (!stage) throw new Error('dropout: stage view 가 없다');
  const code = views['codePanel'] as unknown as CodePanel | undefined;
  const ms = (base: number): number => base / Math.max(0.01, runtime ? runtime.getSpeed() : 1);

  return {
    onReset() {
      stage.reset();
      code?.highlightPhase?.(null);
    },
    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const phase = obj(event.payload, 'phase')['phase'];
          if (typeof phase !== 'string') throw new Error('dropout: phase 이름이 없다');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'init':
          stage.setup(readInit(obj(event.payload, 'init')));
          return;
        case 'all-on':
          await stage.allOn(readAllOn(obj(event.payload, 'all-on')), ms(MOTION_HEAD_MS));
          return;
        case 'masks':
          await stage.masks(readMasks(obj(event.payload, 'masks')), ms(MOTION_MASKS_MS));
          return;
        case 'summary':
          await stage.summary(readSummary(obj(event.payload, 'summary')), ms(MOTION_SUMMARY_MS));
          return;
        default:
          throw new Error(`dropout: 모르는 이벤트 ${event.type}`);
      }
    },
  };
};
