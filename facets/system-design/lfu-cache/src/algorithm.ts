/**
 * LFU 캐시 — 세는 창의 길이로 성격이 갈리는 LFU.
 *
 * 요청 60 (씨앗 42 생성기로 미리 뽑은 목록 — `initialData.requests`) 을 용량 3 의 캐시에 차례로 흘린다.
 * 걸음 하나 = 요청 하나. **창** = 지금 요청을 포함한 가장 최근 W 요청 (W 0 = 처음부터 모두).
 * 키의 횟수 = 창 안에서 그 경로가 나온 수 (캐시 안 LFU — 창이 기억이다).
 *
 * 규약:
 *   - 적중: 셈만 (마지막 쓴 걸음을 갱신)
 *   - 실패: 빈 칸이 있으면 앞쪽 빈 칸을 채운다. 없으면 **창 안 횟수가 가장 적은 키**를 밀어낸다.
 *     횟수가 같으면 **마지막으로 쓴 걸음이 가장 오래된 키** (동률). 마지막 쓴 걸음은 키마다 달라 둘째 동률은 없다.
 *   - 밀려난 칸에 새 키가 든다 — 칸 차례는 판정에 들지 않는다.
 *   - 옛 키 = `lateFrom` 앞 걸음에 나온 경로. 뒤 판(걸음 `lateFrom`..) 의 적중과 옛 키 자리를 센다.
 *   - 어제의 인기 키 = 앞 판에서 가장 많이 나온 경로 (같으면 먼저 나온 것). 그 키가 처음 밀려난 걸음에 표지를 단다.
 *
 * 이벤트 (차례대로):
 *   - `init` (silent) — 판 머리. 걸음 0 을 갈아 끼운다.
 *       { window: number, requests: string[], lateFrom: number (1 부터), capacity: number,
 *         countMax: number (사다리 전체에서 캐시 칸이 가진 횟수의 최대 — 막대 축의 끝),
 *         hotKey: string, motionMs: number }
 *   - `phase` (silent) — { phase: 'hit' | 'fill' | 'evict' }. 걸음마다 `request` 바로 앞에 하나.
 *   - `request` (걸음) — 요청 하나.
 *       { step: number (1 부터), key: string, kind: 'hit' | 'fill' | 'evict', slot: number (0 부터 — 적중 · 채움 · 밀어냄이 닿은 칸),
 *         victim: string | null, tie: boolean (밀어냄에서 가장 적은 횟수가 둘 이상이었나),
 *         windowStart: number (1 부터 — 창의 첫 걸음), hotOut: boolean (어제의 인기 키가 이 걸음에 처음 밀려났나),
 *         slots: { key: string | null, count: number, last: number (1 부터, 빈 칸은 0), old: boolean }[] }
 *
 * phase 어휘: `hit` · `fill` · `evict` (irs.ts 와 같다).
 *
 * 계기 (판 머리에서 0 — 차이만 보낸다):
 *   - `late-hits`      뒤 판 적중
 *   - `old-key-slots`  옛 키 자리 — 뒤 판 걸음마다 옛 키가 든 칸 수의 합
 *
 * 손잡이 `window` — 값은 `initialData.windows` 사다리 (0 = 끝없음).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LfuCacheData = {
  type: 'lfu-cache';
  stepMs: number;
  motionMs: number;
  capacity: number;
  lateFrom: number;
  windows: number[];
  defaultWindow: number;
  requests: string[];
};

export type LfuKind = 'hit' | 'fill' | 'evict';

export type LfuSlot = { key: string | null; count: number; last: number; old: boolean };

export type LfuStep = {
  step: number;
  key: string;
  kind: LfuKind;
  slot: number;
  victim: string | null;
  tie: boolean;
  windowStart: number;
  hotOut: boolean;
  slots: LfuSlot[];
  lateHits: number;
  oldKeySlots: number;
};

export type LfuRun = {
  window: number;
  steps: LfuStep[];
  lateHits: number;
  oldKeySlots: number;
  /** 어제의 인기 키가 처음 밀려난 걸음 (1 부터). 끝까지 남으면 null. */
  hotOutStep: number | null;
  /** 가장 적은 횟수가 둘 이상이던 밀어냄 수. */
  ties: number;
  /** 이 판에서 캐시 칸이 가진 횟수의 최대. */
  maxCount: number;
};

function isPositiveInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x > 0;
}

/** `ctx.data` · 첫 그림의 좁히개 — 모양이 어긋나면 무엇이 어긋났는지 담아 던진다. */
export function readLfuCacheData(raw: unknown): LfuCacheData {
  if (typeof raw !== 'object' || raw === null) throw new Error('lfu-cache: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'lfu-cache') throw new Error(`lfu-cache: type 이 'lfu-cache' 가 아니다 (${String(d.type)})`);
  for (const k of ['stepMs', 'motionMs', 'capacity', 'lateFrom'] as const) {
    if (!isPositiveInt(d[k])) throw new Error(`lfu-cache: ${k} 가 양의 정수가 아니다`);
  }
  const reqs = d.requests;
  if (!Array.isArray(reqs) || reqs.length === 0 || !reqs.every((r) => typeof r === 'string' && r.length > 0)) {
    throw new Error('lfu-cache: requests 가 비지 않은 문자열 목록이 아니다');
  }
  const wins = d.windows;
  if (
    !Array.isArray(wins) ||
    wins.length === 0 ||
    !wins.every((w) => typeof w === 'number' && Number.isInteger(w) && w >= 0)
  ) {
    throw new Error('lfu-cache: windows 가 0 이상 정수 목록이 아니다');
  }
  if (typeof d.defaultWindow !== 'number' || !wins.includes(d.defaultWindow)) {
    throw new Error('lfu-cache: defaultWindow 가 사다리에 없다');
  }
  const lateFrom = d.lateFrom as number;
  if (lateFrom > reqs.length) throw new Error('lfu-cache: lateFrom 이 요청 수를 넘는다');
  return {
    type: 'lfu-cache',
    stepMs: d.stepMs as number,
    motionMs: d.motionMs as number,
    capacity: d.capacity as number,
    lateFrom,
    windows: wins as number[],
    defaultWindow: d.defaultWindow,
    requests: reqs as string[],
  };
}

/** 앞 판에서 가장 많이 나온 경로 — 같으면 먼저 나온 것. */
export function hotKeyOf(data: LfuCacheData): string {
  const front = data.requests.slice(0, data.lateFrom - 1);
  let best: string | null = null;
  let bestN = 0;
  for (const k of front) {
    const n = front.filter((r) => r === k).length;
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  if (best === null) throw new Error('lfu-cache: 앞 판이 비어 어제의 인기 키가 없다');
  return best;
}

/** 한 판을 끝까지 셈한다 — 화면 · 계기 · 검사가 모두 이 셈을 쓴다. */
export function simulateLfu(data: LfuCacheData, window: number): LfuRun {
  if (!Number.isInteger(window) || window < 0) throw new Error(`lfu-cache: 창이 0 이상 정수가 아니다 (${window})`);
  const reqs = data.requests;
  const front = data.lateFrom - 1; // 0 부터 센 뒤 판 첫 색인
  const oldKeys = new Set(reqs.slice(0, front));
  const hotKey = hotKeyOf(data);
  const cache: (string | null)[] = Array.from({ length: data.capacity }, () => null);
  const last = new Map<string, number>();
  const steps: LfuStep[] = [];
  let lateHits = 0;
  let oldKeySlots = 0;
  let hotOutStep: number | null = null;
  let ties = 0;
  let maxCount = 0;

  for (let i = 0; i < reqs.length; i++) {
    const key = reqs[i];
    const start = window === 0 ? 0 : Math.max(0, i - window + 1);
    const countOf = (k: string): number => {
      let c = 0;
      for (let j = start; j <= i; j++) if (reqs[j] === k) c++;
      return c;
    };
    let kind: LfuKind;
    let slot = cache.indexOf(key);
    let victim: string | null = null;
    let tie = false;
    if (slot !== -1) {
      kind = 'hit';
      if (i >= front) lateHits++;
    } else {
      slot = cache.indexOf(null);
      if (slot !== -1) {
        kind = 'fill';
      } else {
        kind = 'evict';
        let best = -1;
        let bestCount = 0;
        let bestLast = 0;
        const counts: number[] = [];
        for (let s = 0; s < cache.length; s++) {
          const k = cache[s];
          if (k === null) throw new Error('lfu-cache: 꽉 찬 캐시에 빈 칸이 있다');
          const lu = last.get(k);
          if (lu === undefined) throw new Error(`lfu-cache: 캐시의 키 ${k} 에 마지막 쓴 걸음이 없다`);
          const c = countOf(k);
          counts.push(c);
          if (best === -1 || c < bestCount || (c === bestCount && lu < bestLast)) {
            best = s;
            bestCount = c;
            bestLast = lu;
          }
        }
        tie = counts.filter((c) => c === bestCount).length > 1;
        if (tie) ties++;
        slot = best;
        victim = cache[best];
        if (victim === hotKey && hotOutStep === null) hotOutStep = i + 1;
      }
      cache[slot] = key;
    }
    last.set(key, i);
    if (i >= front) oldKeySlots += cache.filter((k) => k !== null && oldKeys.has(k)).length;
    const slots: LfuSlot[] = cache.map((k) => {
      if (k === null) return { key: null, count: 0, last: 0, old: false };
      const lu = last.get(k);
      if (lu === undefined) throw new Error(`lfu-cache: 캐시의 키 ${k} 에 마지막 쓴 걸음이 없다`);
      const c = countOf(k);
      if (c > maxCount) maxCount = c;
      return { key: k, count: c, last: lu + 1, old: oldKeys.has(k) };
    });
    steps.push({
      step: i + 1,
      key,
      kind,
      slot,
      victim,
      tie,
      windowStart: start + 1,
      hotOut: hotOutStep === i + 1,
      slots,
      lateHits,
      oldKeySlots,
    });
  }
  return { window, steps, lateHits, oldKeySlots, hotOutStep, ties, maxCount };
}

/** 사다리 전체에서 캐시 칸이 가진 횟수의 최대 — 막대 축의 끝. */
export function countMaxOf(data: LfuCacheData): number {
  let m = 0;
  for (const w of data.windows) m = Math.max(m, simulateLfu(data, w).maxCount);
  return m;
}

export async function lfuCacheAlgorithm(base: FacetContext<LfuCacheData>): Promise<void> {
  const ctx = base as ReactiveContext<LfuCacheData>;
  const data = readLfuCacheData(ctx.data);
  const countMax = countMaxOf(data);
  const hotKey = hotKeyOf(data);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name);
    ctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };
  const phase = (name: LfuKind) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRun = async (window: number): Promise<boolean> => {
    const run = simulateLfu(data, window);
    gauge('late-hits', 0);
    gauge('old-key-slots', 0);
    await ctx.emit({
      type: 'init',
      payload: {
        window,
        requests: [...data.requests],
        lateFrom: data.lateFrom,
        capacity: data.capacity,
        countMax,
        hotKey,
        motionMs: data.motionMs,
      },
      silent: true,
    });
    for (const s of run.steps) {
      if (ctx.cancelled) return false;
      if (s.kind === 'hit') await phase('hit');
      else if (s.kind === 'fill') await phase('fill');
      else await phase('evict');
      await ctx.emit({
        type: 'request',
        payload: {
          step: s.step,
          key: s.key,
          kind: s.kind,
          slot: s.slot,
          victim: s.victim,
          tie: s.tie,
          windowStart: s.windowStart,
          hotOut: s.hotOut,
          slots: s.slots.map((x) => ({ ...x })),
        },
      });
      gauge('late-hits', s.lateHits);
      gauge('old-key-slots', s.oldKeySlots);
      const ok = await ctx.sleep(data.stepMs + data.motionMs);
      if (!ok) return false;
    }
    return true;
  };

  let window = data.defaultWindow;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      const done = await playRun(window);
      if (!done || ctx.cancelled) return;
      // 한 판이 끝났다 — 손잡이를 기다린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'window') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) throw new Error('lfu-cache: window 입력에 payload 가 없다');
        const v = (p as { value?: unknown }).value;
        if (typeof v !== 'number' || !data.windows.includes(v)) {
          throw new Error(`lfu-cache: window 값이 사다리에 없다 (${String(v)})`);
        }
        window = v;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
