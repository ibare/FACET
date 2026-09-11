/**
 * boyerMooreProjector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 여기서 짓지 않는다. 키만 들고 `runtime.t` 로 조회하며 원본은
 * `facet.ts` 의 `messages` 에 있다 (C10). payload 는 열린 타입이므로 가드로 좁혀
 * 정형 값만 stage 로 넘긴다 (C9).
 *
 * 어긋난 글자와 그 마지막 자리는 `mismatch` 에 실려 오고, 그 까닭을 말할 자리는
 * 한 걸음 뒤의 `slide` 다. 같은 값을 두 이벤트에 겹쳐 싣는 대신 여기서 그림자로
 * 들고 있는다 — projector 가 시각 상태를 독자적으로 관리해도 된다는 원칙 5 의
 * 자리다.
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 노출하는 메서드. 없는 메서드와도 견디도록 전부 optional 이다. */
type BoyerMooreStage = {
  initRun?(text: string, pattern: string): void;
  setReadout?(jumpCount: number, jumpSum: number, unread: number): void;
  land?(at: number): void;
  probe?(at: number, j: number, textIndex: number, matched: boolean): Promise<void> | void;
  mismatch?(
    at: number,
    textIndex: number,
    lastIndex: number,
    shift: number,
  ): Promise<void> | void;
  slide?(from: number, to: number): Promise<void> | void;
  found?(at: number): Promise<void> | void;
  dimUnread?(): Promise<void> | void;
  setCaption?(value: string): void;
  reset?(): void;
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

export const boyerMooreProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BoyerMooreStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 방금 어긋난 글자와 그 글자가 패턴 안에서 마지막으로 선 자리. */
  let missChar = '';
  let missLast = -1;

  return {
    onInit() {
      // initialData 를 여기서 다시 좁혀 밀어 넣지 않는다 — 그것은 stage 의 mount 가
      // 이미 했다. 되돌린 직후에도 algorithm 이 곧바로 run-init 을 내보낸다.
      panel?.clearHighlight?.();
      missChar = '';
      missLast = -1;
    },

    onReset() {
      panel?.clearHighlight?.();
      stage?.reset?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = asRecord(event.payload);

      switch (event.type) {
        case 'phase': {
          panel?.highlightPhase?.(str(p?.phase));
          return;
        }

        case 'run-init': {
          const text = str(p?.text);
          const pattern = str(p?.pattern);
          const m = num(p?.patternLength);
          const total = num(p?.textLength);
          if (text === null || pattern === null || m === null) return;
          stage?.initRun?.(text, pattern);
          stage?.setReadout?.(0, 0, total ?? text.length);
          stage?.setCaption?.(
            tr(
              'caption.start',
              'Pattern "{pattern}" is {m} letters long. Comparing starts at its last letter.',
              { pattern, m },
            ),
          );
          return;
        }

        case 'land': {
          const at = num(p?.at);
          if (at === null) return;
          stage?.land?.(at);
          stage?.setCaption?.(tr('caption.land', 'The pattern stands at {at}.', { at }));
          return;
        }

        case 'probe': {
          const at = num(p?.at);
          const j = num(p?.j);
          const textIndex = num(p?.textIndex);
          if (at === null || j === null || textIndex === null) return;
          await stage?.probe?.(at, j, textIndex, p?.matched === true);
          return;
        }

        case 'mismatch': {
          const at = num(p?.at);
          const textIndex = num(p?.textIndex);
          const lastIndex = num(p?.lastIndex);
          const shift = num(p?.shift);
          const matched = num(p?.matched);
          const ch = str(p?.badChar);
          if (at === null || textIndex === null || lastIndex === null || shift === null) return;
          if (matched === null || ch === null) return;
          missChar = ch;
          missLast = lastIndex;
          // 무엇이 어긋났는지를 먼저 말하고, 왜 그만큼 뛰는지는 다음 걸음이 말한다.
          stage?.setCaption?.(
            matched === 0
              ? tr('caption.missAtEnd', 'The last letter already differs: "{ch}".', { ch })
              : tr(
                  'caption.missAfter',
                  '{n} letters match from the right, then "{ch}" breaks it.',
                  { n: matched, ch },
                ),
          );
          await stage?.mismatch?.(at, textIndex, lastIndex, shift);
          return;
        }

        case 'slide': {
          const from = num(p?.from);
          const to = num(p?.to);
          const shift = num(p?.shift);
          const jumpCount = num(p?.jumpCount);
          const jumpSum = num(p?.jumpSum);
          if (from === null || to === null || shift === null) return;
          stage?.setCaption?.(
            missLast >= 0
              ? tr(
                  'caption.skipKnown',
                  '"{ch}" last stands in the pattern at {last}, so the pattern slides {n}.',
                  { ch: missChar, last: missLast, n: shift },
                )
              : tr(
                  'caption.skipNone',
                  '"{ch}" is nowhere in the pattern, so the pattern clears it in one slide of {n}.',
                  { ch: missChar, n: shift },
                ),
          );
          if (jumpCount !== null && jumpSum !== null) {
            stage?.setReadout?.(jumpCount, jumpSum, -1);
          }
          await stage?.slide?.(from, to);
          return;
        }

        case 'found': {
          const at = num(p?.at);
          if (at === null) return;
          stage?.setCaption?.(
            tr('caption.found', 'Every letter matches. The pattern sits at {at}.', { at }),
          );
          await stage?.found?.(at);
          return;
        }

        case 'verdict': {
          const m = num(p?.patternLength);
          const jumps = num(p?.jumpCount);
          const jumpSum = num(p?.jumpSum);
          const unread = num(p?.unread);
          const total = num(p?.textLength);
          if (m === null || jumps === null || jumpSum === null) return;
          if (unread === null || total === null) return;
          stage?.setReadout?.(jumps, jumpSum, unread);
          await stage?.dimUnread?.();
          stage?.setCaption?.(
            tr(
              'caption.verdict',
              'Length {m}: {jumps} jumps of {avg} on average, and {unread} of {total} letters were never read.',
              {
                m,
                jumps,
                avg: jumps === 0 ? '0' : (jumpSum / jumps).toFixed(2),
                unread,
                total,
              },
            ),
          );
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.waiting', 'Move the pattern length to run the same text again.'),
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
