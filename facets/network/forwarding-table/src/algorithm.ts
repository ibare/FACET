/**
 * forwarding-table — 라우터가 들어온 패킷마다 표의 줄을 찾아 문으로 내보낸다.
 *
 * 이벤트 (silent 없음):
 *   - `forward` { packet: number; row: number; hop: string; fallback: boolean }
 *       packet   : 도착 차례의 자리 (packets 배열의 번호, 0 부터)
 *       row      : 이 패킷을 맡은 표의 줄 번호 (table 배열의 번호)
 *       hop      : 넘길 곳. 줄의 넘길 곳이 없으면(직접) 목적지 주소 자신
 *       fallback : 기본 줄이 아닌 줄 가운데 맞는 것이 없어 기본 줄(`/0`)이 맡았는가
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 로 세운다 (기다리는 패킷들 · 표).
 * 걸음 0 이 이미 읽을 화면이라 첫 발신 앞에도 stepMs 를 둔다.
 *
 * 줄인 규약 (설명 글이 밝힌다):
 *   - 기본 줄이 아닌 줄들은 서로 겹치지 않는다 — 겹치면 던진다. 겹치는 줄 사이의
 *     고르기(가장 긴 일치)는 이 조각이 다루지 않는다
 *   - 맞는 줄이 없으면 기본 줄. 기본 줄도 없으면 던진다
 *   - 들어온 문은 판정에 쓰지 않는다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface ForwardingRow {
  /** 목적지 망 — `a.b.c.d/len` */
  net: string;
  /** 넘길 곳. null 이면 직접 (목적지 자신에게) */
  hop: string | null;
  /** 나가는 문 — `eth0` 따위 */
  door: string;
}

export interface ForwardingTableFacetData {
  type: 'forwarding-table';
  stepMs: number;
  /** 보내는 이의 주소 */
  sender: string;
  /** 패킷이 들어오는 문 */
  inDoor: string;
  table: ForwardingRow[];
  /** 도착 차례대로 목적지 주소 */
  packets: string[];
}

/** 점 네 개 십진 주소를 32 비트 수로. 모양이 틀리면 던진다. */
export function ipToInt(addr: string): number {
  const parts = addr.split('.');
  if (parts.length !== 4) throw new Error(`forwarding-table: 주소 모양이 아니다 — ${addr}`);
  let v = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) throw new Error(`forwarding-table: 주소 모양이 아니다 — ${addr}`);
    const n = Number(p);
    if (n > 255) throw new Error(`forwarding-table: 주소 칸이 255 를 넘는다 — ${addr}`);
    v = v * 256 + n;
  }
  return v;
}

/** `a.b.c.d/len` 을 망 수와 접두 길이로. 호스트 비트가 서 있으면 던진다. */
export function parseNet(cidr: string): { base: number; len: number } {
  const [addr, lenText, extra] = cidr.split('/');
  if (addr === undefined || lenText === undefined || extra !== undefined || !/^\d{1,2}$/.test(lenText)) {
    throw new Error(`forwarding-table: 망 모양이 아니다 — ${cidr}`);
  }
  const len = Number(lenText);
  if (len > 32) throw new Error(`forwarding-table: 접두 길이가 32 를 넘는다 — ${cidr}`);
  const base = ipToInt(addr);
  const size = 2 ** (32 - len);
  if (base % size !== 0) throw new Error(`forwarding-table: 호스트 비트가 서 있다 — ${cidr}`);
  return { base, len };
}

/** 주소가 망 안에 드는가 */
export function inNet(addr: string, cidr: string): boolean {
  const { base, len } = parseNet(cidr);
  const size = 2 ** (32 - len);
  const a = ipToInt(addr);
  return a >= base && a < base + size;
}

export async function forwardingTable(
  context: FacetContext<ForwardingTableFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ForwardingTableFacetData>;
  const { table, packets, stepMs } = ctx.data;

  const defaults = table.map((r, i) => ({ r, i })).filter(({ r }) => parseNet(r.net).len === 0);
  if (defaults.length > 1) throw new Error('forwarding-table: 기본 줄이 둘 이상이다');
  const specific = table.map((r, i) => ({ r, i })).filter(({ r }) => parseNet(r.net).len > 0);

  // 기본 줄이 아닌 줄끼리 겹치지 않는지 — 겹침의 고르기는 이 조각의 말이 아니다
  for (const a of specific) {
    for (const b of specific) {
      if (a.i === b.i) continue;
      const bAddr = b.r.net.split('/')[0] as string;
      if (inNet(bAddr, a.r.net)) {
        throw new Error(`forwarding-table: 줄이 겹친다 — ${a.r.net} · ${b.r.net}`);
      }
    }
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let p = 0; p < packets.length; p += 1) {
    if (!(await pause())) return;
    const dst = packets[p] as string;
    const hits = specific.filter(({ r }) => inNet(dst, r.net));
    if (hits.length > 1) throw new Error(`forwarding-table: ${dst} 에 맞는 줄이 둘 이상이다`);
    const hit = hits[0] ?? defaults[0];
    if (hit === undefined) throw new Error(`forwarding-table: ${dst} 에 맞는 줄도 기본 줄도 없다`);
    const hop = hit.r.hop ?? dst;
    await ctx.emit({
      type: 'forward',
      payload: { packet: p, row: hit.i, hop, fallback: hits.length === 0 },
    });
  }
}
