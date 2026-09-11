/**
 * growth-outpaces projector — 걸음 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 열린 타입이라 여기서 한 번 좁힌다 (C9). 화면 문안은 키와 en 원본만
 * 코드에 남고 문안 자체는 `facet.ts` 의 messages 에 있다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 내주는 계약. 없는 메서드에 대비해 `?.()` 로 부른다 (C9). */
type GrowthStage = {
  showStep?(step: {
    n: number;
    terms: [number, number, number];
    sum: number;
    topIndex: number;
    pctText: string;
    caption: string;
  }): Promise<void> | void;
  collapse?(caption: string): Promise<void> | void;
  rewind?(): void;
};

type Rung = {
  n: number;
  quad: number;
  lin: number;
  cons: number;
  sum: number;
  share: number;
  topIndex: number;
};

/**
 * payload 를 좁힌다. 단언 뒤에 필드마다 `typeof` 가 따르므로 회피가 아니라
 * 좁히개다 (C9).
 */
function readRung(payload: unknown): Rung | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const { n, quad, lin, cons, sum, share, topIndex } = p;
  if (typeof n !== 'number') return null;
  if (typeof quad !== 'number' || typeof lin !== 'number' || typeof cons !== 'number') return null;
  if (typeof sum !== 'number' || typeof share !== 'number' || typeof topIndex !== 'number') return null;
  return { n, quad, lin, cons, sum, share, topIndex };
}

export const growthOutpacesProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as GrowthStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 몫을 소수 한 자리까지. 캡션과 막대가 같은 수를 말하도록 한 자리에서 만든다. */
  const pctOf = (share: number): string => (share * 100).toFixed(1);

  const show = async (r: Rung, caption: string): Promise<void> => {
    await stage?.showStep?.({
      n: r.n,
      terms: [r.quad, r.lin, r.cons],
      sum: r.sum,
      topIndex: r.topIndex,
      pctText: pctOf(r.share),
      caption,
    });
  };

  return {
    async onEvent(event) {
      switch (event.type) {
        case 'begin': {
          const r = readRung(event.payload);
          if (!r) return;
          await show(
            r,
            tr(
              'caption.begin',
              'One formula, three terms, one bar. At n = {n} the largest term holds {pct}% of it.',
              { n: r.n, pct: pctOf(r.share) },
            ),
          );
          return;
        }
        case 'rung': {
          const r = readRung(event.payload);
          if (!r) return;
          await show(
            r,
            tr('caption.rung', 'n = {n} — n² now takes {pct}% of the bar.', {
              n: r.n,
              pct: pctOf(r.share),
            }),
          );
          return;
        }
        case 'tie': {
          const r = readRung(event.payload);
          if (!r) return;
          await show(
            r,
            tr(
              'caption.tie',
              'n = {n} — the three terms are exactly equal. Each one is {each}. This is the tipping point.',
              { n: r.n, each: r.quad },
            ),
          );
          return;
        }
        case 'settle': {
          await stage?.collapse?.(
            tr('caption.settle', 'Only n² is left. Dropping the smaller terms is what O(n²) means.'),
          );
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        default:
          // 그 밖의 이벤트는 이 조각이 내지 않는다 — 조용히 흘린다 (C2).
          return;
      }
    },
    onReset() {
      stage?.rewind?.();
    },
  };
};
