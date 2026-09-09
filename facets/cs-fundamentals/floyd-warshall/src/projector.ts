/**
 * 플로이드-워셜 Projector — 이벤트를 무대와 코드 패널의 메서드 호출로 옮긴다.
 *
 * 화면에 뜨는 문장은 전부 여기서 `tr` 로 뽑아 무대에 넘긴다. 무대는 수와 수식만
 * 그리고, algorithm 은 문안을 모른다 (C10 · 원칙 1).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorViews,
  ProjectorRuntime,
} from '@ffacet/core';

/** 무대가 내주는 메서드. 열린 `ViewInstance` 를 여기서 한 번만 좁힌다 (C9). */
type Stage = {
  setCell?: (i: number, j: number, value: number, infinite: boolean) => void;
  setPivot?: (k: number) => void;
  setProbe?: (p: ProbeInfo, verdict: string) => void;
  applyRewrite?: (i: number, j: number, value: number) => void;
  setCaption?: (text: string) => void;
  finish?: () => void;
  reset?: () => void;
};

/** 코드 패널이 내주는 메서드. */
type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
};

type ProbeInfo = {
  i: number;
  j: number;
  k: number;
  current: number;
  currentInfinite: boolean;
  through: number;
  throughInfinite: boolean;
  improves: boolean;
};

const isNum = (v: unknown): v is number => typeof v === 'number';

export const floydWarshallProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 정점 이름. onInit 에서 받아 둔다 — 캡션이 자리 번호 대신 이름을 쓴다. */
  let labels: string[] = [];
  const name = (v: number): string => labels[v] ?? String(v);

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { vertices?: unknown } | undefined;
      labels = Array.isArray(d?.vertices)
        ? d.vertices.filter((v): v is string => typeof v === 'string')
        : [];
      stage?.reset?.();
      codePanel?.highlightPhase?.(null);
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          const phase = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase?.(phase);
          // 표를 세우는 두 단계는 따로 이벤트가 없다 — 같은 state-changed 로
          // 나가므로 서술은 phase 에서 갈린다.
          if (phase === 'build-table') {
            stage?.setCaption?.(
              tr('caption.build', 'Zero to itself, infinity everywhere else.'),
            );
          } else if (phase === 'add-edges') {
            stage?.setCaption?.(tr('caption.edges', 'Writing in the direct edges.'));
          }
          return;
        }

        case 'state-changed': {
          const p = event.payload as
            | { i?: unknown; j?: unknown; value?: unknown; infinite?: unknown }
            | undefined;
          if (!isNum(p?.i) || !isNum(p.j) || !isNum(p.value)) return;
          stage?.setCell?.(p.i, p.j, p.value, p.infinite === true);
          return;
        }

        case 'mark': {
          const p = event.payload as { k?: unknown } | undefined;
          if (!isNum(p?.k)) return;
          stage?.setPivot?.(p.k);
          stage?.setCaption?.(
            tr('caption.pivot', 'Standing in the middle: vertex {v}.', { v: name(p.k) }),
          );
          return;
        }

        case 'highlight': {
          const p = event.payload as Partial<ProbeInfo> | undefined;
          if (!isNum(p?.i) || !isNum(p.j) || !isNum(p.k)) return;
          if (!isNum(p.current) || !isNum(p.through)) return;
          const improves = p.improves === true;
          const probe: ProbeInfo = {
            i: p.i,
            j: p.j,
            k: p.k,
            current: p.current,
            currentInfinite: p.currentInfinite === true,
            through: p.through,
            throughInfinite: p.throughInfinite === true,
            improves,
          };
          stage?.setProbe?.(
            probe,
            improves
              ? tr('verdict.rewrite', 'Shorter. Rewrite the cell.')
              : tr('verdict.keep', 'Not shorter. Leave it.'),
          );
          stage?.setCaption?.(
            tr('caption.probe', 'Is the way through the middle shorter?'),
          );
          return;
        }

        case 'rewrite': {
          const p = event.payload as
            | { i?: unknown; j?: unknown; value?: unknown }
            | undefined;
          if (!isNum(p?.i) || !isNum(p.j) || !isNum(p.value)) return;
          stage?.applyRewrite?.(p.i, p.j, p.value);
          stage?.setCaption?.(
            tr('caption.rewrite', 'Rewritten: d[{a}][{b}] = {value}.', {
              a: name(p.i),
              b: name(p.j),
              value: p.value,
            }),
          );
          return;
        }

        case 'done': {
          stage?.finish?.();
          stage?.setCaption?.(
            tr('caption.done', 'Every pair now holds its shortest distance.'),
          );
          return;
        }

        default:
          // 그 밖의 표준 어휘는 이 facet 이 내지 않는다. 와도 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
      codePanel?.highlightPhase?.(null);
    },
  };
};
