/**
 * BFS Projector — 알고리즘 이벤트를 stage(graph-layout) + 큐 + 레이어 카운터에 매핑.
 *
 * 시각적 정체성:
 *   1. 동심 파면       — onInit 에서 BFS 거리를 미리 계산해 방사형 positions 주입.
 *                        배경 등고선(concentric-rings) 도 같은 단계에서 설정.
 *                        링은 3단: 미방문(점선) → 현재 파면(accent 펄스) → 잔향(저채도 fill).
 *   2. 동시 점등 섬광   — layer-discovered 이벤트를 받으면 해당 레이어의 모든 노드를
 *                        한 번의 pulseNodes 호출로 동시에 점등. 링 pulse 도 동시에 묶음.
 *                        순차 트윈 금지.
 *   3. FIFO 큐의 몸통   — enqueue/dequeue 이벤트를 conveyor-queue 의 IN/OUT 캡 +
 *                        스탬프 큐브에 1:1 매핑. stamp(#n) 는 projector 가 발급한
 *                        누적 enqueue 카운터. view 의 시안 기본 팔레트 존중.
 *                        features:[] 로 나이 그라디언트/꼬리 로그/bounded 는 끔.
 *   4. 확정 거리 라벨   — layer-discovered 시점에 setNodeBadge 로 k 숫자 동시 점등.
 *   5. 비가역 꼬리      — 다음 레이어 발견 시 이전 레이어는 visited 로 식힘.
 *                        pulseEdge 는 안→밖 방향 흐름 입자 (반대 방향 없음).
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import type {
  GraphData,
  GraphEdgeState,
  GraphNodeState,
  GraphPositions,
} from '@facet/core/runtime';
import { parseTarget } from '@facet/core/runtime';
import { computeBfsResult, type BfsGraphData } from './algorithm.js';

export const BFS_CANVAS = { width: 520, height: 360 } as const;

type GraphLayout = {
  setGraph(data: GraphData, pos: GraphPositions): void;
  setNodeState(id: string, state: GraphNodeState): void;
  setEdgeState(a: string, b: string, state: GraphEdgeState): void;
  setNodeBadge(id: string, text: string): void;
  clearNodeBadge(id: string): void;
  pulseNodes(ids: string[], options?: { duration?: number }): Promise<void>;
  pulseEdge(a: string, b: string, options?: { duration?: number }): Promise<void>;
  setConcentricRings(centerId: string, radii: number[]): void;
  pulseRing(index: number, options?: { duration?: number }): Promise<void>;
  setRingMuted(index: number): void;
  clearConcentricRings(): void;
  reset(): void;
};
// conveyor-queue 의 공개 메서드 shape. BFS 가 직접 쓰는 것만 추린 최소 계약.
type ConveyorQueue = {
  enqueue(
    item: { stamp: number; label: string; tint?: string },
    opts?: { duration?: number },
  ): Promise<void>;
  dequeue(opts?: { duration?: number }): Promise<void>;
  reset(): void;
};
type TextDisplay = {
  setText(s: string): void;
  reset(): void;
};
type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

/**
 * 방사형 좌표 계산 — 출발점을 캔버스 정중앙에 두고, 레이어 k 를 중심으로부터
 * 단조 증가하는 타원 반지름에 등각도로 분배.
 *
 * source 앵커를 중앙에 두는 이유:
 *   동심 파문 메타포는 radial-symmetric 이다. 앵커가 한쪽으로 치우치면
 *   링의 중심도 치우치고, 먼 레이어는 반대쪽에서 캔버스 밖으로 잘려 "부채꼴"
 *   처럼 보이는 착시가 생긴다. 중앙 앵커여야 사방으로 퍼지는 파면이 그대로 읽힌다.
 *
 * 뷰포트 클리핑 방지:
 *   1) 타원 궤도로 우선 배치 후 source 앵커(cx, cy) 기준 4방향(상/하/좌/우) 초과량 측정.
 *   2) 안전 영역(pad = 26px — 노드 반지름 18 + 우상단 배지 돌출 ~8) 을 넘으면
 *      uniform scale 로 동심 수축. 독립 스케일이 아니라 min 을 쓰는 이유:
 *      동심 원/타원의 진행성 자체가 메타포라 종횡 비율이 변하면 안 됨.
 *   3) 링(배경 등고선) 도 동일 scale 로 축소해 노드 궤도와 일치 유지.
 *
 * 반환:
 *   - positions: 모든 노드의 (x, y). 도달 불가 노드는 scale 과 무관하게 캔버스 하단 일렬.
 *   - rings: 배경 등고선 반지름 배열 (수평 반지름 기준, scale 적용 후 값).
 */
