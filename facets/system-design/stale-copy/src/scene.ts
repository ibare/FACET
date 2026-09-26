/**
 * stale-copy 장면 — 알고리즘 이벤트를 잇기만 한다. 셈(옛값 판정 · 서로 다른 값 수)은 알고리즘이 싣는다.
 *
 * 바탕: key · 서버 차례
 * 자취: db · 사본 값 · 받은 값 줄 · 셈값(tally — 옛 사본 서버를 함께 든다)
 * 이번 걸음: step
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowStaleCopyData } from './algorithm.js';

export interface StaleCopyCopy {
  id: string;
  value: number;
}

export interface StaleCopyRead {
  server: string;
  value: number;
  stale: boolean;
}

export interface StaleCopyTally {
  readSlots: number;
  staleReads: number;
  distinct: number;
  /** DB 와 다른 값을 든 서버 (옛 사본) */
  stale: string[];
  /** 걸음 0 에 모든 사본이 든 같은 값 — 다르면 null (init 이 싣는다) */
  shared: number | null;
}

export type StaleCopyStep =
  | {
      kind: 'write';
      server: string;
      value: number;
      dbBefore: number;
      copyBefore: number;
      staleBefore: string[];
    }
  | { kind: 'read'; server: string; value: number; stale: boolean; slot: number };

export interface StaleCopyScene {
  key: string;
  db: number;
  copies: StaleCopyCopy[];
  reads: StaleCopyRead[];
  /** silent init 이 채운다 — 그 앞에는 없다 */
  tally: StaleCopyTally | null;
  step: StaleCopyStep | null;
}

function fields(event: FacetRuntimeEvent): Record<string, unknown> {
  const p: unknown = event.payload;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) {
    throw new Error(`stale-copy 장면: ${event.type}.payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function int(p: Record<string, unknown>, name: string, where: string): number {
  const v = p[name];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`stale-copy 장면: ${where}.payload.${name} 는 정수여야 한다`);
  }
  return v;
}

function bool(p: Record<string, unknown>, name: string, where: string): boolean {
  const v = p[name];
  if (typeof v !== 'boolean') throw new Error(`stale-copy 장면: ${where}.payload.${name} 는 참거짓이어야 한다`);
  return v;
}

function serverOf(scene: StaleCopyScene, p: Record<string, unknown>, name: string, where: string): string {
  const v = p[name];
  if (typeof v !== 'string' || !scene.copies.some((c) => c.id === v)) {
    throw new Error(`stale-copy 장면: ${where}.payload.${name} 가 바탕의 서버가 아니다 (${String(v)})`);
  }
  return v;
}

function serverList(scene: StaleCopyScene, p: Record<string, unknown>, name: string, where: string): string[] {
  const v = p[name];
  if (!Array.isArray(v)) throw new Error(`stale-copy 장면: ${where}.payload.${name} 가 배열이 아니다`);
  return v.map((id, i) => {
    if (typeof id !== 'string' || !scene.copies.some((c) => c.id === id)) {
      throw new Error(`stale-copy 장면: ${where}.payload.${name}[${i}] 가 바탕의 서버가 아니다 (${String(id)})`);
    }
    return id;
  });
}

function copyValue(scene: StaleCopyScene, id: string): number {
  const c = scene.copies.find((x) => x.id === id);
  if (!c) throw new Error(`stale-copy 장면: 서버 '${id}' 의 사본이 없다`);
  return c.value;
}

function needTally(scene: StaleCopyScene, where: string): StaleCopyTally {
  if (!scene.tally) throw new Error(`stale-copy 장면: ${where} 가 init 보다 먼저 왔다`);
  return scene.tally;
}

export const staleCopyScene: ScenePlan<StaleCopyScene> = {
  initial(initialData: unknown): StaleCopyScene {
    const data = narrowStaleCopyData(initialData);
    return {
      key: data.key,
      db: data.dbValue,
      copies: data.servers.map((s) => ({ id: s.id, value: s.cached })),
      reads: [],
      tally: null,
      step: null,
    };
  },

  reduce(scene: StaleCopyScene, event: FacetRuntimeEvent): StaleCopyScene {
    switch (event.type) {
      case 'init': {
        const p = fields(event);
        const readSlots = int(p, 'readSlots', 'init');
        const staleReads = int(p, 'staleReads', 'init');
        const distinct = int(p, 'distinct', 'init');
        const stale = serverList(scene, p, 'stale', 'init');
        const sharedRaw = p.shared;
        if (sharedRaw !== null && (typeof sharedRaw !== 'number' || !Number.isInteger(sharedRaw))) {
          throw new Error('stale-copy 장면: init.payload.shared 는 정수이거나 null 이어야 한다');
        }
        const shared: number | null = sharedRaw;
        return { ...scene, reads: [], tally: { readSlots, staleReads, distinct, stale, shared }, step: null };
      }
      case 'write': {
        const tally = needTally(scene, 'write');
        const p = fields(event);
        const server = serverOf(scene, p, 'server', 'write');
        const value = int(p, 'value', 'write');
        const dbBefore = int(p, 'dbBefore', 'write');
        const copyBefore = int(p, 'copyBefore', 'write');
        if (dbBefore !== scene.db) {
          throw new Error(`stale-copy 장면: write.payload.dbBefore ${dbBefore} 가 지금 DB ${scene.db} 와 다르다`);
        }
        if (copyBefore !== copyValue(scene, server)) {
          throw new Error(`stale-copy 장면: write.payload.copyBefore ${copyBefore} 가 서버 '${server}' 의 사본과 다르다`);
        }
        const staleBefore = serverList(scene, p, 'staleBefore', 'write');
        if (staleBefore.join(',') !== tally.stale.join(',')) {
          throw new Error('stale-copy 장면: write.payload.staleBefore 가 지금 장면의 옛 사본과 다르다');
        }
        const stale = serverList(scene, p, 'stale', 'write');
        const distinct = int(p, 'distinct', 'write');
        return {
          ...scene,
          db: value,
          copies: scene.copies.map((c) => (c.id === server ? { id: c.id, value } : { ...c })),
          reads: scene.reads.map((r) => ({ ...r })),
          tally: { ...tally, distinct, stale },
          step: { kind: 'write', server, value, dbBefore, copyBefore, staleBefore },
        };
      }
      case 'read': {
        const tally = needTally(scene, 'read');
        const p = fields(event);
        const server = serverOf(scene, p, 'server', 'read');
        const value = int(p, 'value', 'read');
        const stale = bool(p, 'stale', 'read');
        const slot = int(p, 'slot', 'read');
        const staleReads = int(p, 'staleReads', 'read');
        if (value !== copyValue(scene, server)) {
          throw new Error(`stale-copy 장면: read.payload.value ${value} 가 서버 '${server}' 의 사본과 다르다`);
        }
        if (slot !== scene.reads.length || slot >= tally.readSlots) {
          throw new Error(`stale-copy 장면: read.payload.slot ${slot} 가 다음 칸이 아니다`);
        }
        return {
          ...scene,
          copies: scene.copies.map((c) => ({ ...c })),
          reads: [...scene.reads.map((r) => ({ ...r })), { server, value, stale }],
          tally: { ...tally, staleReads, stale: [...tally.stale] },
          step: { kind: 'read', server, value, stale, slot },
        };
      }
      default:
        throw new Error(`stale-copy 장면: 모르는 이벤트 '${event.type}'`);
    }
  },
};
