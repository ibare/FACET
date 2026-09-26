/**
 * ecc projector — 알고리즘 이벤트를 ecc-stage 메서드와 코드 패널 강조로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 모르는 이벤트 · 어긋난 모양은 던진다.
 * 판 머리(init)에서 코드 패널을 끈다 — 걸음 0 에는 phase 가 없다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { EccInit, EccLadderEvent, EccRecoverEvent, EccSharedEvent, EccSlot, EccStage } from './ecc-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void };

const obj = (v: unknown, what: string): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null) throw new Error(`ecc projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
};
const int = (o: Record<string, unknown>, key: string): number => {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`ecc projector: ${key} 가 정수가 아니다`);
  return v;
};
const bool = (o: Record<string, unknown>, key: string): boolean => {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`ecc projector: ${key} 가 참거짓이 아니다`);
  return v;
};
const ints = (o: Record<string, unknown>, key: string): number[] => {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`ecc projector: ${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) throw new Error(`ecc projector: ${key}[${i}] 가 정수가 아니다`);
    return x;
  });
};

function readSlots(o: Record<string, unknown>): EccSlot[] {
  const v = o.slots;
  if (!Array.isArray(v) || v.length === 0) throw new Error('ecc projector: slots 가 없다');
  return v.map((raw, i) => {
    const s = obj(raw, `slots[${i}]`);
    return { m: int(s, 'm'), code: int(s, 'code'), x: int(s, 'x'), y: int(s, 'y'), v: int(s, 'v'), identity: bool(s, 'identity'), alias: bool(s, 'alias') };
  });
}

function readInit(raw: unknown): EccInit {
  const o = obj(raw, 'init payload');
  const group = o.group;
  if (group !== 'curve' && group !== 'mul') throw new Error(`ecc projector: 모르는 군 ${String(group)}`);
  return {
    group,
    p: int(o, 'p'),
    a: int(o, 'a'),
    b: int(o, 'b'),
    g: int(o, 'g'),
    identity: int(o, 'identity'),
    k: int(o, 'k'),
    bits: ints(o, 'bits'),
    peer: int(o, 'peer'),
    barMax: int(o, 'barMax'),
    marks: ints(o, 'marks'),
    slots: readSlots(o),
  };
}

function readLadder(op: 'double' | 'add', raw: unknown): EccLadderEvent {
  const o = obj(raw, `${op} payload`);
  return {
    op,
    m: int(o, 'm'),
    fromM: int(o, 'fromM'),
    code: int(o, 'code'),
    bitIndex: int(o, 'bitIndex'),
    forward: int(o, 'forward'),
    motionMs: int(o, 'motionMs'),
  };
}

function readRecover(raw: unknown): EccRecoverEvent {
  const o = obj(raw, 'recover payload');
  return { path: ints(o, 'path'), added: int(o, 'added'), recovered: int(o, 'recovered'), code: int(o, 'code'), hopMs: int(o, 'hopMs') };
}

function readShared(raw: unknown): EccSharedEvent {
  const o = obj(raw, 'shared payload');
  return {
    peer: int(o, 'peer'),
    bCode: int(o, 'bCode'),
    aCode: int(o, 'aCode'),
    kCode: int(o, 'kCode'),
    forward: int(o, 'forward'),
    backward: int(o, 'backward'),
    motionMs: int(o, 'motionMs'),
  };
}

export const eccProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as EccStage | undefined;
  if (stage === undefined) throw new Error('ecc projector: stage 가 없다');
  const code = views.codePanel as unknown as CodePanel | undefined;
  stage.bindSpeed(() => runtime?.getSpeed() ?? 1);

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const phase = obj(event.payload, 'phase payload').phase;
          if (typeof phase !== 'string') throw new Error('ecc projector: phase 이름이 없다');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'init':
          code?.highlightPhase?.(null);
          stage.init(readInit(event.payload));
          return;
        case 'double':
          stage.ladder(readLadder('double', event.payload));
          return;
        case 'add':
          stage.ladder(readLadder('add', event.payload));
          return;
        case 'recover':
          stage.recover(readRecover(event.payload));
          return;
        case 'shared':
          stage.shared(readShared(event.payload));
          return;
        default:
          throw new Error(`ecc projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage.reset();
      code?.highlightPhase?.(null);
    },
  };
};
