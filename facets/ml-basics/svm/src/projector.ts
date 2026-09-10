/**
 * svm projector — 알고리즘 이벤트를 stage 와 코드 패널의 메서드 호출로 옮긴다.
 *
 * 여기서 하는 일은 번역뿐이다. 색도 좌표도 고르지 않고 (그것은 stage 의 일),
 * 문안도 짓지 않는다 — 알고리즘이 보내는 `textKey` 를 `runtime.t` 로 풀 뿐이다
 * (C10). en 원본은 추출기가 리터럴만 읽으므로 호출부에 그대로 둔다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance, ProjectorRuntime, ProjectorViews, Translate } from '@ffacet/core/runtime';
import { makeTranslator, parseTarget } from '@ffacet/core/runtime';

/** stage 의 계약 (C9 — 오픈 타입인 ViewInstance 를 여기 한 곳에서만 좁힌다). */
type SvmStage = {
  setPoints?(
    points: Array<{ x: number; y: number; label: number }>,
    overlapIndex: number,
    overlapAt: { x: number; y: number },
    totalSteps: number,
  ): void;
  setSettings?(c: number, cIndex: number, overlap: boolean): void;
  setModel?(model: {
    step: number;
    w0: number;
    w1: number;
    b: number;
    marginWidth: number;
    violators: number[];
    misplaced: number[];
  }): void;
  setScanned?(index: number | null, margin: number): void;
  record?(row: { cIndex: number; c: number; marginWidth: number; misplaced: number }): void;
  setCaption?(lines: string[]): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

type StepPayload = {
  step: number;
  w0: number;
  w1: number;
  b: number;
  marginWidth: number;
  violators: number[];
  misplaced: number[];
};

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function numList(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

function readStep(payload: unknown): StepPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.step !== 'number') return null;
  return {
    step: p.step,
    w0: num(p.w0, 0),
    w1: num(p.w1, 0),
    b: num(p.b, 0),
    marginWidth: num(p.marginWidth, 0),
    violators: numList(p.violators),
    misplaced: numList(p.misplaced),
  };
}

/** 소수 셋째 자리까지 — 화면에 뜨는 수는 알고리즘이 셈한 값 그대로다. */
function f3(x: number): string {
  return (Math.round(x * 1000) / 1000).toFixed(3);
}

export const svmProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as SvmStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  /**
   * 마지막으로 움직인 손잡이가 남긴 말.
   *
   * 손잡이를 옮기면 곧바로 다시 훈련해 `done` 이 뒤따르므로, 그때 덮어써
   * 버리면 그 말이 눈 깜짝할 사이에 사라진다. 결과 아래 한 줄로 남긴다.
   */
  let note: string | null = null;

  /**
   * 알고리즘이 보낸 키를 문안으로 푼다. 키는 리터럴로 가르므로 grep 으로
   * 잡히고, en 원본도 호출부에 리터럴로 남는다 (C10).
   */
  function caption(key: string, vars: Record<string, string | number>): string | null {
    switch (key) {
      case 'caption.clean':
        return tr('caption.clean', 'Nothing sits inside the gap. Its width is {w}.', vars);
      case 'caption.inside':
        return tr(
          'caption.inside',
          'Points inside the gap: {n}. None of them crossed the line. Width is {w}.',
          vars,
        );
      case 'caption.wrong':
        return tr(
          'caption.wrong',
          'Points across the line: {n}. It gave them up and opened the gap to {w}.',
          vars,
        );
      case 'caption.cChanged':
        return tr('caption.cChanged', 'C moved to {c}. Trained again from zero.', vars);
      case 'caption.overlapOn':
        return tr(
          'caption.overlapOn',
          'One point moved into the middle of the other group. No straight line separates them now.',
          vars,
        );
      case 'caption.overlapOff':
        return tr('caption.overlapOff', 'That point went home. The two groups part cleanly again.', vars);
      default:
        return null;
    }
  }

  return {
    onInit(initialData: unknown): void {
      if (typeof initialData !== 'object' || initialData === null) return;
      const d = initialData as Record<string, unknown>;
      const rawPoints = Array.isArray(d.points) ? d.points : [];
      const points = rawPoints
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .map((p) => ({ x: num(p.x, 0), y: num(p.y, 0), label: num(p.label, 1) }));
      const at =
        typeof d.overlapAt === 'object' && d.overlapAt !== null
          ? (d.overlapAt as Record<string, unknown>)
          : {};
      stage?.setPoints?.(
        points,
        num(d.overlapIndex, -1),
        { x: num(at.x, 0), y: num(at.y, 0) },
        num(d.totalSteps, 0),
      );
      const cValues = numList(d.cValues);
      const cIndex = Math.min(Math.max(num(d.initialCIndex, 0), 0), Math.max(cValues.length - 1, 0));
      stage?.setSettings?.(cValues[cIndex] ?? 1, cIndex, false);
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          if (typeof p?.phase === 'string') codePanel?.highlightPhase?.(p.phase);
          return;
        }
        case 'train-step': {
          const m = readStep(event.payload);
          if (m) stage?.setModel?.(m);
          return;
        }
        case 'point-scanned': {
          // 어느 점인지는 식별자가 말한다 — 정규식을 인라인으로 쓰지 않는다 (원칙 4).
          const t = typeof event.target === 'string' ? parseTarget(event.target) : null;
          if (t?.prefix !== 'point') return;
          const index = Number(t.id);
          if (!Number.isInteger(index)) return;
          const p = event.payload as { margin?: unknown } | undefined;
          stage?.setScanned?.(index, num(p?.margin, 0));
          return;
        }
        case 'knob-moved': {
          const p = event.payload as
            | { c?: unknown; cIndex?: unknown; overlap?: unknown; textKey?: unknown }
            | undefined;
          const c = num(p?.c, 1);
          stage?.setSettings?.(c, num(p?.cIndex, 0), p?.overlap === true);
          if (typeof p?.textKey === 'string') {
            const line = caption(p.textKey, { c: String(c) });
            note = line;
            if (line !== null) stage?.setCaption?.([line]);
          }
          return;
        }
        case 'done': {
          const m = readStep(event.payload);
          const p = event.payload as { c?: unknown; cIndex?: unknown; textKey?: unknown } | undefined;
          stage?.setScanned?.(null, 0);
          if (m) {
            stage?.setModel?.(m);
            stage?.record?.({
              cIndex: num(p?.cIndex, 0),
              c: num(p?.c, 1),
              marginWidth: m.marginWidth,
              misplaced: m.misplaced.length,
            });
          }
          if (typeof p?.textKey === 'string' && m) {
            const line = caption(p.textKey, {
              c: String(num(p?.c, 1)),
              w: f3(m.marginWidth),
              n: p.textKey === 'caption.wrong' ? m.misplaced.length : m.violators.length,
            });
            const under = note ?? tr('caption.tryKnobs', 'Move C, or switch the overlap on.');
            if (line !== null) stage?.setCaption?.([line, under]);
          }
          codePanel?.clearHighlight?.();
          return;
        }
        default:
          // 그 밖의 이벤트는 이 facet 이 발신하지 않는다. 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      note = null;
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
