/**
 * cache-invalidation — 층 캐시는 앞 층의 열쇠를 품으므로 바뀐 층 뒤가 전부 다시 된다.
 *
 * 한 줄로 선 층 여섯(바탕 · 의존 목록 넣기 · 의존 설치 · 소스 넣기 · 빌드 · 테스트)을 층 차례대로 쌓는다.
 * 층 열쇠 = FNV-1a( 앞 층 열쇠 여덟 자(첫 층은 빈 글자) + '|' + 층 식별자 + '|' + 파일 지문 여덟 자(파일 없으면 빈 글자) ),
 * 파일 지문 = FNV-1a(파일 내용). FNV-1a 는 32 비트 — 글자를 UTF-8 바이트로, 처음 값 0x811c9dc5, 바이트마다
 * XOR 뒤 Math.imul(h, 0x01000193) >>> 0. 소문자 16진 여덟 자로 셈하고 잇고 견준다(화면은 앞 여섯 자).
 * 지난번 열쇠는 같은 층 차례로 지난번 파일 내용에서 셈한 것이 모두 캐시에 있다. 새 열쇠가 지난 열쇠와 같으면
 * 꺼내 쓰고(cached), 다르면 다시 한다(redone). 다시 드는 초 = 다시 하는 층의 초의 합.
 *
 * 손잡이 — `layer-order`(층 차례 순번 0..orders.length-1) · `changed-file`(바뀐 파일 순번 0..files.length-1).
 * 바뀐 파일 하나만 이번 내용으로 바꾸고 다른 파일은 지난번 그대로 둔다.
 * 동률 — 고르는 자리가 없다(층은 한 줄이고 차례는 데이터가 정한다). 이 데이터에서 동률이 걸리는 자리 0.
 *
 * 걸음 (한 판 넷, 걸음 경계는 `ctx.sleep(stepMs)` 와 입력 대기):
 *   0  round-start   — 층 차례대로 여섯이 서고 지난 열쇠가 모두 캐시에 · 계기 셋을 0 으로
 *   1  file-changed  — 바뀐 파일의 지문 딱지가 바뀐다
 *   2  cascade       — 새 열쇠가 층마다 서고 꺼내 씀 / 다시 가 갈린다 · cached · redone
 *   3  redo-seconds  — 다시 하는 층의 초가 모여 합이 선다 · redo-seconds
 *
 * 이벤트 (모두 silent 아님):
 *   round-start  { orderIndex: number, orderId: string, allSeconds: number,
 *                  layers: { id: string, file: string | null, seconds: number, prevKey: string }[],
 *                  files: { name: string, print: string, content: string }[] }
 *   file-changed { name: string, before: string, after: string, content: string, layer: string, position: number }
 *                  — position 은 그 파일을 가져오는 층의 자리(1 부터)
 *   cascade      { firstChanged: number, cached: number, redone: number,
 *                  layers: { id: string, newKey: string, verdict: 'cached' | 'own-file' | 'prev-layer' }[] }
 *                  — firstChanged 는 처음 열쇠가 달라진 층의 자리(1 부터). verdict 의 own-file 은 제 파일 지문이
 *                    바뀌어 다시, prev-layer 는 앞 층 열쇠가 바뀌어 다시
 *   redo-seconds { total: number, parts: { id: string, seconds: number }[] }   — parts 는 다시 하는 층만, 층 차례대로
 *   열쇠 · 지문은 모두 여덟 자로 싣는다(화면이 앞 여섯 자를 자른다).
 *
 * phase 어휘 — 없다. IR 을 두지 않아 코드 패널이 없다(irs.ts 의 주석).
 *
 * 계기 (회차마다 새로 — 판 머리에서 0 으로 되돌린다, 누적하지 않는다):
 *   cached        꺼내 쓴 층 수      걸음 2 에 선다
 *   redone        다시 하는 층 수    걸음 2 에 선다
 *   redo-seconds  다시 드는 초       걸음 3 에 선다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CacheLayer = {
  /** 층 식별자 — 열쇠 셈에 들어가는 자료 글자. 표시 이름은 messages 의 label.layer.* */
  id: string;
  /** 이 층이 가져오는 파일 이름. 파일을 가져오지 않는 층은 null */
  file: string | null;
  /** 이 층이 걸리는 초 (예로 정한 값) */
  seconds: number;
};

export type CacheFile = {
  name: string;
  /** 지난번 내용 — 캐시에 있는 열쇠는 이것으로 셈했다 */
  before: string;
  /** 이번 내용 — 바뀐 파일 손잡이가 고른 파일만 이것으로 바꾼다 */
  after: string;
};

