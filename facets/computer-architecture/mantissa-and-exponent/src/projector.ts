/**
 * 가수와 지수 — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 좁혀서 넘긴다 (C9). 문안은 여기서 키로 조회하고 (C10) stage 는
 * 다 된 문장을 받는다 — 화면이 무엇이라 말하는지는 선언의 몫이다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/**
 * stage 가 내주는 계약. 애니메이션이 있는 것은 promise 를 돌려주므로 여기서
 * 기다린다 — 기다려야 `ctx.emit` 이 그만큼 늦게 돌아오고, stepMs 가 애니메이션
 * *뒤*의 정지 시간이 된다 (S-piece).
 */
type Stage = {
  layBits?(bits: string, value: string): Promise<void> | void;
  split?(): Promise<void> | void;
  readSign?(sign: string): Promise<void> | void;
  readExponent?(raw: number): Promise<void> | void;
  debias?(bias: number, actual: number): Promise<void> | void;
  readMantissa?(fractionBits: string, fraction: string): Promise<void> | void;
  revealHiddenOne?(significandBits: string, significand: string): Promise<void> | void;
  assemble?(value: string): Promise<void> | void;
  settle?(): Promise<void> | void;
  rewind?(): void;
  setCaption?(line: string): void;
};

/** 런타임 가드가 뒤따르는 좁히개 (C9). 꺼낸 값은 아래에서 하나씩 거른다. */
function fields(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

function readText(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

function readCount(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export const mantissaAndExponentProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = fields(event.payload);
      switch (event.type) {
        case 'lay-bits': {
          stage.setCaption?.(
            tr('caption.layBits', 'One number, written as {n} bits.', {
              n: readCount(p, 'total'),
            }),
          );
          await stage.layBits?.(readText(p, 'bits'), readText(p, 'value'));
          return;
        }
        case 'split': {
          stage.setCaption?.(
            tr('caption.split', 'It splits into three: {a} · {b} · {c}', {
              a: readCount(p, 'sign'),
              b: readCount(p, 'exponent'),
              c: readCount(p, 'mantissa'),
            }),
          );
          await stage.split?.();
          return;
        }
        case 'read-sign': {
          const sign = readText(p, 'sign');
          stage.setCaption?.(
            tr('caption.sign', 'The first bit carries the sign: {s}', { s: sign }),
          );
          await stage.readSign?.(sign);
          return;
        }
        case 'read-exponent': {
          const raw = readCount(p, 'raw');
          stage.setCaption?.(
            tr('caption.exponent', 'The next {n} bits read as {raw}.', {
              n: readCount(p, 'n'),
              raw,
            }),
          );
          await stage.readExponent?.(raw);
          return;
        }
        case 'debias': {
          const bias = readCount(p, 'bias');
          const actual = readCount(p, 'actual');
          stage.setCaption?.(
            tr('caption.debias', 'Take away the bias {bias}. The real exponent is {actual}.', {
              bias,
              actual,
            }),
          );
          await stage.debias?.(bias, actual);
          return;
        }
        case 'read-mantissa': {
          const fractionBits = readText(p, 'fractionBits');
          stage.setCaption?.(
            tr('caption.mantissa', 'The last {n} bits are the fraction: {frac}', {
              n: readCount(p, 'n'),
              frac: fractionBits,
            }),
          );
          await stage.readMantissa?.(fractionBits, readText(p, 'fraction'));
          return;
        }
        case 'hidden-one': {
          const significandBits = readText(p, 'significandBits');
          stage.setCaption?.(
            tr('caption.hiddenOne', 'A leading 1 is never stored. It is always there: {s}', {
              s: significandBits,
            }),
          );
          await stage.revealHiddenOne?.(significandBits, readText(p, 'significand'));
          return;
        }
        case 'assemble': {
          const value = readText(p, 'value');
          stage.setCaption?.(tr('caption.assemble', 'Three parts, one number: {value}', { value }));
          await stage.assemble?.(value);
          return;
        }
        case 'done': {
          stage.setCaption?.(
            tr('caption.done', 'The same number it started as: {value}', {
              value: readText(p, 'value'),
            }),
          );
          await stage.settle?.();
          return;
        }
        case 'rewind': {
          stage.rewind?.();
          return;
        }
        default:
          // 그 밖의 이벤트는 조용히 흘린다 — 이 조각이 내는 어휘는 위가 전부다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.rewind?.();
    },
  };
};
