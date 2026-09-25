/**
 * peer-layer-talk — 받는 쪽의 층이 아래에서 위로 하나씩 제 머리만 연다.
 *
 * 모형 (줄인 자리 — 설명 글이 밝힌다):
 *  - 두 호스트가 한 선으로 곧장 이어져 있다. 가운데 장치가 없다.
 *  - 층은 TCP/IP 다섯 층으로 센다. 물리 층(번호 0)은 머리를 쓰지 않고 양쪽에 하나씩 있다.
 *  - 보낸 쪽은 머리를 다 씌운 채 시작한다. 씌우는 과정은 걸음으로 보이지 않는다.
 *  - 층이 읽는 것은 제 머리에 적힌 것 하나뿐이다. 적힌 것의 뜻은 판정하지 않는다.
 *
 * 받는 쪽 층은 짐의 맨 바깥 머리를 벗긴다. 그 머리를 누가 썼는지는 보낸 쪽이 위에서 아래로
 * 씌울 때 붙인 꼬리표에서 읽는다 — 같은 층이라는 것을 가정하지 않고 셈한다.
 *
 * 층 k 의 머리를 열지 않고 나른 층의 수 = 보낸 쪽 k 아래 층 + 받는 쪽 k 아래 층 + 양쪽 물리 층.
 *
 * 이벤트:
 *  - `open` (silent 아님) — 받는 쪽의 층 하나가 제 머리를 연다. 아래에서 위 차례.
 *    payload: {
 *      layer: string            // 머리를 연 받는 쪽 층 식별자 (application · transport · network · link)
 *      n: number                // 그 층 번호
 *      writer: string           // 그 머리를 쓴 보낸 쪽 층 — 보낸 쪽이 씌운 짐에서 벗겨 낸 머리의 꼬리표로 셈한다
 *      carriedSender: number    // 보낸 쪽에서 이 머리를 열지 않고 나른 층 (물리 제외)
 *      carriedReceiver: number  // 받는 쪽에서 이 머리를 열지 않고 나른 층 (물리 제외)
 *      carriedPhysical: number  // 양쪽 물리 층
 *      carried: number          // 위 셋의 합
 *    }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 채운다 (머리 넷이 봉한 채 선 위에 있다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LayerId = 'application' | 'transport' | 'network' | 'link' | 'physical';

export const LAYER_IDS: readonly LayerId[] = [
  'application',
  'transport',
  'network',
  'link',
  'physical',
];

/** 머리에 적힌 한 가지. `field` 는 항목 식별자(표시 이름은 messages), `value` 는 번역하지 않는 자료. */
export type PeerHeader = { field: string; value: string };

/** 층 하나. 물리 층은 `header` 가 null 이다. */
export type PeerLayer = { layer: LayerId; n: number; header: PeerHeader | null };

export type PeerLayerTalkFacetData = {
  type: 'peer-layer-talk';
  /** 두 호스트의 식별자 — 보낸 쪽 먼저 */
  hosts: string[];
  /** 위에서 아래 차례의 층 */
  stack: PeerLayer[];
  stepMs: number;
};

function isLayerId(v: unknown): v is LayerId {
  return typeof v === 'string' && (LAYER_IDS as readonly string[]).includes(v);
}

