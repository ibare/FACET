/**
 * overlapping-subproblems-stage — 같은 이름이 자꾸 돋는 나무와, 그 이름들이
 * 쌓이는 선반.
 *
 * 화면은 둘로 나뉜다. 위는 재귀 호출 나무 — 걸음마다 가지 하나가 **부모
 * 자리에서 아래로 미끄러져 내려와** 자기 자리에 앉는다. 처음 만나는 항은 옅게,
 * 이미 풀었던 항을 또 푸는 것은 진하게 그리고, 몇 번째로 나타났는지가 그 자리
 * 모서리에 숫자로 남는다.
 *
 * 아래는 이름 선반 — 항 하나마다 자리가 하나뿐이다. 가지가 돋을 때마다 그 항의
 * 복제 조각이 나무에서 **떨어져 나와 선반으로 날아가 쌓인다.** 원본(가지)은 나무에
 * 남는다. 다 펼치고 나면 어느 더미가 높은지가 곧 어느 항을 몇 번 다시 풀었는지다.
 *
 * ── 크기
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 나무가 깊거나 더미가 높으면 층
 * 간격과 조각 간격을 줄여 담는다 — 높이를 늘리지 않는다. 가로는 잎 개수에서
 * 역산하고 상수는 상한만 둔다 (S-piece).
 *
 * ── 움직임
 * 위치가 실제로 변하는 애니메이션이다. 자체 rAF 루프 하나로 진행하며
 * `destroy()` 에서 프레임을 취소하고 목록을 비운다 — 뒷일을 남기지 않는다.
 *
 * ── 문자
 * 화면에 새기는 글자는 `f(3)` · `×5` · `= 5` 뿐이다. 전부 수식 표기라 표식으로
 * 두고 키를 만들지 않는다 (C10 판정 3). 캡션 문안은 projector 가 넘긴다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 330;

/** 좌우 최소 여백. 잎 자리 폭은 이 값을 뺀 나머지를 나눠 갖는다. */
const SIDE = 22;

const TREE_TOP = 14;
/** 나무가 쓸 수 있는 아래 끝. */
const TREE_BOTTOM = 208;
/** 가장 높이 쌓인 더미의 꼭대기. */
const PILE_TOP = 224;
/** 더미가 얹히는 선반 바닥. */
const SHELF_BASE = 288;
const SHELF_LABEL_Y = 303;
const CAPTION_Y = 322;

const NODE_H = 22;
const NODE_MAX_W = 52;
const ROW_PITCH_MAX = 43;
const CHIP_H = 10;
const CHIP_PITCH_MAX = 12;

const SPROUT_MS = 200;
const CHIP_DELAY_MS = 130;
const CHIP_MS = 250;
/** 날아가는 조각이 그리는 호의 높이. */
const CHIP_ARC = 20;

export type PlanNode = {
  id: string;
  n: number;
  depth: number;
  parentId: string | null;
};

export type SproutNode = {
  id: string;
  n: number;
  ordinal: number;
  repeat: boolean;
};

export type CallSummary = {
  calls: number;
  distinct: number;
  worstN: number;
  worstCount: number;
  value: number;
};

type Placed = { node: PlanNode; x: number; y: number };

