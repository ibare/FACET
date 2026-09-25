/**
 * 최장 접두 일치 — 목적지 주소 하나를 표의 줄마다 맞춰 보고, 맞은 줄 가운데
 * 접두가 가장 긴 줄을 고른다.
 *
 * 규약 (사양):
 * - 줄 하나 맞춰 보기 = 목적지와 줄의 망 주소를 32 비트로 놓고 앞에서부터 접두 길이만큼
 *   견준다. 다 같으면 맞음(길이 L), 하나라도 다르면 그 자리에서 안 맞음. `/0` 은 견줄
 *   비트가 없어 늘 맞는다.
 * - 줄을 표에 적힌 차례로 한 걸음에 하나씩 맞춰 본다. 첫 일치에서 멈추지 않는다.
 * - 다 본 뒤 맞은 줄 가운데 길이가 가장 큰 줄을 고른다. 길이가 같으면 표에서 앞선 줄
 *   (이 데이터에서는 일어나지 않는다).
 * - 라우터 하나 · 패킷 하나 · 표 한 장. 여러 라우터를 거치는 여정은 다루지 않는다.
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음):
 * - `probe` payload `{ row: number; len: number; matched: boolean; same: number }`
 *     row     표에 적힌 차례 (0 부터)
 *     len     그 줄의 접두 길이
 *     matched 접두 길이만큼 다 같은가
 *     same    접두 안에서 앞에서부터 같은 비트 수 (맞으면 len, 안 맞으면 갈린 자리 앞까지)
 * - `pick`  payload `{ row: number; len: number }` — 맞은 줄 가운데 가장 긴 줄
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다(목적지 · 표). 그 화면에 읽을
 * 것이 있으므로 첫 `probe` 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RouteRow = { prefix: string; out: string };

export type LongestPrefixMatchFacetData = {
  type: 'longest-prefix-match';
  stepMs: number;
  /** 목적지 주소 (점 네 개 십진) */
  dest: string;
  /** 표에 적힌 차례 그대로 */
  table: RouteRow[];
};

/** 점 네 개 십진 주소를 32 비트 문자열로. 모양이 틀리면 던진다. */
export function addrBits(addr: string): string {
  const parts = addr.split('.');
  if (parts.length !== 4) throw new Error(`주소 모양이 아니다: ${addr}`);
  return parts
    .map((p) => {
      if (!/^\d{1,3}$/.test(p)) throw new Error(`주소 옥텟이 수가 아니다: ${addr}`);
      const n = Number(p);
      if (n > 255) throw new Error(`주소 옥텟이 255 를 넘는다: ${addr}`);
      return n.toString(2).padStart(8, '0');
    })
    .join('');
}

/** `a.b.c.d/L` 을 망 주소 비트와 길이로. 호스트 비트가 서 있으면 던진다. */
export function parsePrefix(cidr: string): { net: string; bits: string; len: number } {
  const slash = cidr.split('/');
  if (slash.length !== 2) throw new Error(`접두 모양이 아니다: ${cidr}`);
  const [net, lenText] = slash as [string, string];
  if (!/^\d{1,2}$/.test(lenText)) throw new Error(`접두 길이가 수가 아니다: ${cidr}`);
  const len = Number(lenText);
  if (len > 32) throw new Error(`접두 길이가 32 를 넘는다: ${cidr}`);
  const bits = addrBits(net);
  if (bits.slice(len).includes('1')) throw new Error(`호스트 비트가 서 있다: ${cidr}`);
  return { net, bits, len };
}

export async function longestPrefixMatch(
  context: FacetContext<LongestPrefixMatchFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<LongestPrefixMatchFacetData>;
  const { dest, table, stepMs } = ctx.data;
  if (!Array.isArray(table) || table.length === 0) throw new Error('표가 비었다');
  const destBits = addrBits(dest);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let best: { row: number; len: number } | null = null;

  for (let row = 0; row < table.length; row += 1) {
    if (!(await pause())) return;
    const entry = table[row];
    if (!entry) throw new Error(`표의 줄 ${row} 이 없다`);
    const { bits, len } = parsePrefix(entry.prefix);

    // 앞에서부터 접두 길이만큼 견준다. 어긋나면 그 자리에서 멈춘다.
    let same = 0;
    while (same < len && destBits[same] === bits[same]) same += 1;
    const matched = same === len;

    await ctx.emit({ type: 'probe', payload: { row, len, matched, same } });

    // 길이가 같으면 앞선 줄을 둔다 — 엄격히 더 길 때만 바꾼다.
    if (matched && (best === null || len > best.len)) best = { row, len };
  }

  if (best === null) throw new Error(`맞는 줄이 없다: ${dest}`);
  if (!(await pause())) return;
  await ctx.emit({ type: 'pick', payload: { row: best.row, len: best.len } });
}
