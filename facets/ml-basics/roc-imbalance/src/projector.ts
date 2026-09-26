/**
 * roc-imbalance projector — 알고리즘 이벤트를 무대 메서드와 캡션으로 옮긴다.
 *
 * 걸음 0(`items`)에서 코드 패널을 끄고 무대의 결론 글자 · 표지를 걷는다. 운동 길이는 재생 속도를 그때그때 읽는다.
 * payload 는 typeof 로 읽고, 비었거나 모양이 다르면 던진다 (C6 · C9).
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { CellName, CurvePoint } from './algorithm.js';
import type { RocImbalanceStage } from './roc-imbalance-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

const MOTION_MS = 600;

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what}: 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`payload.${key}: 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`payload.${key}: 글이 아니다`);
  return v;
}
function list(o: Record<string, unknown>, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`payload.${key}: 목록이 아니다`);
  return v;
}
function cell(v: string): CellName {
  if (v === 'tp' || v === 'fn' || v === 'fp' || v === 'tn') return v;
  throw new Error(`모르는 칸: ${v}`);
}
function curveOf(o: Record<string, unknown>): CurvePoint[] {
  return list(o, 'curve').map((raw) => {
    const q = obj(raw, 'curve[]');
    return { fp: num(q, 'fp'), tp: num(q, 'tp'), fpr: num(q, 'fpr'), tpr: num(q, 'tpr') };
  });
}

export const rocImbalanceProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RocImbalanceStage | undefined;
  if (stage === undefined) throw new Error('roc-imbalance: stage 가 없다');
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const ms = () => MOTION_MS / (runtime ? runtime.getSpeed() : 1);

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'items': {
          const p = obj(event.payload, 'items');
          code?.highlightPhase(null);
          const positives = list(p, 'positives').map((raw) => {
            const q = obj(raw, 'positives[]');
            return { id: str(q, 'id'), score: num(q, 'score') };
          });
          const negatives = list(p, 'negatives').map((raw) => {
            const q = obj(raw, 'negatives[]');
            return { id: str(q, 'id'), score: num(q, 'score'), layer: num(q, 'layer') };
          });
          const multiplier = num(p, 'multiplier');
          stage.showItems({ multiplier, positives, negatives }, ms());
          stage.setCaption(
            t('caption.items', 'Positives {p} · negatives {n} — the negative list ×{m}', {
              p: num(p, 'p'),
              n: num(p, 'n'),
              m: multiplier,
            }),
          );
          return;
        }
        case 'call': {
          const p = obj(event.payload, 'call');
          const placements = list(p, 'placements').map((raw) => {
            const q = obj(raw, 'placements[]');
            return { id: str(q, 'id'), cell: cell(str(q, 'cell')), slot: num(q, 'slot') };
          });
          const counts = { tp: num(p, 'tp'), fn: num(p, 'fn'), fp: num(p, 'fp'), tn: num(p, 'tn') };
          const threshold = num(p, 'threshold');
          stage.showCall({ threshold, counts, placements }, ms());
          stage.setCaption(
            t('caption.call', 'Called positive: score ≥ {th} — TP {tp} · FN {fn} · FP {fp} · TN {tn}', {
              th: threshold,
              ...counts,
            }),
          );
          return;
        }
        case 'rates': {
          const p = obj(event.payload, 'rates');
          const tprPercent = num(p, 'tprPercent');
          const fprPercent = num(p, 'fprPercent');
          stage.showRates({ tprPercent, fprPercent, tpr: num(p, 'tpr'), fpr: num(p, 'fpr'), curve: curveOf(p) }, ms());
          stage.setCaption(
            t('caption.rates', 'TPR = TP / P = {tp} / {p} → {tpr} % · FPR = FP / N = {fp} / {n} → {fpr} %', {
              tp: num(p, 'tp'),
              p: num(p, 'p'),
              tpr: tprPercent,
              fp: num(p, 'fp'),
              n: num(p, 'n'),
              fpr: fprPercent,
            }),
          );
          return;
        }
        case 'auc': {
          const p = obj(event.payload, 'auc');
          const auc = num(p, 'aucPercent');
          stage.showAuc(auc, curveOf(p), ms());
          stage.setCaption(
            t('caption.auc', 'AUC {auc} % — area under the curve: the share of pairs where the positive scores higher', {
              auc,
            }),
          );
          return;
        }
        case 'precision': {
          const p = obj(event.payload, 'precision');
          const v = num(p, 'precisionPercent');
          stage.showGauge('precision', v, ms());
          stage.setCaption(
            t('caption.precision', 'Precision = TP / (TP + FP) = {tp} / {called} → {v} %', {
              tp: num(p, 'tp'),
              called: num(p, 'called'),
              v,
            }),
          );
          return;
        }
        case 'accuracy': {
          const p = obj(event.payload, 'accuracy');
          const v = num(p, 'accuracyPercent');
          stage.showGauge('accuracy', v, ms());
          stage.setCaption(
            t('caption.accuracy', 'Accuracy = (TP + TN) / all = {correct} / {total} → {v} %', {
              correct: num(p, 'correct'),
              total: num(p, 'total'),
              v,
            }),
          );
          return;
        }
        default:
          throw new Error(`roc-imbalance: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage.reset();
      code?.highlightPhase(null);
    },
  };
};
