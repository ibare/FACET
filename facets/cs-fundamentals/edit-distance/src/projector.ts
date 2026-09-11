/**
 * editDistanceProjector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 여기서 짓지 않는다. 키만 들고 `runtime.t` 로 조회하며 원본은 `facet.ts`
 * 의 `messages` 에 있다 (C10). payload 는 열린 타입이므로 가드로 좁혀 정형 값만
 * stage 로 넘긴다 (C9).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
} from '@ffacet/core/runtime';

/** stage 가 노출하는 메서드. 없는 메서드와도 견디도록 전부 optional 이다. */
type EditDistanceStage = {
  initTable?(rows: number, cols: number, source: string, target: string): void;
  setCell?(i: number, j: number, value: number): void;
  setAnswer?(value: number): void;
  markPath?(i: number, j: number, pi: number, pj: number, op: string): void;
  addFix?(index: number, i: number, j: number, op: string, text: string): void;
  setCaption?(value: string): void;
  clearAll?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export const editDistanceProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as EditDistanceStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 한 줄짜리 고침 문안. 세 갈래가 각자 다른 자리를 채운다 (C10). */
  const fixText = (op: string, from: string, to: string): string => {
    if (op === 'replace') return tr('fix.replace', 'replace {a} with {b}', { a: from, b: to });
    if (op === 'insert') return tr('fix.insert', 'insert {b}', { b: to });
    return tr('fix.delete', 'delete {a}', { a: from });
  };

  return {
    onInit() {
      // initialData 를 여기서 다시 좁혀 밀어 넣지 않는다 — 그것은 stage 의 mount 가
      // 이미 했다. 되돌린 직후에도 algorithm 이 곧바로 table-init 을 내보낸다.
      panel?.clearHighlight?.();
    },

    onReset() {
      panel?.clearHighlight?.();
      stage?.clearAll?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      const p = asRecord(event.payload);

      switch (event.type) {
        case 'phase': {
          panel?.highlightPhase?.(str(p?.phase));
          return;
        }

        case 'table-init': {
          const rows = num(p?.rows);
          const cols = num(p?.cols);
          const source = str(p?.source);
          const target = str(p?.target);
          const subCost = num(p?.subCost);
          // 손잡이 값도 다른 필드와 같은 가드에 둔다. 기본값으로 메우면 payload 가
          // 어긋났을 때 화면이 "비용 1" 이라고 **틀린 값을 단언**한다.
          if (rows === null || cols === null || source === null || target === null) return;
          if (subCost === null) return;
          stage?.initTable?.(rows, cols, source, target);
          stage?.setCaption?.(
            tr('caption.start', 'Substitution costs {sub}. The table fills from the corner outwards.', {
              sub: subCost,
            }),
          );
          return;
        }

        case 'cell-filled': {
          const i = num(p?.i);
          const j = num(p?.j);
          const value = num(p?.value);
          if (i === null || j === null || value === null) return;
          stage?.setCell?.(i, j, value);
          return;
        }

        case 'table-done': {
          const value = num(p?.value);
          if (value === null) return;
          stage?.setAnswer?.(value);
          stage?.setCaption?.(
            tr('caption.filled', 'The table is full. The last cell says {n}.', { n: value }),
          );
          return;
        }

        case 'path-step': {
          const i = num(p?.i);
          const j = num(p?.j);
          const pi = num(p?.pi);
          const pj = num(p?.pj);
          const op = str(p?.op);
          if (i === null || j === null || pi === null || pj === null || op === null) return;
          stage?.markPath?.(i, j, pi, pj, op);
          stage?.setCaption?.(
            tr('caption.back', 'Walking back from that cell — every step names one edit.'),
          );
          return;
        }

        case 'fix-listed': {
          const index = num(p?.index);
          const i = num(p?.i);
          const j = num(p?.j);
          const op = str(p?.op);
          const from = str(p?.from) ?? '';
          const to = str(p?.to) ?? '';
          if (index === null || i === null || j === null || op === null) return;
          stage?.addFix?.(index, i, j, op, fixText(op, from, to));
          stage?.setCaption?.(
            tr('caption.collect', 'Read the walk forwards and the fix list falls out.'),
          );
          return;
        }

        case 'verdict': {
          const subCost = num(p?.subCost);
          const cost = num(p?.cost);
          const fixCount = num(p?.fixCount);
          const replaceCount = num(p?.replaceCount);
          if (subCost === null || cost === null) return;
          if (fixCount === null || replaceCount === null) return;
          stage?.setCaption?.(
            tr(
              'caption.verdict',
              'Cost {sub}: {fix} fixes, {rep} of them replacements, {cost} in total.',
              { sub: subCost, fix: fixCount, rep: replaceCount, cost },
            ),
          );
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr(
              'caption.waiting',
              'Move the substitution cost to fix the same two words another way.',
            ),
          );
          return;
        }

        default:
          // 그 밖의 어휘는 이 facet 이 내보내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