export type CacheOrder = {
  /** 층 차례 식별자. 표시 이름은 messages 의 label.order.* */
  id: string;
  /** 층 식별자를 위에서 아래로 */
  layers: string[];
};

export type CacheInvalidationData = {
  type: 'cache-invalidation';
  stepMs: number;
  layers: CacheLayer[];
  files: CacheFile[];
  /** 층 차례 사다리 — 손잡이 layer-order 의 값이 이 순번 */
  orders: CacheOrder[];
  /** 처음 판의 층 차례 순번 */
  initialOrder: number;
  /** 처음 판의 바뀐 파일 순번 (files 의 순번) */
  initialChanged: number;
};

export type CacheVerdict = 'cached' | 'own-file' | 'prev-layer';

export type CacheLayerResult = {
  id: string;
  file: string | null;
  seconds: number;
  prevKey: string;
  newKey: string;
  verdict: CacheVerdict;
};

export type CacheRound = {
  orderId: string;
  changed: string;
  printBefore: string;
  printAfter: string;
  layers: CacheLayerResult[];
  /** 처음 열쇠가 달라진 층의 자리 (1 부터) */
  firstChanged: number;
  cached: number;
  redone: number;
  redoSeconds: number;
  allSeconds: number;
};

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const utf8 = new TextEncoder();

/** FNV-1a 32 비트 — 소문자 16진 여덟 자 */
export function fnv1a(text: string): string {
  let h = FNV_OFFSET;
  for (const byte of utf8.encode(text)) {
    h ^= byte;
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 층 열쇠 사슬 — 차례대로 앞 층 열쇠를 품는다 */
function keyChain(layers: CacheLayer[], prints: Map<string, string>): string[] {
  const keys: string[] = [];
  let prev = '';
  for (const layer of layers) {
    let print = '';
    if (layer.file !== null) {
      const p = prints.get(layer.file);
      if (p === undefined) throw new Error(`cache-invalidation: 층 '${layer.id}' 의 파일 '${layer.file}' 이 files 에 없다`);
      print = p;
    }
    prev = fnv1a(`${prev}|${layer.id}|${print}`);
    keys.push(prev);
  }
  return keys;
}

/** 한 판의 셈 — 층 차례 순번과 바뀐 파일 순번으로 */
export function computeRound(data: CacheInvalidationData, orderIndex: number, changedIndex: number): CacheRound {
  const order = data.orders[orderIndex];
  if (order === undefined) throw new Error(`cache-invalidation: 층 차례 순번 ${orderIndex} 이 사다리에 없다`);
  const changedFile = data.files[changedIndex];
  if (changedFile === undefined) throw new Error(`cache-invalidation: 바뀐 파일 순번 ${changedIndex} 이 files 에 없다`);

  const byId = new Map(data.layers.map((l) => [l.id, l]));
  const layers = order.layers.map((id) => {
    const layer = byId.get(id);
    if (layer === undefined) throw new Error(`cache-invalidation: 층 차례 '${order.id}' 의 층 '${id}' 이 layers 에 없다`);
    return layer;
  });
  if (layers.length !== data.layers.length) {
    throw new Error(`cache-invalidation: 층 차례 '${order.id}' 가 층 ${layers.length} 개 — layers 는 ${data.layers.length} 개`);
  }
  if (!layers.some((l) => l.file === changedFile.name)) {
    throw new Error(`cache-invalidation: 바뀐 파일 '${changedFile.name}' 을 가져오는 층이 없다`);
  }

  const before = new Map(data.files.map((f) => [f.name, fnv1a(f.before)]));
  const after = new Map(before);
  after.set(changedFile.name, fnv1a(changedFile.after));
  const prevKeys = keyChain(layers, before);
  const newKeys = keyChain(layers, after);

  const results: CacheLayerResult[] = layers.map((layer, i) => {
    const prevKey = prevKeys[i];
    const newKey = newKeys[i];
    if (prevKey === undefined || newKey === undefined) throw new Error(`cache-invalidation: 층 '${layer.id}' 의 열쇠를 셈하지 못했다`);
    let verdict: CacheVerdict = 'cached';
    if (prevKey !== newKey) {
      const ownChanged = layer.file !== null && before.get(layer.file) !== after.get(layer.file);
      const aboveChanged = i > 0 && prevKeys[i - 1] !== newKeys[i - 1];
      if (ownChanged) verdict = 'own-file';
      else if (aboveChanged) verdict = 'prev-layer';
      else throw new Error(`cache-invalidation: 층 '${layer.id}' 의 열쇠가 까닭 없이 달라졌다`);
    }
    return { id: layer.id, file: layer.file, seconds: layer.seconds, prevKey, newKey, verdict };
  });

  const firstIdx = results.findIndex((r) => r.verdict !== 'cached');
  if (firstIdx < 0) throw new Error('cache-invalidation: 바뀐 파일이 있는데 달라진 열쇠가 없다');
  const redoneLayers = results.filter((r) => r.verdict !== 'cached');
  const printBefore = before.get(changedFile.name);
  const printAfter = after.get(changedFile.name);
  if (printBefore === undefined || printAfter === undefined) throw new Error(`cache-invalidation: '${changedFile.name}' 의 지문이 없다`);

  return {
    orderId: order.id,
    changed: changedFile.name,
    printBefore,
    printAfter,
    layers: results,
    firstChanged: firstIdx + 1,
    cached: results.length - redoneLayers.length,
    redone: redoneLayers.length,
    redoSeconds: redoneLayers.reduce((s, r) => s + r.seconds, 0),
    allSeconds: results.reduce((s, r) => s + r.seconds, 0),
  };
}

/** 우리 손잡이의 값 — 사다리 밖이거나 수가 아니면 던진다 */
function readKnob(input: { type: string; payload?: unknown }, ladderSize: number): number {
  const p = input.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`cache-invalidation: '${input.type}' 입력에 payload 가 없다`);
  const v = (p as Record<string, unknown>).value;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= ladderSize) {
    throw new Error(`cache-invalidation: '${input.type}' 의 값 ${String(v)} 이 사다리 0..${ladderSize - 1} 에 없다`);
  }
  return v;
}

