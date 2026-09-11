/**
 * p-np 의 projector — 알고리즘이 셈한 것을 stage 메서드로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 만든 뒤 넘긴다 (C9). 문안은 키로만 다루고
 * 문장 자체는 `facet.ts` 의 messages 에 있다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드와도 견디게 전부 optional 이다 (C9). */
type PNpStage = {
  setProblem?(frame: { values: number[]; target: number; n: number; adds: number }): void;
  showSum?(frame: { picked: number[]; sum: number; used: number }): void;
  showVerdict?(frame: { sum: number; target: number; ok: boolean }): void;
  countCandidates?(frame: { candidates: number }): void;
  sweep?(frame: { seen: number; total: number }): void;
  settle?(): void;
  setCaption?(text: string): void;
  resetAll?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
}

/**
 * **값으로 읽는 수**에 천 단위 구분을 넣는다.
 *
 * 표기가 두 층위다 — 식의 일부(계수 · 지수 · `n-1` 같은 것)는 구분 없이 적고, "후보
 * 1,048,576 가지" 처럼 크기를 읽는 자리에는 넣는다. 계수에 구분이 붙으면 식이 다른
 * 것으로 읽히고, 값에 안 붙으면 자릿수를 눈으로 셀 수 없다. 이 화면에 뜨는 수는
 * 전부 뒤쪽이다 — 식 표기는 글(description)에만 있다.
 *
 * `toLocaleString` 을 쓰지 않는다. 환경마다 ICU 가 달라 답이 갈리고, locale 에 따라
 * 자릿수 글자 자체가 바뀌어 무엇이 뜰지 검사가 못 박는다.
 */
function groupDigits(n: number): string {
  const digits = String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${digits}` : digits;
}

export const pNpProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as PNpStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit() {
      codePanel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      const p = asRecord(event.payload);
      switch (event.type) {
        case 'problem': {
          const values = numList(p?.values);
          const target = num(p?.target);
          stage?.setProblem?.({ values, target, n: num(p?.n), adds: num(p?.adds) });
          stage?.setCaption?.(
            tr(
              'caption.problem',
              '{count} numbers and a target of {target}. Two jobs start from exactly the same place.',
              // 개수를 문안에 박지 않는다 — 손잡이를 밀면 이 수가 달라진다.
              { count: values.length, target },
            ),
          );
          return;
        }

        case 'check-sum': {
          const used = num(p?.used);
          stage?.showSum?.({ picked: numList(p?.picked), sum: num(p?.sum), used });
          stage?.setCaption?.(
            tr(
              'caption.check',
              'The handed candidate adds up in {used} additions. No candidate ever needs more than {adds}.',
              { used, adds: num(p?.adds) },
            ),
          );
          return;
        }

        case 'check-verdict': {
          const sum = num(p?.sum);
          const target = num(p?.target);
          stage?.showVerdict?.({ sum, target, ok: p?.ok === true });
          stage?.setCaption?.(
            tr(
              'caption.verdict',
              'The sum is {sum}, exactly the target {target}. Checking looked at one candidate and stopped.',
              { sum, target },
            ),
          );
          return;
        }

        case 'count-candidates': {
          const candidates = num(p?.candidates);
          stage?.countCandidates?.({ candidates });
          stage?.setCaption?.(
            tr(
              'caption.count',
              'Nobody hands anything over now. Each extra number doubles the candidates, and there are {total}.',
              { total: groupDigits(candidates) },
            ),
          );
          return;
        }

        case 'sweep': {
          const seen = num(p?.seen);
          const total = num(p?.total);
          stage?.sweep?.({ seen, total });
          stage?.setCaption?.(
            tr('caption.sweep', 'Every candidate has to be looked at. So far: {seen} of {total}.', {
              seen: groupDigits(seen),
              total: groupDigits(total),
            }),
          );
          return;
        }

        case 'gap': {
          stage?.setCaption?.(
            tr(
              'caption.gap',
              'Checking stopped at one candidate. Finding had to look at all {total} — the same look, {total} times over.',
              { total: groupDigits(num(p?.findLooks)) },
            ),
          );
          return;
        }

        case 'done': {
          stage?.settle?.();
          stage?.setCaption?.(
            tr(
              'caption.push',
              'Easy to check is not the same as easy to find. Push the size and watch only one side grow.',
            ),
          );
          return;
        }

        case 'phase': {
          const name = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase?.(name);
          return;
        }

        default:
          // 그 밖의 이벤트는 이 facet 이 내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.resetAll?.();
      codePanel?.clearHighlight?.();
    },
  };
};
