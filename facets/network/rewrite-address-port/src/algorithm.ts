/**
 * rewrite-address-port — NAT 가 나가는 패킷의 칸을 갈아 끼운다.
 *
 * 모형 (실제 NAT 를 줄인 자리):
 *   - 나가는 패킷마다 보낸 이 주소 → 공인 주소, 보낸 이 포트 → 새 포트(firstPort 부터 차례로 하나씩).
 *   - 받는 이 주소 · 포트는 손대지 않는다.
 *   - 체크섬 고쳐 쓰기와 들어오는 쪽(답을 되돌리기)은 다루지 않는다. 바꾼 대응을 적어 두는 표도 그리지 않는다.
 *   - 새 포트 번호와 두 기기의 같은 보낸 이 포트는 예로 정한 값이다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   arrive           { index: number }                              패킷 index 가 안쪽에서 NAT 경계에 닿는다
 *   rewrite-address  { index: number; was: string; now: string }    보낸 이 주소 칸: was 가 빠지고 now 가 끼워진다
 *   rewrite-port     { index: number; was: number; now: number; next: number }
 *                                                                   보낸 이 포트 칸: was 가 빠지고 now 가 끼워진다.
 *                                                                   next 는 다음 패킷이 받을 포트. 칸을 바꾼 패킷은 밖으로 나간다
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 채운다 (두 패킷이 안쪽에 서 있다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface Endpoint {
  address: string;
  port: number;
}

export interface OutgoingPacket {
  src: Endpoint;
  dst: Endpoint;
}

export interface RewriteAddressPortFacetData {
  type: 'rewrite-address-port';
  stepMs: number;
  /** NAT 장치의 공인 주소 */
  publicAddress: string;
  /** 처음 내줄 새 포트. 그 뒤로 하나씩 늘린다 */
  firstPort: number;
  /** 안쪽 기기가 보내는 패킷, 이 차례로 경계를 넘는다 */
  packets: OutgoingPacket[];
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function readAddress(v: unknown, where: string): string {
  if (typeof v !== 'string') throw new Error(`rewrite-address-port: ${where} 주소가 글자가 아니다`);
  const m = IPV4.exec(v);
  if (!m) throw new Error(`rewrite-address-port: ${where} 주소 "${v}" 는 점 네 개 십진 꼴이 아니다`);
  for (const part of m.slice(1)) {
    if (Number(part) > 255) throw new Error(`rewrite-address-port: ${where} 주소 "${v}" 의 칸이 255 를 넘는다`);
  }
  return v;
}

function readPort(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 65535) {
    throw new Error(`rewrite-address-port: ${where} 포트 ${String(v)} 는 1–65535 의 정수가 아니다`);
  }
  return v;
}

function readEndpoint(v: unknown, where: string): Endpoint {
  if (typeof v !== 'object' || v === null) throw new Error(`rewrite-address-port: ${where} 가 없다`);
  const o = v as Record<string, unknown>;
  return { address: readAddress(o.address, where), port: readPort(o.port, where) };
}

/** initialData 를 좁힌다. 모르는 모양은 던진다 (C6). 새 객체를 돌려준다. */
export function readRewriteData(raw: unknown): RewriteAddressPortFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('rewrite-address-port: initialData 가 없다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'rewrite-address-port') throw new Error(`rewrite-address-port: type 이 다르다 (${String(o.type)})`);
  const stepMs = o.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('rewrite-address-port: stepMs 가 양수가 아니다');
  const publicAddress = readAddress(o.publicAddress, '공인');
  const firstPort = readPort(o.firstPort, '첫 새');
  if (!Array.isArray(o.packets) || o.packets.length === 0) throw new Error('rewrite-address-port: packets 가 비었다');
  const packets = o.packets.map((p: unknown, i: number): OutgoingPacket => {
    if (typeof p !== 'object' || p === null) throw new Error(`rewrite-address-port: 패킷 ${i + 1} 이 객체가 아니다`);
    const q = p as Record<string, unknown>;
    return { src: readEndpoint(q.src, `패킷 ${i + 1} 보낸 이`), dst: readEndpoint(q.dst, `패킷 ${i + 1} 받는 이`) };
  });
  readPort(firstPort + packets.length - 1, '마지막 새');
  return { type: 'rewrite-address-port', stepMs, publicAddress, firstPort, packets };
}

export async function rewriteAddressPort(
  context: FacetContext<RewriteAddressPortFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<RewriteAddressPortFacetData>;
  const data = readRewriteData(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 두 패킷이 안쪽에 선 화면이다 — 읽을 틈을 먼저 둔다.
  let nextPort = data.firstPort;
  for (let index = 0; index < data.packets.length; index += 1) {
    if (!(await pause())) return;
    const packet = data.packets[index]!;

    await ctx.emit({ type: 'arrive', payload: { index } });
    if (!(await pause())) return;

    await ctx.emit({
      type: 'rewrite-address',
      payload: { index, was: packet.src.address, now: data.publicAddress },
    });
    if (!(await pause())) return;

    const now = nextPort;
    nextPort += 1;
    await ctx.emit({
      type: 'rewrite-port',
      payload: { index, was: packet.src.port, now, next: nextPort },
    });
  }
}