function computeConcentricLayout(
  data: BfsGraphData,
  W: number,
  H: number,
): { positions: GraphPositions; rings: number[] } {
  const result = computeBfsResult(data);
  const layers = result.layers;

  const cx = W * 0.5;
  const cy = H * 0.5;
  const numSteps = Math.max(layers.length - 1, 1);
  // 캔버스 중앙 기준 좌우/상하 대칭. 수평·수직 각각의 절반 공간에서 여유 pad 를 뺌.
  const rxStep = (Math.min(cx, W - cx) - 28) / numSteps;
  const ryStep = (Math.min(cy, H - cy) - 20) / numSteps;

  // 1. 도달 가능 노드를 타원 궤도에 우선 배치.
  const reachable: Record<string, { x: number; y: number }> = {};
  const rawRings: number[] = [];
  layers.forEach((layer, k) => {
    if (k === 0) {
      for (const id of layer) reachable[id] = { x: cx, y: cy };
      return;
    }
    const rx = rxStep * k;
    const ry = ryStep * k;
    rawRings.push(rx);
    const N = layer.length;
    layer.forEach((id, i) => {
      // 같은 레이어는 원주 위 등각도. 시작 각도 -π/2 (상단).
      const theta = N === 1 ? 0 : (2 * Math.PI * i) / N - Math.PI / 2;
      reachable[id] = {
        x: cx + rx * Math.cos(theta),
        y: cy + ry * Math.sin(theta),
      };
    });
  });

  // 2. 4방향 초과량 측정 → 필요 시 uniform scale.
  //    pad: 노드 반지름(18) + 배지 돌출(~8) = 26.
  const pad = 26;
  let maxDxR = 0;
  let maxDxL = 0;
  let maxDyD = 0;
  let maxDyU = 0;
  for (const id in reachable) {
    const dx = reachable[id].x - cx;
    const dy = reachable[id].y - cy;
    if (dx > maxDxR) maxDxR = dx;
    if (-dx > maxDxL) maxDxL = -dx;
    if (dy > maxDyD) maxDyD = dy;
    if (-dy > maxDyU) maxDyU = -dy;
  }
  const ratios: number[] = [1];
  if (maxDxR > 0) ratios.push((W - pad - cx) / maxDxR);
  if (maxDxL > 0) ratios.push((cx - pad) / maxDxL);
  if (maxDyD > 0) ratios.push((H - pad - cy) / maxDyD);
  if (maxDyU > 0) ratios.push((cy - pad) / maxDyU);
  const scale = Math.min(...ratios);

  // 3. scale 적용 — source 앵커 기준 동심 수축. 링도 동일 비율.
  const positions: GraphPositions = {};
  for (const id in reachable) {
    positions[id] = {
      x: cx + (reachable[id].x - cx) * scale,
      y: cy + (reachable[id].y - cy) * scale,
    };
  }
  const rings = rawRings.map((r) => r * scale);

  // 4. 도달 불가 노드 — scale 과 무관하게 캔버스 하단 일렬.
  let off = 0;
  for (const n of data.nodes) {
    if (!positions[n.id]) {
      positions[n.id] = { x: W - 40 - off * 28, y: H - 24 };
      off++;
    }
  }
  return { positions, rings };
}

function extractEdgesFromAdjacency(
  adjacency: Record<string, string[]>,
): { from: string; to: string }[] {
  const seen = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  for (const [a, nbs] of Object.entries(adjacency)) {
    for (const b of nbs) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: a, to: b });
    }
  }
  return edges;
}