type Anim = {
  startedAt: number;
  delay: number;
  dur: number;
  tick(p: number): void;
};

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const overlappingSubproblemsStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const c = getColors(params.theme);
    const svg = params.canvas;

    // 러너가 붙여 준 캔버스 안쪽만 쓴다. 컨테이너를 비우면 캔버스가 떨어져
    // 나간다 (S-view).
    const shelfLayer = svgEl('g', {});
    const edgeLayer = svgEl('g', {});
    const nodeLayer = svgEl('g', {});
    const chipLayer = svgEl('g', {});
    const markLayer = svgEl('g', {});
    svg.appendChild(shelfLayer);
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);
    svg.appendChild(chipLayer);
    svg.appendChild(markLayer);

    const caption = svgEl('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    svg.appendChild(caption);

    // ── 애니메이션 루프. 자기 자신을 다시 예약하므로 destroy 에서 반드시 멈춘다.
    let destroyed = false;
    let frameId: number | null = null;
    const anims = new Set<Anim>();
    const hasRaf = typeof requestAnimationFrame === 'function';

    const cancelFrame = (): void => {
      if (frameId === null) return;
      if (hasRaf) cancelAnimationFrame(frameId);
      else clearTimeout(frameId as unknown as ReturnType<typeof setTimeout>);
      frameId = null;
    };

    const step = (): void => {
      frameId = null;
      if (destroyed) return;
      const now = performance.now();
      for (const a of [...anims]) {
        const elapsed = now - a.startedAt - a.delay;
        const raw = a.dur <= 0 ? 1 : elapsed / a.dur;
        const p = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
        a.tick(easeOut(p));
        if (raw >= 1) anims.delete(a);
      }
      if (anims.size > 0) ensureLoop();
    };

    function ensureLoop(): void {
      if (destroyed || frameId !== null) return;
      frameId = hasRaf
        ? requestAnimationFrame(() => step())
        : (setTimeout(step, 16) as unknown as number);
    }

    const animate = (dur: number, delay: number, tick: (p: number) => void): void => {
      tick(0);
      if (destroyed) return;
      anims.add({ startedAt: performance.now(), delay, dur, tick });
      ensureLoop();
    };

    // ── 나무·선반의 기하. plan() 이 채운다.
    let placed = new Map<string, Placed>();
    let nodeW = NODE_MAX_W;
    let rowPitch = ROW_PITCH_MAX;
    let chipW = NODE_MAX_W;
    let chipPitch = CHIP_PITCH_MAX;
    let columns: number[] = [];
    let colW = 0;
    const colLabels = new Map<number, SVGTextElement>();
    const colRules = new Map<number, SVGLineElement>();
    const pileCount = new Map<number, number>();

    const colCenter = (n: number): number => {
      const i = columns.indexOf(n);
      return SIDE + colW * (i + 0.5);
    };

    const paintColumnLabel = (n: number): void => {
      const label = colLabels.get(n);
      if (!label) return;
      const count = pileCount.get(n) ?? 0;
      label.textContent = count > 0 ? `f(${n}) ×${count}` : `f(${n})`;
    };

    const clearDrawing = (): void => {
      anims.clear();
      cancelFrame();
      edgeLayer.replaceChildren();
      nodeLayer.replaceChildren();
      chipLayer.replaceChildren();
      markLayer.replaceChildren();
      pileCount.clear();
      for (const n of columns) {
        paintColumnLabel(n);
        const rule = colRules.get(n);
        rule?.setAttribute('stroke', c.border);
        rule?.setAttribute('stroke-width', '1.4');
        colLabels.get(n)?.setAttribute('fill', c.textMuted);
        colLabels.get(n)?.setAttribute('font-weight', '400');
      }
    };

    function plan(nodes: PlanNode[]): void {
      shelfLayer.replaceChildren();
      colLabels.clear();
      colRules.clear();
      placed = new Map();
      if (nodes.length === 0) return;

      const byId = new Map<string, PlanNode>();
      const kids = new Map<string, string[]>();
      for (const nd of nodes) {
        byId.set(nd.id, nd);
        if (nd.parentId !== null) {
          const list = kids.get(nd.parentId);
          if (list) list.push(nd.id);
          else kids.set(nd.parentId, [nd.id]);
        }
      }
      const root = nodes.find((nd) => nd.parentId === null);
      if (!root) return;

      // 잎을 왼쪽부터 한 자리씩 차지하게 하고, 부모는 자식들의 가운데에 선다.
      const slot = new Map<string, number>();
      let leafCount = 0;
      const assign = (id: string): number => {
        const children = kids.get(id) ?? [];
        if (children.length === 0) {
          const s = leafCount;
          leafCount += 1;
          slot.set(id, s);
          return s;
        }
        let sum = 0;
        for (const kid of children) sum += assign(kid);
        const s = sum / children.length;
        slot.set(id, s);
        return s;
      };
      assign(root.id);

      let maxDepth = 0;
      const perName = new Map<number, number>();
      for (const nd of nodes) {
        if (nd.depth > maxDepth) maxDepth = nd.depth;
        perName.set(nd.n, (perName.get(nd.n) ?? 0) + 1);
      }

      // 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
      const slotW = (W - SIDE * 2) / Math.max(1, leafCount);
      nodeW = Math.max(30, Math.min(NODE_MAX_W, Math.round(slotW - 22)));
      rowPitch =
        maxDepth > 0
          ? Math.min(ROW_PITCH_MAX, (TREE_BOTTOM - TREE_TOP - NODE_H) / maxDepth)
          : 0;

      for (const nd of nodes) {
        placed.set(nd.id, {
          node: nd,
          x: SIDE + slotW * ((slot.get(nd.id) ?? 0) + 0.5),
          y: TREE_TOP + NODE_H / 2 + nd.depth * rowPitch,
        });
      }

      columns = [...perName.keys()].sort((a, b) => a - b);
      colW = (W - SIDE * 2) / Math.max(1, columns.length);
      chipW = Math.max(24, Math.min(nodeW, Math.round(colW - 26)));
      const tallest = Math.max(1, ...perName.values());
      chipPitch =
        tallest > 1
          ? Math.min(CHIP_PITCH_MAX, (SHELF_BASE - PILE_TOP - CHIP_H) / (tallest - 1))
          : CHIP_PITCH_MAX;

      for (const n of columns) {
        const cx = colCenter(n);
        const rule = svgEl('line', {
          x1: cx - chipW / 2 - 4,
          y1: SHELF_BASE + 1,
          x2: cx + chipW / 2 + 4,
          y2: SHELF_BASE + 1,
          stroke: c.border,
          'stroke-width': 1.4,
          'stroke-linecap': 'round',
        });
        const label = svgEl('text', {
          x: cx,
          y: SHELF_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': 400,
          fill: c.textMuted,
        });
        label.textContent = `f(${n})`;
        shelfLayer.appendChild(rule);
        shelfLayer.appendChild(label);
        colRules.set(n, rule);
        colLabels.set(n, label);
      }
      clearDrawing();
    }

    function flyChip(from: Placed, info: SproutNode): void {
      const idx = pileCount.get(info.n) ?? 0;
      pileCount.set(info.n, idx + 1);
      paintColumnLabel(info.n);

      const tx = colCenter(info.n);
      const ty = SHELF_BASE - CHIP_H / 2 - idx * chipPitch;

      const group = svgEl('g', { transform: `translate(${from.x},${from.y})` });
      const slab = svgEl('rect', {
        x: -nodeW / 2,
        y: -NODE_H / 2,
        width: nodeW,
        height: NODE_H,
        rx: 4,
        fill: info.repeat ? c.itemComparing : c.itemDefault,
        stroke: info.repeat ? c.itemComparing : c.border,
        'stroke-width': 1.1,
      });
      group.appendChild(slab);
      chipLayer.appendChild(group);

      animate(CHIP_MS, CHIP_DELAY_MS, (p) => {
        const x = lerp(from.x, tx, p);
        const y = lerp(from.y, ty, p) - CHIP_ARC * 4 * p * (1 - p);
        const w = lerp(nodeW, chipW, p);
        const h = lerp(NODE_H, CHIP_H, p);
        group.setAttribute('transform', `translate(${x},${y})`);
        slab.setAttribute('x', String(-w / 2));
        slab.setAttribute('y', String(-h / 2));
        slab.setAttribute('width', String(w));
        slab.setAttribute('height', String(h));
        slab.setAttribute('rx', String(Math.min(4, h / 2)));
      });
    }

    function sprout(info: SproutNode): void {
      const self = placed.get(info.id);
      if (!self) return;
      const parentId = self.node.parentId;
      const parent = parentId !== null ? placed.get(parentId) : undefined;
      // 뿌리는 부모가 없으므로 한 층 위에서 내려온다 — 어디서든 아래로 뻗는다.
      const fromX = parent ? parent.x : self.x;
      const fromY = parent ? parent.y : self.y - Math.max(rowPitch, ROW_PITCH_MAX);

      if (parent) {
        const edge = svgEl('line', {
          x1: parent.x,
          y1: parent.y + NODE_H / 2,
          x2: parent.x,
          y2: parent.y + NODE_H / 2,
          stroke: c.border,
          'stroke-width': 1.2,
          'stroke-linecap': 'round',
        });
        edgeLayer.appendChild(edge);
        animate(SPROUT_MS, 0, (p) => {
          edge.setAttribute('x2', String(lerp(parent.x, self.x, p)));
          edge.setAttribute('y2', String(lerp(parent.y + NODE_H / 2, self.y - NODE_H / 2, p)));
        });
      }

      const group = svgEl('g', { transform: `translate(${fromX},${fromY})`, opacity: 0 });
      group.appendChild(
        svgEl('rect', {
          x: -nodeW / 2,
          y: -NODE_H / 2,
          width: nodeW,
          height: NODE_H,
          rx: 5,
          fill: info.repeat ? c.itemComparing : c.itemDefault,
          stroke: info.repeat ? c.itemComparing : c.border,
          'stroke-width': 1.3,
        }),
      );
      const name = svgEl('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: info.repeat ? c.stateInk : c.text,
      });
      name.textContent = `f(${info.n})`;
      group.appendChild(name);

      // 몇 번째로 나타났는지는 그 자리에 남는다.
      const bx = nodeW / 2 - 2;
      const by = -NODE_H / 2 + 2;
      group.appendChild(
        svgEl('circle', {
          cx: bx,
          cy: by,
          r: 8.5,
          fill: c.bg,
          stroke: info.repeat ? c.itemComparing : c.border,
          'stroke-width': 1.2,
        }),
      );
      const badge = svgEl('text', {
        x: bx,
        y: by,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: info.repeat ? c.text : c.textMuted,
      });
      badge.textContent = String(info.ordinal);
      group.appendChild(badge);
      nodeLayer.appendChild(group);

      animate(SPROUT_MS, 0, (p) => {
        group.setAttribute('transform', `translate(${lerp(fromX, self.x, p)},${lerp(fromY, self.y, p)})`);
        group.setAttribute('opacity', String(Math.min(1, p * 3)));
      });

      flyChip(self, info);
    }

    function finish(summary: CallSummary): void {
      const worstLabel = colLabels.get(summary.worstN);
      worstLabel?.setAttribute('fill', c.itemComparing);
      worstLabel?.setAttribute('font-weight', '700');
      const worstRule = colRules.get(summary.worstN);
      worstRule?.setAttribute('stroke', c.itemComparing);
      worstRule?.setAttribute('stroke-width', '2.6');

      const rootEntry = [...placed.values()].find((p) => p.node.parentId === null);
      if (!rootEntry) return;
      markLayer.replaceChildren();
      const answer = svgEl('text', {
        x: rootEntry.x + nodeW / 2 + 18,
        y: rootEntry.y,
        'text-anchor': 'start',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      answer.textContent = `= ${summary.value}`;
      markLayer.appendChild(answer);
    }

    return {
      plan,
      sprout,
      rewind(): void {
        clearDrawing();
      },
      finish,
      setCaption(text: string): void {
        caption.textContent = text;
      },
      destroy(): void {
        destroyed = true;
        cancelFrame();
        anims.clear();
        for (const layer of [shelfLayer, edgeLayer, nodeLayer, chipLayer, markLayer, caption]) {
          layer.remove();
        }
      },
    };
  },
};
