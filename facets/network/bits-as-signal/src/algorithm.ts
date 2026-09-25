/**
 * bits-as-signal — 비트 하나가 선 위에서 전압 두 반 칸이 된다 (맨체스터 부호).
 *
 * 규약 (IEEE 802.3 맨체스터):
 *   - 1 = 낮음 → 높음, 0 = 높음 → 낮음. 한 비트 = 반 칸 둘, 가운데서 반드시 뒤집힌다
 *   - 경계 뒤집힘 = 앞 비트의 뒷반 칸과 이번 비트의 앞반 칸이 다를 때. 첫 비트 앞의 경계는 세지 않는다
 *   - 전압은 높음 · 낮음 두 값뿐 (수치 전압 없음)
 *
 * 줄인 자리: 비트 차례는 **높은 자리 먼저** 다. 실제 이더넷은 바이트의 낮은 자리부터
 * 보낸다 — 읽기 쉽게 줄였고, 설명 글이 밝힌다. 화면에는 두지 않는다.
 *
 * 견줌: 같은 비트를 전압 = 비트 값으로 그대로 싣는 줄(1 = 높음, 0 = 낮음)을 함께 셈한다.
 * 그 줄의 뒤집힘은 비트가 바뀌는 경계에서만 생긴다.
 *
 * 이벤트
 *   init  (silent)  { char: string; byte: number; bits: (0|1)[] }
 *                   바이트에서 뽑은 비트 열 (높은 자리 먼저). 걸음 0 을 갈아 끼운다
 *   bit             { index: number; bit: 0|1; halves: ['H'|'L', 'H'|'L'];
 *                     edge: boolean;        — 이번 비트 앞 경계에서 맨체스터 선이 뒤집혔는가
 *                     levelFlip: boolean;   — 이번 비트 앞 경계에서 그대로 싣는 선이 뒤집혔는가
 *                     mid: number; edges: number; levelFlips: number;  — 여기까지의 뒤집힘 수
 *                     held: { from: number; len: number } | null }
 *                   — 그대로 싣는 선이 뒤집히지 않고 머문 가장 긴 구간 (여기까지, 길이 2 이상일 때만.
 *                     같으면 앞의 것)
 *
 * 걸음 0 은 문자와 비트 열이 이미 읽을 것이라 첫 bit 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BitsAsSignalFacetData = {
  type: 'bits-as-signal';
  /** 선에 실을 문자 하나 (자료 — 번역하지 않는다) */
  char: string;
  stepMs: number;
};

export type Level = 'H' | 'L';

/** 맨체스터 부호의 두 반 칸 — 1 = 낮음 → 높음, 0 = 높음 → 낮음 */
function manchester(bit: 0 | 1): [Level, Level] {
  return bit === 1 ? ['L', 'H'] : ['H', 'L'];
}

function narrow(data: unknown): BitsAsSignalFacetData {
  if (typeof data !== 'object' || data === null) throw new Error('bits-as-signal: 자료가 없다');
  const d = data as Record<string, unknown>;
  const char = d['char'];
  const stepMs = d['stepMs'];
  if (typeof char !== 'string' || char.length !== 1) {
    throw new Error(`bits-as-signal: char 는 문자 하나여야 한다 (받은 것: ${String(char)})`);
  }
  const code = char.charCodeAt(0);
  if (code > 0xff) throw new Error(`bits-as-signal: '${char}' 는 바이트 하나에 담기지 않는다`);
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('bits-as-signal: stepMs 가 없다');
  return { type: 'bits-as-signal', char, stepMs };
}

export async function bitsAsSignal(context: FacetContext<BitsAsSignalFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<BitsAsSignalFacetData>;
  const { char, stepMs } = narrow(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const byte = char.charCodeAt(0);
  const bits: (0 | 1)[] = [];
  for (let k = 7; k >= 0; k -= 1) {
    if (ctx.cancelled) return;
    bits.push(((byte >> k) & 1) === 1 ? 1 : 0);
  }

  await ctx.emit({ type: 'init', payload: { char, byte, bits: [...bits] }, silent: true });

  let mid = 0;
  let edges = 0;
  let levelFlips = 0;
  let prevBack: Level | null = null;
  let runFrom = 0;
  let held: { from: number; len: number } | null = null;

  for (let i = 0; i < bits.length; i += 1) {
    if (!(await pause())) return;
    const bit = bits[i];
    if (bit === undefined) throw new Error(`bits-as-signal: 비트 ${i} 가 없다`);
    const halves = manchester(bit);
    if (halves[0] === halves[1]) throw new Error(`bits-as-signal: 비트 ${i} 에 가운데 뒤집힘이 없다`);
    mid += 1;
    const edge = prevBack !== null && prevBack !== halves[0];
    if (edge) edges += 1;
    const before = i > 0 ? bits[i - 1] : undefined;
    const levelFlip = before !== undefined && before !== bit;
    if (levelFlip) {
      levelFlips += 1;
      runFrom = i;
    }
    const runLen = i - runFrom + 1;
    if (runLen >= 2 && (held === null || runLen > held.len)) held = { from: runFrom, len: runLen };
    prevBack = halves[1];

    await ctx.emit({
      type: 'bit',
      payload: {
        index: i,
        bit,
        halves: [halves[0], halves[1]],
        edge,
        levelFlip,
        mid,
        edges,
        levelFlips,
        held: held === null ? null : { from: held.from, len: held.len },
      },
    });
  }
}
