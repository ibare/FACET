/**
 * batchnorm projector — algorithm 이벤트를 무대 메서드로 옮긴다.
 *
 * 캡션 문안을 고르고 수를 표시 글자로 바꾸는 일(둘째 자리 · 첫째 자리)만 여기서 한다. 셈은 payload 에 있다.
 * 운동 길이 = stepMs 의 60% ÷ 지금 재생 속도 — 걸음 안에서 끝난다. 무대의 운동은 기다리지 않는다
 * (기다리면 걸음마다 운동 길이만큼 재생이 늘어난다).
 */
import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { fmt1, fmt2 } from './algorithm.js';
import type { BatchnormStageApi } from './batchnorm-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight?(): void };

const MOTION_SHARE = 0.6;

function rec(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error('batchnorm: payload 가 객체가 아니다');
  return payload as Record<string, unknown>;
}
function num(r: Record<string, unknown>, key: string): number {
  const v = r[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`batchnorm: payload.${key} 가 수가 아니다`);
  return v;
}
function nums(r: Record<string, unknown>, key: string): number[] {
  const v = r[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number')) throw new Error(`batchnorm: payload.${key} 가 수 목록이 아니다`);
  return v as number[];
}

export const batchnormProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as (BatchnormStageApi & { destroy(): void }) | undefined;
  if (!stage) throw new Error('batchnorm: stage 블록이 없다');
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();

  let stepMs: number | null = null;
  let tracked: string | null = null;
  let wholeText: string | null = null;

  const motionMs = (): number => {
    if (stepMs === null) throw new Error('batchnorm: init 전에 걸음이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return (MOTION_SHARE * stepMs) / Math.max(0.01, speed);
  };
  const need = (s: string | null): string => {
    if (s === null) throw new Error('batchnorm: init 전에 걸음이 왔다');
    return s;
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const ph = rec(event.payload).phase;
          if (typeof ph !== 'string') throw new Error('batchnorm: phase 가 글자가 아니다');
          code?.highlightPhase(ph);
          return;
        }
        case 'init': {
          const r = rec(event.payload);
          const xs = nums(r, 'xs');
          const track = num(r, 'track');
          const x = xs[track];
          if (x === undefined) throw new Error('batchnorm: 지켜보는 번호가 값 목록 밖이다');
          stepMs = num(r, 'stepMs');
          tracked = fmt1(x);
          const wholeSpot = num(r, 'wholeSpot');
          wholeText = fmt2(wholeSpot);
          stage.init({ xs, track, wholeSpot, wholeSpotText: wholeText, shuffleCount: num(r, 'shuffleCount') });
          code?.highlightPhase(null);
          return;
        }
        case 'board': {
          const r = rec(event.payload);
          code?.highlightPhase(null);
          stage.board({
            caption: t('caption.board', 'Batch size {b}, tracked value {v}. It is batched by eight shuffles.', {
              b: num(r, 'batch'),
              v: need(tracked),
            }),
          });
          return;
        }
        case 'gather': {
          const r = rec(event.payload);
          const peers = nums(r, 'peers');
          const s = num(r, 'shuffle');
          stage.gather({
            shuffle: s,
            peers,
            mu: num(r, 'mu'),
            caption: t('caption.gather', 'Shuffle {s}: the batch holding the tracked value has {n} values. The μ mark is its mean.', {
              s,
              n: peers.length,
            }),
            ms: motionMs(),
          });
          return;
        }
        case 'scale': {
          const r = rec(event.payload);
          const s = num(r, 'shuffle');
          const spot = num(r, 'spot');
          const spotText = fmt2(spot);
          const last = r.last;
          if (typeof last !== 'boolean') throw new Error('batchnorm: payload.last 가 참거짓이 아니다');
          const meanDiffText = last ? fmt2(num(r, 'meanDiff')) : null;
          stage.scale({
            shuffle: s,
            mu: num(r, 'mu'),
            sigma: num(r, 'sigma'),
            spot,
            spotText,
            meanDiffText,
            caption:
              meanDiffText === null
                ? t('caption.scale', 'Shuffle {s}: divided by the batch spread σ, it lands at {spot}.', { s, spot: spotText })
                : t('caption.last', 'Shuffle {s}: it lands at {spot}. Mean gap of the eight from the whole-set position {w}: {d}', {
                    s,
                    spot: spotText,
                    w: need(wholeText),
                    d: meanDiffText,
                  }),
            ms: motionMs(),
          });
          return;
        }
        default:
          throw new Error(`batchnorm: 모르는 이벤트 — ${event.type}`);
      }
    },
    onReset() {
      stage.reset();
      code?.highlightPhase(null);
    },
  };
};
