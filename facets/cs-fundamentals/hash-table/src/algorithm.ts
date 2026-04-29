/**
 * 해시 테이블 (Hash Table — 분리 체이닝) 자료구조 시각화 알고리즘 — 입력 반응형.
 *
 * mount 직후 자동 시연 (7개 키 시퀀스, 충돌 1회 포함) 후 무한 waitForInput 루프로
 * 사용자 입력 (insert/search/remove/reset) 을 1:1 시각 사건으로 매핑한다.
 *
 * 식별자 (C1):
 *   - `index:<n>` — 슬롯 배열 자리 번호. 표준 prefix `index:` 를 사용한다.
 *
 * 이벤트 (C2):
 *   facet 로컬 (StandardEventType 미포함):
 *     - init                target: -            payload: { M, hashLabel }
 *     - insert              target: index:<i>    payload: { index, key, slot,
 *                                                            isCollision, chainLength,
 *                                                            size, M, alpha,
 *                                                            distribution }
 *     - duplicate-key       target: index:<i>    payload: { index, key, slot }
 *     - search-prepare      payload: { key }
 *     - search-jump         target: index:<i>    payload: { index, key }
 *     - search-chain-step   target: index:<i>    payload: { index, slot, key,
 *                                                            isMatch, isFinal }
 *     - search-result       payload: { found, index?, slot?, key, walked }
 *     - remove-prepare      payload: { key }
 *     - remove-jump         target: index:<i>    payload: { index, key }
 *     - remove-chain-step   target: index:<i>    payload: { index, slot, key,
 *                                                            isMatch, isFinal }
 *     - remove-result       payload: { found, index?, slot?, key, size, M,
 *                                       alpha, distribution }
 *     - rehash-begin        payload: { oldM, newM, hashLabel }
 *     - rehash-step         target: index:<i>    payload: { key, oldIndex,
 *                                                            newIndex, slot }
 *     - rehash-end          payload: { M, size, alpha, distribution, hashLabel }
 *     - alpha-warn          payload: { alpha, level: 'safe' | 'caution' | 'warn' }
 *     - empty-table         payload: { op: 'search' | 'remove' }
 *     - invalid-key         payload: { op: 'insert' | 'search' | 'remove', raw }
 *     - not-found           payload: { op: 'search' | 'remove', key }
 *     - demo-end            payload: {}
 *
 *   메타 (silent):
 *     - phase  payload: { phase: 'auto-demo' | 'idle' | 'insert' | 'search' |
 *                                'remove' | 'rehash' }
 *
 * 메트릭 (C5):
 *   - 'insert-count'     삽입 횟수 (중복 무시 제외)
 *   - 'collision-count'  충돌 횟수 (사슬 길이 ≥ 1 인 자리에 삽입)
 *   - 'search-count'     검색 호출 횟수
 *   - 'remove-count'     삭제 성공 횟수
 *   - 'walk-count'       사슬 안 비교 누적 (search/remove)
 *   - 'rehash-count'     리해싱 발생 횟수
 *
 * 진행 동력은 ReactiveMechanism. registerAlgorithm 시 mechanismKind: 'reactive'.
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type HashTableInputEvent =
  | { type: 'input'; payload?: { name: string; value: string } }
  | { type: 'insert'; payload?: { key?: string } }
  | { type: 'search'; payload?: { key?: string } }
  | { type: 'remove'; payload?: { key?: string } };

export type HashTableFacetData = {
  type: 'hash-table';
  /** 초기 슬롯 수 M (소수 권장, 기본 11). */
  initialM: number;
  /** 리해싱 후 슬롯 수 (기본 23, 다음 소수). */
  rehashM: number;
  /** 적재율 임계 α — 삽입 후 이 값 이상이면 1회 리해싱이 발화. */
  rehashThreshold: number;
  /** 자동 시연 한 키 사이 간격 ms. */
  autoDemoIntervalMs: number;
  /** 사슬 한 칸 짚기 머무는 간격 ms. */
  chainStepMs: number;
  /** 리해싱 한 키 재던지기 머무는 간격 ms. */
  rehashStepMs: number;
  /** 자동 시연 키 시퀀스 (정수 문자열, h(k) = k mod 11 기준 충돌 1회 의도). */
  autoDemoKeys: string[];
};

