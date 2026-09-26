/**
 * invalidate-others 장면 — 알고리즘 이벤트를 잇기만 한다. 셈(옛값 판정 · 사본 수 · 적중)은 알고리즘이 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowInvalidateOthersData } from './algorithm.js';

export type InvalidateOthersStep =
  | { kind: 'init' }
  | { kind: 'write'; server: string; value: number; wasDb: number; wasSlot: number | null }
  | { kind: 'invalidate'; from: string; targets: { server: string; was: number }[]; heldBefore: number; heldAfter: number }
  | { kind: 'read'; server: string; hit: boolean; value: number; stale: boolean };

export interface InvalidateOthersScene {
  /** 바탕 */
  key: string;
  servers: string[];
  /** 자취 */
  db: number;
  /** servers 와 같은 차례. null 은 빈 자리 */
  slots: (number | null)[];
  /** 옛 사본을 든 서버 */
  stale: string[];
  /** 알고리즘이 셈해 보낸 계기 — init 전에는 null */
  held: number | null;
  dbReads: number | null;
  /** 이번 걸음 */
  step: InvalidateOthersStep;
}

function rec(x: unknown, at: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`invalidate-others 장면: ${at} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}
function num(x: unknown, at: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`invalidate-others 장면: ${at} 가 수가 아니다`);
  return x;
}
function str(x: unknown, at: string): string {
  if (typeof x !== 'string') throw new Error(`invalidate-others 장면: ${at} 가 문자열이 아니다`);
  return x;
}
function bool(x: unknown, at: string): boolean {
  if (typeof x !== 'boolean') throw new Error(`invalidate-others 장면: ${at} 가 참거짓이 아니다`);
  return x;
}
function strList(x: unknown, at: string): string[] {
  if (!Array.isArray(x)) throw new Error(`invalidate-others 장면: ${at} 가 배열이 아니다`);
  return x.map((v, i) => str(v, `${at}[${i}]`));
}

function indexOf(scene: InvalidateOthersScene, server: string, at: string): number {
  const i = scene.servers.indexOf(server);
  if (i < 0) throw new Error(`invalidate-others 장면: ${at} 의 서버 ${server} 가 바탕에 없다`);
  return i;
}

const KNOWN = ['init', 'write', 'invalidate', 'read'];

export const invalidateOthersScene: ScenePlan<InvalidateOthersScene> = {
  initial(initialData: unknown): InvalidateOthersScene {
    const data = narrowInvalidateOthersData(initialData);
    return {
      key: data.key,
      servers: [...data.servers],
      db: data.dbValue,
      slots: data.servers.map((s) => (data.cachedAt.includes(s) ? data.dbValue : null)),
      stale: [],
      held: null,
      dbReads: null,
      step: { kind: 'init' },
    };
  },

  reduce(scene: InvalidateOthersScene, event: FacetRuntimeEvent): InvalidateOthersScene {
    if (!KNOWN.includes(event.type)) throw new Error(`invalidate-others 장면: 모르는 이벤트 ${event.type}`);
    const p = rec(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'init': {
        return {
          ...scene,
          slots: [...scene.slots],
          stale: [...scene.stale],
          held: num(p.held, 'init.payload.held'),
          dbReads: num(p.dbReads, 'init.payload.dbReads'),
          step: { kind: 'init' },
        };
      }
      case 'write': {
        const server = str(p.server, 'write.payload.server');
        const i = indexOf(scene, server, 'write.payload.server');
        const value = num(p.value, 'write.payload.value');
        const wasDb = num(p.wasDb, 'write.payload.wasDb');
        const wasSlot = p.wasSlot === null ? null : num(p.wasSlot, 'write.payload.wasSlot');
        if (wasDb !== scene.db) throw new Error(`invalidate-others 장면: write.payload.wasDb ${wasDb} 가 지금 DB 값 ${scene.db} 와 다르다`);
        if (wasSlot !== scene.slots[i]) throw new Error(`invalidate-others 장면: write.payload.wasSlot 이 서버 ${server} 의 지금 자리와 다르다`);
        const stale = strList(p.stale, 'write.payload.stale');
        for (const s of stale) indexOf(scene, s, 'write.payload.stale');
        const slots = [...scene.slots];
        slots[i] = value;
        return { ...scene, db: value, slots, stale, step: { kind: 'write', server, value, wasDb, wasSlot } };
      }
      case 'invalidate': {
        const from = str(p.from, 'invalidate.payload.from');
        indexOf(scene, from, 'invalidate.payload.from');
        if (!Array.isArray(p.targets)) throw new Error('invalidate-others 장면: invalidate.payload.targets 가 배열이 아니다');
        const slots = [...scene.slots];
        const targets = p.targets.map((raw, k) => {
          const at = `invalidate.payload.targets[${k}]`;
          const tg = rec(raw, at);
          const server = str(tg.server, `${at}.server`);
          const was = num(tg.was, `${at}.was`);
          const i = indexOf(scene, server, `${at}.server`);
          if (slots[i] !== was) throw new Error(`invalidate-others 장면: ${at}.was 가 서버 ${server} 의 지금 자리와 다르다`);
          slots[i] = null;
          return { server, was };
        });
        const heldBefore = num(p.heldBefore, 'invalidate.payload.heldBefore');
        const heldAfter = num(p.heldAfter, 'invalidate.payload.heldAfter');
        const stale = strList(p.stale, 'invalidate.payload.stale');
        for (const s of stale) indexOf(scene, s, 'invalidate.payload.stale');
        return {
          ...scene,
          slots,
          stale,
          held: heldAfter,
          step: { kind: 'invalidate', from, targets, heldBefore, heldAfter },
        };
      }
      case 'read': {
        const server = str(p.server, 'read.payload.server');
        const i = indexOf(scene, server, 'read.payload.server');
        const hit = bool(p.hit, 'read.payload.hit');
        const value = num(p.value, 'read.payload.value');
        if (hit && scene.slots[i] !== value) throw new Error(`invalidate-others 장면: read.payload 가 적중이라는데 서버 ${server} 의 자리와 값이 다르다`);
        if (!hit && scene.slots[i] !== null) throw new Error(`invalidate-others 장면: read.payload 가 실패라는데 서버 ${server} 의 자리가 비어 있지 않다`);
        const slots = [...scene.slots];
        slots[i] = value;
        return {
          ...scene,
          slots,
          stale: [...scene.stale],
          held: num(p.held, 'read.payload.held'),
          dbReads: num(p.dbReads, 'read.payload.dbReads'),
          step: { kind: 'read', server, hit, value, stale: bool(p.stale, 'read.payload.stale') },
        };
      }
      default:
        throw new Error(`invalidate-others 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
