/**
 * prune-branch projector — 걸음 이벤트를 stage 호출로 옮긴다.
 *
 * payload 는 열린 타입이므로 여기서 한 번에 좁힌다 (C9). stage 는 좁혀진
 * 필수 필드만 받고, `unknown` 을 다시 만나지 않는다.
 *
 * 화면 문안은 코드에 없다 — 키와 en 원본만 있고 문안은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import type { BranchVerdict, PruneBranchStageStep } from './prune-branch-stage.js';

/** stage 가 노출하는 메서드 계약. optional 은 반드시 `?.()` 로 부른다 (C9). */
type PruneBranchStage = {
  init?(cfg: { values: number[]; target: number }): void;
  setCaption?(text: string): void;
  markTask?(): Promise<void>;
  growTo?(step: PruneBranchStageStep): Promise<void>;
  finish?(): Promise<void>;
  rewind?(): void;
};

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];
}

type StepPayload = {
  /** `task-set` 에만 있다. */
  values?: unknown;
  id?: unknown;
  parentId?: unknown;
  level?: unknown;
  sum?: unknown;
  value?: unknown;
  took?: unknown;
  target?: unknown;
  below?: unknown;
  picked?: unknown;
  opened?: unknown;
  skipped?: unknown;
};

function readStep(payload: unknown, verdict: BranchVerdict): PruneBranchStageStep {
  const p = payload as StepPayload | undefined;
  return {
    id: str(p?.id),
    parentId: str(p?.parentId),
    level: num(p?.level),
    sum: num(p?.sum),
    verdict,
    below: num(p?.below),
    opened: num(p?.opened),
    skipped: num(p?.skipped),
  };
}

export const pruneBranchProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as PruneBranchStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const caption = (text: string): void => {
    stage?.setCaption?.(text);
  };

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { values?: unknown; target?: unknown } | undefined;
      stage?.init?.({ values: numList(d?.values), target: num(d?.target) });
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = event.payload as StepPayload | undefined;

      switch (event.type) {
        case 'task-set': {
          caption(tr('caption.task', 'Pick from {list} and make the sum come out exactly — the target is {target}.', {
            list: numList(p?.values).join(', '),
            target: num(p?.target),
          }));
          await stage?.markTask?.();
          return;
        }

        case 'branch-grow': {
          const step = readStep(event.payload, 'open');
          if (step.level === 0) {
            caption(tr('caption.start', 'Nothing chosen yet. The running sum is {sum}.', {
              sum: step.sum,
            }));
          } else if (p?.took === true) {
            caption(tr('caption.take', 'Put {value} in — the running sum is now {sum}.', {
              value: num(p?.value),
              sum: step.sum,
            }));
          } else {
            caption(tr('caption.skip', 'Leave {value} out — the running sum stays {sum}.', {
              value: num(p?.value),
              sum: step.sum,
            }));
          }
          await stage?.growTo?.(step);
          return;
        }

        case 'branch-cut': {
          const step = readStep(event.payload, 'cut');
          if (step.below > 0) {
            caption(tr(
              'caption.cut',
              'The running sum is already over: {sum} > {target}. Nothing below can bring it back down, so the {below} spots under this one never open.',
              { sum: step.sum, target: num(p?.target), below: step.below },
            ));
          } else {
            caption(tr(
              'caption.cutLeaf',
              'Over again: {sum} > {target}. This spot closes too — on the last row there was nothing left underneath to skip.',
              { sum: step.sum, target: num(p?.target) },
            ));
          }
          await stage?.growTo?.(step);
          return;
        }

        case 'branch-leaf': {
          const step = readStep(event.payload, 'dead');
          caption(tr('caption.dead', 'All {count} decided, and {sum} is not {target}. Nothing here.', {
            count: step.level,
            sum: step.sum,
            target: num(p?.target),
          }));
          await stage?.growTo?.(step);
          return;
        }

        case 'branch-answer': {
          const step = readStep(event.payload, 'answer');
          caption(tr('caption.answer', '{list} — the sum is exactly {target}.', {
            list: numList(p?.picked).join(' + '),
            target: num(p?.target),
          }));
          await stage?.growTo?.(step);
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        case 'done': {
          caption(tr(
            'caption.done',
            '{opened} spots opened, {skipped} never touched — and not one answer was lost. Below a sum that is already over, no answer can exist.',
            { opened: num(p?.opened), skipped: num(p?.skipped), target: num(p?.target) },
          ));
          await stage?.finish?.();
          return;
        }

        default:
          // 이 algorithm 이 발신하는 이벤트는 위가 전부다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
