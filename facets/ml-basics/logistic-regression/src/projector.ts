/**
 * 로지스틱 회귀 Projector — 알고리즘 이벤트를 stage / 코드 패널 호출로 옮긴다.
 *
 * 다루는 이벤트 (algorithm.ts 의 목록과 짝):
 *   phase          → codePanel.highlightPhase
 *   state-changed  → stage.setFrame + setCaption   (학습이 한 마디 나아갔다)
 *   mark           → stage.setFrame + setCaption   (독자가 문턱을 옮겼다)
 *   done           → stage.setFrame + setCaption   (600 걸음을 마쳤다)
 *   그 밖          → 조용히 버린다 (default 분기)
 *
 * 문안은 코드에 없다. 알고리즘이 키를 보내고 여기서 `tr` 로 푼다 (C10) —
 * 추출기가 원본을 모을 수 있도록 en 원본은 호출부에 리터럴로 둔다.
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { LogisticStageFrame, LogisticStagePoint } from './logistic-regression-stage.js';

/** stage view 의 호출 가능한 표면 (C9 — 오픈 타입을 여기서 한 번만 좁힌다). */
type LogisticStage = {
  setPoints?: (points: LogisticStagePoint[], thresholds: number[]) => void;
  setFrame?: (frame: LogisticStageFrame) => void;
  setCaption?: (text: string) => void;
};

/** code-view 의 호출 가능한 표면. 호스트가 등록하지 않았으면 없을 수 있다. */
type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
};

function readPoints(value: unknown): LogisticStagePoint[] {
  if (!Array.isArray(value)) return [];
  const out: LogisticStagePoint[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const p = raw as Record<string, unknown>;
    if (typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.label !== 'number') continue;
    out.push({ x: p.x, y: p.y, label: p.label });
  }
  return out;
}

function readNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number');
}

function readFrame(payload: unknown): LogisticStageFrame | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const nums = ['step', 'w0', 'w1', 'bias', 'loss', 'threshold', 'hit', 'miss', 'falseAlarm'];
  for (const key of nums) {
    if (typeof p[key] !== 'number') return null;
  }
  if (!Array.isArray(p.probs)) return null;
  return {
    step: p.step as number,
    w0: p.w0 as number,
    w1: p.w1 as number,
    bias: p.bias as number,
    probs: readNumbers(p.probs),
    loss: p.loss as number,
    threshold: p.threshold as number,
    hit: p.hit as number,
    miss: p.miss as number,
    falseAlarm: p.falseAlarm as number,
    finished: p.finished === true,
  };
}

function readTextKey(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return '';
  const key = (payload as Record<string, unknown>).textKey;
  return typeof key === 'string' ? key : '';
}

export const logisticRegressionProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const tr = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as LogisticStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  /** 키 하나에 en 원본 하나. 추출기가 리터럴만 읽으므로 호출부에 둔다 (C10). */
  const captionFor = (key: string): string => {
    switch (key) {
      case 'caption.start':
        return tr('caption.start', 'The weights start at zero, so every point is still a coin flip.');
      case 'caption.training':
        return tr('caption.training', 'The weights move, and the line and the ribbon move with them.');
      case 'caption.threshold':
        return tr(
          'caption.threshold',
          'The weights did not move. Only the place where you say "this one" did.',
        );
      case 'caption.done':
        return tr(
          'caption.done',
          'Learning is over. Where to draw the line is still yours to pick.',
        );
      default:
        return '';
    }
  };

  const show = (event: FacetRuntimeEvent): void => {
    const frame = readFrame(event.payload);
    if (frame) stage?.setFrame?.(frame);
    const caption = captionFor(readTextKey(event.payload));
    if (caption) stage?.setCaption?.(caption);
  };

  return {
    onInit(initialData: unknown): void {
      if (typeof initialData !== 'object' || initialData === null) return;
      const d = initialData as Record<string, unknown>;
      stage?.setPoints?.(readPoints(d.points), readNumbers(d.thresholds));
      codePanel?.highlightPhase?.(null);
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          codePanel?.highlightPhase?.(typeof p?.phase === 'string' ? p.phase : null);
          break;
        }
        case 'state-changed':
        case 'mark':
        case 'done':
          show(event);
          break;
        default:
          // 이 facet 이 내지 않는 이벤트. 조용히 버린다.
          break;
      }
    },

    onReset(): void {
      codePanel?.highlightPhase?.(null);
    },
  };
};
