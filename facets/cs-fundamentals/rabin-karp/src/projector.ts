/**
 * rabinKarp 의 Projector — algorithm 이 내는 여덟 이벤트를 stage 메서드와 코드
 * 패널 호출로 옮긴다.
 *
 * 그림도 문안도 여기서 짓지 않는다. 좌표는 stage 가 캔버스에서 역산하고 문안은
 * `FacetJson.messages` 에 있다 (C10) — 여기 남는 것은 키와 en 원본뿐이다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 의 구조적 계약. 전부 optional 이고 호출은 `?.()` 로 한다 (C9). */
type RabinStage = {
  setup?(m: number, text: string, pattern: string, patternHash: number): void;
  showWindow?(w: {
    start: number;
    hash: number;
    match: boolean;
    outIndex: number | null;
    inIndex: number | null;
  }): void;
  verify?(start: number, ok: boolean): void;
  found?(start: number): void;
  setLedger?(touched: number, naive: number): void;
  setContrast?(
    points: Array<{ m: number; rolled: number; naive: number }>,
    current: number,
  ): void;
  setCaption?(text: string): void;
  setVerdict?(text: string): void;
  clear?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asPoints(v: unknown): Array<{ m: number; rolled: number; naive: number }> | null {
  if (!Array.isArray(v)) return null;
  const out: Array<{ m: number; rolled: number; naive: number }> = [];
  for (const entry of v) {
    const p = asObject(entry);
    if (!p) return null;
    const m = asNumber(p.m);
    const rolled = asNumber(p.rolled);
    const naive = asNumber(p.naive);
    if (m === null || rolled === null || naive === null) return null;
    out.push({ m, rolled, naive });
  }
  return out;
}

export const rabinKarpProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as RabinStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 지금 판의 패턴 길이. 여러 캡션이 되뇌므로 들고 있는다. */
  let patternLength = 0;

  return {
    onInit(): void {
      // 초기 데이터를 여기서 다시 좁혀 밀어 넣지 않는다 — 그 일은 stage 의
      // mount 가 이미 했다. 첫 판이 시작하면 곧 `setup` 이 와서 다시 짓는다.
      patternLength = 0;
      stage?.clear?.();
      codePanel?.clearHighlight?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = asObject(event.payload);

      switch (event.type) {
        case 'setup': {
          if (!p) return;
          const n = asNumber(p.n);
          const m = asNumber(p.m);
          const patternHash = asNumber(p.patternHash);
          const text = typeof p.text === 'string' ? p.text : null;
          const pattern = typeof p.pattern === 'string' ? p.pattern : null;
          if (n === null || m === null || patternHash === null || !text || !pattern) return;
          patternLength = m;
          stage?.setup?.(m, text, pattern, patternHash);
          stage?.setVerdict?.('');
          stage?.setCaption?.(
            tr('caption.setup', 'Looking for {m} letters inside a text of {n}.', { m, n }),
          );
          return;
        }

        case 'first-window': {
          if (!p) return;
          const start = asNumber(p.start);
          const hash = asNumber(p.hash);
          const touched = asNumber(p.touched);
          const naive = asNumber(p.naive);
          if (start === null || hash === null || touched === null || naive === null) return;
          stage?.showWindow?.({
            start,
            hash,
            match: p.match === true,
            outIndex: null,
            inIndex: null,
          });
          stage?.setLedger?.(touched, naive);
          stage?.setCaption?.(
            tr('caption.first', 'The first window reads all {m} letters, one by one.', {
              m: patternLength,
            }),
          );
          return;
        }

        case 'roll': {
          if (!p) return;
          const start = asNumber(p.start);
          const hash = asNumber(p.hash);
          const touched = asNumber(p.touched);
          const naive = asNumber(p.naive);
          const outIndex = asNumber(p.outIndex);
          const inIndex = asNumber(p.inIndex);
          if (start === null || hash === null || touched === null || naive === null) return;
          stage?.showWindow?.({ start, hash, match: p.match === true, outIndex, inIndex });
          stage?.setLedger?.(touched, naive);
          stage?.setCaption?.(
            tr('caption.roll', 'One letter out, one in — the hash rolls. Two letters touched.'),
          );
          return;
        }

        case 'verify': {
          if (!p) return;
          const start = asNumber(p.start);
          const chars = asNumber(p.chars);
          const touched = asNumber(p.touched);
          const naive = asNumber(p.naive);
          if (start === null || chars === null || touched === null || naive === null) return;
          stage?.verify?.(start, p.ok === true);
          stage?.setLedger?.(touched, naive);
          stage?.setCaption?.(
            tr(
              'caption.verify',
              'Same hash. Now check the letters — that costs {chars} more touches.',
              { chars },
            ),
          );
          return;
        }

        case 'found': {
          if (!p) return;
          const start = asNumber(p.start);
          if (start === null) return;
          stage?.found?.(start);
          stage?.setCaption?.(tr('caption.found', 'The letters match too. Found at {start}.', { start }));
          return;
        }

        case 'contrast': {
          if (!p) return;
          const points = asPoints(p.points);
          const current = asNumber(p.current);
          if (!points || current === null) return;
          stage?.setContrast?.(points, current);
          return;
        }

        case 'done': {
          if (!p) return;
          const touched = asNumber(p.touched);
          const naive = asNumber(p.naive);
          if (touched === null || naive === null) return;
          stage?.setLedger?.(touched, naive);
          stage?.setCaption?.(
            tr('caption.done', 'Rolling touched {touched} letters. Plain comparison used {naive}.', {
              touched,
              naive,
            }),
          );
          stage?.setVerdict?.(
            tr('caption.wait', 'Move the handle: the rolling side never leaves {touched}.', {
              touched,
            }),
          );
          return;
        }

        case 'phase': {
          const name = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase?.(name);
          return;
        }

        default:
          // 그 밖의 어휘는 조용히 버린다 — 이 facet 의 algorithm 은 위 여덟만 낸다.
          return;
      }
    },

    onReset(): void {
      patternLength = 0;
      stage?.clear?.();
      codePanel?.clearHighlight?.();
    },
  };
};
