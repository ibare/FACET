/**
 * bigO 의 projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 두 가지만 한다.
 *   1. payload 를 좁혀서 넘긴다 (C9). `event.payload` 를 그대로 흘리지 않는다.
 *   2. 지금 무슨 일이 일어나는지 말하는 캡션의 **키**를 고른다 (C10). 문장은
 *      `facet.ts` 의 messages 에 있고 여기에는 키와 en 원본만 남는다.
 *
 * 몫(%)은 여기서 한 번만 셈한다 — 캡션과 화면 아래 읽기가 같은 수를 말하도록.
 * 항의 이름(`n³` · `1000`)과 표기(`O(n³)`)는 여기서 만들지 않는다. 계수에서
 * 조립되는 표식이라 stage 가 그린다 (C10 판정 3).
 *
 * stage 의 애니메이션 promise 를 **돌려준다.** 러너의 `ctx.emit` 이
 * `await projector.onEvent(event)` 를 하므로, 돌려주지 않으면 토큰이 옮겨 가기도
 * 전에 다음 걸음이 온다.
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드와도 견디게 전부 optional 이다 (C9). */
type BigOStage = {
  setup?(n: number, rungs: number, caption: string): void | Promise<void>;
  showRung?(step: RungStep): void | Promise<void>;
  settle?(caption: string): void | Promise<void>;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

/** stage 가 한 단을 그리는 데 필요한 것 전부. 파생값은 여기서 이미 셈해 둔다. */
export type RungStep = {
  index: number;
  n: number;
  terms: number[];
  places: number[];
  sum: number;
  /** 항마다의 몫. 소수 한 자리 문자열이다. */
  pcts: string[];
  caption: string;
};

type Rung = {
  n: number;
  index: number;
  terms: number[];
  places: number[];
  sum: number;
  topPlace: number;
  tied: number;
  strictLead: boolean;
};

function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nums(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const raw of value) {
    const n = num(raw);
    if (n === null) return null;
    out.push(n);
  }
  return out.length > 0 ? out : null;
}

function readRung(payload: unknown): Rung | null {
  const p = fields(payload);
  if (p === null) return null;
  const n = num(p.n);
  const index = num(p.index);
  const sum = num(p.sum);
  const topPlace = num(p.topPlace);
  const tied = num(p.tied);
  const terms = nums(p.terms);
  const places = nums(p.places);
  if (n === null || index === null || sum === null || topPlace === null || tied === null) return null;
  if (terms === null || places === null) return null;
  if (typeof p.strictLead !== 'boolean') return null;
  return { n, index, terms, places, sum, topPlace, tied, strictLead: p.strictLead };
}

/** 몫을 소수 한 자리까지. 합이 0 이면 0 으로 본다. */
function pctOf(value: number, sum: number): string {
  return sum > 0 ? ((value / sum) * 100).toFixed(1) : '0.0';
}

export const bigOProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BigOStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 한 단의 캡션. 최고차항이 어디에 서 있는가로 갈린다. */
  const captionFor = (r: Rung, pcts: string[]): string => {
    if (r.strictLead) {
      return tr(
        'caption.ahead',
        'At n = {n}, n³ leads alone with {pct}% of the sum while the constant term is down to {last}%.',
        { n: r.n, pct: pcts[0] ?? '0.0', last: pcts[pcts.length - 1] ?? '0.0' },
      );
    }
    if (r.topPlace === 0) {
      return tr(
        'caption.tie',
        'At n = {n}, {tied} of the terms are exactly equal — no term leads on its own yet.',
        { n: r.n, tied: r.tied },
      );
    }
    return tr('caption.behind', 'At n = {n}, n³ sits in place {place} and holds {pct}% of the sum.', {
      n: r.n,
      place: r.topPlace + 1,
      pct: pcts[0] ?? '0.0',
    });
  };

  return {
    onInit() {
      // 초기 데이터를 좁혀 밀어 넣지 않는다 — 그것은 stage 의 mount 가 한다.
      // 첫 판이 시작하면 곧바로 `setup` 이 와서 판을 다시 세운다.
      codePanel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      const p = fields(event.payload);
      switch (event.type) {
        case 'setup': {
          const n = num(p?.n);
          const rungs = num(p?.rungs);
          if (n === null || rungs === null) return;
          return stage?.setup?.(
            n,
            rungs,
            tr('caption.setup', 'Walk the ladder up to n = {n}. Four terms take their places.', { n }),
          );
        }
        case 'rung': {
          const r = readRung(event.payload);
          if (r === null) return;
          const pcts = r.terms.map((t) => pctOf(t, r.sum));
          return stage?.showRung?.({
            index: r.index,
            n: r.n,
            terms: r.terms,
            places: r.places,
            sum: r.sum,
            pcts,
            caption: captionFor(r, pcts),
          });
        }
        case 'settle': {
          const n = num(p?.n);
          if (n === null) return;
          const caption =
            p?.strictLead === true
              ? tr(
                  'caption.settleDone',
                  'Every other term has fallen behind n³ for good. What is left to say is O(n³).',
                )
              : tr(
                  'caption.settleEarly',
                  'Keep only n³ and the notation still reads O(n³) — it is not describing n = {n}.',
                  { n },
                );
          return stage?.settle?.(caption);
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
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
