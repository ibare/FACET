/**
 * invalidationCascade — 층마다 앞 층의 열쇠를 품어 캐시 열쇠를 만들 때, 바뀜이 어디까지 번지는가.
 *
 * 층을 차례대로 하나씩 지난다. 층 열쇠 = FNV-1a(앞 층 새 열쇠 + "|" + 층 식별자 + "|" + 파일 지문).
 * 지난번 내용으로 셈한 여섯 열쇠가 캐시에 있다. 이번 열쇠가 캐시에 있으면 꺼내 쓰고, 없으면 다시 한다.
 *
 * 이벤트
 *   init   (silent: true)
 *     payload: {
 *       files:   { name: string; fpBefore: string; fpAfter: string }[]   // 지문은 소문자 16진 여덟 자
 *       oldKeys: string[]                                                // 지난번 층 열쇠, 층 차례
 *     }
 *   layer  (silent 아님 — 걸음 하나 = 층 하나)
 *     payload: {
 *       index:       number    // 층 차례 (0 부터)
 *       prevKey:     string    // 앞 층의 새 열쇠 (첫 층은 빈 글자)
 *       fileFp:      string    // 이번 파일 지문 (파일 없는 층은 빈 글자)
 *       key:         string    // 이번 열쇠
 *       hit:         boolean   // 이번 열쇠가 캐시에 있는가
 *       prevChanged: boolean   // 앞 층 열쇠가 지난번과 다른가
 *       fileChanged: boolean   // 제 파일 지문이 지난번과 다른가
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type InvalidationCascadeLayer = {
  /** 층 식별자 — 열쇠 셈에 그대로 들어간다. 표시 이름은 messages 의 label.* */
  id: string;
  /** 이 층이 가져오는 파일 이름. 없으면 null */
  file: string | null;
};

export type InvalidationCascadeFile = {
  name: string;
  before: string;
  after: string;
};

export type InvalidationCascadeFacetData = {
  type: 'invalidation-cascade';
  stepMs: number;
  layers: InvalidationCascadeLayer[];
  files: InvalidationCascadeFile[];
};

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32 비트, UTF-8 바이트 위. 소문자 16진 여덟 자. */
export function fnv1a32(text: string): string {
  let h = FNV_OFFSET;
  for (const b of new TextEncoder().encode(text)) {
    h ^= b;
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export type LayerKey = {
  prevKey: string;
  fileFp: string;
  key: string;
};

/** 한 판(지난번 또는 이번)의 파일 내용으로 층 열쇠를 차례로 셈한다. */
export function layerKeys(
  layers: readonly InvalidationCascadeLayer[],
  contentOf: (file: string) => string,
): LayerKey[] {
  const out: LayerKey[] = [];
  let prev = '';
  for (const layer of layers) {
    const fileFp = layer.file === null ? '' : fnv1a32(contentOf(layer.file));
    const key = fnv1a32(`${prev}|${layer.id}|${fileFp}`);
    out.push({ prevKey: prev, fileFp, key });
    prev = key;
  }
  return out;
}

function fileLookup(
  files: readonly InvalidationCascadeFile[],
  side: 'before' | 'after',
): (name: string) => string {
  return (name) => {
    const found = files.find((f) => f.name === name);
    if (!found) throw new Error(`invalidationCascade: 층이 가져오는 파일 "${name}" 이 files 에 없다`);
    return found[side];
  };
}

export async function invalidationCascade(
  ctx: FacetContext<InvalidationCascadeFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<InvalidationCascadeFacetData>;
  const { layers, files, stepMs } = ctx.data;
  if (layers.length === 0) throw new Error('invalidationCascade: 층이 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const oldKeys = layerKeys(layers, fileLookup(files, 'before'));
  const newKeys = layerKeys(layers, fileLookup(files, 'after'));
  const cache = new Set(oldKeys.map((k) => k.key));

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      files: files.map((f) => ({ name: f.name, fpBefore: fnv1a32(f.before), fpAfter: fnv1a32(f.after) })),
      oldKeys: oldKeys.map((k) => k.key),
    },
  });

  for (let index = 0; index < layers.length; index += 1) {
    // 걸음 0 은 이미 읽을 것(파일 · 지난번 열쇠)이 있는 화면이라 첫 층 앞에도 머문다.
    if (!(await pause())) return;
    const was = oldKeys[index];
    const now = newKeys[index];
    if (was === undefined || now === undefined) {
      throw new Error(`invalidationCascade: 층 ${index} 의 열쇠를 셈하지 못했다`);
    }
    const hit = cache.has(now.key);
    const prevChanged = was.prevKey !== now.prevKey;
    const fileChanged = was.fileFp !== now.fileFp;
    if (!hit && !prevChanged && !fileChanged) {
      throw new Error(`invalidationCascade: 층 ${index} — 입력이 모두 같은데 열쇠가 캐시에 없다`);
    }
    await ctx.emit({
      type: 'layer',
      payload: {
        index,
        prevKey: now.prevKey,
        fileFp: now.fileFp,
        key: now.key,
        hit,
        prevChanged,
        fileChanged,
      },
    });
  }
}
