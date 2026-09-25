/**
 * networkLayer — 캡슐화와 홉 전달.
 *
 * 응용 데이터 1200 바이트를 n 조각으로 나누어 링크 L 개(A · R1 … · B)를 지나 보낸다.
 * 조각마다 층 머리 · 꼬리(전송 20 · 네트워크 20 · 링크 14 + 4 = 58)를 새로 붙이고,
 * 라우터는 조각 하나를 온전히 받은 뒤에야 넘긴다. 끝 시각을 바이트 시간으로 센다.
 *
 * 규약 (hop-by-hop 과 같다)
 *   - 한 틱 = 조각 하나를 한 링크에 다 싣는 시간. 틱 하나의 길이 = 조각 크기만큼의 바이트 시간
 *     (n 이 다르면 틱 길이가 다르다 — 판 사이 견줌은 바이트 시간으로만 한다)
 *   - 틱 t 에 받은 조각은 t+1 부터 넘긴다. 마디마다 한 틱에 **온전히 가진 조각 가운데 번호가
 *     가장 작은 것 하나**를 옆 마디로 넘긴다. 한 틱의 옮김은 동시다
 *   - 줄인 자리: 링크 속도가 모두 같다 · 전파 · 처리 지연 0 · 줄 설 자리 넉넉 · 길은 한 줄
 *     (라우팅 표 · TTL 없음) · IP 조각화와 이더넷 최소 프레임 채움은 세지 않는다
 *   - 동률: "가장 빠른 쪼갬" 이 둘 이상이면 던진다 (이 데이터의 L 넷 모두 동률이 없다)
 *   - 1200 이 n 으로 나뉘지 않거나 1000 틱 안에 끝나지 않으면 던진다
 *
 * 걸음 — 판 하나 = 틱 수 + 2
 *   0        `round` 을 내고 phase `split`
 *   1 … 틱   `forward` 를 내고 phase `forward`
 *   끝       `finish` 를 내고 phase `finish` — 그 뒤 손잡이 입력을 기다린다
 *
 * 이벤트
 *   round    { split, links, message, pieceSize, headSum, tailSum,
 *              heads: { layer: string; bytes: number }[]  (층 목록 차례 — 위에서 아래),
 *              tails: { layer: string; bytes: number }[],
 *              headerBytes, wireBytes, payloadShare, ticks, finish,
 *              nodes: string[]  (마디 기호 L+1 개),
 *              wireMax, timeMax  (모든 조합에서 가장 긴 선 위 · 가장 늦은 끝 시각 — 축의 끝),
 *              stack: string[] · routerStack: string[]  (호스트 · 라우터 마디의 층 표지 — 식별자),
 *              bars: { split: number; finish: number }[]  (지금 L 의 여섯 n),
 *              fastestSplit }
 *   forward  { tick, elapsed, pieceSize, busyLinks, moves: { piece: number (1 부터); from: number; to: number }[] }
 *            moves 는 조각 번호가 작은 것 먼저 (마디 번호는 0 = A)
 *   finish   { ticks, finish, split, fastestSplit }
 *   phase    { phase } — silent
 *
 * phase 어휘: split · forward · finish (irs.ts 와 같다)
 *
 * 계기
 *   header-bytes   머리 합 — 링크 하나를 지나는 머리 · 꼬리 바이트 (58 × n). 걸음 0 에
 *   payload-share  응용 몫 % — (1200 × 100 + 선 위 // 2) // 선 위. 걸음 0 에
 *   elapsed-time   지난 시간 (바이트 시간) — 틱마다 조각 크기만큼. 걸음 0 에 0 으로 되돌린다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NetworkLayerLayer = { id: string; header: number; trailer: number };

export type NetworkLayerData = {
  type: 'network-layer';
  stepMs: number;
  /** 응용 데이터 바이트 */
  message: number;
  /** 머리 · 꼬리를 붙이는 층 — 위에서 아래 */
  layers: NetworkLayerLayer[];
  /** 호스트가 여는 다섯 층 — 위에서 아래 (식별자) */
  stack: string[];
  /** 라우터 마디의 층 표지 — 네트워크 · 링크 · 물리 (식별자) */
  routerStack: string[];
  splits: number[];
  linkCounts: number[];
  /** 마디 기호 — L 이면 앞 L 개 + 마지막 하나 (A · R1 … · B) */
  nodes: string[];
  split: number;
  links: number;
};

