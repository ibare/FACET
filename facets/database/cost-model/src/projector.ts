/**
 * cost-model projector — 알고리즘 이벤트를 무대 메서드로 옮긴다.
 *
 * round → beginRound · cut → cut · pick → pick · actual → reveal · cost → settle · phase → 코드 패널 강조.
 * 새 판(round)의 걸음 0 에서 코드 패널 강조를 먼저 지운다 — 앞 판의 마지막 줄이 남지 않게.
 * 운동 길이는 부를 때마다 재생 속도를 읽어 셈한다.
 */
import type { FacetRuntimeEvent, ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';
import type {
  CostModelActualView,
  CostModelCostView,
  CostModelCutView,
  CostModelPickView,
  CostModelRoundView,
} from './cost-model-stage.js';

type CostModelStage = ViewInstance & {
  beginRound(p: CostModelRoundView, ms: number): void;
  cut(p: CostModelCutView, ms: number): void;
  pick(p: CostModelPickView, ms: number): void;
  reveal(p: CostModelActualView, ms: number): void;
  settle(p: CostModelCostView, ms: number): void;
  clear(): void;
};

type CodePanel = ViewInstance & {
  highlightPhase(phase: string | null): void;
};

/** 운동 한 번의 길이 — 1 배속에서 */
const MOTION_MS = 800;

type Bag = Record<string, unknown>;

function bag(e: FacetRuntimeEvent): Bag {
  const p: unknown = e.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`cost-model: ${e.type} 의 payload 가 없다`);
  return p as Bag;
}
function num(p: Bag, key: string): number {
  const x = p[key];
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`cost-model: payload.${key} 가 수가 아니다`);
  return x;
}
function str(p: Bag, key: string): string {
  const x = p[key];
  if (typeof x !== 'string') throw new Error(`cost-model: payload.${key} 가 글이 아니다`);
  return x;
}
function nums(p: Bag, key: string): number[] {
  const x = p[key];
  if (!Array.isArray(x)) throw new Error(`cost-model: payload.${key} 가 목록이 아니다`);
  return x.map((item, i) => {
    if (typeof item !== 'number' || !Number.isFinite(item)) throw new Error(`cost-model: payload.${key}[${i}] 가 수가 아니다`);
    return item;
  });
}
function flag(p: Bag, key: string): boolean {
  const x = p[key];
  if (typeof x !== 'boolean') throw new Error(`cost-model: payload.${key} 가 참 거짓이 아니다`);
  return x;
}
function which(p: Bag, key: string): 0 | 1 {
  const x = num(p, key);
  if (x !== 0 && x !== 1) throw new Error(`cost-model: payload.${key} 가 길 번호가 아니다 (${x})`);
  return x;
}
function pieces(p: Bag): CostModelCutView['pieces'] {
  const x = p.pieces;
  if (!Array.isArray(x)) throw new Error('cost-model: payload.pieces 가 목록이 아니다');
  return x.map((item) => {
    if (typeof item !== 'object' || item === null) throw new Error('cost-model: 조각이 객체가 아니다');
    const q = item as Bag;
    return {
      bin: num(q, 'bin'),
      from: num(q, 'from'),
      to: num(q, 'to'),
      binRows: num(q, 'binRows'),
      binWidth: num(q, 'binWidth'),
      rows: num(q, 'rows'),
    };
  });
}

export const costModelProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CostModelStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const ms = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? MOTION_MS / speed : MOTION_MS;
  };

  return {
    onEvent(e: FacetRuntimeEvent): void {
      switch (e.type) {
        case 'phase': {
          const p = bag(e);
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'round': {
          const p = bag(e);
          code?.highlightPhase(null);
          stage?.beginRound(
            {
              bins: num(p, 'bins'),
              binWidth: num(p, 'binWidth'),
              span: num(p, 'span'),
              decadeWidth: num(p, 'decadeWidth'),
              binRows: nums(p, 'binRows'),
              lo: num(p, 'lo'),
              hi: num(p, 'hi'),
              sql: str(p, 'sql'),
              column: str(p, 'column'),
            },
            ms(),
          );
          return;
        }
        case 'cut': {
          const p = bag(e);
          stage?.cut({ pieces: pieces(p), estimate: num(p, 'estimate') }, ms());
          return;
        }
        case 'pick': {
          const p = bag(e);
          stage?.pick(
            {
              seqName: str(p, 'seqName'),
              indexName: str(p, 'indexName'),
              seqEstimate: num(p, 'seqEstimate'),
              indexEstimate: num(p, 'indexEstimate'),
              chosen: which(p, 'chosen'),
            },
            ms(),
          );
          return;
        }
        case 'actual': {
          const p = bag(e);
          stage?.reveal(
            {
              decades: nums(p, 'decades'),
              decadeWidth: num(p, 'decadeWidth'),
              actualRows: num(p, 'actualRows'),
              error: num(p, 'error'),
              estimate: num(p, 'estimate'),
            },
            ms(),
          );
          return;
        }
        case 'cost': {
          const p = bag(e);
          stage?.settle(
            {
              seqName: str(p, 'seqName'),
              indexName: str(p, 'indexName'),
              seqActual: num(p, 'seqActual'),
              indexActual: num(p, 'indexActual'),
              chosen: which(p, 'chosen'),
              better: which(p, 'better'),
              chosenWasBetter: flag(p, 'chosenWasBetter'),
              pagesRead: num(p, 'pagesRead'),
            },
            ms(),
          );
          return;
        }
        default:
          return;
      }
    },
    onReset(): void {
      code?.highlightPhase(null);
      stage?.clear();
    },
  };
};
