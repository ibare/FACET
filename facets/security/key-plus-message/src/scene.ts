/**
 * key-plus-message 의 장면.
 *
 * 바탕  — 열쇠 K · 보내는 글 · 고친 글 (initialData 에서 베낀다)
 * 자취  — 길 위의 글(packet) · 사람마다 마지막으로 한 셈(computes) · Bob 이 판정한 것(log)
 * 이번 걸음 — step (무엇이 흘러야 하는지 · 지나간 값 from · was)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowKeyPlusMessageData } from './algorithm.js';

export type Who = 'alice' | 'mallory' | 'bob';

export type Packet = {
  msg: string;
  /** 붙은 표. 아직 셈하지 않았으면 null */
  tag: number | null;
  /** 표를 누가 셈했나 — mac: 열쇠로 · hash: 열쇠 없이 */
  tagBy: 'mac' | 'hash' | null;
  at: Who;
};

export type Compute = {
  kind: 'mac' | 'hash';
  msg: string;
  out: number;
  /** Bob 의 셈만 — 견준 붙은 표와 그 표를 만든 셈 */
  against: { tag: number; by: 'mac' | 'hash' } | null;
};

export type Verdict = {
  msg: string;
  tag: number;
  tagBy: 'mac' | 'hash';
  mine: number;
  accepted: boolean;
};

export type KeyPlusMessageStep =
  | { kind: 'start' }
  | { kind: 'tag' }
  | { kind: 'verify'; from: Who }
  | { kind: 'alter'; from: string }
  | { kind: 'forge'; was: number };

export type KeyPlusMessageScene = {
  key: number;
  message: string;
  altered: string;
  packet: Packet | null;
  computes: { alice: Compute | null; mallory: Compute | null; bob: Compute | null };
  log: Verdict[];
  step: KeyPlusMessageStep;
};

function field(payload: unknown, name: string, type: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`key-plus-message scene: payload 가 객체가 아니다 (${type})`);
  }
  if (!(name in payload)) {
    throw new Error(`key-plus-message scene: ${type}.payload.${name} 이 없다`);
  }
  return (payload as Record<string, unknown>)[name];
}

function word(payload: unknown, name: string, type: string): number {
  const v = field(payload, name, type);
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 0xffff) {
    throw new Error(`key-plus-message scene: ${type}.payload.${name} 이 16 비트 정수가 아니다`);
  }
  return v;
}

function text(payload: unknown, name: string, type: string): string {
  const v = field(payload, name, type);
  if (typeof v !== 'string') {
    throw new Error(`key-plus-message scene: ${type}.payload.${name} 이 글이 아니다`);
  }
  return v;
}

function flag(payload: unknown, name: string, type: string): boolean {
  const v = field(payload, name, type);
  if (typeof v !== 'boolean') {
    throw new Error(`key-plus-message scene: ${type}.payload.${name} 이 참거짓이 아니다`);
  }
  return v;
}

export const keyPlusMessageScene: ScenePlan<KeyPlusMessageScene> = {
  initial(initialData: unknown): KeyPlusMessageScene {
    const d = narrowKeyPlusMessageData(initialData);
    return {
      key: d.key,
      message: d.message,
      altered: d.altered,
      packet: { msg: d.message, tag: null, tagBy: null, at: 'alice' },
      computes: { alice: null, mallory: null, bob: null },
      log: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: KeyPlusMessageScene, event: FacetRuntimeEvent): KeyPlusMessageScene {
    const p = event.payload;
    switch (event.type) {
      case 'tag': {
        const msg = text(p, 'msg', 'tag');
        const tag = word(p, 'tag', 'tag');
        const pk = scene.packet;
        if (pk === null || pk.at !== 'alice' || pk.tag !== null) {
          throw new Error('key-plus-message scene: tag — Alice 손에 표 없는 글이 없다');
        }
        if (pk.msg !== msg) {
          throw new Error(`key-plus-message scene: tag.payload.msg 가 Alice 손의 글과 다르다 (${msg})`);
        }
        return {
          ...scene,
          packet: { ...pk, tag, tagBy: 'mac' },
          computes: { ...scene.computes, alice: { kind: 'mac', msg, out: tag, against: null } },
          step: { kind: 'tag' },
        };
      }
      case 'verify': {
        const msg = text(p, 'msg', 'verify');
        const tag = word(p, 'tag', 'verify');
        const mine = word(p, 'mine', 'verify');
        const accepted = flag(p, 'accepted', 'verify');
        const pk = scene.packet;
        if (pk === null || pk.tag === null || pk.tagBy === null) {
          throw new Error('key-plus-message scene: verify — 길 위에 표 붙은 글이 없다');
        }
        if (pk.msg !== msg || pk.tag !== tag) {
          throw new Error('key-plus-message scene: verify.payload 의 msg · tag 가 길 위의 글과 다르다');
        }
        if (accepted !== (mine === tag)) {
          throw new Error('key-plus-message scene: verify.payload.accepted 가 mine === tag 와 어긋난다');
        }
        return {
          ...scene,
          packet: null,
          computes: {
            ...scene.computes,
            bob: { kind: 'mac', msg, out: mine, against: { tag, by: pk.tagBy } },
          },
          log: [...scene.log, { msg, tag, tagBy: pk.tagBy, mine, accepted }],
          step: { kind: 'verify', from: pk.at },
        };
      }
      case 'alter': {
        const from = text(p, 'from', 'alter');
        const to = text(p, 'to', 'alter');
        const tag = word(p, 'tag', 'alter');
        if (scene.packet !== null) {
          throw new Error('key-plus-message scene: alter — 앞 글이 아직 길 위에 있다');
        }
        if (from !== scene.message || to !== scene.altered) {
          throw new Error('key-plus-message scene: alter.payload 의 from · to 가 바탕의 글과 다르다');
        }
        const sent = scene.computes.alice;
        if (sent === null || sent.out !== tag) {
          throw new Error('key-plus-message scene: alter.payload.tag 가 Alice 의 표가 아니다');
        }
        return {
          ...scene,
          packet: { msg: to, tag, tagBy: 'mac', at: 'mallory' },
          step: { kind: 'alter', from },
        };
      }
      case 'forge': {
        const msg = text(p, 'msg', 'forge');
        const tag = word(p, 'tag', 'forge');
        const was = word(p, 'was', 'forge');
        const pk = scene.packet;
        if (pk === null || pk.at !== 'mallory') {
          throw new Error('key-plus-message scene: forge — Mallory 앞에 글이 없다');
        }
        if (pk.msg !== msg || pk.tag !== was) {
          throw new Error('key-plus-message scene: forge.payload 의 msg · was 가 Mallory 앞의 글과 다르다');
        }
        return {
          ...scene,
          packet: { ...pk, tag, tagBy: 'hash' },
          computes: { ...scene.computes, mallory: { kind: 'hash', msg, out: tag, against: null } },
          step: { kind: 'forge', was },
        };
      }
      default:
        throw new Error(`key-plus-message scene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
