/**
 * layer-wraps-payload — 보내는 쪽에서 응용의 데이터가 층을 하나씩 내려가며 봉투를 덧씌운다.
 *
 * 모형 (실제 프로토콜과 어긋나게 줄인 자리):
 *   - 층은 TCP/IP 다섯 층으로 센다. 응용이 데이터를 내놓고, 전송 · 네트워크 · 링크가 차례로 머리를
 *     덧씌운다. 링크는 꼬리(FCS)까지 붙인다.
 *   - 물리 층은 바이트를 덧붙이지 않는다 — 층으로 세우지 않는다. 프리앰블 · 프레임 사이 틈은 세지 않는다.
 *   - 머리의 칸(체크섬 · 길이 · 플래그 …)은 다루지 않고 크기만 센다. 선택 항목은 없다.
 *   - 응용 데이터 100 바이트는 예로 정한 크기다. 내용은 보이지 않는다.
 *   - 받는 쪽은 그리지 않는다 — 벗기는 일은 peer-layer-talk 의 말이다.
 *
 * 이벤트 (모두 silent 아님):
 *   wrap   { layer: 'transport' | 'network' | 'link'; head: number; tail: number; size: number }
 *          한 층을 내려가 그 층의 머리(와 꼬리)가 바깥에 씌워졌다. size = 앞 크기 + head + tail
 *   wire   { total: number; added: number; data: number; share: number }
 *          링크까지 씌운 전체가 선에 오른다. added = total - data, share = data / total
 *
 * 걸음 0 (응용 데이터만) 은 장면의 initial() 이 initialData 에서 채운다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WrapLayerId = 'transport' | 'network' | 'link';

export interface WrapLayerSpec {
  id: WrapLayerId;
  head: number;
  tail: number;
}

export interface LayerWrapsPayloadFacetData {
  type: 'layer-wraps-payload';
  stepMs: number;
  /** 응용 데이터 바이트 수 */
  payload: number;
  /** 위에서 아래 차례로 덧붙는 층 */
  layers: WrapLayerSpec[];
}

/** 이더넷 최소 프레임. 이보다 작으면 채움 바이트가 필요한데, 이 조각은 채움을 다루지 않는다. */
const ETHERNET_MIN_FRAME = 64;

const LAYER_IDS: readonly WrapLayerId[] = ['transport', 'network', 'link'];

function isLayerId(v: unknown): v is WrapLayerId {
  return typeof v === 'string' && (LAYER_IDS as readonly string[]).includes(v);
}

function isByteCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** initialData 를 좁힌다. 알고리즘과 장면이 같은 좁히개를 쓴다. 틀리면 던진다. */
export function readWrapData(raw: unknown): { payload: number; layers: WrapLayerSpec[] } {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('layer-wraps-payload: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  const payload = r.payload;
  if (!isByteCount(payload) || payload === 0) {
    throw new Error(`layer-wraps-payload: payload 가 양의 정수가 아니다 (${String(payload)})`);
  }
  const rawLayers = r.layers;
  if (!Array.isArray(rawLayers) || rawLayers.length === 0) {
    throw new Error('layer-wraps-payload: layers 가 비었거나 배열이 아니다');
  }
  const layers: WrapLayerSpec[] = [];
  rawLayers.forEach((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`layer-wraps-payload: layers[${i}] 가 객체가 아니다`);
    }
    const o = item as Record<string, unknown>;
    if (!isLayerId(o.id)) {
      throw new Error(`layer-wraps-payload: layers[${i}].id 를 모른다 (${String(o.id)})`);
    }
    if (!isByteCount(o.head) || !isByteCount(o.tail)) {
      throw new Error(`layer-wraps-payload: layers[${i}] 의 head · tail 이 바이트 수가 아니다`);
    }
    if (layers.some((l) => l.id === o.id)) {
      throw new Error(`layer-wraps-payload: 층 ${o.id} 가 두 번 나온다`);
    }
    layers.push({ id: o.id, head: o.head, tail: o.tail });
  });
  return { payload, layers };
}

export async function layerWrapsPayload(
  ctx: FacetContext<LayerWrapsPayloadFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<LayerWrapsPayloadFacetData>;
  const { payload, layers } = readWrapData(ctx.data);
  const stepMs = ctx.data.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error(`layer-wraps-payload: stepMs 가 양수가 아니다 (${String(stepMs)})`);
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 (응용 데이터만) 이 이미 읽을 화면이라 첫 걸음 앞에도 문을 둔다.
  let size = payload;
  for (const layer of layers) {
    if (!(await pause())) return;
    size = size + layer.head + layer.tail;
    if (layer.id === 'link' && size < ETHERNET_MIN_FRAME) {
      throw new Error(
        `layer-wraps-payload: 링크 프레임 ${size} 바이트는 최소 ${ETHERNET_MIN_FRAME} 보다 작아 채움이 필요하다 — 이 조각은 채움을 다루지 않는다`,
      );
    }
    await ctx.emit({
      type: 'wrap',
      payload: { layer: layer.id, head: layer.head, tail: layer.tail, size },
    });
  }

  if (!(await pause())) return;
  await ctx.emit({
    type: 'wire',
    payload: { total: size, added: size - payload, data: payload, share: payload / size },
  });
}
