/**
 * cacheLineProjector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 판정 문안만 여기서 고른다. algorithm 은 키만 보내고 (C10), 어느 문장을 띄울지
 * 고르는 것과 값을 끼우는 것은 표현 계층의 일이다. 조회는 러너가 주입한
 * `runtime.t` 를 쓰므로 저작자가 `messages` 에 쓴 문안이 언제나 이긴다.
 */

import {
  makeTranslator,
  parseTarget,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type CacheLineStage = {
  setConfig?(cfg: { lineSize: number; lineCount: number; elementsPerLine: number }): void;
  markAccess?(
    trackId: string,
    index: number,
    lineIndex: number,
    byteOffset: number,
    hit: boolean,
  ): void;
  setSummary?(trackId: string, misses: number, accessCount: number, rate: number): void;
  setVerdict?(text: string): void;
  clearRun?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

export const cacheLineProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as CacheLineStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 트랙별 미스율. 판정 문안에 끼울 값이라 마지막 집계를 들고 있는다. */
  const rates: Record<string, number> = {};

  const verdictText = (key: string): string => {
    const vars = {
      seq: rates.sequential ?? 0,
      strided: rates.strided ?? 0,
    };
    if (key === 'caption.bothMiss') {
      return tr(
        'caption.bothMiss',
        'A line holds a single int here, so nothing rides along — both patterns miss every access.',
      );
    }
    if (key === 'caption.bothMove') {
      return tr(
        'caption.bothMove',
        'The line is wide enough that the stride lands in it twice: strided halves to {strided}%, sequential is at {seq}%.',
        vars,
      );
    }
    return tr(
      'caption.seqOnly',
      'Sequential falls to {seq}%, strided stays at {strided}% — the neighbours arrive and are never read.',
      vars,
    );
  };

  return {
    onInit(initialData: unknown): void {
      const d = initialData as Record<string, unknown> | undefined;
      if (typeof d !== 'object' || d === null) return;
      const lineSize = typeof d.lineSize === 'number' ? d.lineSize : 0;
      const totalBytes = typeof d.totalBytes === 'number' ? d.totalBytes : 0;
      const elementBytes = typeof d.elementBytes === 'number' ? d.elementBytes : 0;
      if (lineSize <= 0 || totalBytes <= 0 || elementBytes <= 0) return;
      for (const key of Object.keys(rates)) delete rates[key];
      stage?.setConfig?.({
        lineSize,
        lineCount: Math.max(1, Math.floor(totalBytes / lineSize)),
        elementsPerLine: Math.max(1, Math.floor(lineSize / elementBytes)),
      });
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          panel?.highlightPhase?.(typeof p?.phase === 'string' ? p.phase : null);
          break;
        }

        case 'state-changed': {
          const target = typeof event.target === 'string' ? event.target : '';
          const parsed = parseTarget(target);
          if (parsed === null) break;
          const p = event.payload as Record<string, unknown> | undefined;
          if (typeof p !== 'object' || p === null) break;

          if (parsed.prefix === 'config') {
            if (
              typeof p.lineSize !== 'number' ||
              typeof p.lineCount !== 'number' ||
              typeof p.elementsPerLine !== 'number'
            ) {
              break;
            }
            stage?.setConfig?.({
              lineSize: p.lineSize,
              lineCount: p.lineCount,
              elementsPerLine: p.elementsPerLine,
            });
            break;
          }

          if (parsed.prefix === 'summary') {
            const track = typeof p.track === 'string' ? p.track : parsed.id;
            if (
              track === '' ||
              typeof p.misses !== 'number' ||
              typeof p.accessCount !== 'number' ||
              typeof p.rate !== 'number'
            ) {
              break;
            }
            rates[track] = p.rate;
            stage?.setSummary?.(track, p.misses, p.accessCount, p.rate);
          }
          break;
        }

        case 'mark': {
          const target = typeof event.target === 'string' ? event.target : '';
          const parsed = parseTarget(target);
          if (parsed === null || parsed.prefix !== 'index') break;
          const index = Number(parsed.id);
          if (!Number.isInteger(index)) break;
          const p = event.payload as Record<string, unknown> | undefined;
          if (typeof p !== 'object' || p === null) break;
          if (
            typeof p.track !== 'string' ||
            typeof p.lineIndex !== 'number' ||
            typeof p.byteOffset !== 'number' ||
            typeof p.hit !== 'boolean'
          ) {
            break;
          }
          stage?.markAccess?.(p.track, index, p.lineIndex, p.byteOffset, p.hit);
          break;
        }

        case 'done': {
          const p = event.payload as { textKey?: unknown } | undefined;
          const key = typeof p?.textKey === 'string' ? p.textKey : '';
          stage?.setVerdict?.(verdictText(key));
          break;
        }

        default:
          // 그 밖의 이벤트는 이 facet 이 발신하지 않는다. 조용히 흘린다 (C2).
          break;
      }
    },

    onReset(): void {
      for (const key of Object.keys(rates)) delete rates[key];
      stage?.clearRun?.();
      panel?.clearHighlight?.();
    },
  };
};
