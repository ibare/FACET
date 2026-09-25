/**
 * ARP 와 MAC 주소 — 다른 망의 상대에게 세 번 보낼 때 ARP 로 몇 번 묻는가.
 *
 * 프레임은 제 링크를 벗어나지 못한다. 보내는 이는 목적지가 다른 망이면 목적지가 아니라 첫 라우터의
 * MAC 을 묻고, 링크마다 그 링크의 두 끝이 새로 묻는다. IP 쌍은 끝까지 하나이고 MAC 쌍은 링크 수만큼
 * 생긴다. 캐시가 없으면 물음은 링크 수 × 보냄 수로 늘고, 있으면 링크 수에서 멈춘다.
 *
 * 손잡이 둘 — `dest` (0 같은 망 · 1 다른 망, destinations 의 색인) · `cache` (0 없음 · 1 있음,
 * cacheModes 의 색인). 한 판을 끝까지 재생한 뒤 입력을 기다리고, 받은 값으로 다시 재생한다.
 *
 * 걸음 (판 하나 = 1 + 보냄 × 홉 수)
 *   0  pick-next-hop — 보내는 이가 제 IP 와 목적지의 앞 (prefixLength ÷ 8) 옥텟을 견주어 묻는 IP 를 정한다
 *   (보냄 s, 홉 j) 마다 한 걸음 — 그 홉의 보내는 이가 제 표에서 묻는 IP 를 찾는다
 *      없으면 broadcast-ask (요청이 링크에 퍼지고 주인이 답한다, 캐시가 있으면 두 표에 줄) → 데이터 프레임이 건넌다
 *      있으면 from-table (표의 MAC 을 꺼내 데이터 프레임이 곧바로 건넌다)
 *   "끝났다" 는 마지막 보냄의 마지막 홉 걸음 — 셈(`done`)이 그 걸음에 선다
 *
 * 규약 (줄인 자리 — 설명 글이 밝힌다)
 *   - 첫 홉: 앞 옥텟이 같으면 묻는 IP = 목적지, 다르면 게이트웨이. prefixLength 가 8 의 배수가 아니면 던진다
 *   - 다음 홉: 묻는 IP 의 주인(정확히 하나)이 라우터면 routes 의 다음 홉 IP 가 새 묻는 IP, 그 라우터의 다른
 *     인터페이스(정확히 하나)가 나가는 곳. 묻는 IP 가 목적지이면 그 홉이 마지막. 다음 홉 없는 라우터 ·
 *     여덟 홉을 넘는 길은 던진다
 *   - 방송을 듣는 곳 = 그 링크의 인터페이스를 가진 장치 가운데 보내는 이를 뺀 모두 (데이터 차례). 주인만 답
 *   - 캐시 있음: 물음 하나로 묻는 이 표 +(묻는 IP, 주인의 그 링크 MAC) · 주인 표 +(묻는 이의 나가는 IP ·
 *     MAC). 구경꾼은 묻는 이의 줄을 이미 가졌을 때만 같은 값으로 고친다 (이 데이터에서는 한 번도 없다).
 *     줄은 적힌 차례로 쌓이고 만료되지 않는다
 *   - 캐시 없음: 표를 두지 않는다 — 보낼 때마다 모든 홉에서 묻는다 (견주려고 세운 가정)
 *   - 프레임 = 데이터(보냄 × 홉) + 요청(방송 수) + 답(방송 수). MAC 쌍 = 데이터 프레임의 서로 다른
 *     (보낸 이 MAC, 받는 이 MAC) 수. IP 쌍 = 데이터 프레임의 서로 다른 (보낸 이 IP, 받는 이 IP) 수
 *   - TTL · 체크섬 · 라우터의 표 찾기는 셈하지 않는다
 *   - 동률 · 동시: 방송을 들은 곳은 nodes 차례로 싣는다
 *
 * 이벤트 (silent 는 phase 뿐)
 *   phase   { phase: 'pick-next-hop' | 'broadcast-ask' | 'from-table' }                      silent
 *   round   { cache: boolean, srcIp, dstIp, usedLinks: string[], usedNodes: string[] }
 *   pick    { srcIp, dstIp, octets: number, same: boolean, askIp, owner: string, ownerSym }
 *   hop     { send, hop, kind: 'broadcast' | 'table', from, fromSym, to, toSym, link, linkNo,
 *             askIp, heard: string[], heardSyms: string[], srcMac, dstMac, srcIp, dstIp,
 *             broadcastMac, row: number (table 이면 보내는 이 표의 줄 색인, 아니면 −1),
 *             adds: { node, sym, ip, mac }[] (새로 쌓인 줄),
 *             updates: { node, sym, row, ip, mac }[] (이미 있던 줄을 같은 자리에서 고침), newPair: boolean }
 *   done    { broadcasts, fromTable, macPairs, frames, ipPairs }
 *
 * phase 어휘 (irs.ts 와 같다): pick-next-hop · broadcast-ask · from-table
 *
 * 계기 (판마다 차이만 보낸다 — 새 판 머리에서 0 으로)
 *   broadcasts   broadcast-ask 걸음마다 +1
 *   from-table   from-table 걸음마다 +1
 *   mac-pairs    처음 쓰이는 링크의 데이터 프레임이 건널 때 +1
 *   frames       홉 걸음마다 데이터 +1, broadcast-ask 이면 요청 · 답 +2
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ArpIface = { link: string; mac: string; ip: string };
export type ArpNode = { id: string; symbol: string; ifaces: ArpIface[] };
export type ArpRoute = { node: string; next: string };

export type ArpData = {
  type: 'arp';
  stepMs: number;
  nodes: ArpNode[];
  prefixLength: number;
  sender: string;
  gateway: string;
  routes: ArpRoute[];
  destinations: string[];
  cacheModes: string[];
  sends: number;
  broadcastMac: string;
  startDest: number;
  startCache: number;
};

/** 한 홉 — 보내는 이 · 나가는 인터페이스 · 묻는 IP · 주인 · 주인의 그 링크 인터페이스 · 들은 곳 */
export type ArpHop = {
  from: ArpNode;
  out: ArpIface;
  askIp: string;
  owner: ArpNode;
  ownIf: ArpIface;
  heard: ArpNode[];
};