export const MAX_TICKS = 1000;

/** 층 목록에서 머리 합과 꼬리 합 — 조각 하나에 붙는 바이트 */
export function headerTotals(layers: NetworkLayerLayer[]): { head: number; tail: number } {
  if (layers.length === 0) throw new Error('networkLayer: 층 목록이 비었다');
  let head = 0;
  let tail = 0;
  for (const l of layers) {
    if (!Number.isInteger(l.header) || !Number.isInteger(l.trailer) || l.header < 0 || l.trailer < 0) {
      throw new Error(`networkLayer: 층 ${l.id} 의 머리 · 꼬리가 음이 아닌 정수가 아니다`);
    }
    head += l.header;
    tail += l.trailer;
  }
  return { head, tail };
}

export type HopMove = { piece: number; from: number };

/**
 * hop-by-hop 틱 반복. at · ready 는 n 칸 0 으로 시작한다. 틱마다 옮김 목록을 onTick 에 넘긴다.
 * 마디를 가까운 쪽부터 돈다 — 이번 틱에 받은 조각은 ready == t 라 같은 틱에 다시 넘어가지 않는다.
 */
export function hopTicks(pieces: number, links: number, onTick?: (tick: number, moves: HopMove[]) => void): number {
  if (!Number.isInteger(pieces) || pieces < 1) throw new Error(`networkLayer: 조각 수 ${pieces} 가 1 이상 정수가 아니다`);
  if (!Number.isInteger(links) || links < 1) throw new Error(`networkLayer: 링크 수 ${links} 가 1 이상 정수가 아니다`);
  const at = new Array<number>(pieces).fill(0);
  const ready = new Array<number>(pieces).fill(0);
  let t = 0;
  let arrived = 0;
  while (arrived < pieces) {
    if (t >= MAX_TICKS) throw new Error('networkLayer: 끝나지 않는 틱');
    t += 1;
    const moves: HopMove[] = [];
    for (let node = 0; node < links; node += 1) {
      let best = -1;
      for (let p = 0; p < pieces; p += 1) {
        if (best === -1 && at[p] === node && (ready[p] as number) < t) best = p;
      }
      if (best !== -1) {
        at[best] = node + 1;
        ready[best] = t;
        moves.push({ piece: best, from: node });
        if (node + 1 === links) arrived += 1;
      }
    }
    onTick?.(t, moves);
  }
  return t;
}

export type NetworkLayerRound = {
  pieceSize: number;
  ticks: number;
  finish: number;
};

/** 한 판의 조각 크기 · 틱 · 끝 시각 */
export function finishOf(message: number, header: number, pieces: number, links: number): NetworkLayerRound {
  if (message % pieces !== 0) throw new Error(`networkLayer: 메시지 ${message} 가 ${pieces} 로 나뉘지 않는다`);
  const pieceSize = message / pieces + header;
  const ticks = hopTicks(pieces, links);
  return { pieceSize, ticks, finish: ticks * pieceSize };
}

/** 반올림 백분율 — (x * 100 + n // 2) // n */
export function percentOf(x: number, n: number): number {
  if (n <= 0) throw new Error('networkLayer: 백분율의 분모가 0 이하');
  return Math.floor((x * 100 + Math.floor(n / 2)) / n);
}

/** 지금 L 에서 여섯 n 의 끝 시각과 가장 빠른 n (동률이면 던진다) */
export function barsOf(data: NetworkLayerData, links: number): { bars: { split: number; finish: number }[]; fastestSplit: number } {
  const { head, tail } = headerTotals(data.layers);
  const bars = data.splits.map((n) => ({ split: n, finish: finishOf(data.message, head + tail, n, links).finish }));
  let best = bars[0];
  if (best === undefined) throw new Error('networkLayer: 쪼갬 사다리가 비었다');
  for (const b of bars) if (b.finish < best.finish) best = b;
  const ties = bars.filter((b) => b.finish === best.finish).length;
  if (ties !== 1) throw new Error(`networkLayer: 링크 ${links} 에서 가장 빠른 쪼갬이 ${ties} 개로 동률`);
  return { bars, fastestSplit: best.split };
}

