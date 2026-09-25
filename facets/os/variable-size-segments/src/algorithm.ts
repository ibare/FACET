/**
 * variableSizeSegments — 세그멘테이션은 프로그램을 뜻의 경계에서 자른다.
 *
 * 프로그램의 세그먼트(코드 · 데이터 · 힙 · 스택)는 길이가 서로 다르다. 자른 덩어리를
 * 세그먼트 차례로 메모리의 **처음 맞는 틈**(주소가 가장 낮고 길이가 모자라지 않은 틈)의
 * **앞 끝**에 넣고, 넣을 때마다 세그먼트 표에 한 줄(시작 · 길이)을 적는다.
 *
 * 값은 모두 예로 정한 것이다 — 실제 시스템에서 잰 크기가 아니다. 크기 단위는 KiB.
 *
 * 규약
 *   - 틈은 이미 찬 자리(와 앞서 넣은 세그먼트)에서 셈한다. 주소 차례, 이웃한 틈은 하나로 친다
 *   - 넣기는 세그먼트 차례로, 처음 맞는 틈의 앞 끝에
 *   - 걸음: 처음 · 잘림(한 걸음) · 세그먼트마다 넣기 한 걸음. 나가는 것은 없다
 *   - 맞는 틈이 없거나 자리가 겹치거나 메모리를 벗어나면 던진다 (셈할 수 없는 상태)
 *
 * 이벤트
 *   init   (silent) payload { holes: Hole[] }
 *          찬 자리에서 셈한 처음 틈. 걸음 0 의 바탕을 채운다
 *   cut    payload {}
 *          프로그램이 뜻의 경계에서 세그먼트로 갈라진다
 *   place  payload { id: string, start: number, size: number,
 *                    into: Hole, skipped: Hole[], holes: Hole[] }
 *          세그먼트 id 가 into 틈의 앞 끝(start)에 놓인다. skipped 는 그 앞에서 짧아
 *          지나친 틈들, holes 는 넣은 뒤의 틈 목록
 *
 *   Hole = { start: number, size: number }   (KiB)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type UsedKind = 'os' | 'process';

export type VariableSizeSegmentsFacetData = {
  type: 'variable-size-segments';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 메모리 전체 크기 (KiB) */
  memoryKiB: number;
  /** 이미 찬 자리 */
  used: { id: string; kind: UsedKind; start: number; size: number }[];
  /** 프로그램의 세그먼트, 넣는 차례 그대로 */
  segments: { id: string; size: number }[];
};

export type Hole = { start: number; size: number };

type Block = { id: string; start: number; size: number };

/** 찬 자리에서 빈 틈을 셈한다. 겹치거나 메모리를 벗어나면 던진다. */
function freeHoles(blocks: readonly Block[], total: number): Hole[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const holes: Hole[] = [];
  let cur = 0;
  for (const b of sorted) {
    if (b.start < cur) throw new Error(`variableSizeSegments: '${b.id}' 자리가 앞 자리와 겹친다 (시작 ${b.start})`);
    if (b.start + b.size > total) throw new Error(`variableSizeSegments: '${b.id}' 가 메모리 ${total} KiB 를 벗어난다`);
    if (b.start > cur) holes.push({ start: cur, size: b.start - cur });
    cur = b.start + b.size;
  }
  if (cur < total) holes.push({ start: cur, size: total - cur });
  return holes;
}

function checkData(d: VariableSizeSegmentsFacetData): void {
  const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (!isCount(d.memoryKiB) || d.memoryKiB === 0) throw new Error('variableSizeSegments: memoryKiB 가 양의 정수가 아니다');
  if (!isCount(d.stepMs)) throw new Error('variableSizeSegments: stepMs 가 0 이상의 정수가 아니다');
  if (!Array.isArray(d.used) || !Array.isArray(d.segments)) throw new Error('variableSizeSegments: used · segments 가 배열이 아니다');
  if (d.segments.length === 0) throw new Error('variableSizeSegments: 세그먼트가 없다');
  const ids = new Set<string>();
  for (const u of d.used) {
    if (typeof u.id !== 'string' || u.id === '') throw new Error('variableSizeSegments: 찬 자리의 식별자가 비었다');
    if (u.kind !== 'os' && u.kind !== 'process') throw new Error(`variableSizeSegments: '${u.id}' 의 kind 를 모른다`);
    if (!isCount(u.start) || !isCount(u.size) || u.size === 0) throw new Error(`variableSizeSegments: '${u.id}' 의 시작 · 길이가 틀렸다`);
    if (ids.has(u.id)) throw new Error(`variableSizeSegments: 식별자 '${u.id}' 가 겹친다`);
    ids.add(u.id);
  }
  for (const s of d.segments) {
    if (typeof s.id !== 'string' || s.id === '') throw new Error('variableSizeSegments: 세그먼트 식별자가 비었다');
    if (!isCount(s.size) || s.size === 0) throw new Error(`variableSizeSegments: 세그먼트 '${s.id}' 의 길이가 틀렸다`);
    if (ids.has(s.id)) throw new Error(`variableSizeSegments: 식별자 '${s.id}' 가 겹친다`);
    ids.add(s.id);
  }
}

export async function variableSizeSegments(
  ctxBase: FacetContext<VariableSizeSegmentsFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<VariableSizeSegmentsFacetData>;
  const data = ctx.data;
  checkData(data);
  const { stepMs, memoryKiB } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const blocks: Block[] = data.used.map((u) => ({ id: u.id, start: u.start, size: u.size }));

  await ctx.emit({ type: 'init', payload: { holes: freeHoles(blocks, memoryKiB) }, silent: true });

  // 걸음 0 은 이미 읽을 것이 있는 화면(통째인 프로그램 · 찬 메모리)이다 — 읽을 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'cut', payload: {} });

  for (const seg of data.segments) {
    if (!(await pause())) return;
    const holes = freeHoles(blocks, memoryKiB);
    const i = holes.findIndex((h) => h.size >= seg.size);
    if (i < 0) throw new Error(`variableSizeSegments: '${seg.id}' (${seg.size} KiB) 가 들어갈 틈이 없다`);
    const into = holes[i];
    if (into === undefined) throw new Error('variableSizeSegments: 틈 목록이 어긋났다');
    const skipped = holes.slice(0, i);
    blocks.push({ id: seg.id, start: into.start, size: seg.size });
    await ctx.emit({
      type: 'place',
      payload: {
        id: seg.id,
        start: into.start,
        size: seg.size,
        into: { start: into.start, size: into.size },
        skipped,
        holes: freeHoles(blocks, memoryKiB),
      },
    });
  }
}
