/**
 * LRU 캐시 (Least Recently Used Cache) 자료구조 시각화 알고리즘 — 입력 반응형.
 *
 * mount 직후 자동 시연 (put k1·k2·k3 → get k1, capacity=4) 후 무한 waitForInput 루프로
 * 사용자 입력 (get/put/reset) 을 1:1 시각 사건으로 매핑한다.
 *
 * 식별자 (C1):
 *   - `node:<key>` — 캐시 한 항목 (hash slot ↔ list node 의 공유 식별자).
 *
 * 이벤트 (C2):
 *   facet 로컬 (StandardEventType 미포함):
 *     - init                payload: { capacity }
 *     - get-hit             target: node:<key>
 *                           payload: { key, value, fromListIndex, listOrder,
 *                                      traceIndex }
 *     - get-miss            payload: { key, traceIndex }
 *     - put-update          target: node:<key>
 *                           payload: { key, oldValue, newValue,
 *                                      fromListIndex, listOrder, traceIndex }
 *     - put-insert          target: node:<key>
 *                           payload: { key, value, listOrder, hashSlot,
 *                                      size, capacity, traceIndex }
 *     - put-evict           target: node:<newKey>
 *                           payload: { newKey, newValue, evictedKey,
 *                                      evictedValue, evictedHashSlot,
 *                                      newHashSlot, listOrder, size,
 *                                      capacity, traceIndex }
 *     - invalid-input       payload: { op, raw }
 *     - demo-end            payload: {}
 *
 *   메타 (silent):
 *     - phase  payload: { phase: 'auto-demo' | 'idle' | 'get' | 'put' }
 *
 * 메트릭 (C5):
 *   - 'get-count'        get 호출 횟수
 *   - 'put-count'        put 호출 횟수
 *   - 'hit-count'        get 적중
 *   - 'miss-count'       get 빗나감
 *   - 'eviction-count'   capacity 초과로 LRU 가 축출된 횟수
 *
 * 진행 동력은 ReactiveMechanism. registerAlgorithm 시 mechanismKind: 'reactive'.
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type LruCacheInputEvent =
  | { type: 'input'; payload?: { name: string; value: string } }
  | { type: 'get'; payload?: { key?: string } }
  | { type: 'put'; payload?: { key?: string; value?: string } };

export type LruCacheFacetData = {
  type: 'lru-cache';
  /** 캐시 용량 — 동시에 보관 가능한 키 수. */
  capacity: number;
  /** 자동 시연 한 호출 사이 머무는 간격 ms. */
  autoDemoIntervalMs: number;
  /** 자동 시연 시퀀스 — 데모 진입 시 순서대로 적용. */
  autoDemoSequence: Array<
    | { op: 'put'; key: string; value: string }
    | { op: 'get'; key: string }
  >;
};

type CacheNode = {
  key: string;
  value: string;
  /** hash 슬롯 인덱스 (0..capacity-1). 삽입 때 빈 자리 채움, 축출 시 그 자리 해제. */
  hashSlot: number;
};

function parseKey(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // 키는 짧은 문자열 (영숫자 허용). 시각화 좁은 칸에 들어가야 하므로 길이 제한.
  if (trimmed.length > 6) return null;
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) return null;
  return trimmed;
}

function parseValue(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 6) return null;
  return trimmed;
}