/** 모든 손잡이 조합에서 가장 긴 선 위 바이트와 가장 늦은 끝 시각 — 화면 축의 끝 */
export function extentsOf(data: NetworkLayerData): { wireMax: number; timeMax: number } {
  const { head, tail } = headerTotals(data.layers);
  let wireMax = 0;
  let timeMax = 0;
  for (const n of data.splits) {
    wireMax = Math.max(wireMax, data.message + (head + tail) * n);
    for (const l of data.linkCounts) timeMax = Math.max(timeMax, finishOf(data.message, head + tail, n, l).finish);
  }
  if (wireMax <= 0 || timeMax <= 0) throw new Error('networkLayer: 사다리가 비어 축의 끝을 셈할 수 없다');
  return { wireMax, timeMax };
}

type MetricName = 'header-bytes' | 'payload-share' | 'elapsed-time';

export async function networkLayerAlgorithm(ctx0: FacetContext<NetworkLayerData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<NetworkLayerData>;
  const data = ctx.data;
  const shown: Record<MetricName, number> = { 'header-bytes': 0, 'payload-share': 0, 'elapsed-time': 0 };
  // 지금 보이는 값을 들고 차이만 보낸다 — 처음 한 번은 차이가 0 이어도 보낸다
  const setMetric = (name: MetricName, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  if (!data.splits.includes(data.split)) throw new Error(`networkLayer: 처음 쪼갠 수 ${data.split} 가 사다리 밖`);
  if (!data.linkCounts.includes(data.links)) throw new Error(`networkLayer: 처음 링크 수 ${data.links} 가 사다리 밖`);
  let split = data.split;
  let links = data.links;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      // ── 걸음 0 — 쪼개고 씌운다
      const { head, tail } = headerTotals(data.layers);
      const header = head + tail;
      const round = finishOf(data.message, header, split, links);
      const { bars, fastestSplit } = barsOf(data, links);
      if (links + 1 > data.nodes.length) throw new Error(`networkLayer: 링크 ${links} 에 마디 기호가 모자란다`);
      const last = data.nodes[data.nodes.length - 1] as string;
      const nodes = [...data.nodes.slice(0, links), last];
      const headerBytes = header * split;
      const wireBytes = data.message + headerBytes;
      const payloadShare = percentOf(data.message, wireBytes);
      const { wireMax, timeMax } = extentsOf(data);
      await ctx.emit({
        type: 'round',
        payload: {
          split,
          links,
          message: data.message,
          pieceSize: round.pieceSize,
          headSum: head,
          tailSum: tail,
          heads: data.layers.map((l) => ({ layer: l.id, bytes: l.header })),
          tails: data.layers.map((l) => ({ layer: l.id, bytes: l.trailer })),
          headerBytes,
          wireBytes,
          payloadShare,
          ticks: round.ticks,
          finish: round.finish,
          nodes,
          bars,
          fastestSplit,
          wireMax,
          timeMax,
          stack: data.stack,
          routerStack: data.routerStack,
        },
      });
      setMetric('header-bytes', headerBytes);
      setMetric('payload-share', payloadShare);
      setMetric('elapsed-time', 0);
      await phase('split');
      if (!(await ctx.sleep(data.stepMs))) return;

      // ── 걸음 1 … 틱 — 넘긴다
      const ticks: { tick: number; moves: HopMove[] }[] = [];
      hopTicks(split, links, (tick, moves) => ticks.push({ tick, moves }));
      for (const { tick, moves } of ticks) {
        if (ctx.cancelled) return;
        const elapsed = tick * round.pieceSize;
        const sorted = [...moves].sort((a, b) => a.piece - b.piece);
        await ctx.emit({
          type: 'forward',
          payload: {
            tick,
            elapsed,
            pieceSize: round.pieceSize,
            busyLinks: moves.length,
            moves: sorted.map((m) => ({ piece: m.piece + 1, from: m.from, to: m.from + 1 })),
          },
        });
        setMetric('elapsed-time', elapsed);
        await phase('forward');
        if (!(await ctx.sleep(data.stepMs))) return;
      }

      // ── 끝 — 끝 시각
      if (ctx.cancelled) return;
      await ctx.emit({
        type: 'finish',
        payload: { ticks: round.ticks, finish: round.finish, split, fastestSplit },
      });
      setMetric('elapsed-time', round.finish);
      await phase('finish');

      // ── 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'split' && input.type !== 'links') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') continue;
        if (input.type === 'split') {
          if (!data.splits.includes(value)) continue;
          split = value;
        } else {
          if (!data.linkCounts.includes(value)) continue;
          links = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
