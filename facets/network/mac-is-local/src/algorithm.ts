/**
 * mac-is-local — 다른 망의 상대에게 보낼 때 프레임의 받는 이 MAC 은 누구의 것인가.
 *
 * 지나는 차례(path)의 이웃한 두 장치마다 둘이 함께 가진 링크를 찾고, 그 링크의 프레임을 셈한다.
 *   보내는 이 MAC = 앞 장치의 그 링크 인터페이스 MAC
 *   받는 이 MAC   = 뒤 장치의 그 링크 인터페이스 MAC
 *   IP 쌍         = (보내는 이의 IP, 받는 이의 IP) — 모든 링크에서 같다
 *
 * 줄인 자리 (설명 글이 밝힌다):
 *   - IP 헤더는 주소 두 칸만 보인다. TTL · 체크섬은 hop 마다 바뀌지만 다루지 않는다
 *   - 라우터가 다음 MAC 을 어떻게 알았는지는 묻지 않는다 (ARP 는 이웃 조각의 몫)
 *   - 길 찾기는 하지 않는다. 지나는 차례는 데이터다
 *
 * 이벤트:
 *   init    (silent) { path: string[]; links: string[]; ports: { node, link, mac }[];
 *                      srcIp: string; dstIp: string }
 *           — 바탕. links[i] 는 path[i] 와 path[i+1] 이 함께 가진 링크
 *   frame   { hop: number; link: string; from: number; to: number; srcMac: string; dstMac: string;
 *             srcIp: string; dstIp: string; final: boolean }
 *           — hop 번째 링크의 프레임이 path[from] 에서 path[to] 로 건너간다.
 *             final 은 받는 이 MAC 이 최종 상대의 MAC 인가
 *   swap    { at: number; left: number; hop: number; link: string; srcMac: string; dstMac: string }
 *           — path[at] 에서 left 번째 링크의 MAC 쌍이 남고, hop 번째 링크의 새 쌍이 붙는다
 *   deliver { at: number; left: number; links: number; macPairs: number; macs: number; ipPairs: number }
 *           — 최종 상대가 받는다. left 번째 링크의 쌍도 남고, 셈을 보인다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MacIsLocalIface = { link: string; mac: string; ip: string };
export type MacIsLocalNode = { id: string; ifaces: MacIsLocalIface[] };

export type MacIsLocalFacetData = {
  type: 'mac-is-local';
  stepMs: number;
  nodes: MacIsLocalNode[];
  path: string[];
  src: string;
  dst: string;
};

type Frame = {
  link: string;
  srcMac: string;
  dstMac: string;
  srcIp: string;
  dstIp: string;
};

function nodeOf(nodes: Map<string, MacIsLocalNode>, id: string): MacIsLocalNode {
  const n = nodes.get(id);
  if (n === undefined) throw new Error(`mac-is-local: 장치 ${id} 가 nodes 에 없다`);
  return n;
}

function ifaceOn(node: MacIsLocalNode, link: string): MacIsLocalIface {
  const hits = node.ifaces.filter((f) => f.link === link);
  if (hits.length !== 1) {
    throw new Error(`mac-is-local: ${node.id} 의 ${link} 인터페이스가 ${hits.length} 개`);
  }
  return hits[0] as MacIsLocalIface;
}

function sharedLink(a: MacIsLocalNode, b: MacIsLocalNode): string {
  const lb = new Set(b.ifaces.map((f) => f.link));
  const common = [...new Set(a.ifaces.map((f) => f.link))].filter((l) => lb.has(l));
  if (common.length !== 1) {
    throw new Error(`mac-is-local: ${a.id}-${b.id} 가 함께 가진 링크가 ${common.length} 개`);
  }
  return common[0] as string;
}

/** 끝 장치는 인터페이스가 하나여야 IP 가 정해진다 */
function soleIp(node: MacIsLocalNode): string {
  if (node.ifaces.length !== 1) {
    throw new Error(`mac-is-local: 끝 장치 ${node.id} 의 인터페이스가 ${node.ifaces.length} 개`);
  }
  return (node.ifaces[0] as MacIsLocalIface).ip;
}

export async function macIsLocal(ctx: FacetContext<MacIsLocalFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<MacIsLocalFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const nodes = new Map<string, MacIsLocalNode>();
  for (const n of data.nodes) {
    if (nodes.has(n.id)) throw new Error(`mac-is-local: 장치 ${n.id} 가 둘`);
    nodes.set(n.id, n);
  }
  const path = data.path;
  if (path.length < 2) throw new Error('mac-is-local: 지나는 차례가 둘보다 짧다');
  if (path[0] !== data.src || path[path.length - 1] !== data.dst) {
    throw new Error('mac-is-local: 지나는 차례의 양 끝이 보내는 이 · 받는 이와 다르다');
  }
  const pathNodes = path.map((id) => nodeOf(nodes, id));
  const srcIp = soleIp(nodeOf(nodes, data.src));
  const dstIp = soleIp(nodeOf(nodes, data.dst));
  const dstMac = (nodeOf(nodes, data.dst).ifaces[0] as MacIsLocalIface).mac;

  const frames: Frame[] = [];
  for (let i = 0; i + 1 < pathNodes.length; i += 1) {
    if (ctx.cancelled) return;
    const from = pathNodes[i] as MacIsLocalNode;
    const to = pathNodes[i + 1] as MacIsLocalNode;
    const link = sharedLink(from, to);
    frames.push({
      link,
      srcMac: ifaceOn(from, link).mac,
      dstMac: ifaceOn(to, link).mac,
      srcIp,
      dstIp,
    });
  }

  const ports: { node: string; link: string; mac: string }[] = [];
  for (const n of pathNodes) {
    if (ctx.cancelled) return;
    for (const f of n.ifaces) ports.push({ node: n.id, link: f.link, mac: f.mac });
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { path: [...path], links: frames.map((f) => f.link), ports, srcIp, dstIp },
  });

  for (let hop = 0; hop < frames.length; hop += 1) {
    if (!(await pause())) return;
    const f = frames[hop] as Frame;
    if (hop > 0) {
      await ctx.emit({
        type: 'swap',
        payload: { at: hop, left: hop - 1, hop, link: f.link, srcMac: f.srcMac, dstMac: f.dstMac },
      });
      if (!(await pause())) return;
    }
    await ctx.emit({
      type: 'frame',
      payload: {
        hop,
        link: f.link,
        from: hop,
        to: hop + 1,
        srcMac: f.srcMac,
        dstMac: f.dstMac,
        srcIp: f.srcIp,
        dstIp: f.dstIp,
        final: f.dstMac === dstMac,
      },
    });
  }

  if (!(await pause())) return;
  const macs = new Set<string>();
  for (const f of frames) {
    macs.add(f.srcMac);
    macs.add(f.dstMac);
  }
  await ctx.emit({
    type: 'deliver',
    payload: {
      at: path.length - 1,
      left: frames.length - 1,
      links: frames.length,
      macPairs: new Set(frames.map((f) => `${f.srcMac}>${f.dstMac}`)).size,
      macs: macs.size,
      ipPairs: new Set(frames.map((f) => `${f.srcIp}>${f.dstIp}`)).size,
    },
  });
}
