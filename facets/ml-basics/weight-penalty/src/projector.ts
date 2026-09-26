/**
 * weight-penalty projector — algorithm 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 수의 표시(toFixed)만 여기서 한다. 자리 · 비 · 0 개수 · 붙은 갱신은 payload 그대로 넘긴다.
 * 운동 길이는 부를 때마다 재생 속도를 읽어 정한다.
 */
import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { WeightPenaltyStage } from './weight-penalty-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

/** 운동의 바탕 길이 (재생 속도 1 에서) */
const MOTION_MS = 380;

function num(x: unknown, what: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`weight-penalty projector: ${what} 가 수가 아니다`);
  return x;
}

function str(x: unknown, what: string): string {
  if (typeof x !== 'string') throw new Error(`weight-penalty projector: ${what} 가 글이 아니다`);
  return x;
}

function nums(x: unknown, what: string): number[] {
  if (!Array.isArray(x)) throw new Error(`weight-penalty projector: ${what} 가 목록이 아니다`);
  return x.map((v, i) => num(v, `${what}[${i}]`));
}

function strs(x: unknown, what: string): string[] {
  if (!Array.isArray(x)) throw new Error(`weight-penalty projector: ${what} 가 목록이 아니다`);
  return x.map((v, i) => str(v, `${what}[${i}]`));
}

function pins(x: unknown): (number | null)[] {
  if (!Array.isArray(x)) throw new Error('weight-penalty projector: pinnedAt 가 목록이 아니다');
  return x.map((v, i) => (v === null ? null : num(v, `pinnedAt[${i}]`)));
}

/** 두 자리 표시. −0 이 뜨면 셈 길이 사양과 다른 것이라 던진다. */
function fx2(v: number): string {
  const s = v.toFixed(2);
  if (s === '-0.00') throw new Error('weight-penalty projector: -0.00 이 떴다');
  return s;
}

/**
 * 무게의 표시 — 두 자리. 다만 정확히 0 이 아닌데 두 자리로 0.00 (또는 −0.00) 이 되는 무게는 셋째 자리까지 적는다.
 * "두 자리로 0.00 인 값은 0 이 아니다" — L1 에서 0 에 붙기 한 갱신 앞의 무게가 이 자리에 온다
 * (λ 0.1 의 갱신 3 w6 = −0.0016 · λ 0.8 의 갱신 4 w2 = −0.00368, 이 데이터의 전부). 정확한 0 만 0.00 으로 뜬다.
 */
export function weightText(v: number): string {
  if (v !== 0 && Math.abs(v) < 0.005) return v.toFixed(3);
  return fx2(v);
}

export const weightPenaltyProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as WeightPenaltyStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const dur = () => MOTION_MS / Math.max(0.25, runtime?.getSpeed() ?? 1);
  let total = 0;
  let ids: string[] = [];

  return {
    onEvent(event: FacetRuntimeEvent) {
      if (stage === undefined) throw new Error('weight-penalty projector: stage 가 없다');
      const p = (event.payload ?? {}) as Record<string, unknown>;
      switch (event.type) {
        case 'phase': {
          code?.highlightPhase(str(p.phase, 'phase'));
          return;
        }
        case 'init': {
          total = num(p.total, 'total');
          ids = strs(p.ids, 'ids');
          stage.init({
            ids,
            start: nums(p.start, 'start'),
            extent: num(p.extent, 'extent'),
            ratioSymbol: str(p.ratioSymbol, 'ratioSymbol'),
          });
          code?.highlightPhase(null);
          return;
        }
        case 'start': {
          const penalty = str(p.penalty, 'penalty');
          const lam = num(p.lam, 'lam');
          const etaLam = num(p.etaLam, 'etaLam');
          const weights = nums(p.weights, 'weights');
          code?.highlightPhase(null);
          stage.start(
            {
              penalty,
              lamText: String(lam),
              etaText: fx2(num(p.eta, 'eta')),
              etaLam,
              etaLamText: fx2(etaLam),
              formula: str(p.formula, 'formula'),
              weights,
              valueTexts: weights.map(weightText),
            },
            dur(),
          );
          stage.setCaption(
            t('caption.start', 'Penalty {penalty}, λ = {lam}. The six weights start from a, the fit with no penalty.', {
              penalty,
              lam: String(lam),
            }),
          );
          return;
        }
        case 'update': {
          const penalty = str(p.penalty, 'penalty');
          const k = num(p.index, 'index');
          const weights = nums(p.weights, 'weights');
          const ratios = nums(p.ratios, 'ratios');
          const zeroCount = num(p.zeroCount, 'zeroCount');
          const newly = nums(p.newlyZero, 'newlyZero');
          const h = p.h === null ? null : nums(p.h, 'h');
          const etaLamText = fx2(num(p.etaLam, 'etaLam'));
          if (typeof p.sameRatio !== 'boolean') throw new Error('weight-penalty projector: sameRatio 가 없다');
          stage.update(
            {
              h,
              weights,
              valueTexts: weights.map(weightText),
              ratioTexts: ratios.map(fx2),
              pinnedAt: pins(p.pinnedAt),
              zeroCount,
              total,
            },
            dur(),
          );
          if (penalty === 'L1') {
            if (newly.length > 0) {
              const names = newly.map((i) => {
                const id = ids[i];
                if (id === undefined) throw new Error('weight-penalty projector: newlyZero 가 무게 밖을 가리킨다');
                return id;
              });
              stage.setCaption(
                t('caption.l1Zero', 'Update {k}: {names} fell inside the band ηλ = {el} and stick at 0. Weights at 0: {z}', {
                  k,
                  names: names.join(', '),
                  el: etaLamText,
                  z: zeroCount,
                }),
              );
            } else {
              stage.setCaption(
                t('caption.l1Update', 'Update {k}: a pull toward a, then every nonzero weight moves {el} toward 0. Weights at 0: {z}', {
                  k,
                  el: etaLamText,
                  z: zeroCount,
                }),
              );
            }
          } else if (penalty === 'L2') {
            const r0 = ratios[0];
            if (r0 === undefined) throw new Error('weight-penalty projector: ratios 가 비었다');
            if (p.sameRatio) {
              stage.setCaption(
                t('caption.l2Same', 'Update {k}: all six keep the same ratio w / a = {r}. Weights at 0: {z}', {
                  k,
                  r: fx2(r0),
                  z: zeroCount,
                }),
              );
            } else {
              stage.setCaption(
                t('caption.l2Mixed', 'Update {k}: the ratios w / a differ across weights. Weights at 0: {z}', { k, z: zeroCount }),
              );
            }
          } else {
            throw new Error(`weight-penalty projector: 모르는 벌점 ${penalty}`);
          }
          return;
        }
        case 'count': {
          const zeroCount = num(p.zeroCount, 'zeroCount');
          const n = num(p.total, 'total');
          stage.count({ zeroCount, total: n });
          stage.setCaption(
            t('caption.count', 'Weights exactly at 0: {z} of {n} (penalty {penalty}, λ = {lam}).', {
              z: zeroCount,
              n,
              penalty: str(p.penalty, 'penalty'),
              lam: String(num(p.lam, 'lam')),
            }),
          );
          return;
        }
        default:
          throw new Error(`weight-penalty projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.highlightPhase(null);
    },
  };
};
