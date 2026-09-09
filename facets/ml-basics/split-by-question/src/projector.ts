/**
 * splitByQuestion projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁힌다 (C9). stage 는 필수 필드 타입만 받으며 `unknown` 을
 * 보지 않는다. 화면 문안도 여기서 정해진다 — algorithm 은 키도 문안도 싣지 않고,
 * projector 가 `runtime.t` 로 조회해 완성된 문장을 넘긴다 (C10).
 */

import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';

type Axis = 'x' | 'y';
type Side = { a: number; b: number };
type Point = { x: number; y: number; label: string };

/**
 * stage 의 계약. 메서드가 빠진 view 와도 깨지지 않게 optional 로 두고 `?.()` 로
 * 부른다 (C9).
 */
type SplitStage = {
  setup?(input: {
    points: Point[];
    classes: [string, string];
    xCuts: number[];
    yCuts: number[];
  }): void;
  say?(caption: string): void;
  reset?(): void;
  pickAxis?(input: { axis: Axis; caption: string }): Promise<void> | void;
  tryCut?(input: {
    axis: Axis;
    threshold: number;
    low: Side;
    high: Side;
    pure: boolean;
    caption: string;
  }): Promise<void> | void;
  showExhausted?(input: { caption: string }): Promise<void> | void;
  finish?(input: { caption: string }): void;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readSide(v: unknown): Side | null {
  const raw = v as { a?: unknown; b?: unknown } | undefined;
  const a = num(raw?.a);
  const b = num(raw?.b);
  return a === null || b === null ? null : { a, b };
}

function readAxis(v: unknown): Axis | null {
  return v === 'x' || v === 'y' ? v : null;
}

function readPoints(v: unknown): Point[] {
  if (!Array.isArray(v)) return [];
  const out: Point[] = [];
  for (const item of v) {
    const raw = item as { x?: unknown; y?: unknown; label?: unknown };
    const x = num(raw?.x);
    const y = num(raw?.y);
    if (x === null || y === null || typeof raw?.label !== 'string') continue;
    out.push({ x, y, label: raw.label });
  }
  return out;
}

function readNumbers(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const item of v) {
    const n = num(item);
    if (n !== null) out.push(n);
  }
  return out;
}

function readClasses(v: unknown, points: Point[]): [string, string] {
  if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string') {
    return [v[0], v[1]];
  }
  // 선언이 이름표를 안 주면 점에서 처음 보인 순서로 둘을 잡는다.
  const seen: string[] = [];
  for (const p of points) if (!seen.includes(p.label)) seen.push(p.label);
  return [seen[0] ?? '', seen[1] ?? ''];
}

export const splitByQuestionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SplitStage | undefined;
  // 러너 밖 mount 를 위한 fallback. 직접 만든 조회기는 주입된 locale 번들을 못 본다.
  const tr: Translate = runtime?.t ?? makeTranslator();

  const startCaption = (): string =>
    tr('caption.start', 'Every point carries a label. A sits low, B sits high.');

  return {
    onInit(initialData) {
      const d = initialData as
        | { points?: unknown; classes?: unknown; xCuts?: unknown; yCuts?: unknown }
        | undefined;
      const points = readPoints(d?.points);
      stage?.setup?.({
        points,
        classes: readClasses(d?.classes, points),
        xCuts: readNumbers(d?.xCuts),
        yCuts: readNumbers(d?.yCuts),
      });
      stage?.say?.(startCaption());
    },

    onReset() {
      stage?.reset?.();
      stage?.say?.(startCaption());
    },

    async onEvent(event) {
      switch (event.type) {
        case 'axis-picked': {
          const p = event.payload as { axis?: unknown } | undefined;
          const axis = readAxis(p?.axis);
          if (axis === null) return;
          const caption =
            axis === 'x'
              ? tr('caption.axisX', 'Stand one cut line on the horizontal axis.')
              : tr('caption.axisY', 'Turn the cut line over onto the vertical axis.');
          await stage?.pickAxis?.({ axis, caption });
          return;
        }

        case 'cut-tried': {
          const p = event.payload as
            | { axis?: unknown; threshold?: unknown; low?: unknown; high?: unknown; pure?: unknown }
            | undefined;
          const axis = readAxis(p?.axis);
          const threshold = num(p?.threshold);
          const low = readSide(p?.low);
          const high = readSide(p?.high);
          if (axis === null || threshold === null || low === null || high === null) return;
          const pure = p?.pure === true;
          const caption = pure
            ? tr('caption.pure', 'Cut at {t}. One side is all A, the other all B.', {
                t: String(threshold),
              })
            : tr('caption.mixed', 'Cut at {t}. Each side is still half A, half B.', {
                t: String(threshold),
              });
          await stage?.tryCut?.({ axis, threshold, low, high, pure, caption });
          return;
        }

        case 'axis-exhausted': {
          const p = event.payload as { tried?: unknown } | undefined;
          const tried = num(p?.tried) ?? 0;
          await stage?.showExhausted?.({
            caption: tr(
              'caption.exhausted',
              'Positions tried on this axis: {n}. Sliding never separates them.',
              { n: String(tried) },
            ),
          });
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          stage?.say?.(startCaption());
          return;
        }

        case 'done': {
          stage?.finish?.({
            caption: tr('caption.done', 'What separated them was the axis, not the position.'),
          });
          return;
        }

        default:
          // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