export type ArpTableRow = { ip: string; mac: string };

export type ArpResult = {
  broadcasts: number;
  fromTable: number;
  macPairs: number;
  frames: number;
  ipPairs: number;
  firstAsk: string;
  hops: number;
  steps: number;
  tables: Record<string, ArpTableRow[]>;
};

const MAX_HOPS = 8;

function octetsOf(ip: string): number[] {
  const parts = ip.split('.');
  if (parts.length !== 4) throw new Error(`[arp] IPv4 가 아니다: ${ip}`);
  return parts.map((p) => {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error(`[arp] 옥텟이 아니다: ${ip}`);
    return n;
  });
}

/** 앞 count 옥텟이 같으면 true */
function samePrefix(x: string, y: string, count: number): boolean {
  const a = octetsOf(x);
  const b = octetsOf(y);
  for (let o = 0; o < count; o++) {
    if (a[o] !== b[o]) return false;
  }
  return true;
}

export function prefixOctets(data: ArpData): number {
  if (data.prefixLength % 8 !== 0 || data.prefixLength <= 0 || data.prefixLength > 32) {
    throw new Error(`[arp] 옥텟 경계가 아닌 접두: ${data.prefixLength}`);
  }
  return data.prefixLength / 8;
}

function nodeById(data: ArpData, id: string): ArpNode {
  const n = data.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`[arp] 없는 장치: ${id}`);
  return n;
}

function ownerOf(data: ArpData, ip: string): { node: ArpNode; iface: ArpIface } {
  const hits: { node: ArpNode; iface: ArpIface }[] = [];
  for (const node of data.nodes) {
    for (const iface of node.ifaces) if (iface.ip === ip) hits.push({ node, iface });
  }
  if (hits.length !== 1) throw new Error(`[arp] ${ip} 의 주인이 ${hits.length} 이다`);
  return hits[0]!;
}

function heardOn(data: ArpData, link: string, sender: ArpNode): ArpNode[] {
  return data.nodes.filter((n) => n.id !== sender.id && n.ifaces.some((f) => f.link === link));
}

