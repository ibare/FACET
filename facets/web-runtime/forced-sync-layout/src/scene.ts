/**
 * 장면 — 코드 줄 위의 실행 자리 · 상자마다 스타일 너비와 잰 너비 · 레이아웃 상태 · 돈 레이아웃.
 *
 * 바탕: 코드 줄 · 상자 식별자 (initial 이 initialData 에서 베낀다)
 * 자취: 읽기 줄(read 이벤트가 알린 줄) · 상자 너비 둘 · 더러움 · 레이아웃 목록 · 실행 자리 · 마지막 읽기
 * 이번 걸음: step — 운동이 출발할 계기값(fromLine · was · before)을 싣는다
 *
 * 셈(더러움 판정 · 잰 너비)은 알고리즘이 하고 이벤트에 싣는다. 여기서는 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ForcedSyncLayoutReason = 'forced' | 'frame';

export type ForcedSyncLayoutSceneBox = {
  id: string;
  /** 스타일에 적힌 너비 (px) */
  styled: number;
  /** 마지막 레이아웃이 잰 너비 — offsetWidth 가 돌려주는 값 */
  laid: number;
};

export type ForcedSyncLayoutStep =
  | { kind: 'start' }
  | { kind: 'read'; box: number; value: number; fromLine: number | null }
  | { kind: 'write'; box: number; was: number; width: number; fromLine: number | null }
  | {
      kind: 'layout';
      reason: ForcedSyncLayoutReason;
      /** 기다리는 읽기의 상자 (frame 이면 null) */
      box: number | null;
      /** 레이아웃 앞의 잰 너비 */
      before: number[];
      fromLine: number | null;
    };

export type ForcedSyncLayoutScene = {
  code: string[];
  /** 읽기 줄 — read 이벤트가 알린 줄. 알리기 전에는 null */
  readLine: number | null;
  boxes: ForcedSyncLayoutSceneBox[];
  /** 실행 자리 — 코드 줄 번호. code.length 는 스크립트 끝, null 은 아직 시작 전 */
  cursor: number | null;
  /** 실행이 레이아웃을 기다리며 멈춰 섰는가 */
  stopped: boolean;
  /** 루프가 지금 맡은 상자 */
  current: number | null;
  dirty: boolean;
  layouts: ForcedSyncLayoutReason[];
  /** 마지막 읽기가 받아 간 값 — 읽기 줄 곁에 머문다 */
  lastRead: number | null;
  step: ForcedSyncLayoutStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readInitial(data: unknown): { code: string[]; boxes: ForcedSyncLayoutSceneBox[] } {
  if (!isRecord(data)) throw new Error('forced-sync-layout: initialData 가 없다');
  const { code, boxes } = data;
  if (!Array.isArray(code) || !code.every((l): l is string => typeof l === 'string')) {
    throw new Error('forced-sync-layout: initialData.code 는 글자 줄 목록이어야 한다');
  }
  if (!Array.isArray(boxes) || boxes.length === 0) {
    throw new Error('forced-sync-layout: initialData.boxes 가 비었다');
  }
  const seen = new Set<string>();
  const out = boxes.map((b, i) => {
    if (!isRecord(b) || typeof b.id !== 'string' || typeof b.width !== 'number' || !(b.width > 0)) {
      throw new Error(`forced-sync-layout: initialData.boxes[${i}] 는 { id, width > 0 } 이어야 한다`);
    }
    if (seen.has(b.id)) throw new Error(`forced-sync-layout: 상자 식별자가 겹친다: ${b.id}`);
    seen.add(b.id);
    return { id: b.id, styled: b.width, laid: b.width };
  });
  return { code: [...code], boxes: out };
}

function boxIndex(scene: ForcedSyncLayoutScene, id: unknown): number {
  if (typeof id !== 'string') throw new Error('forced-sync-layout: payload.box 가 글자가 아니다');
  const i = scene.boxes.findIndex((b) => b.id === id);
  if (i < 0) throw new Error(`forced-sync-layout: 모르는 상자: ${id}`);
  return i;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`forced-sync-layout: payload.${key} 가 수가 아니다`);
  return v;
}

export const forcedSyncLayoutScene: ScenePlan<ForcedSyncLayoutScene> = {
  initial(initialData) {
    const { code, boxes } = readInitial(initialData);
    return {
      code,
      readLine: null,
      boxes,
      cursor: null,
      stopped: false,
      current: null,
      dirty: false,
      layouts: [],
      lastRead: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene, event: FacetRuntimeEvent) {
    const p = event.payload;
    if (!isRecord(p)) throw new Error(`forced-sync-layout: ${event.type} 의 payload 가 없다`);

    if (event.type === 'read') {
      const box = boxIndex(scene, p.box);
      const value = num(p, 'value');
      const line = num(p, 'line');
      return {
        ...scene,
        boxes: scene.boxes.map((b) => ({ ...b })),
        readLine: line,
        cursor: line,
        stopped: false,
        current: box,
        lastRead: value,
        step: { kind: 'read', box, value, fromLine: scene.cursor },
      };
    }

    if (event.type === 'write') {
      const box = boxIndex(scene, p.box);
      const width = num(p, 'width');
      const line = num(p, 'line');
      const target = scene.boxes[box];
      if (!target) throw new Error(`forced-sync-layout: 상자 ${box} 가 없다`);
      return {
        ...scene,
        boxes: scene.boxes.map((b, i) => (i === box ? { ...b, styled: width } : { ...b })),
        cursor: line,
        stopped: false,
        current: box,
        dirty: true,
        step: { kind: 'write', box, was: target.styled, width, fromLine: scene.cursor },
      };
    }

    if (event.type === 'layout') {
      const reason = p.reason;
      if (reason !== 'forced' && reason !== 'frame') {
        throw new Error(`forced-sync-layout: 모르는 레이아웃 까닭: ${String(reason)}`);
      }
      const widths = p.widths;
      if (
        !Array.isArray(widths) ||
        widths.length !== scene.boxes.length ||
        !widths.every((w): w is number => typeof w === 'number')
      ) {
        throw new Error('forced-sync-layout: payload.widths 가 상자 수만큼의 수가 아니다');
      }
      const count = num(p, 'count');
      if (count !== scene.layouts.length + 1) {
        throw new Error(`forced-sync-layout: 레이아웃 수가 이어지지 않는다: ${count}`);
      }
      const forced = reason === 'forced';
      const box = forced ? boxIndex(scene, p.box) : null;
      const cursor = forced ? num(p, 'line') : scene.code.length;
      return {
        ...scene,
        boxes: scene.boxes.map((b, i) => ({ ...b, laid: widths[i] as number })),
        cursor,
        stopped: forced,
        current: box,
        dirty: false,
        layouts: [...scene.layouts, reason],
        lastRead: forced ? null : scene.lastRead,
        step: {
          kind: 'layout',
          reason,
          box,
          before: scene.boxes.map((b) => b.laid),
          fromLine: scene.cursor,
        },
      };
    }

    throw new Error(`forced-sync-layout: 모르는 이벤트: ${event.type}`);
  },
};
