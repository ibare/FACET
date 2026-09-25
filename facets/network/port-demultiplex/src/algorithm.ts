/**
 * 포트 역다중화 — 한 주소로 들어온 조각들을 호스트는 받는 포트로 갈라 응용에 건넨다.
 *
 * 줄인 자리 (설명 글이 밝힌다):
 * - 가르는 열쇠는 받는 포트 하나다. 듣고 있는 소켓만 있는 것으로 줄였다 — 연결된 소켓이
 *   보낸 주소 · 보낸 포트까지 열쇠로 쓰는 일은 다루지 않는다.
 * - 전송 방식(UDP · TCP)의 다름은 말하지 않는다.
 *
 * 이벤트 (모두 silent 아님)
 * - `deliver` — 조각 하나가 받는 포트로 응용을 찾아 닿았다.
 *   payload: {
 *     index: number;     // 들어온 차례 (1 부터)
 *     srcAddr: string;   // 보낸 주소
 *     srcPort: number;   // 보낸 포트
 *     dstAddr: string;   // 받는 주소 (호스트 주소와 같다 — 다르면 던진다)
 *     dstPort: number;   // 받는 포트 — 가르는 열쇠
 *     app: string;       // 그 포트를 듣는 응용의 식별자
 *   }
 *
 * 걸음 0 은 호스트와 듣는 응용뿐이다 — 장면의 `initial()` 이 initialData 에서 채운다.
 * 읽을 것이 있는 화면이라 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ListeningApp = { id: string; port: number };

export type IncomingSegment = {
  srcAddr: string;
  srcPort: number;
  dstAddr: string;
  dstPort: number;
};

export type PortDemultiplexFacetData = {
  type: 'port-demultiplex';
  stepMs: number;
  /** 받는 호스트의 주소 */
  host: string;
  /** 듣고 있는 응용 — 식별자와 포트 */
  apps: ListeningApp[];
  /** 들어오는 조각, 들어오는 차례대로 */
  segments: IncomingSegment[];
};

function isPort(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 65535;
}

/** 듣는 포트 → 응용 식별자. 같은 포트를 둘이 들으면 가를 수 없으니 던진다. */
export function listenTable(apps: readonly ListeningApp[]): Map<number, string> {
  const table = new Map<number, string>();
  for (const app of apps) {
    if (typeof app.id !== 'string' || app.id === '') {
      throw new Error('port-demultiplex: 응용의 식별자가 비었다');
    }
    if (!isPort(app.port)) {
      throw new Error(`port-demultiplex: 응용 ${app.id} 의 포트가 포트 범위 밖이다`);
    }
    const taken = table.get(app.port);
    if (taken !== undefined) {
      throw new Error(`port-demultiplex: 포트 ${app.port} 를 ${taken} · ${app.id} 가 함께 듣는다`);
    }
    table.set(app.port, app.id);
  }
  return table;
}

export async function portDemultiplex(
  context: FacetContext<PortDemultiplexFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<PortDemultiplexFacetData>;
  const { host, apps, segments, stepMs } = ctx.data;
  if (typeof host !== 'string' || host === '') {
    throw new Error('port-demultiplex: 받는 호스트의 주소가 없다');
  }
  if (!Array.isArray(apps) || !Array.isArray(segments)) {
    throw new Error('port-demultiplex: apps · segments 가 배열이 아니다');
  }
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('port-demultiplex: stepMs 가 양수가 아니다');
  }
  const table = listenTable(apps);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let i = 0; i < segments.length; i += 1) {
    // 걸음 0 을 읽을 틈 — 첫 발신 앞에도 문을 둔다
    if (!(await pause())) return;
    const seg = segments[i];
    if (seg === undefined) throw new Error(`port-demultiplex: 조각 ${i + 1} 이 비었다`);
    const { srcAddr, srcPort, dstAddr, dstPort } = seg;
    if (typeof srcAddr !== 'string' || srcAddr === '' || !isPort(srcPort)) {
      throw new Error(`port-demultiplex: 조각 ${i + 1} 의 보낸 쪽이 온전하지 않다`);
    }
    if (dstAddr !== host) {
      throw new Error(
        `port-demultiplex: 조각 ${i + 1} 의 받는 주소 ${String(dstAddr)} 가 호스트 ${host} 와 다르다`,
      );
    }
    if (!isPort(dstPort)) {
      throw new Error(`port-demultiplex: 조각 ${i + 1} 의 받는 포트가 포트 범위 밖이다`);
    }
    const app = table.get(dstPort);
    if (app === undefined) {
      throw new Error(`port-demultiplex: 조각 ${i + 1} 의 받는 포트 ${dstPort} 를 듣는 응용이 없다`);
    }
    await ctx.emit({
      type: 'deliver',
      payload: { index: i + 1, srcAddr, srcPort, dstAddr, dstPort, app },
    });
  }
}
