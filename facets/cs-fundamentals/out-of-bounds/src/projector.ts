/**
 * out-of-bounds projector — algorithm 이 발신한 걸음을 stage 메서드 호출로 옮긴다.
 *
 * payload 는 오픈 타입이므로 여기서 한 번 좁힌 뒤 정형 객체로 stage 에 넘긴다
 * (C9). 캡션 문안은 algorithm 이 보낸 키를 tr 로 해석해 만든다 (C10) — 코드에는
 * 키와 en 원본만 있고 문안은 facet.ts 의 messages 에 있다.
 */

import type { ProjectorFactory, ProjectorInstance, ProjectorRuntime, ProjectorViews } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { OutOfBoundsStageInit } from './out-of-bounds-stage.js';

/** stage 가 노출하는 호출 표면. */
type OutOfBoundsStage = {
  init(d: OutOfBoundsStageInit): void;
  showAddress(p: { index: number; addressHex: string }): void;
  moveProbe(p: { index: number; crossed: boolean }): Promise<void>;
  readSlot(p: { index: number; value: number; outOfBounds: boolean }): void;
  dropGuard(p: { homeIndex: number }): Promise<void>;
  blockProbe(p: { index: number }): Promise<void>;
  setCaption(text: string): void;
  markDone(): void;
  resetStage(): void;
};

type RawPayload = {
  index?: unknown;
  baseHex?: unknown;
  stride?: unknown;
  addressHex?: unknown;
  crossed?: unknown;
  value?: unknown;
  outOfBounds?: unknown;
  lo?: unknown;
  hi?: unknown;
  homeIndex?: unknown;
  textKey?: unknown;
};

const asNumber = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);
const asString = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const asBool = (v: unknown): boolean => v === true;

export const outOfBoundsProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as OutOfBoundsStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  // stage 를 다시 세우기 위한 그림자 사본. 데이터 원본은 알고리즘의 ctx.data 다.
  let shadow: OutOfBoundsStageInit | null = null;

  /**
   * 걸음의 말. algorithm 은 키만 보내므로 여기서 en 원본과 짝지어 조회한다.
   * en 원본이 호출부 리터럴로 남아야 저작자가 무엇을 덮어쓰는지 알 수 있다.
   */
  const captionOf = (key: string, vars: Record<string, string | number>): string => {
    switch (key) {
      case 'caption.start':
        return tr('caption.start', 'An index is a number. The machine has to turn it into a place.');
      case 'caption.compute':
        return tr(
          'caption.compute',
          'The index becomes an address: {base} + {i} × {stride} = {addr}.',
          vars,
        );
      case 'caption.inside':
        return tr('caption.inside', '{name}[{i}] lands on the last cell the array owns.', vars);
      case 'caption.readInside':
        return tr('caption.readInside', 'It reads {value}, the value the array keeps there.', vars);
      case 'caption.keepsCounting':
        return tr(
          'caption.keepsCounting',
          'Now {i}. The arithmetic checks nothing — it just keeps counting: {addr}.',
          vars,
        );
      case 'caption.crossed':
        return tr('caption.crossed', '{addr} lies past the end of the array, on the next variable.', vars);
      case 'caption.readsNeighbor':
        return tr(
          'caption.readsNeighbor',
          '{name}[{i}] reads {value} all the same. That value belongs to someone else.',
          vars,
        );
      case 'caption.guard':
        return tr(
          'caption.guard',
          'A bounds check stands at the end and asks {lo} ≤ i < {hi} before any access.',
          vars,
        );
      case 'caption.blocked':
        return tr(
          'caption.blocked',
          '{name}[{i}] never reaches the address. It stops at the edge instead.',
          vars,
        );
      default:
        return '';
    }
  };

  const say = (raw: RawPayload, vars: Record<string, string | number>): void => {
    const key = asString(raw.textKey, '');
    if (key === '') return;
    stage?.setCaption(captionOf(key, vars));
  };

  const applyInit = (initialData: unknown): void => {
    const d = initialData as unknown as Partial<OutOfBoundsStageInit> | undefined;
    if (!d || !Array.isArray(d.values)) return;
    shadow = {
      arrayName: asString(d.arrayName, 'arr'),
      values: d.values.filter((v): v is number => typeof v === 'number'),
      baseAddress: asNumber(d.baseAddress, 0),
      stride: asNumber(d.stride, 4),
      neighborName: asString(d.neighborName, 'next'),
      neighborValue: asNumber(d.neighborValue, 0),
    };
    stage?.init(shadow);
    stage?.setCaption(captionOf('caption.start', {}));
  };

  return {
    onInit(initialData: unknown): void {
      applyInit(initialData);
    },

    onEvent(event): void | Promise<void> {
      const raw = (event.payload ?? {}) as RawPayload;
      const name = shadow?.arrayName ?? 'arr';

      switch (event.type) {
        case 'address-computed': {
          const index = asNumber(raw.index, 0);
          const addressHex = asString(raw.addressHex, '');
          stage?.showAddress({ index, addressHex });
          say(raw, {
            name,
            i: index,
            base: asString(raw.baseHex, ''),
            stride: asNumber(raw.stride, 0),
            addr: addressHex,
          });
          return;
        }

        case 'probe-move': {
          const index = asNumber(raw.index, 0);
          const crossed = asBool(raw.crossed);
          say(raw, { name, i: index, addr: asString(raw.addressHex, '') });
          return stage?.moveProbe({ index, crossed });
        }

        case 'slot-read': {
          const index = asNumber(raw.index, 0);
          const value = asNumber(raw.value, 0);
          stage?.readSlot({ index, value, outOfBounds: asBool(raw.outOfBounds) });
          say(raw, { name, i: index, value });
          return;
        }

        case 'guard-drop': {
          say(raw, { name, lo: asNumber(raw.lo, 0), hi: asNumber(raw.hi, 0) });
          return stage?.dropGuard({ homeIndex: asNumber(raw.homeIndex, 0) });
        }

        case 'probe-blocked': {
          const index = asNumber(raw.index, 0);
          say(raw, { name, i: index });
          return stage?.blockProbe({ index });
        }

        case 'rewind': {
          stage?.resetStage();
          if (shadow) stage?.init(shadow);
          stage?.setCaption(captionOf('caption.start', {}));
          return;
        }

        case 'done': {
          stage?.markDone();
          return;
        }

        // 이 algorithm 은 위 어휘만 발신한다. 그 밖의 이벤트는 조용히 흘린다.
        default:
          return;
      }
    },

    onReset(): void {
      stage?.resetStage();
      if (shadow) {
        stage?.init(shadow);
        stage?.setCaption(captionOf('caption.start', {}));
      }
    },
  };
};