const ALPHA_CAUTION = 0.5;

function hash(keyNum: number, M: number): number {
  // 음수 키도 안전하게 처리.
  const r = keyNum % M;
  return r < 0 ? r + M : r;
}

function parseKey(raw: string | undefined): { ok: true; n: number; text: string } | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return { ok: true, n, text: trimmed };
}

function distributionOf(buckets: readonly string[][]): {
  empty: number;
  len1: number;
  len2: number;
  len3plus: number;
} {
  let empty = 0;
  let len1 = 0;
  let len2 = 0;
  let len3plus = 0;
  for (const b of buckets) {
    const n = b.length;
    if (n === 0) empty += 1;
    else if (n === 1) len1 += 1;
    else if (n === 2) len2 += 1;
    else len3plus += 1;
  }
  return { empty, len1, len2, len3plus };
}

function alphaLevel(alpha: number, threshold: number): 'safe' | 'caution' | 'warn' {
  if (alpha >= threshold) return 'warn';
  if (alpha >= ALPHA_CAUTION) return 'caution';
  return 'safe';
}

function totalSize(buckets: readonly string[][]): number {
  let n = 0;
  for (const b of buckets) n += b.length;
  return n;
}

export async function hashTable(ctxBase: FacetContext<HashTableFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<HashTableFacetData>;
  const {
    initialM,
    rehashM,
    rehashThreshold,
    autoDemoIntervalMs,
    chainStepMs,
    rehashStepMs,
    autoDemoKeys,
  } = ctx.data;

  // 모델 상태.
  let M = initialM;
  let buckets: string[][] = Array.from({ length: M }, () => []);
  // 학습자가 1회 직접 임계를 발화시키도록 1회만 자동.
  let rehashed = false;

  let lastKey = '';

  function hashLabel(): string {
    return `h(k) = k mod ${M}`;
  }

  async function emitInsert(keyText: string, keyNum: number): Promise<boolean> {
    const i = hash(keyNum, M);
    const slotChain = buckets[i]!;
    if (slotChain.includes(keyText)) {
      await ctx.emit({
        type: 'duplicate-key',
        target: `index:${i}`,
        payload: { index: i, key: keyText, slot: slotChain.indexOf(keyText) },
      });
      return false;
    }
    const wasEmpty = slotChain.length === 0;
    slotChain.push(keyText);
    const slot = slotChain.length - 1;
    const size = totalSize(buckets);
    const alpha = size / M;
    const dist = distributionOf(buckets);
    if (!wasEmpty) ctx.metric('collision-count', 'inc');
    ctx.metric('insert-count', 'inc');
    await ctx.emit({
      type: 'insert',
      target: `index:${i}`,
      payload: {
        index: i,
        key: keyText,
        slot,
        isCollision: !wasEmpty,
        chainLength: slotChain.length,
        size,
        M,
        alpha,
        distribution: dist,
      },
    });
    await ctx.emit({
      type: 'alpha-warn',
      payload: { alpha, level: alphaLevel(alpha, rehashThreshold) },
    });
    return true;
  }

  async function maybeRehash(): Promise<void> {
    if (rehashed) return;
    const size = totalSize(buckets);
    const alpha = size / M;
    if (alpha < rehashThreshold) return;

    const oldM = M;
    const newM = rehashM;
    await ctx.emit({ type: 'phase', payload: { phase: 'rehash' }, silent: true });
    await ctx.emit({
      type: 'rehash-begin',
      payload: { oldM, newM, hashLabel: `h(k) = k mod ${newM}` },
    });

    // 새 표 준비.
    const newBuckets: string[][] = Array.from({ length: newM }, () => []);
    // 키별 재던지기 — 옛 표의 좌→우, 사슬 위→아래 순서로.
    for (let i = 0; i < oldM; i++) {
      const chain = buckets[i]!;
      for (const key of chain) {
        if (ctx.cancelled) return;
        const keyNum = Number(key);
        const newIndex = hash(keyNum, newM);
        const slot = newBuckets[newIndex]!.length;
        newBuckets[newIndex]!.push(key);
        await ctx.emit({
          type: 'rehash-step',
          target: `index:${newIndex}`,
          payload: { key, oldIndex: i, newIndex, slot },
        });
        const ok = await ctx.sleep(rehashStepMs);
        if (!ok || ctx.cancelled) return;
      }
    }

    // 표 교체.
    M = newM;
    buckets = newBuckets;
    rehashed = true;
    ctx.metric('rehash-count', 'inc');

    const sizeAfter = totalSize(buckets);
    const alphaAfter = sizeAfter / M;
    await ctx.emit({
      type: 'rehash-end',
      payload: {
        M,
        size: sizeAfter,
        alpha: alphaAfter,
        distribution: distributionOf(buckets),
        hashLabel: hashLabel(),
      },
    });
  }

  // 0. 초기 통보.
  await ctx.emit({
    type: 'init',
    payload: { M, hashLabel: hashLabel() },
  });

  // 1. 자동 시연 — 키 7개 차례로 (기획 §9 권장 시퀀스).
  await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });
  for (const keyText of autoDemoKeys) {
    if (ctx.cancelled) return;
    const ok = await ctx.sleep(autoDemoIntervalMs);
    if (!ok || ctx.cancelled) return;
    const parsed = parseKey(keyText);
    if (!parsed) continue;
    await ctx.emit({ type: 'phase', payload: { phase: 'insert' }, silent: true });
    await emitInsert(parsed.text, parsed.n);
    // 자동 시연 안에서는 임계를 의도적으로 넘기지 않도록 시퀀스가 설계되어 있음.
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'demo-end' });
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

  // 2. 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;
    let ev: HashTableInputEvent;
    try {
      ev = await ctx.waitForInput<HashTableInputEvent>();
    } catch {
      return;
    }

    if (ev.type === 'input') {
      const name = ev.payload?.name;
      const v = ev.payload?.value;
      if (typeof v === 'string' && name === 'key') lastKey = v;
      continue;
    }

    const rawKey =
      lastKey.trim() !== ''
        ? lastKey
        : typeof ev.payload?.key === 'string'
          ? ev.payload.key
          : '';

    if (ev.type === 'insert') {
      const parsed = parseKey(rawKey);
      if (!parsed) {
        await ctx.emit({ type: 'invalid-key', payload: { op: 'insert', raw: rawKey } });
        continue;
      }
      await ctx.emit({ type: 'phase', payload: { phase: 'insert' }, silent: true });
      const inserted = await emitInsert(parsed.text, parsed.n);
      if (inserted) await maybeRehash();
      continue;
    }

    if (ev.type === 'search') {
      const parsed = parseKey(rawKey);
      if (!parsed) {
        await ctx.emit({ type: 'invalid-key', payload: { op: 'search', raw: rawKey } });
        continue;
      }
      const size = totalSize(buckets);
      if (size === 0) {
        await ctx.emit({ type: 'empty-table', payload: { op: 'search' } });
        continue;
      }
      ctx.metric('search-count', 'inc');
      await ctx.emit({ type: 'phase', payload: { phase: 'search' }, silent: true });
      await ctx.emit({ type: 'search-prepare', payload: { key: parsed.text } });
      const i = hash(parsed.n, M);
      await ctx.emit({
        type: 'search-jump',
        target: `index:${i}`,
        payload: { index: i, key: parsed.text },
      });
      const okJump = await ctx.sleep(chainStepMs);
      if (!okJump || ctx.cancelled) return;

      const chain = buckets[i]!;
      let walked = 0;
      let matchSlot = -1;

      if (chain.length === 0) {
        await ctx.emit({
          type: 'search-result',
          payload: { found: false, key: parsed.text, walked: 0 },
        });
        continue;
      }

      for (let s = 0; s < chain.length; s++) {
        if (ctx.cancelled) return;
        walked += 1;
        const isMatch = chain[s] === parsed.text;
        const isFinal = isMatch || s === chain.length - 1;
        await ctx.emit({
          type: 'search-chain-step',
          target: `index:${i}`,
          payload: { index: i, slot: s, key: chain[s], isMatch, isFinal },
        });
        ctx.metric('walk-count', 'inc');
        const ok = await ctx.sleep(chainStepMs);
        if (!ok || ctx.cancelled) return;
        if (isMatch) {
          matchSlot = s;
          break;
        }
      }

      await ctx.emit({
        type: 'search-result',
        payload:
          matchSlot >= 0
            ? { found: true, index: i, slot: matchSlot, key: parsed.text, walked }
            : { found: false, index: i, key: parsed.text, walked },
      });
      continue;
    }

    if (ev.type === 'remove') {
      const parsed = parseKey(rawKey);
      if (!parsed) {
        await ctx.emit({ type: 'invalid-key', payload: { op: 'remove', raw: rawKey } });
        continue;
      }
      const size = totalSize(buckets);
      if (size === 0) {
        await ctx.emit({ type: 'empty-table', payload: { op: 'remove' } });
        continue;
      }
      await ctx.emit({ type: 'phase', payload: { phase: 'remove' }, silent: true });
      await ctx.emit({ type: 'remove-prepare', payload: { key: parsed.text } });
      const i = hash(parsed.n, M);
      await ctx.emit({
        type: 'remove-jump',
        target: `index:${i}`,
        payload: { index: i, key: parsed.text },
      });
      const okJump = await ctx.sleep(chainStepMs);
      if (!okJump || ctx.cancelled) return;

      const chain = buckets[i]!;
      let matchSlot = -1;

      if (chain.length === 0) {
        await ctx.emit({
          type: 'remove-result',
          payload: {
            found: false,
            index: i,
            key: parsed.text,
            size,
            M,
            alpha: size / M,
            distribution: distributionOf(buckets),
          },
        });
        continue;
      }

      for (let s = 0; s < chain.length; s++) {
        if (ctx.cancelled) return;
        const isMatch = chain[s] === parsed.text;
        const isFinal = isMatch || s === chain.length - 1;
        await ctx.emit({
          type: 'remove-chain-step',
          target: `index:${i}`,
          payload: { index: i, slot: s, key: chain[s], isMatch, isFinal },
        });
        ctx.metric('walk-count', 'inc');
        const ok = await ctx.sleep(chainStepMs);
        if (!ok || ctx.cancelled) return;
        if (isMatch) {
          matchSlot = s;
          break;
        }
      }

      if (matchSlot >= 0) {
        chain.splice(matchSlot, 1);
        ctx.metric('remove-count', 'inc');
      }

      const sizeAfter = totalSize(buckets);
      const alphaAfter = sizeAfter / M;
      await ctx.emit({
        type: 'remove-result',
        payload:
          matchSlot >= 0
            ? {
                found: true,
                index: i,
                slot: matchSlot,
                key: parsed.text,
                size: sizeAfter,
                M,
                alpha: alphaAfter,
                distribution: distributionOf(buckets),
              }
            : {
                found: false,
                index: i,
                key: parsed.text,
                size: sizeAfter,
                M,
                alpha: alphaAfter,
                distribution: distributionOf(buckets),
              },
      });
      await ctx.emit({
        type: 'alpha-warn',
        payload: { alpha: alphaAfter, level: alphaLevel(alphaAfter, rehashThreshold) },
      });
      continue;
    }
  }
}