export async function cacheInvalidationAlgorithm(base: FacetContext<CacheInvalidationData>): Promise<void> {
  const ctx = base as ReactiveContext<CacheInvalidationData>;
  const data = ctx.data;
  let orderIndex = data.initialOrder;
  let changedIndex = data.initialChanged;

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다 (처음은 0 이어도 보낸다)
  const shown = new Map<string, number>();
  const show = (name: string, value: number): void => {
    const now = shown.get(name);
    ctx.metric(name, now === undefined ? value : value - now);
    shown.set(name, value);
  };

  const playRound = async (): Promise<boolean> => {
    const round = computeRound(data, orderIndex, changedIndex);

    // 걸음 0 — 층 차례대로 여섯이 선다
    if (ctx.cancelled) return false;
    show('cached', 0);
    show('redone', 0);
    show('redo-seconds', 0);
    await ctx.emit({
      type: 'round-start',
      payload: {
        orderIndex,
        orderId: round.orderId,
        allSeconds: round.allSeconds,
        layers: round.layers.map((l) => ({ id: l.id, file: l.file, seconds: l.seconds, prevKey: l.prevKey })),
        files: data.files.map((f) => ({ name: f.name, print: fnv1a(f.before), content: f.before })),
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // 걸음 1 — 바뀐 파일의 지문
    if (ctx.cancelled) return false;
    const changedFile = data.files[changedIndex];
    if (changedFile === undefined) throw new Error(`cache-invalidation: 바뀐 파일 순번 ${changedIndex} 이 files 에 없다`);
    const position = round.layers.findIndex((l) => l.file === round.changed) + 1;
    const owner = round.layers[position - 1];
    if (owner === undefined) throw new Error(`cache-invalidation: '${round.changed}' 을 가져오는 층이 없다`);
    await ctx.emit({
      type: 'file-changed',
      payload: {
        name: round.changed,
        before: round.printBefore,
        after: round.printAfter,
        content: changedFile.after,
        layer: owner.id,
        position,
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // 걸음 2 — 새 열쇠가 서고 다시 가 번진다
    if (ctx.cancelled) return false;
    show('cached', round.cached);
    show('redone', round.redone);
    await ctx.emit({
      type: 'cascade',
      payload: {
        firstChanged: round.firstChanged,
        cached: round.cached,
        redone: round.redone,
        layers: round.layers.map((l) => ({ id: l.id, newKey: l.newKey, verdict: l.verdict })),
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // 걸음 3 — 다시 드는 초
    if (ctx.cancelled) return false;
    show('redo-seconds', round.redoSeconds);
    await ctx.emit({
      type: 'redo-seconds',
      payload: {
        total: round.redoSeconds,
        parts: round.layers.filter((l) => l.verdict !== 'cached').map((l) => ({ id: l.id, seconds: l.seconds })),
      },
    });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      // 한 판이 끝나면 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'layer-order') {
          orderIndex = readKnob(input, data.orders.length);
          break;
        }
        if (input.type === 'changed-file') {
          changedIndex = readKnob(input, data.files.length);
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