export async function lruCache(ctxBase: FacetContext<LruCacheFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<LruCacheFacetData>;
  const { capacity, autoDemoIntervalMs, autoDemoSequence } = ctx.data;

  // 모델 상태. listOrder 의 0번이 LRU (왼쪽), 끝이 MRU (오른쪽).
  const listOrder: string[] = [];
  const byKey = new Map<string, CacheNode>();
  // hash 슬롯 점유 비트맵.
  const slotOccupied: boolean[] = Array.from({ length: capacity }, () => false);

  let traceIndex = 0;
  let lastKey = '';
  let lastValue = '';

  function nextFreeSlot(): number {
    for (let i = 0; i < capacity; i++) {
      if (!slotOccupied[i]) return i;
    }
    return -1;
  }

  function promote(key: string): number {
    const idx = listOrder.indexOf(key);
    if (idx < 0) return -1;
    listOrder.splice(idx, 1);
    listOrder.push(key);
    return idx;
  }

  async function emitGet(key: string): Promise<void> {
    traceIndex += 1;
    ctx.metric('get-count', 'inc');
    const node = byKey.get(key);
    if (!node) {
      ctx.metric('miss-count', 'inc');
      await ctx.emit({
        type: 'get-miss',
        payload: { key, traceIndex },
      });
      return;
    }
    ctx.metric('hit-count', 'inc');
    const fromListIndex = promote(key);
    await ctx.emit({
      type: 'get-hit',
      target: `node:${key}`,
      payload: {
        key,
        value: node.value,
        fromListIndex,
        listOrder: [...listOrder],
        traceIndex,
      },
    });
  }

  async function emitPut(key: string, value: string): Promise<void> {
    traceIndex += 1;
    ctx.metric('put-count', 'inc');
    const existing = byKey.get(key);
    if (existing) {
      const oldValue = existing.value;
      existing.value = value;
      const fromListIndex = promote(key);
      await ctx.emit({
        type: 'put-update',
        target: `node:${key}`,
        payload: {
          key,
          oldValue,
          newValue: value,
          fromListIndex,
          listOrder: [...listOrder],
          traceIndex,
        },
      });
      return;
    }
    // 새 키.
    if (byKey.size < capacity) {
      const slot = nextFreeSlot();
      slotOccupied[slot] = true;
      byKey.set(key, { key, value, hashSlot: slot });
      listOrder.push(key);
      await ctx.emit({
        type: 'put-insert',
        target: `node:${key}`,
        payload: {
          key,
          value,
          hashSlot: slot,
          listOrder: [...listOrder],
          size: byKey.size,
          capacity,
          traceIndex,
        },
      });
      return;
    }
    // capacity 초과 — LRU 축출.
    const evictedKey = listOrder[0];
    if (evictedKey === undefined) return;
    const evictedNode = byKey.get(evictedKey);
    if (!evictedNode) return;
    listOrder.shift();
    byKey.delete(evictedKey);
    const evictedSlot = evictedNode.hashSlot;
    slotOccupied[evictedSlot] = false;
    ctx.metric('eviction-count', 'inc');

    // 새 키는 방금 비운 자리를 받는다 (MRU 끝에 새로 들어오는 키가 옛 LRU 의 자리를 인계).
    slotOccupied[evictedSlot] = true;
    byKey.set(key, { key, value, hashSlot: evictedSlot });
    listOrder.push(key);

    await ctx.emit({
      type: 'put-evict',
      target: `node:${key}`,
      payload: {
        newKey: key,
        newValue: value,
        evictedKey,
        evictedValue: evictedNode.value,
        evictedHashSlot: evictedSlot,
        newHashSlot: evictedSlot,
        listOrder: [...listOrder],
        size: byKey.size,
        capacity,
        traceIndex,
      },
    });
  }

  // 0. 초기 통보.
  await ctx.emit({
    type: 'init',
    payload: { capacity },
  });

  // 1. 자동 시연 — put/get 시퀀스.
  await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });
  for (const step of autoDemoSequence) {
    if (ctx.cancelled) return;
    const ok = await ctx.sleep(autoDemoIntervalMs);
    if (!ok || ctx.cancelled) return;
    if (step.op === 'put') {
      await ctx.emit({ type: 'phase', payload: { phase: 'put' }, silent: true });
      await emitPut(step.key, step.value);
    } else {
      await ctx.emit({ type: 'phase', payload: { phase: 'get' }, silent: true });
      await emitGet(step.key);
    }
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'demo-end' });
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

  // 2. 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;
    let ev: LruCacheInputEvent;
    try {
      ev = await ctx.waitForInput<LruCacheInputEvent>();
    } catch {
      return;
    }

    if (ev.type === 'input') {
      const name = ev.payload?.name;
      const v = ev.payload?.value;
      if (typeof v === 'string') {
        if (name === 'key') lastKey = v;
        else if (name === 'value') lastValue = v;
      }
      continue;
    }

    if (ev.type === 'get') {
      const rawKey =
        lastKey.trim() !== ''
          ? lastKey
          : typeof ev.payload?.key === 'string'
            ? ev.payload.key
            : '';
      const k = parseKey(rawKey);
      if (k === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'get', raw: rawKey } });
        continue;
      }
      await ctx.emit({ type: 'phase', payload: { phase: 'get' }, silent: true });
      await emitGet(k);
      continue;
    }

    if (ev.type === 'put') {
      const rawKey =
        lastKey.trim() !== ''
          ? lastKey
          : typeof ev.payload?.key === 'string'
            ? ev.payload.key
            : '';
      const rawVal =
        lastValue.trim() !== ''
          ? lastValue
          : typeof ev.payload?.value === 'string'
            ? ev.payload.value
            : '';
      const k = parseKey(rawKey);
      const v = parseValue(rawVal);
      if (k === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'put', raw: rawKey } });
        continue;
      }
      if (v === null) {
        await ctx.emit({ type: 'invalid-input', payload: { op: 'put', raw: rawVal } });
        continue;
      }
      await ctx.emit({ type: 'phase', payload: { phase: 'put' }, silent: true });
      await emitPut(k, v);
      continue;
    }
  }
}
