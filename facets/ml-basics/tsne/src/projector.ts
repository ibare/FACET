/**
 * t-SNE projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 여기서 짓지 않는다. 키만 알고 `runtime.t` 로 조회한다 (C10).
 * 알고리즘이 보내는 것은 잰 수와 판정 토큰(`verdict`)뿐이고, 그것을 어떤 문장으로
 * 말할지는 표현 계층의 결정이다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { LedgerRow, PanelState } from './tsne-stage.js';

/** stage 의 계약. 열린 타입을 좁히는 자리는 여기 하나다 (C9). */
type TsneStage = ViewInstance & {
  setSource?(state: PanelState, separation: number): void;
  setEmbedding?(state: PanelState, separation: number): void;
  clearEmbedding?(): void;
  addLedgerRow?(row: LedgerRow): void;
  setCurrentRow?(key: string | null): void;
  setCaption?(line: string): void;
  reset?(): void;
};

type Verdict = LedgerRow['verdict'];

/** 이벤트 payload 에서 판을 잰 값만 꺼낸다. 필드마다 런타임 가드를 건다 (C9). */
type MeasurePayload = {
  perplexity: number;
  step: number;
  steps: number;
  coords: number[][];
  labels: number[];
  spreads: number[];
  ratio: number;
  separation: number;
  verdict: Verdict;
};

function isNumberList(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function isCoordList(v: unknown): v is number[][] {
  return (
    Array.isArray(v) &&
    v.every((p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number')
  );
}

function asVerdict(v: unknown): Verdict {
  return v === 'clean' || v === 'broken' ? v : 'blurred';
}

function readMeasure(payload: unknown): MeasurePayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    perplexity: num(p.perplexity),
    step: num(p.step),
    steps: num(p.steps),
    coords: isCoordList(p.coords) ? p.coords : isCoordList(p.points) ? p.points : [],
    labels: isNumberList(p.labels) ? p.labels : [],
    spreads: isNumberList(p.spreads) ? p.spreads : [],
    ratio: num(p.ratio),
    separation: num(p.separation),
    verdict: asVerdict(p.verdict),
  };
}

function fixed2(v: number): string {
  return v.toFixed(2);
}

export const tsneProjector: ProjectorFactory = (views, runtime) => {
  const tr = runtime?.t ?? makeTranslator();
  const stage = views.stage as TsneStage | undefined;

  /** 원래 자리의 무리 사이 비. 편 그림과 견줄 기준이라 들고 있는다. */
  let sourceRatio = 0;
  /** 원래 자리의 점과 무리 번호. 손잡이가 움직여도 왼쪽 판은 그대로다. */
  let sourceState: PanelState | null = null;

  const caption = (line: string): void => {
    stage?.setCaption?.(line);
  };

  return {
    onInit() {
      stage?.reset?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'source-measured': {
          const m = readMeasure(event.payload);
          if (!m) return;
          sourceRatio = m.ratio;
          sourceState = { coords: m.coords, labels: m.labels, spreads: m.spreads, ratio: m.ratio };
          stage?.setSource?.(sourceState, m.separation);
          stage?.addLedgerRow?.({
            key: 'source',
            kind: 'source',
            perplexity: 0,
            separation: m.separation,
            ratio: m.ratio,
            verdict: m.verdict,
          });
          caption(
            tr('caption.source', 'Really, B-C is {ratio} times A-B. Watch what survives the flattening.', {
              ratio: fixed2(m.ratio),
            }),
          );
          return;
        }

        case 'run-begin': {
          const m = readMeasure(event.payload);
          if (!m) return;
          stage?.clearEmbedding?.();
          stage?.setCurrentRow?.(`p${m.perplexity}`);
          caption(
            tr('caption.running', 'Flattening at perplexity {perplexity} - step {step} of {steps}.', {
              perplexity: m.perplexity,
              step: 0,
              steps: m.steps,
            }),
          );
          return;
        }

        case 'layout-step': {
          const m = readMeasure(event.payload);
          if (!m) return;
          stage?.setEmbedding?.(
            {
              coords: m.coords,
              labels: m.labels.length > 0 ? m.labels : (sourceState?.labels ?? []),
              spreads: m.spreads,
              ratio: m.ratio,
            },
            m.separation,
          );
          caption(
            tr('caption.running', 'Flattening at perplexity {perplexity} - step {step} of {steps}.', {
              perplexity: m.perplexity,
              step: m.step,
              steps: m.steps,
            }),
          );
          return;
        }

        case 'run-settled': {
          const m = readMeasure(event.payload);
          if (!m) return;
          stage?.addLedgerRow?.({
            key: `p${m.perplexity}`,
            kind: 'p',
            perplexity: m.perplexity,
            separation: m.separation,
            ratio: m.ratio,
            verdict: m.verdict,
          });
          stage?.setCurrentRow?.(`p${m.perplexity}`);
          if (m.verdict === 'clean') {
            caption(
              tr(
                'caption.clean',
                'Perplexity {perplexity}: separation {separation}, so the groups split cleanly. But the gap ratio is now {ratio}, not {sourceRatio}.',
                {
                  perplexity: m.perplexity,
                  separation: fixed2(m.separation),
                  ratio: fixed2(m.ratio),
                  sourceRatio: fixed2(sourceRatio),
                },
              ),
            );
          } else if (m.verdict === 'broken') {
            caption(
              tr(
                'caption.broken',
                'Perplexity {perplexity}: separation {separation}. Too few neighbours, so a group shattered and no boundary survives.',
                { perplexity: m.perplexity, separation: fixed2(m.separation) },
              ),
            );
          } else {
            caption(
              tr(
                'caption.blurred',
                'Perplexity {perplexity}: separation {separation}. Too many neighbours, so the groups sit tight but their edges touch.',
                { perplexity: m.perplexity, separation: fixed2(m.separation) },
              ),
            );
          }
          return;
        }

        default:
          // 이 알고리즘은 위 넷 말고는 발신하지 않는다. 그 밖의 것이 오면
          // 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      sourceRatio = 0;
      sourceState = null;
      stage?.reset?.();
    },
  };
};