export const bfsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as GraphLayout | undefined;
  const queue = views.queue as unknown as ConveyorQueue | undefined;
  const distanceCounter = views.distanceCounter as unknown as TextDisplay | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // 각 노드의 레이어(거리) 를 onInit 에서 미리 기록 — layer-discovered 시
  // 이전 레이어 노드들을 visited 로 식히기 위해.
  const nodeLayer = new Map<string, number>();
  let sourceId = '';
  let maxLayer = 0;
  let currentK = 0;
  // conveyor-queue 의 스탬프(#n) 는 누적 enqueue 번호. BFS 는 본래 큐 stamp 개념이
  // 없으므로 projector 가 발급한다. reset 시 0 으로.
  let enqueueCount = 0;

  function resetState(): void {
    nodeLayer.clear();
    sourceId = '';
    maxLayer = 0;
    currentK = 0;
    enqueueCount = 0;
  }

  return {
    onInit(initialData) {
      const data = initialData as BfsGraphData;
      resetState();
      sourceId = data.source;

      const result = computeBfsResult(data);
      maxLayer = Math.max(result.layers.length - 1, 0);
      result.layers.forEach((layer, k) => {
        for (const id of layer) nodeLayer.set(id, k);
      });

      if (stage) {
        const { positions, rings } = computeConcentricLayout(
          data,
          BFS_CANVAS.width,
          BFS_CANVAS.height,
        );
        const edges = extractEdgesFromAdjacency(data.adjacency);
        stage.setGraph({ nodes: data.nodes, edges }, positions);
        stage.setConcentricRings(data.source, rings);
      }

      distanceCounter?.setText('k = —');
      queue?.reset();
    },

    async onEvent(event) {
      switch (event.type) {
        case 'mark': {
          if (!stage) break;
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          const t = Array.isArray(event.target) ? event.target[0] : event.target;
          if (typeof t !== 'string') break;
          const parsed = parseTarget(t);
          if (parsed?.prefix !== 'node') break;
          const id = parsed.id;
          if (kind === 'source') {
            stage.setNodeState(id, 'source');
          } else if (kind === 'visited') {
            if (id !== sourceId) stage.setNodeState(id, 'visited');
          }
          break;
        }

        case 'layer-discovered': {
          if (!stage) break;
          const p = event.payload as { distance?: number; nodes?: string[] } | undefined;
          if (!p || typeof p.distance !== 'number' || !Array.isArray(p.nodes)) break;
          const k = p.distance;
          // 1. 이전 레이어(k-1) 를 visited 로 식힘 — source 는 그대로.
          if (k > 0) {
            for (const [id, d] of nodeLayer) {
              if (d === k - 1 && id !== sourceId) stage.setNodeState(id, 'visited');
            }
          }
          // 2. 새 레이어는 active — 단, 출발점은 source 유지(mark 가 먼저 처리).
          for (const id of p.nodes) {
            if (id !== sourceId) stage.setNodeState(id, 'active');
          }
          // 3. 거리 배지 + 동시 pulse. 순차 트윈 금지 — 노드와 링을 한 호흡으로 묶음.
          //    ring index = k-1 (k=0 은 source 점 자체로 파면이 아님).
          //    이전 파면(k-2) 은 잔향(muted)으로 식힘 — 비가역 꼬리.
          for (const id of p.nodes) stage.setNodeBadge(id, String(k));
          const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);
          const duration = 240 / speed;
          const ringIdx = k - 1;
          const prevRingIdx = k - 2;
          if (prevRingIdx >= 0) stage.setRingMuted(prevRingIdx);
          const ringPulse =
            ringIdx >= 0 ? stage.pulseRing(ringIdx, { duration }) : Promise.resolve();
          const nodePulse = stage.pulseNodes(p.nodes, { duration });
          await Promise.all([ringPulse, nodePulse]);
          currentK = k;
          distanceCounter?.setText(
            k < maxLayer ? `k = ${k} → ${k + 1}` : `k = ${k}`,
          );
          break;
        }

        case 'enqueue': {
          if (!queue) break;
          const p = event.payload as { id?: string; distance?: number; label?: string } | undefined;
          const label = p?.label ?? p?.id ?? '?';
          enqueueCount += 1;
          // fire-and-forget — BFS 는 다중 view 병렬 진행이 본체 리듬.
          // conveyor-queue 의 애니메이션이 다른 stage pulse 와 겹쳐도 자연스럽다.
          void queue.enqueue({ stamp: enqueueCount, label });
          break;
        }

        case 'dequeue': {
          void queue?.dequeue();
          break;
        }

        case 'highlight': {
          if (!stage) break;
          const payload = event.payload as
            | { kind?: string; from?: string; to?: string }
            | undefined;
          if (payload?.kind !== 'scan' || !payload.from || !payload.to) break;
          const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);
          await stage.pulseEdge(payload.from, payload.to, { duration: 180 / speed });
          break;
        }

        case 'phase': {
          const p = event.payload as { phase?: string } | undefined;
          const phase = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          codePanel?.clearHighlight();
          // 마지막 파면도 잔향으로 남겨 완결된 동심 파문 전체를 시각적 요약으로.
          if (stage && maxLayer - 1 >= 0) stage.setRingMuted(maxLayer - 1);
          distanceCounter?.setText(`k = ${currentK} ✓`);
          break;
        }
      }
    },

    onReset() {
      // stage 의 visual reset 은 runner 가 reset 후 onInit 을 다시 호출해
      // setGraph 로 일괄 처리. 보조 뷰만 정리한다.
      resetState();
      queue?.reset();
      distanceCounter?.reset();
      codePanel?.clearHighlight();
    },
  };
};
