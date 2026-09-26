/**
 * gan projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 *   gan-init            코드 패널을 끄고(걸음 0 에는 phase 가 없다) 무대를 새 판으로
 *   discriminator-step  무대의 D 곡선이 모양을 바꾼다
 *   generator-step      무대의 가짜 넷이 곡선을 따라 옮겨 간다
 *   phase               코드 패널 강조
 *
 * 운동 길이는 MOTION_MS 를 그때그때의 재생 속도로 나눈다. 무대의 운동이 끝나야 이벤트가 끝나므로
 * 걸음 하나 = 운동 + stepMs 다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { GanFrame, GanInitFrame, GanStage, GanStageSide } from './gan-stage.js';

const MOTION_MS = 450;

type CodePanel = { highlightPhase(phase: string | null): void };

function rec(p: unknown, what: string): Record<string, unknown> {
  if (typeof p !== 'object' || p === null) throw new Error(`gan projector: ${what} payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`gan projector: ${key} 가 수가 아니다`);
  return v;
}

function nums(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v) || v.length === 0) throw new Error(`gan projector: ${key} 가 수 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`gan projector: ${key} 에 수가 아닌 것`);
    return x;
  });
}

/** 라운드 번호 목록 — 비어 있어도 된다 (건너뛴 라운드가 없는 걸음). */
function rounds(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`gan projector: ${key} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 1) throw new Error(`gan projector: ${key} 에 라운드 번호가 아닌 것`);
    return x;
  });
}

function side(p: Record<string, unknown>, key: string): GanStageSide {
  const v = p[key];
  if (v === 'left' || v === 'right' || v === 'none') return v;
  throw new Error(`gan projector: ${key} 가 left · right · none 이 아니다`);
}

function bool(p: Record<string, unknown>, key: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`gan projector: ${key} 가 불이 아니다`);
  return v;
}

function readFrame(p: Record<string, unknown>): GanFrame {
  return {
    round: num(p, 'round'),
    a: num(p, 'a'),
    b: num(p, 'b'),
    fakes: nums(p, 'fakes'),
    left: num(p, 'left'),
    right: num(p, 'right'),
    spread: num(p, 'spread'),
    mean: num(p, 'mean'),
    dpar: nums(p, 'dpar'),
    dLeft: num(p, 'dLeft'),
    dRight: num(p, 'dRight'),
    higher: side(p, 'higher'),
    curve: nums(p, 'curve'),
  };
}

function readInit(p: Record<string, unknown>): GanInitFrame {
  const xr = nums(p, 'xRange');
  if (xr.length !== 2) throw new Error('gan projector: xRange 가 둘이 아니다');
  return {
    ...readFrame(p),
    real: nums(p, 'real'),
    centers: nums(p, 'centers'),
    xRange: [xr[0], xr[1]],
    start: num(p, 'start'),
    rounds: num(p, 'rounds'),
    showEvery: num(p, 'showEvery'),
  };
}

export const ganProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as GanStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const needStage = (): GanStage => {
    if (!stage) throw new Error('gan projector: stage 블록이 없다');
    return stage;
  };
  // 코드 패널은 선언에 따라 없을 수 있는 블록이다 (러너 밖 · 검사에서 stage 만 띄울 때) — 있으면 넘긴다
  const highlight = (phase: string | null) => {
    if (code) code.highlightPhase(phase);
  };
  const motion = (): number => {
    if (!runtime) return 0;
    return MOTION_MS / Math.max(0.01, runtime.getSpeed());
  };

  return {
    async onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          const ph = p.phase;
          if (typeof ph !== 'string' || ph.length === 0) throw new Error('gan projector: phase 가 문자열이 아니다');
          highlight(ph);
          return;
        }
        case 'gan-init': {
          const f = readInit(rec(event.payload, 'gan-init'));
          highlight(null);
          await needStage().init(f, motion());
          return;
        }
        case 'discriminator-step': {
          const p = rec(event.payload, 'discriminator-step');
          await needStage().discriminate(readFrame(p), rounds(p, 'skipped'), motion());
          return;
        }
        case 'generator-step': {
          const p = rec(event.payload, 'generator-step');
          await needStage().generate(readFrame(p), bool(p, 'final'), side(p, 'oneSide'), motion());
          return;
        }
        default:
          throw new Error(`gan projector: 모르는 이벤트 ${event.type}`);
      }
    },
  };
};
