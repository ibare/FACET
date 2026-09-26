/**
 * roundKeyMixScene — mix 이벤트를 장면으로 잇는다.
 *
 * 바탕   masterKey · plaintext (initialData 에서, 걸음 0)
 * 자취   keys — 지금까지 잘려 나온 라운드 열쇠 (번호 · 첫 자리 · 16 진)
 *        state — 지금 상태 (16 진)
 * 이번   step — 이번 걸음의 mix 값 (층을 지나기 전 · 들어온 상태 · 결과 · 뒤집힌 수 …)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowRoundKeyMixData, ROUNDS, type MixPayload, type PassKind } from './algorithm.js';

export type CutKey = { round: number; start: number; hex: string };

export type RoundKeyMixScene = {
  masterKey: string;
  plaintext: string;
  keys: readonly CutKey[];
  state: string;
  step: MixPayload | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(p: Record<string, unknown>, field: string): number {
  const v = p[field];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`roundKeyMixScene: payload.${field} 는 정수여야 한다`);
  return v;
}

function hex(p: Record<string, unknown>, field: string, digits: number): string {
  const v = p[field];
  if (typeof v !== 'string' || !new RegExp(`^[0-9A-F]{${digits}}$`).test(v)) {
    throw new Error(`roundKeyMixScene: payload.${field} 는 16 진 ${digits} 자리여야 한다`);
  }
  return v;
}

function passKind(p: Record<string, unknown>): PassKind {
  const v = p.pass;
  if (v === 'none' || v === 'sp' || v === 's') return v;
  throw new Error(`roundKeyMixScene: payload.pass 가 어긋났다 (${String(v)})`);
}

function readMix(raw: unknown): MixPayload {
  if (!isRecord(raw)) throw new Error('roundKeyMixScene: mix 의 payload 가 객체가 아니다');
  const last = raw.last;
  if (typeof last !== 'boolean') throw new Error('roundKeyMixScene: payload.last 는 참거짓이어야 한다');
  return {
    round: num(raw, 'round'),
    start: num(raw, 'start'),
    key: hex(raw, 'key', 4),
    pass: passKind(raw),
    before: hex(raw, 'before', 4),
    enter: hex(raw, 'enter', 4),
    result: hex(raw, 'result', 4),
    flipped: num(raw, 'flipped'),
    last,
    flippedSum: num(raw, 'flippedSum'),
    distinct: num(raw, 'distinct'),
  };
}

export const roundKeyMixScene: ScenePlan<RoundKeyMixScene> = {
  initial(initialData: unknown): RoundKeyMixScene {
    const data = narrowRoundKeyMixData(initialData);
    return {
      masterKey: data.masterKey,
      plaintext: data.plaintext,
      keys: [],
      state: data.plaintext,
      step: null,
    };
  },

  reduce(scene: RoundKeyMixScene, event: FacetRuntimeEvent): RoundKeyMixScene {
    switch (event.type) {
      case 'mix': {
        const mix = readMix(event.payload);
        const expectRound = scene.keys.length + 1;
        if (mix.round !== expectRound) {
          throw new Error(`roundKeyMixScene: payload.round 가 ${mix.round}, 기대는 ${expectRound}`);
        }
        if (mix.round > ROUNDS + 1) throw new Error(`roundKeyMixScene: 열쇠는 ${ROUNDS + 1} 개까지다`);
        if (mix.before !== scene.state) {
          throw new Error(`roundKeyMixScene: payload.before ${mix.before} 가 지금 상태 ${scene.state} 와 다르다`);
        }
        if (mix.pass === 'none' && mix.enter !== mix.before) {
          throw new Error('roundKeyMixScene: 층을 지나지 않았는데 payload.enter 가 payload.before 와 다르다');
        }
        return {
          masterKey: scene.masterKey,
          plaintext: scene.plaintext,
          keys: [...scene.keys, { round: mix.round, start: mix.start, hex: mix.key }],
          state: mix.result,
          step: mix,
        };
      }
      default:
        throw new Error(`roundKeyMixScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