/** initialData 를 좁힌다. 모르는 모양은 던진다. 장면과 그림도 이것을 쓴다. */
export function readPeerData(raw: unknown): PeerLayerTalkFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('peer-layer-talk: 자료가 없다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'peer-layer-talk') throw new Error('peer-layer-talk: type 이 다르다');
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) {
    throw new Error('peer-layer-talk: stepMs 가 양수가 아니다');
  }
  if (!Array.isArray(r.hosts) || r.hosts.length !== 2) {
    throw new Error('peer-layer-talk: 호스트는 둘이다');
  }
  const hosts: string[] = [];
  for (const h of r.hosts) {
    if (typeof h !== 'string' || h === '') throw new Error('peer-layer-talk: 호스트 식별자가 비었다');
    hosts.push(h);
  }
  if (!Array.isArray(r.stack) || r.stack.length === 0) {
    throw new Error('peer-layer-talk: 층이 없다');
  }
  const stack: PeerLayer[] = [];
  for (const [i, item] of r.stack.entries()) {
    if (typeof item !== 'object' || item === null) throw new Error(`peer-layer-talk: 층 ${i} 모양이 틀렸다`);
    const o = item as Record<string, unknown>;
    if (!isLayerId(o.layer)) throw new Error(`peer-layer-talk: 층 ${i} 의 식별자를 모른다`);
    if (typeof o.n !== 'number' || !Number.isInteger(o.n) || o.n < 0) {
      throw new Error(`peer-layer-talk: 층 ${i} 의 번호가 틀렸다`);
    }
    let header: PeerHeader | null = null;
    if (o.header !== null) {
      const hd = o.header;
      if (typeof hd !== 'object' || hd === undefined) {
        throw new Error(`peer-layer-talk: 층 ${o.layer} 의 머리 모양이 틀렸다`);
      }
      const hr = hd as Record<string, unknown>;
      if (typeof hr.field !== 'string' || hr.field === '' || typeof hr.value !== 'string' || hr.value === '') {
        throw new Error(`peer-layer-talk: 층 ${o.layer} 의 머리에 적힌 것이 비었다`);
      }
      header = { field: hr.field, value: hr.value };
    }
    if (o.layer === 'physical' && header !== null) {
      throw new Error('peer-layer-talk: 물리 층은 머리를 쓰지 않는다');
    }
    if (o.layer !== 'physical' && header === null) {
      throw new Error(`peer-layer-talk: 층 ${o.layer} 에 머리가 없다`);
    }
    stack.push({ layer: o.layer, n: o.n, header });
  }
  // 위에서 아래로 번호가 하나씩 줄어 0 에서 끝나야 한다
  for (const [i, l] of stack.entries()) {
    if (l.n !== stack.length - 1 - i) {
      throw new Error(`peer-layer-talk: 층 ${l.layer} 의 번호가 차례와 맞지 않는다`);
    }
  }
  const ids = new Set(stack.map((l) => l.layer));
  if (ids.size !== stack.length) throw new Error('peer-layer-talk: 같은 층이 둘이다');
  return { type: 'peer-layer-talk', hosts, stack, stepMs: r.stepMs };
}

export async function peerLayerTalk(
  context: FacetContext<PeerLayerTalkFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<PeerLayerTalkFacetData>;
  const data = readPeerData(ctx.data);
  const { stepMs, stack } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const physicalPerHost = stack.filter((l) => l.header === null).length;
  const carriedPhysical = physicalPerHost * data.hosts.length;
  // 보낸 쪽이 위에서 아래로 씌운 짐 — 끝이 맨 바깥. 머리마다 쓴 층의 꼬리표가 붙는다
  const frame: { writer: LayerId; n: number }[] = [];
  for (const l of stack) {
    if (ctx.cancelled) return;
    if (l.header !== null) frame.push({ writer: l.layer, n: l.n });
  }
  // 받는 쪽이 여는 차례 — 아래에서 위로
  const opening = stack.filter((l) => l.header !== null).sort((a, b) => a.n - b.n);

  // 걸음 0 (봉한 머리가 선 위에 있다) 을 읽을 틈
  for (const l of opening) {
    if (!(await pause())) return;
    const outer = frame.pop();
    if (outer === undefined) throw new Error(`peer-layer-talk: 층 ${l.layer} 이 벗길 머리가 남지 않았다`);
    // 이 머리를 열지 않고 나른 층 — 보낸 쪽은 쓴 층 아래, 받는 쪽은 연 층 아래의 머리 쓰는 층
    const belowSender = stack.filter((o) => o.header !== null && o.n < outer.n).length;
    const belowReceiver = stack.filter((o) => o.header !== null && o.n < l.n).length;
    await ctx.emit({
      type: 'open',
      payload: {
        layer: l.layer,
        n: l.n,
        writer: outer.writer,
        carriedSender: belowSender,
        carriedReceiver: belowReceiver,
        carriedPhysical,
        carried: belowSender + belowReceiver + carriedPhysical,
      },
    });
  }
}
