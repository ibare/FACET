/**
 * handshake-lemma 알고리즘 — 간선을 하나씩 놓으며 양 끝 정점의 차수를 하나씩 올린다.
 *
 * 무향 · 단순 그래프다. 고리 간선(두 끝이 같은 간선)과 겹친 간선은 데이터 오류로 던진다.
 * 정점의 차수는 그 정점에 닿은 간선 수이고, 차수 합은 차수를 **더해서** 얻는다
 * (간선 수의 두 배로 적지 않는다).
 *
 * 이벤트 (발신 차례대로):
 *
 * - `init` (silent) — 간선을 놓기 전의 바탕. 걸음 0 을 갈아 끼운다.
 *   payload `{ vertices: number[]; degrees: number[]; sum: number; edges: number }`
 *   - `degrees[i]` 는 `vertices[i]` 의 차수 (모두 0), `sum` 은 그 합, `edges` 는 놓인 간선 수 (0)
 *
 * - `place` — 간선 하나를 놓는다. 걸음 하나.
 *   payload `{ index: number; u: number; v: number; fromU: number; toU: number;
 *              fromV: number; toV: number; sum: number; edges: number }`
 *   - `index` 는 데이터의 간선 차례 (0 부터), `u` · `v` 는 두 끝 정점 이름
 *   - `fromU → toU` · `fromV → toV` 는 두 끝의 차수가 이 간선으로 바뀐 값
 *   - `sum` 은 이 걸음 뒤 차수를 모두 더한 값, `edges` 는 이 걸음 뒤 놓인 간선 수
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HandshakeLemmaFacetData = {
  type: 'handshake-lemma';
  /** 정점 이름 (정수). 이 차례가 그림의 차례다. */
  vertices: number[];
  /** 놓는 차례대로의 간선. 각 간선은 두 끝 정점 이름. */
  edges: Array<[number, number]>;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

/**
 * 자료 좁히개 — 모양을 보고 어긋나면 필드 경로를 담아 던진다.
 * 알고리즘과 장면이 같은 좁히개를 부른다.
 */
export function narrowHandshakeData(raw: unknown): HandshakeLemmaFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('handshake-lemma: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'handshake-lemma') {
    throw new Error(`handshake-lemma: initialData.type 이 'handshake-lemma' 가 아니다 (${String(d.type)})`);
  }
  if (!Array.isArray(d.vertices) || d.vertices.length < 2) {
    throw new Error('handshake-lemma: initialData.vertices 는 정점 둘 이상의 배열이어야 한다');
  }
  const vertices: number[] = [];
  d.vertices.forEach((v, i) => {
    if (!isInt(v)) throw new Error(`handshake-lemma: initialData.vertices[${i}] 가 정수가 아니다`);
    if (vertices.includes(v)) throw new Error(`handshake-lemma: initialData.vertices[${i}] 정점 ${v} 가 겹친다`);
    vertices.push(v);
  });
  if (!Array.isArray(d.edges) || d.edges.length === 0) {
    throw new Error('handshake-lemma: initialData.edges 는 간선 하나 이상의 배열이어야 한다');
  }
  const edges: Array<[number, number]> = [];
  const seen = new Set<string>();
  d.edges.forEach((e, i) => {
    if (!Array.isArray(e) || e.length !== 2 || !isInt(e[0]) || !isInt(e[1])) {
      throw new Error(`handshake-lemma: initialData.edges[${i}] 는 정수 둘의 배열이어야 한다`);
    }
    const u: number = e[0];
    const v: number = e[1];
    if (!vertices.includes(u)) throw new Error(`handshake-lemma: initialData.edges[${i}][0] 정점 ${u} 가 없다`);
    if (!vertices.includes(v)) throw new Error(`handshake-lemma: initialData.edges[${i}][1] 정점 ${v} 가 없다`);
    if (u === v) throw new Error(`handshake-lemma: initialData.edges[${i}] 는 고리 간선이다 (${u})`);
    const key = u < v ? `${u}-${v}` : `${v}-${u}`;
    if (seen.has(key)) throw new Error(`handshake-lemma: initialData.edges[${i}] 는 겹친 간선이다 (${key})`);
    seen.add(key);
    edges.push([u, v]);
  });
  if (!isInt(d.stepMs) || d.stepMs < 0) {
    throw new Error('handshake-lemma: initialData.stepMs 는 0 이상의 정수여야 한다');
  }
  return { type: 'handshake-lemma', vertices, edges, stepMs: d.stepMs };
}

/** 차수를 모두 더한다. */
function sumOf(degrees: readonly number[]): number {
  let s = 0;
  for (const d of degrees) s += d;
  return s;
}

export async function handshakeLemma(
  context: FacetContext<HandshakeLemmaFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<HandshakeLemmaFacetData>;
  const data = narrowHandshakeData(ctx.data);
  const { vertices, edges, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const degrees = vertices.map(() => 0);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { vertices: [...vertices], degrees: [...degrees], sum: sumOf(degrees), edges: 0 },
  });

  // 걸음 0 은 정점 여섯과 차수 0 이 이미 읽을 화면이라 첫 간선 앞에도 머문다.
  for (let i = 0; i < edges.length; i += 1) {
    if (!(await pause())) return;
    const [u, v] = edges[i]!;
    const iu = vertices.indexOf(u);
    const iv = vertices.indexOf(v);
    const fromU = degrees[iu]!;
    const fromV = degrees[iv]!;
    degrees[iu] = fromU + 1;
    degrees[iv] = fromV + 1;
    await ctx.emit({
      type: 'place',
      payload: {
        index: i,
        u,
        v,
        fromU,
        toU: degrees[iu]!,
        fromV,
        toV: degrees[iv]!,
        sum: sumOf(degrees),
        edges: i + 1,
      },
    });
  }
}
