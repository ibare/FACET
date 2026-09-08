/**
 * heightStaysLow projector — algorithm 이벤트를 stage view 호출로 번역한다
 * (C9: payload 는 좁혀서 넘긴다).
 *
 * 문안은 여기서 `runtime.t` 로 해석해 완성 문자열을 view 에 넘긴다 — view 는
 * 무엇을 그릴지만 알고 무엇을 말할지는 모른다 (`ProjectorRuntime.t` 의 용도).
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type TreeId = 'branchA' | 'branchB';

type HeightStaysLowStage = {
  resetView(payload: { caption: string }): void;
  descend(payload: { treeId: TreeId; level: number; covered: number; arrived: boolean }): void;
  showResult(payload: { caption: string }): void;
  destroy(): void;
};

type InitialShape = {
  target: number;
};

function readInitialData(raw: unknown): InitialShape {
  const obj = raw as Record<string, unknown> | undefined;
  const target = typeof obj?.target === 'number' ? obj.target : 0;
  return { target };
}

/**
 * 자릿점 서식. `ProjectorRuntime` 에는 locale 이 없어 (View 의 `params.locale`
 * 과 달리) 여기서는 실행 환경 기본값을 쓴다. 화면에 그리는 쪽 서식은 locale 을
 * 아는 stage 가 따로 맡는다.
 */
function formatCount(n: number): string {
  return n.toLocaleString();
}

function readDescendPayload(payload: unknown): { treeId: TreeId; level: number; covered: number; arrived: boolean } | null {
  const p = payload as { treeId?: unknown; level?: unknown; covered?: unknown; arrived?: unknown } | undefined;
  if (p?.treeId !== 'branchA' && p?.treeId !== 'branchB') return null;
  if (typeof p.level !== 'number' || typeof p.covered !== 'number' || typeof p.arrived !== 'boolean') return null;
  return { treeId: p.treeId, level: p.level, covered: p.covered, arrived: p.arrived };
}

function readResultPayload(payload: unknown): { levelsA: number; levelsB: number } | null {
  const p = payload as { levelsA?: unknown; levelsB?: unknown } | undefined;
  if (typeof p?.levelsA !== 'number' || typeof p?.levelsB !== 'number') return null;
  return { levelsA: p.levelsA, levelsB: p.levelsB };
}

export const heightStaysLowProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as HeightStaysLowStage;
  const tr: Translate = runtime?.t ?? makeTranslator();
  let target = 0;

  function goalCaption(): string {
    return tr('caption.goal', 'Both trees have to cover the same {target} leaves.', {
      target: formatCount(target),
    });
  }

  return {
    onInit(initialData: unknown) {
      target = readInitialData(initialData).target;
      stage.resetView({ caption: goalCaption() });
    },

    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'descend': {
          const p = readDescendPayload(event.payload);
          if (p) stage.descend(p);
          break;
        }
        case 'rewind': {
          stage.resetView({ caption: goalCaption() });
          break;
        }
        case 'result': {
          const p = readResultPayload(event.payload);
          if (p) {
            stage.showResult({
              caption: tr(
                'caption.result',
                '{a} levels down on one side, {b} on the other — same leaves, same walk to read.',
                { a: p.levelsA, b: p.levelsB },
              ),
            });
          }
          break;
        }
        default:
          // 이 세 이벤트 외에는 발신되지 않는다 — 다른 type 은 조용히 무시.
          break;
      }
    },
    // onReset 은 두지 않는다 — mechanism.reset() 이 onReset 뒤 반드시 onInit 을
    // 다시 호출하므로 (mechanism.ts), onInit 하나로 초기화와 재설정을 함께 감당한다.
  };
};
