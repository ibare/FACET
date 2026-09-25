/**
 * NAT 매핑 테이블 — 나가는 패킷마다 줄을 적고, 들어온 답은 받는 포트로 그 줄을 되짚는다.
 *
 * 규약 (실제 NAT 를 줄인 자리 — 설명 글이 밝힌다):
 * - 표의 한 줄 = 공인 포트 ↔ 안쪽 주소:포트. 먼 쪽 주소:포트도 함께 적되 찾는 열쇠가 아니다.
 * - 찾는 열쇠는 들어온 패킷의 **받는 포트 하나**다. 먼 쪽을 따지지 않는 가장 단순한 NAT.
 * - 새 공인 포트는 `firstPort` 부터 나가는 차례대로 하나씩 늘린다 (예로 정한 값).
 * - 줄은 재생 동안 지워지지 않는다 (시간 만료 없음). 줄이 없는 포트로 온 패킷은 버린다.
 * - 한 걸음 = 패킷 하나.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩):
 * - `write`  { port: number; inside: Endpoint; remote: Endpoint }
 *     나가는 패킷이 공인 포트 `port` 의 줄을 적었다.
 * - `return` { port: number; remote: Endpoint; inside: Endpoint }
 *     `remote` 에서 `port` 로 들어온 답이 적힌 줄을 찾아 `inside` 로 돌아갔다.
 * - `drop`   { port: number; remote: Endpoint }
 *     `remote` 에서 `port` 로 들어온 패킷이 줄을 못 찾아 경계에서 버려졌다.
 *
 * Endpoint = { addr: string; port: number }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Endpoint = { addr: string; port: number };

export type NatOutgoing = { from: Endpoint; to: Endpoint };
export type NatIncoming = { from: Endpoint; toPort: number };

export type NatMappingTableFacetData = {
  type: 'nat-mapping-table';
  stepMs: number;
  publicAddr: string;
  firstPort: number;
  outgoing: NatOutgoing[];
  incoming: NatIncoming[];
};

type Row = { inside: Endpoint; remote: Endpoint };

export async function natMappingTable(
  context: FacetContext<NatMappingTableFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<NatMappingTableFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const table = new Map<number, Row>();
  let nextPort = data.firstPort;

  // 걸음 0 은 빈 표와 양쪽 끝이 이미 서 있는 화면이다 — 읽을 틈을 먼저 준다.
  for (const out of data.outgoing) {
    if (!(await pause())) return;
    const port = nextPort;
    if (table.has(port)) {
      throw new Error(`공인 포트 ${port} 에 이미 줄이 있다`);
    }
    table.set(port, { inside: { ...out.from }, remote: { ...out.to } });
    nextPort += 1;
    await ctx.emit({
      type: 'write',
      payload: { port, inside: { ...out.from }, remote: { ...out.to } },
    });
  }

  for (const inc of data.incoming) {
    if (!(await pause())) return;
    const row = table.get(inc.toPort);
    if (row === undefined) {
      await ctx.emit({
        type: 'drop',
        payload: { port: inc.toPort, remote: { ...inc.from } },
      });
    } else {
      await ctx.emit({
        type: 'return',
        payload: { port: inc.toPort, remote: { ...inc.from }, inside: { ...row.inside } },
      });
    }
  }
}
