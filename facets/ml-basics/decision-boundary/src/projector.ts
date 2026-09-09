/**
 * 결정 경계 projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 좁혀서 넘긴다 (C9). stage 는 필수 필드
 * 타입으로만 받고, 모양이 어긋난 발신은 그림에 닿지 않는다.
 *
 * 캡션 문안은 코드에 없다 — 키와 en 원본만 있고 정본은 `facet.ts` 의
 * `messages` 다 (C10). 캡션은 지금 화면에서 무슨 일이 일어나는지만 말하고,
 * 개념 설명은 `description.ts` 가 한다 (S-piece).
 */

import {
  makeTranslator,
  type ProjectorFactory,
  type ProjectorInstance,
} from '@ffacet/core/runtime';

import type {
  BoundaryInfo,
  CrossInfo,
  ProbeInfo,
  ScanInfo,
  SpreadInfo,
} from './decision-boundary-stage.js';

/** stage 의 계약. 러너가 주는 ViewInstance 는 열린 타입이라 여기서 좁힌다. */
type Stage = {
  reset(): void;
  setCaption(text: string): void;
  probePoint(info: ProbeInfo): Promise<void>;
  noteSpread(info: SpreadInfo): Promise<void>;
  scanField(info: ScanInfo): Promise<void>;
  markCrossings(info: CrossInfo): Promise<void>;
  revealBoundary(info: BoundaryInfo): Promise<void>;
};

function numbersOf(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const n of v) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

export const decisionBoundaryProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const instance: ProjectorInstance = {
    onInit(): void {
      stage?.reset();
    },
    onReset(): void {
      stage?.reset();
    },
    async onEvent(event): Promise<void> {
      if (!stage) return;

      switch (event.type) {
        case 'point-probed': {
          const p = event.payload as Partial<ProbeInfo> | undefined;
          if (
            typeof p?.index !== 'number' || typeof p.total !== 'number'
            || typeof p.x !== 'number' || typeof p.y !== 'number'
            || typeof p.z !== 'number' || typeof p.p !== 'number'
          ) return;
          stage.setCaption(tr(
            'caption.probe',
            'Ask each point for a probability, not a side — {k} of {n}.',
            { k: p.index + 1, n: p.total },
          ));
          await stage.probePoint({
            index: p.index, total: p.total, x: p.x, y: p.y, z: p.z, p: p.p,
          });
          return;
        }

        case 'spread-noted': {
          const p = event.payload as Partial<SpreadInfo> | undefined;
          if (
            typeof p?.low !== 'number' || typeof p.high !== 'number'
            || typeof p.threshold !== 'number'
          ) return;
          stage.setCaption(tr(
            'caption.spread',
            'The eight fell to the two ends. Nothing landed near half.',
          ));
          await stage.noteSpread({ low: p.low, high: p.high, threshold: p.threshold });
          return;
        }

        case 'field-scanned': {
          const p = event.payload as Partial<ScanInfo> | undefined;
          const values = numbersOf(p?.values);
          if (
            typeof p?.col0 !== 'number' || typeof p.cols !== 'number'
            || typeof p.rows !== 'number' || values === null
          ) return;
          stage.setCaption(tr(
            'caption.scan',
            'So ask every spot on the plane the same question.',
          ));
          await stage.scanField({ col0: p.col0, cols: p.cols, rows: p.rows, values });
          return;
        }

        case 'crossing-marked': {
          const p = event.payload as Partial<CrossInfo> | undefined;
          const cells = numbersOf(p?.cells);
          if (cells === null || typeof p?.total !== 'number') return;
          stage.setCaption(tr(
            'caption.crossing',
            'Light up the cells where the probability crosses half.',
          ));
          await stage.markCrossings({ cells, total: p.total });
          return;
        }

        case 'boundary-revealed': {
          const p = event.payload as Partial<BoundaryInfo> | undefined;
          if (
            typeof p?.wx !== 'number' || typeof p.wy !== 'number'
            || typeof p.bias !== 'number'
          ) return;
          stage.setCaption(tr(
            'caption.boundary',
            'Join them and the boundary appears. It was never drawn first.',
          ));
          await stage.revealBoundary({ wx: p.wx, wy: p.wy, bias: p.bias });
          return;
        }

        case 'done': {
          stage.setCaption(tr(
            'caption.done',
            'The line sits where p = 0.5 — not midway between the two clumps.',
          ));
          return;
        }

        case 'rewind': {
          stage.reset();
          return;
        }

        default:
          // 이 조각의 algorithm 은 위 여섯만 발신한다. 그 밖은 조용히 흘린다.
          return;
      }
    },
  };

  return instance;
};
