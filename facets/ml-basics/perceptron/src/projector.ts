/**
 * 퍼셉트론 projector — algorithm 의 이벤트를 무대 메서드로 옮긴다.
 *
 * payload 는 typeof 가드로 좁혀 무대가 받는 모양(`InitView` · `StartView` · `EpochView` · `VerdictView`)
 * 으로 만든다. 모르는 이벤트 · 빈 값은 던진다. 운동 길이는 재생 속도를 그때그때 읽어 무대에 넘긴다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { EpochView, InitView, PerceptronSpot, Side, StartView, VerdictView, VisitView } from './algorithm.js';

/** 무대가 여는 구조적 표면 */
export type PerceptronStageSurface = {
  reset(): void;
  init(view: InitView): void;
  start(view: StartView, speed: number): Promise<void>;
  epoch(view: EpochView, speed: number): Promise<void>;
  verdict(view: VerdictView, speed: number): Promise<void>;
};

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`perceptron projector: ${what} 가 객체가 아니다`);
  return v as Obj;
}
function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`perceptron projector: ${key} 가 수가 아니다`);
  return v;
}
function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`perceptron projector: ${key} 가 글자가 아니다`);
  return v;
}
function nums(v: unknown, key: string): number[] {
  if (!Array.isArray(v)) throw new Error(`perceptron projector: ${key} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`perceptron projector: ${key} 에 수가 아닌 값`);
    return x;
  });
}
function list(v: unknown, key: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`perceptron projector: ${key} 가 배열이 아니다`);
  return v;
}
function segment(v: unknown, key: string): number[] | null {
  if (v === null) return null;
  const s = nums(v, key);
  if (s.length !== 4) throw new Error(`perceptron projector: ${key} 는 끝점 둘(수 넷)`);
  return s;
}
function side(o: Obj): Side {
  const v = o.side;
  if (v === 'split' || v === 'allOff' || v === 'allOn') return v;
  throw new Error(`perceptron projector: side 가 모르는 값 — ${String(v)}`);
}
function spot(v: unknown, key: string): PerceptronSpot {
  const o = obj(v, key);
  return { x1: num(o, 'x1'), x2: num(o, 'x2') };
}

function readInit(p: Obj): InitView {
  const axisNames = list(p.axisNames, 'axisNames').map((a) => {
    if (typeof a !== 'string') throw new Error('perceptron projector: axisNames 에 글자가 아닌 값');
    return a;
  });
  return {
    points: list(p.points, 'points').map((raw) => {
      const q = obj(raw, 'point');
      return { id: str(q, 'id'), x1: num(q, 'x1'), x2: num(q, 'x2'), y: num(q, 'y') };
    }),
    movingId: str(p, 'movingId'),
    ladder: list(p.ladder, 'ladder').map((s) => spot(s, 'ladder')),
    lo: num(p, 'lo'),
    hi: num(p, 'hi'),
    grid: nums(p.grid, 'grid'),
    ticks: nums(p.ticks, 'ticks'),
    epochColumns: num(p, 'epochColumns'),
    errorMax: num(p, 'errorMax'),
    errorTicks: nums(p.errorTicks, 'errorTicks'),
    axisNames,
  };
}

function readVisit(raw: unknown): VisitView {
  const q = obj(raw, 'visit');
  if (typeof q.wrong !== 'boolean') throw new Error('perceptron projector: wrong 가 참거짓이 아니다');
  return {
    index: num(q, 'index'),
    wrong: q.wrong,
    formula: str(q, 'formula'),
    line: segment(q.line, 'line'),
    region: nums(q.region, 'region'),
    side: side(q),
  };
}

export const perceptronProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PerceptronStageSurface | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  if (!stage) throw new Error('perceptron projector: stage 가 없다');
  const speed = (): number => runtime?.getSpeed() ?? 1;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = obj(event.payload ?? {}, event.type);
      switch (event.type) {
        case 'phase': {
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'init': {
          stage.init(readInit(p));
          return;
        }
        case 'start': {
          // 걸음 #0 — 앞 판의 코드 줄 강조를 걷는다
          code?.highlightPhase?.(null);
          await stage.start(
            { position: spot(p.position, 'position'), wText: str(p, 'wText'), formula: str(p, 'formula'), side: side(p) },
            speed(),
          );
          return;
        }
        case 'epoch': {
          await stage.epoch(
            {
              epoch: num(p, 'epoch'),
              errors: num(p, 'errors'),
              wText: str(p, 'wText'),
              visits: list(p.visits, 'visits').map(readVisit),
            },
            speed(),
          );
          return;
        }
        case 'verdict': {
          const kind = p.kind;
          if (kind !== 'stop' && kind !== 'repeat') throw new Error(`perceptron projector: 모르는 판정 — ${String(kind)}`);
          await stage.verdict(
            {
              kind,
              epoch: num(p, 'epoch'),
              errors: num(p, 'errors'),
              pair: num(p, 'pair'),
              wText: str(p, 'wText'),
              pairLine: segment(p.pairLine, 'pairLine'),
            },
            speed(),
          );
          return;
        }
        default:
          throw new Error(`perceptron projector: 모르는 이벤트 — ${event.type}`);
      }
    },
    onReset(): void {
      stage.reset();
      code?.clearHighlight?.();
    },
  };
};
