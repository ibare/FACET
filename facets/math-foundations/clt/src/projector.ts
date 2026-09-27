/**
 * clt projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 운동 길이는 init 의 `motionMs` 를 쥐고, 부를 때마다 `runtime.getSpeed()` 로 나눈다 (속도를 올리면 곧장 짧아진다).
 * payload 는 typeof 로 좁히고, 어긋나면 지어내지 않고 던진다 (C6 · C9).
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { CltStage } from './clt-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

function record(payload: unknown, type: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error(`clt projector: ${type} payload 가 없다`);
  return payload as Record<string, unknown>;
}
function num(p: Record<string, unknown>, key: string): number {
  const x = p[key];
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`clt projector: ${key} 가 수가 아니다`);
  return x;
}
function str(p: Record<string, unknown>, key: string): string {
  const x = p[key];
  if (typeof x !== 'string') throw new Error(`clt projector: ${key} 가 글이 아니다`);
  return x;
}
function nums(p: Record<string, unknown>, key: string): number[] {
  const x = p[key];
  if (!Array.isArray(x) || !x.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error(`clt projector: ${key} 가 수 목록이 아니다`);
  }
  return [...(x as number[])];
}

export const cltProjector: ProjectorFactory = (views, runtime) => {
  const stageView = views.stage as unknown as CltStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const stage = (): CltStage => {
    if (!stageView) throw new Error('clt projector: 무대가 없다');
    return stageView;
  };
  const dur = (): number => {
    if (motionMs === null) throw new Error('clt projector: 판 머리 없이 걸음이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = record(event.payload, 'phase');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'init': {
          const p = record(event.payload, 'init');
          motionMs = num(p, 'motionMs');
          code?.highlightPhase(null);
          stage().setPopulation({
            popId: str(p, 'popId'),
            weights: nums(p, 'weights'),
            mu: num(p, 'mu'),
            sigma: num(p, 'sigma'),
            n: num(p, 'n'),
            weightMax: num(p, 'weightMax'),
            countMax: num(p, 'countMax'),
            durMs: dur(),
          });
          return;
        }
        case 'one-mean': {
          const p = record(event.payload, 'one-mean');
          stage().showOneMean({
            faces: nums(p, 'faces'),
            sum: num(p, 'sum'),
            n: num(p, 'n'),
            oneMean: num(p, 'oneMean'),
            binCenter: num(p, 'binCenter'),
            durMs: dur(),
          });
          return;
        }
        case 'counts': {
          const p = record(event.payload, 'counts');
          stage().showCounts({
            counts: nums(p, 'counts'),
            means: num(p, 'means'),
            peaks: num(p, 'peaks'),
            tallest: num(p, 'tallest'),
            durMs: dur(),
          });
          return;
        }
        case 'grand-mean': {
          const p = record(event.payload, 'grand-mean');
          stage().showMean({ mean: num(p, 'mean'), mu: num(p, 'mu'), durMs: dur() });
          return;
        }
        case 'spread': {
          const p = record(event.payload, 'spread');
          stage().showSpread({
            spread: num(p, 'spread'),
            sigma: num(p, 'sigma'),
            n: num(p, 'n'),
            theory: num(p, 'theory'),
            mean: num(p, 'mean'),
            durMs: dur(),
          });
          return;
        }
        default:
          throw new Error(`clt projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      motionMs = null;
      stageView?.reset();
      code?.clearHighlight();
    },
    onDestroy() {
      motionMs = null;
    },
  };
};
