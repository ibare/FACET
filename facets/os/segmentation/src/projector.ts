/**
 * segmentation projector — 알고리즘 이벤트를 stage 메서드와 코드 패널 강조로 옮긴다.
 *
 * - `round`   → stage.setRound (요청 줄 글 · 시작 캡션을 문안으로 만들어 넘긴다)
 * - `place` · `release` · `reject` → stage.showStep (캡션을 셈한 값으로 만든다)
 * - `phase`   → codePanel.highlightPhase
 *
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 를 읽어 셈한다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { SegmentationStage, StagePiece, StageHole, StageSnapshot } from './segmentation-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

const MOTION_MS = 500;

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`segmentation projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`segmentation projector: ${key} 가 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`segmentation projector: ${key} 가 글이 아니다`);
  return v;
}
function list(o: Record<string, unknown>, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`segmentation projector: ${key} 가 배열이 아니다`);
  return v;
}

function readSnapshot(v: unknown): StageSnapshot {
  const s = rec(v, 'state');
  const pieces: StagePiece[] = list(s, 'pieces').map((x) => {
    const p = rec(x, 'piece');
    return { block: str(p, 'block'), start: num(p, 'start'), len: num(p, 'len'), used: num(p, 'used') };
  });
  const holes: StageHole[] = list(s, 'holes').map((x) => {
    const h = rec(x, 'hole');
    return { start: num(h, 'start'), len: num(h, 'len') };
  });
  return {
    pieces,
    holes,
    freeTotal: num(s, 'freeTotal'),
    largestHole: num(s, 'largestHole'),
    insideWaste: num(s, 'insideWaste'),
  };
}

export const segmentationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SegmentationStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();

  const motionMs = (): number => {
    const speed = runtime ? runtime.getSpeed() : 1;
    if (!(speed > 0)) throw new Error(`segmentation projector: 재생 속도 ${speed} 로는 운동 길이를 셈할 수 없다`);
    return MOTION_MS / speed;
  };

  const startCaption = (s: StageSnapshot): string =>
    t('caption.start', 'Free total: {free} KiB · Largest hole: {big} KiB', { free: s.freeTotal, big: s.largestHole });

  return {
    async onEvent(e: FacetRuntimeEvent) {
      const p = e.payload;
      switch (e.type) {
        case 'phase': {
          const ph = rec(p, 'phase payload').phase;
          if (typeof ph !== 'string') throw new Error('segmentation projector: phase 가 글이 아니다');
          code?.highlightPhase(ph);
          return;
        }
        case 'round': {
          const r = rec(p, 'round');
          const snapshot = readSnapshot(r.state);
          const lines = list(r, 'requests').map((x) => {
            const q = rec(x, 'request');
            const kind = str(q, 'kind');
            const block = str(q, 'block');
            if (kind === 'in') return t('req.in', 'In: {block} · {size} KiB', { block, size: num(q, 'size') });
            if (kind === 'out') return t('req.out', 'Out: {block}', { block });
            throw new Error(`segmentation projector: 모르는 요청 종류 ${kind}`);
          });
          const blocks = list(r, 'blocks').map((b) => {
            if (typeof b !== 'string') throw new Error('segmentation projector: 덩이 식별자가 글이 아니다');
            return b;
          });
          code?.clearHighlight();
          await stage?.setRound(
            {
              fixed: num(r, 'fit') === 3,
              memoryKiB: num(r, 'memoryKiB'),
              frameKiB: num(r, 'frameKiB'),
              blocks,
              lines,
              snapshot,
              caption: startCaption(snapshot),
            },
            motionMs(),
          );
          return;
        }
        case 'place': {
          const r = rec(p, 'place');
          const frames = list(r, 'frames').map((f) => {
            if (typeof f !== 'number') throw new Error('segmentation projector: 프레임 번호가 수가 아니다');
            return f;
          });
          const caption =
            frames.length > 0
              ? t('caption.placedFrames', 'Placed in frames: {frames}', { frames: frames.join(', ') })
              : t('caption.placed', 'Placed at {start}–{end} KiB', { start: num(r, 'start'), end: num(r, 'end') });
          await stage?.showStep(
            {
              kind: 'place',
              step: num(r, 'step'),
              block: str(r, 'block'),
              request: num(r, 'size'),
              snapshot: readSnapshot(r.state),
              caption,
            },
            motionMs(),
          );
          return;
        }
        case 'release': {
          const r = rec(p, 'release');
          const block = str(r, 'block');
          await stage?.showStep(
            {
              kind: 'release',
              step: num(r, 'step'),
              block,
              request: null,
              snapshot: readSnapshot(r.state),
              caption: t('caption.freed', 'Freed: {block}', { block }),
            },
            motionMs(),
          );
          return;
        }
        case 'reject': {
          const r = rec(p, 'reject');
          const size = num(r, 'size');
          await stage?.showStep(
            {
              kind: 'reject',
              step: num(r, 'step'),
              block: str(r, 'block'),
              request: size,
              snapshot: readSnapshot(r.state),
              caption: t('caption.rejected', 'No hole fits: {size} KiB', { size }),
            },
            motionMs(),
          );
          return;
        }
        default:
          return;
      }
    },
  };
};