/** 홉 목록 — 묻는 IP 가 목적지이면 끝 */
export function arpHops(data: ArpData, dstIp: string): ArpHop[] {
  const count = prefixOctets(data);
  const sender = nodeById(data, data.sender);
  if (sender.ifaces.length !== 1) throw new Error('[arp] 보내는 호스트의 인터페이스가 하나가 아니다');
  const srcIf = sender.ifaces[0]!;
  let askIp = samePrefix(srcIf.ip, dstIp, count) ? dstIp : data.gateway;
  const hops: ArpHop[] = [];
  let from = sender;
  let out = srcIf;
  for (let i = 0; i < MAX_HOPS; i++) {
    const own = ownerOf(data, askIp);
    if (own.iface.link !== out.link) throw new Error(`[arp] ${askIp} 이 나가는 링크에 없다`);
    hops.push({ from, out, askIp, owner: own.node, ownIf: own.iface, heard: heardOn(data, out.link, from) });
    if (askIp === dstIp) return hops;
    const route = data.routes.find((r) => r.node === own.node.id);
    if (!route) throw new Error(`[arp] ${own.node.symbol} 에 다음 홉이 없다`);
    const others = own.node.ifaces.filter((f) => f.link !== own.iface.link);
    if (others.length !== 1) throw new Error('[arp] 나가는 인터페이스가 하나가 아니다');
    from = own.node;
    out = others[0]!;
    askIp = route.next;
  }
  throw new Error('[arp] 여덟 홉을 넘는 길');
}

function checkLadder(data: ArpData, dest: number, cache: number): void {
  if (!Number.isInteger(dest) || dest < 0 || dest >= data.destinations.length) {
    throw new Error(`[arp] 사다리 밖 목적지: ${dest}`);
  }
  if (!Number.isInteger(cache) || cache < 0 || cache >= data.cacheModes.length) {
    throw new Error(`[arp] 사다리 밖 캐시: ${cache}`);
  }
}

function cacheOn(data: ArpData, cache: number): boolean {
  const mode = data.cacheModes[cache];
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  throw new Error(`[arp] 모르는 캐시 모드: ${String(mode)}`);
}

/** 한 판의 셈 — 이벤트 없이. 검사와 알고리즘이 같은 길을 쓴다 */
export function arpCompute(data: ArpData, dest: number, cache: number): ArpResult {
  let out: ArpResult | null = null;
  walk(data, dest, cache, () => undefined, (r) => {
    out = r;
  });
  if (!out) throw new Error('[arp] 셈이 끝나지 않았다');
  return out;
}

type Visit = {
  send: number;
  hop: number;
  h: ArpHop;
  kind: 'broadcast' | 'table';
  row: number;
  adds: { node: string; sym: string; ip: string; mac: string }[];
  updates: { node: string; sym: string; row: number; ip: string; mac: string }[];
  newPair: boolean;
};

/** 보냄 × 홉을 차례로 걷는다. visit 은 걸음마다, finish 는 끝에 한 번 */
function walk(
  data: ArpData,
  dest: number,
  cache: number,
  visit: (v: Visit) => void,
  finish: (r: ArpResult) => void,
): void {
  checkLadder(data, dest, cache);
  if (!Number.isInteger(data.sends) || data.sends < 1) throw new Error(`[arp] 보냄 수가 아니다: ${data.sends}`);
  const dstIp = data.destinations[dest]!;
  const on = cacheOn(data, cache);
  const hops = arpHops(data, dstIp);
  const tables: Record<string, ArpTableRow[]> = {};
  for (const n of data.nodes) tables[n.id] = [];
  const pairs = new Set<string>();
  const ipPairs = new Set<string>();
  const srcIp = hops[0]!.out.ip;
  let broadcasts = 0;
  let fromTable = 0;
  for (let s = 0; s < data.sends; s++) {
    for (let j = 0; j < hops.length; j++) {
      const h = hops[j]!;
      const mine = tables[h.from.id]!;
      const row = on ? mine.findIndex((r) => r.ip === h.askIp) : -1;
      const adds: { node: string; sym: string; ip: string; mac: string }[] = [];
      const updates: { node: string; sym: string; row: number; ip: string; mac: string }[] = [];
      let kind: 'broadcast' | 'table';
      if (row >= 0) {
        if (mine[row]!.mac !== h.ownIf.mac) throw new Error('[arp] 표의 MAC 이 주인과 다르다');
        fromTable += 1;
        kind = 'table';
      } else {
        broadcasts += 1;
        kind = 'broadcast';
        if (on) {
          mine.push({ ip: h.askIp, mac: h.ownIf.mac });
          adds.push({ node: h.from.id, sym: h.from.symbol, ip: h.askIp, mac: h.ownIf.mac });
          const theirs = tables[h.owner.id]!;
          const had = theirs.findIndex((r) => r.ip === h.out.ip);
          if (had >= 0) {
            theirs[had] = { ip: h.out.ip, mac: h.out.mac };
            updates.push({ node: h.owner.id, sym: h.owner.symbol, row: had, ip: h.out.ip, mac: h.out.mac });
          } else {
            theirs.push({ ip: h.out.ip, mac: h.out.mac });
            adds.push({ node: h.owner.id, sym: h.owner.symbol, ip: h.out.ip, mac: h.out.mac });
          }
          // 구경꾼은 묻는 이의 줄을 이미 가졌을 때만 같은 값으로 고친다
          for (const b of h.heard) {
            if (b.id === h.owner.id) continue;
            const rows = tables[b.id]!;
            const at = rows.findIndex((r) => r.ip === h.out.ip);
            if (at >= 0) {
              rows[at] = { ip: h.out.ip, mac: h.out.mac };
              updates.push({ node: b.id, sym: b.symbol, row: at, ip: h.out.ip, mac: h.out.mac });
            }
          }
        }
      }
      const key = `${h.out.mac}>${h.ownIf.mac}`;
      const newPair = !pairs.has(key);
      pairs.add(key);
      ipPairs.add(`${srcIp}>${dstIp}`);
      visit({ send: s + 1, hop: j + 1, h, kind, row, adds, updates, newPair });
    }
  }
  finish({
    broadcasts,
    fromTable,
    macPairs: pairs.size,
    frames: data.sends * hops.length + 2 * broadcasts,
    ipPairs: ipPairs.size,
    firstAsk: hops[0]!.askIp,
    hops: hops.length,
    steps: 1 + data.sends * hops.length,
    tables,
  });
}

