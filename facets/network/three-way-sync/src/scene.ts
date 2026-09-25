/**
 * three-way-sync 장면.
 *
 * 바탕: 두 끝(주소 · 처음 상태) · 칸 넷 · 메시지 수 · 자료 글자 — initial() 이 initialData 에서 세운다.
 * 자취: 끝마다 지금 상태 · 칸마다 채운 값과 채운 메시지 차례 · 보낸 메시지들.
 * 이번 걸음: 처음이거나, 메시지 하나가 닿았다 (받는 쪽의 앞 상태를 계기값으로 싣는다).
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트가 실어 온 값을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readThreeWaySyncData, type FactKind } from './algorithm.js';

export type SyncSide = { id: string; addr: string; initial: string; state: string };
export type SyncFact = {
  id: string;
  holder: string;
  kind: FactKind;
  /** 채운 값. 비었으면 null. */
  value: { field: 'seq' | 'ack'; n: number } | null;
  /** 채운 메시지 차례 (1 부터). */
  by: number | null;
};
export type SyncMessage = {
  index: number;
  from: string;
  to: string;
  flags: string[];
  seq: number;
  ack: number | null;
  /** 이 메시지가 채운 칸 id. */
  filled: string[];
};
export type SyncStep =
  | { kind: 'start' }
  | { kind: 'message'; index: number; receiverWas: string };

export type ThreeWaySyncScene = {
  sides: SyncSide[];
  facts: SyncFact[];
  total: number;
  established: string;
  fieldText: { seq: string; ack: string };
  sent: SyncMessage[];
  step: SyncStep;
};

function numberField(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`three-way-sync 장면: ${name} 가 수가 아니다`);
  return v;
}

function stringField(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new Error(`three-way-sync 장면: ${name} 가 글자가 아니다`);
  return v;
}

export const threeWaySyncScene: ScenePlan<ThreeWaySyncScene> = {
  initial(initialData: unknown): ThreeWaySyncScene {
    const d = readThreeWaySyncData(initialData);
    return {
      sides: d.sides.map((s) => ({ id: s.id, addr: s.addr, initial: s.state, state: s.state })),
      facts: d.facts.map((f) => ({ id: f.id, holder: f.holder, kind: f.kind, value: null, by: null })),
      total: d.exchange.length,
      established: d.states.established,
      fieldText: { seq: d.fieldText.seq, ack: d.fieldText.ack },
      sent: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: ThreeWaySyncScene, event: FacetRuntimeEvent): ThreeWaySyncScene {
    if (event.type !== 'message') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error('three-way-sync 장면: message 의 payload 가 없다');
    const r = p as Record<string, unknown>;
    const index = numberField(r.index, 'index');
    const from = stringField(r.from, 'from');
    const to = stringField(r.to, 'to');
    const seq = numberField(r.seq, 'seq');
    const ack = r.ack === null ? null : numberField(r.ack, 'ack');
    const senderState = stringField(r.senderState, 'senderState');
    const receiverState = stringField(r.receiverState, 'receiverState');
    if (!Array.isArray(r.flags)) throw new Error('three-way-sync 장면: flags 가 배열이 아니다');
    const flags = r.flags.map((f, i) => stringField(f, `flags[${i}]`));
    if (!Array.isArray(r.fills)) throw new Error('three-way-sync 장면: fills 가 배열이 아니다');
    const fills = r.fills.map((f, i) => {
      if (typeof f !== 'object' || f === null) throw new Error(`three-way-sync 장면: fills[${i}] 가 객체가 아니다`);
      const o = f as Record<string, unknown>;
      const field = o.field;
      if (field !== 'seq' && field !== 'ack') throw new Error(`three-way-sync 장면: fills[${i}].field 를 모른다`);
      const fill: { fact: string; field: 'seq' | 'ack'; n: number } = {
        fact: stringField(o.fact, `fills[${i}].fact`),
        field,
        n: numberField(o.value, `fills[${i}].value`),
      };
      return fill;
    });

    const receiver = scene.sides.find((s) => s.id === to);
    if (!receiver || !scene.sides.some((s) => s.id === from)) throw new Error('three-way-sync 장면: 없는 끝');
    for (const f of fills) {
      const fact = scene.facts.find((x) => x.id === f.fact);
      if (!fact) throw new Error(`three-way-sync 장면: 없는 칸 ${f.fact}`);
      if (fact.value !== null) throw new Error(`three-way-sync 장면: ${f.fact} 칸이 이미 찼다`);
    }

    return {
      ...scene,
      sides: scene.sides.map((s) => {
        if (s.id === from) return { ...s, state: senderState };
        if (s.id === to) return { ...s, state: receiverState };
        return { ...s };
      }),
      facts: scene.facts.map((fact) => {
        const f = fills.find((x) => x.fact === fact.id);
        return f ? { ...fact, value: { field: f.field, n: f.n }, by: index } : { ...fact };
      }),
      sent: [...scene.sent, { index, from, to, flags, seq, ack, filled: fills.map((f) => f.fact) }],
      step: { kind: 'message', index, receiverWas: receiver.state },
    };
  },
};
