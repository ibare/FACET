/**
 * page-replacement projector — round-start · reference 를 stage 로, phase 를 코드 패널로 옮긴다.
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 로 나눈다 (속도를 바꾸면 다음 걸음부터 따라간다).
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { PageReplacementStage, StageRound, StageStep } from './page-replacement-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`payload.${key} 가 수가 아니다`);
  return v;
}

function nums(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) throw new Error(`payload.${key} 가 수의 배열이 아니다`);
  return v as number[];
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`payload.${key} 가 문자열이 아니다`);
  return v;
}

function record(e: FacetRuntimeEvent): Record<string, unknown> {
  const p = e.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`${e.type} 의 payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

export const pageReplacementProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PageReplacementStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let motionMs = 0;
  const motion = (): number => motionMs / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onInit(data) {
      const d = data as { motionMs?: unknown } | undefined;
      if (typeof d?.motionMs !== 'number') throw new Error('initialData.motionMs 가 수가 아니다');
      motionMs = d.motionMs;
      code?.clearHighlight?.();
    },

    onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = record(e);
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round-start': {
          const p = record(e);
          const round: StageRound = {
            refs: nums(p, 'refs'),
            policy: num(p, 'policy'),
            policyId: str(p, 'policyId'),
            frames: num(p, 'frames'),
            frameLadder: nums(p, 'frameLadder'),
            bars: nums(p, 'bars'),
            scale: num(p, 'scale'),
          };
          code?.clearHighlight?.();
          stage?.startRound(round, motion());
          stage?.setCaption(t('caption.start', 'Empty frames: {n}', { n: round.frames }));
          return;
        }
        case 'reference': {
          const p = record(e);
          const kind = str(p, 'kind');
          if (kind !== 'hit' && kind !== 'fill' && kind !== 'evict') throw new Error(`모르는 걸음 종류: ${kind}`);
          const ev = p.evicted;
          if (ev !== null && typeof ev !== 'number') throw new Error('payload.evicted 가 수나 null 이 아니다');
          const step: StageStep = {
            step: num(p, 'step'),
            page: num(p, 'page'),
            kind,
            frame: num(p, 'frame'),
            evicted: ev,
            swept: nums(p, 'swept'),
            hand: num(p, 'hand'),
            pages: nums(p, 'pages'),
            stamps: nums(p, 'stamps'),
            marks: nums(p, 'marks'),
            faults: num(p, 'faults'),
          };
          stage?.showStep(step, motion());
          const parts = [t('caption.reference', 'Reference: {page}', { page: step.page })];
          if (step.swept.length > 0) {
            parts.push(t('caption.cleared', 'Mark cleared: frame {frame}', { frame: step.swept.join(', ') }));
          }
          if (kind === 'hit') {
            parts.push(t('caption.hit', 'Hit: frame {frame}', { frame: step.frame }));
          } else if (kind === 'fill') {
            parts.push(t('caption.fill', 'Fault: empty frame {frame}', { frame: step.frame }));
          } else {
            if (step.evicted === null) throw new Error(`참조 #${step.step} 는 내보냈다면서 내보낸 페이지가 없다`);
            parts.push(t('caption.evict', 'Fault: evicted {page} from frame {frame}', { page: step.evicted, frame: step.frame }));
          }
          stage?.setCaption(parts.join(' · '));
          return;
        }
        default:
          return;
      }
    },

    onReset() {
      code?.clearHighlight?.();
    },
  };
};