/**
 * IR 에 건넬 인자 — 그리고 IR 이 전제하는 것(닿는 길)을 먼저 확인한다.
 *
 * IR 의 `countHops` 는 닿지 않으면 −1 을 내고 `arpRun` 은 그때 방송을 세지 않고 −1 을 돌려준다. 여섯
 * 언어에서 던질 수 없으니 여기서 먼저 던진다 (C6):
 *   - 모든 목적지의 길이 닿는다 (arpHops 가 주인 · 다음 홉 · 여덟 홉을 확인한다)
 *   - routes 의 라우터마다 물음을 받는 쪽 IP 가 정확히 하나다 (routerIn)
 * routerIn · routeNext 는 routes 차례로 짝을 이룬다 — IR 은 배열 차례에 기대지 않고 routerIn 에서
 * 묻는 IP 를 찾아 사슬을 따라간다.
 */
export function arpIrArgs(
  data: ArpData,
  dest: number,
  cache: number,
): [number[], number[], number[], number[], number[], number, number, number, number[], number[]] {
  checkLadder(data, dest, cache);
  const inIp = new Map<string, Set<string>>();
  for (const d of data.destinations) {
    for (const h of arpHops(data, d)) {
      if (!data.routes.some((r) => r.node === h.owner.id)) continue;
      const set = inIp.get(h.owner.id) ?? new Set<string>();
      set.add(h.ownIf.ip);
      inIp.set(h.owner.id, set);
    }
  }
  const routerIn: number[] = [];
  const routeNext: number[] = [];
  for (const r of data.routes) {
    const set = inIp.get(r.node);
    if (!set || set.size !== 1) throw new Error(`[arp] ${r.node} 이 물음을 받는 쪽 IP 가 하나가 아니다`);
    routerIn.push(...octetsOf([...set][0]!));
    routeNext.push(...octetsOf(r.next));
  }
  const sender = nodeById(data, data.sender);
  const hops = arpHops(data, data.destinations[dest]!);
  return [
    octetsOf(sender.ifaces[0]!.ip),
    octetsOf(data.destinations[dest]!),
    octetsOf(data.gateway),
    routerIn,
    routeNext,
    prefixOctets(data),
    data.sends,
    cache,
    new Array<number>(Math.max(hops.length, 1 + data.routes.length)).fill(0),
    [0, 0, 0],
  ];
}

function knobValue(raw: unknown, ladder: readonly string[]): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < 0 || raw >= ladder.length) return null;
  return raw;
}

