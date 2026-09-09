/**
 * 최소제곱 조각의 번역기 — 이벤트를 무대 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 한 번에 좁힌다 (C9). 무대는 좁혀진 값만
 * 받고, 화면 문안은 여기서 textKey 를 풀어 넘긴다 (C10) — 무대가 스스로
 * translator 를 만들면 저작자가 messages 에 쓴 문안을 보지 못한다.
 */

import type { ProjectorFactory, ProjectorInstance, ProjectorViews, ProjectorRuntime } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type Stage = {
  setup(spec: {
    points: { x: number; y: number }[];
    lines: { slope: number; intercept: number }[];
    caption: string;
  }): void;
  focusLine(spec: { lineIndex: number; residuals: number[]; caption: string }): Promise<void>;
  foldSigned(spec: {
    lineIndex: number;
    residuals: number[];
    total: number;
    caption: string;
  }): Promise<void>;
  foldSquared(spec: {
    lineIndex: number;
    residuals: number[];
    squares: number[];
    total: number;
    caption: string;
  }): Promise<void>;
  shiftMeasure(spec: { caption: string }): Promise<void>;
  markSmallest(spec: { bestIndex: number; caption: string }): Promise<void>;
  rewind(spec: { caption: string }): Promise<void>;
};

type Narrowed = {
  lineIndex: number;
  bestIndex: number;
  residuals: number[];
  squares: number[];
  total: number;
  textKey: string;
};

const EMPTY: Narrowed = {
  lineIndex: 0,
  bestIndex: 0,
  residuals: [],
  squares: [],
  total: 0,
  textKey: '',
};

function numbers(raw: unknown): number[] {
  return Array.isArray(raw) ? raw.filter((v): v is number => typeof v === 'number') : [];
}

function narrow(payload: unknown): Narrowed {
  if (payload === null || typeof payload !== 'object') return EMPTY;
  const p = payload as {
    lineIndex?: unknown;
    bestIndex?: unknown;
    residuals?: unknown;
    squares?: unknown;
    total?: unknown;
    textKey?: unknown;
  };
  return {
    lineIndex: typeof p.lineIndex === 'number' ? p.lineIndex : 0,
    bestIndex: typeof p.bestIndex === 'number' ? p.bestIndex : 0,
    residuals: numbers(p.residuals),
    squares: numbers(p.squares),
    total: typeof p.total === 'number' ? p.total : 0,
    textKey: typeof p.textKey === 'string' ? p.textKey : '',
  };
}

/** 점과 직선의 구조를 initialData 에서 꺼낸다. 좌표는 무대가 셈한다 (S-piece). */
function narrowSetup(initial: unknown): {
  points: { x: number; y: number }[];
  lines: { slope: number; intercept: number }[];
} {
  const d = initial as { points?: unknown; lines?: unknown } | null;
  const points = Array.isArray(d?.points)
    ? d.points
        .map((p) => p as { x?: unknown; y?: unknown })
        .filter((p) => typeof p.x === 'number' && typeof p.y === 'number')
        .map((p) => ({ x: p.x as number, y: p.y as number }))
    : [];
  const lines = Array.isArray(d?.lines)
    ? d.lines
        .map((l) => l as { slope?: unknown; intercept?: unknown })
        .filter((l) => typeof l.slope === 'number' && typeof l.intercept === 'number')
        .map((l) => ({ slope: l.slope as number, intercept: l.intercept as number }))
    : [];
  return { points, lines };
}

export const leastSquaresProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 화면 문안은 전부 이 표를 거친다. en 원본은 호출부 리터럴로 남는다 (C10). */
  function caption(key: string): string {
    switch (key) {
      case 'caption.opening':
        return tr('caption.opening', 'Four points. Three lines to be judged.');
      case 'caption.miss':
        return tr('caption.miss', 'Each point misses the line by this much.');
      case 'caption.cancel':
        return tr(
          'caption.cancel',
          'Stacked with their signs, the misses undo one another.',
        );
      case 'caption.allZero':
        return tr(
          'caption.allZero',
          'All three come back to zero. The signed sum cannot tell them apart.',
        );
      case 'caption.square':
        return tr(
          'caption.square',
          'So square each miss: a length becomes an area, and an area is never negative.',
        );
      case 'caption.pileUp':
        return tr('caption.pileUp', 'The same misses, squared. Squares only pile up.');
      case 'caption.split':
        return tr('caption.split', 'Now the three stand apart.');
      case 'caption.verdict':
        return tr(
          'caption.verdict',
          'Least squares picks the line whose squares pile up the least.',
        );
      default:
        return '';
    }
  }

  return {
    onInit(initialData: unknown): void {
      if (!stage) return;
      const { points, lines } = narrowSetup(initialData);
      stage.setup({ points, lines, caption: caption('caption.opening') });
    },

    async onEvent(event): Promise<void> {
      if (!stage) return;
      switch (event.type) {
        case 'line-focus': {
          const p = narrow(event.payload);
          await stage.focusLine({
            lineIndex: p.lineIndex,
            residuals: p.residuals,
            caption: caption(p.textKey),
          });
          return;
        }
        case 'signed-fold': {
          const p = narrow(event.payload);
          await stage.foldSigned({
            lineIndex: p.lineIndex,
            residuals: p.residuals,
            total: p.total,
            caption: caption(p.textKey),
          });
          return;
        }
        case 'square-fold': {
          const p = narrow(event.payload);
          await stage.foldSquared({
            lineIndex: p.lineIndex,
            residuals: p.residuals,
            squares: p.squares,
            total: p.total,
            caption: caption(p.textKey),
          });
          return;
        }
        case 'measure-shift': {
          await stage.shiftMeasure({ caption: caption(narrow(event.payload).textKey) });
          return;
        }
        case 'verdict': {
          const p = narrow(event.payload);
          await stage.markSmallest({ bestIndex: p.bestIndex, caption: caption(p.textKey) });
          return;
        }
        case 'rewind': {
          await stage.rewind({ caption: caption(narrow(event.payload).textKey) });
          return;
        }
        default:
          // 이 조각이 발신하는 어휘는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      // 되돌리기는 mechanism 이 initialData 를 되살린 뒤 onInit 을 다시 부른다.
      // 여기서 따로 할 일은 없다 — setup 이 무대를 통째로 다시 세운다.
    },
  };
};