export async function arpAlgorithm(ctx0: FacetContext<ArpData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<ArpData>;
  const data = ctx.data;
  if (data.type !== 'arp') throw new Error(`[arp] 모르는 자료: ${String(data.type)}`);
  let dest = data.startDest;
  let cache = data.startCache;
  checkLadder(data, dest, cache);

  const shown: Record<string, number> = {};
  const show = (name: string, value: number): void => {
    const prev = shown[name];
    shown[name] = value;
    ctx.metric(name, prev === undefined ? value : value - prev);
  };

  try {
    while (!ctx.cancelled) {
      const done = await playRound(ctx, data, dest, cache, show);
      if (!done) return;
      if (ctx.cancelled) return;
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      const payload = input.payload;
      const value = payload && typeof payload === 'object' ? (payload as { value?: unknown }).value : undefined;
      if (input.type === 'dest') {
        const v = knobValue(value, data.destinations);
        if (v === null) continue;
        dest = v;
      } else if (input.type === 'cache') {
        const v = knobValue(value, data.cacheModes);
        if (v === null) continue;
        cache = v;
      } else {
        continue;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}

async function playRound(
  ctx: ReactiveContext<ArpData>,
  data: ArpData,
  dest: number,
  cache: number,
  show: (name: string, value: number) => void,
): Promise<boolean> {
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const on = cacheOn(data, cache);
  arpIrArgs(data, dest, cache); // IR 전제(닿는 길 · 라우터의 받는 쪽 IP)를 먼저 확인 — 어긋나면 던진다
  const dstIp = data.destinations[dest]!;
  const hops = arpHops(data, dstIp);
  const count = prefixOctets(data);
  const first = hops[0]!;
  const same = first.askIp === dstIp;

  // 새 판 머리 — 계기를 0 으로
  show('broadcasts', 0);
  show('from-table', 0);
  show('mac-pairs', 0);
  show('frames', 0);

  const usedNodes: string[] = [];
  for (const h of hops) {
    for (const id of [h.from.id, ...h.heard.map((n) => n.id)]) if (!usedNodes.includes(id)) usedNodes.push(id);
  }
  await ctx.emit({
    type: 'round',
    payload: {
      cache: on,
      srcIp: first.out.ip,
      dstIp,
      usedLinks: hops.map((h) => h.out.link),
      usedNodes,
    },
  });

  // 걸음 0 — 묻는 IP 를 정한다
  await phase('pick-next-hop');
  await ctx.emit({
    type: 'pick',
    payload: {
      srcIp: first.out.ip,
      dstIp,
      octets: count,
      same,
      askIp: first.askIp,
      owner: first.owner.id,
      ownerSym: first.owner.symbol,
    },
  });
  if (!(await ctx.sleep(data.stepMs))) return false;

  // 보냄 × 홉 — 셈은 arpCompute 와 같은 길(walk)로
  const visits: Visit[] = [];
  let result: ArpResult | null = null;
  walk(data, dest, cache, (v) => visits.push(v), (r) => {
    result = r;
  });
  if (!result) throw new Error('[arp] 셈이 끝나지 않았다');
  const final: ArpResult = result;
  const links = [...new Set(data.nodes.flatMap((n) => n.ifaces.map((f) => f.link)))];

  let broadcasts = 0;
  let fromTable = 0;
  let macPairs = 0;
  let frames = 0;
  for (let i = 0; i < visits.length; i++) {
    if (ctx.cancelled) return false;
    const v = visits[i]!;
    const h = v.h;
    if (v.kind === 'broadcast') {
      await phase('broadcast-ask');
      broadcasts += 1;
      frames += 3;
    } else {
      await phase('from-table');
      fromTable += 1;
      frames += 1;
    }
    if (v.newPair) macPairs += 1;
    await ctx.emit({
      type: 'hop',
      payload: {
        send: v.send,
        hop: v.hop,
        kind: v.kind,
        from: h.from.id,
        fromSym: h.from.symbol,
        to: h.owner.id,
        toSym: h.owner.symbol,
        link: h.out.link,
        linkNo: links.indexOf(h.out.link) + 1,
        askIp: h.askIp,
        heard: h.heard.map((n) => n.id),
        heardSyms: h.heard.map((n) => n.symbol),
        srcMac: h.out.mac,
        dstMac: h.ownIf.mac,
        srcIp: first.out.ip,
        dstIp,
        broadcastMac: data.broadcastMac,
        row: v.row,
        adds: v.adds,
        updates: v.updates,
        newPair: v.newPair,
      },
    });
    show('broadcasts', broadcasts);
    show('from-table', fromTable);
    show('mac-pairs', macPairs);
    show('frames', frames);
    if (i === visits.length - 1) {
      if (
        broadcasts !== final.broadcasts ||
        fromTable !== final.fromTable ||
        macPairs !== final.macPairs ||
        frames !== final.frames
      ) {
        throw new Error('[arp] 걸음의 셈과 판의 셈이 다르다');
      }
      await ctx.emit({
        type: 'done',
        payload: {
          broadcasts,
          fromTable,
          macPairs,
          frames,
          ipPairs: final.ipPairs,
        },
      });
    }
    if (!(await ctx.sleep(data.stepMs))) return false;
  }
  return true;
}
