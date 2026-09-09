/**
 * cycle-blocks-order-stage — 꺼내다가 멈추는 화면.
 *
 * ── 왜 이 모양인가
 *
 * 동사가 "멈춘다" 다. 멈춤을 보이려면 먼저 **나아가는 것**이 보여야 하므로,
 * 화면을 위아래 둘로 가른다. 위는 정점들이 놓인 판이고 아래는 꺼낸 것을 담는
 * 자리 다섯이다. 꺼낼 수 있는 정점은 제 자리에서 **아래로 내려가** 자리를
 * 채운다 — 색이 바뀌는 것이 아니라 실제로 옮겨 간다.
 *
 * 두 번 내려가고 나면 아무도 내려가지 못한다. 남은 것들은 흔들리기만 하고
 * 제자리다. 그 다음이 이 조각의 몫이다 — 왜 못 가는지를 **화살표를 거슬러
 * 올라가며** 보인다. 점 하나가 기다리는 쪽에서 기다림을 받는 쪽으로 거슬러
 * 가고, 그것이 제자리로 돌아오는 순간 고리가 닫힌다. 아래 자리 셋은 끝내
 * 빈 채로 남고, 그 빈 자리가 "순서가 없다" 는 말의 그림이다.
 *
 * 가로 좌표는 캔버스에서 역산한다 (S-piece "그 폭을 채운다"). 정점의 좌우
 * 순서도 손으로 적지 않고 구조에서 얻는다 — 짐 0 인 것부터 벗겨 낸 순서를
 * 앞에 두고, 끝내 안 벗겨지는 것들을 알파벳 순으로 뒤에 붙인다.
 *
 * ── 뒷일
 *
 * `destroy()` 는 걸어 둔 타이머를 전부 거두고, 기다리고 있던 애니메이션
 * 약속도 깨워서 풀어 준다 (S-view). 스스로 다음 회차를 예약하는 루프는
 * `animate` 의 tick 하나뿐이며 `destroyed` 플래그가 그것을 끊는다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 판의 크기. 세로는 마운트한 뒤 바뀌지 않는다 (S-view).
const W = PIECE_CANVAS_W;
const H = 268;

const CAPTION_Y = 21;
const SIDE_MIN = 30;
const COL_MAX_W = 112;
const NODE_CY = 110;
const NODE_R = 27;
const BADGE_DY = -46;
const BADGE_W = 26;
const BADGE_H = 20;
const LANE_LABEL_Y = 186;
const LANE_TOP = 196;
const LANE_H = 48;
const SLOT_MAX_W = 96;
const SLOT_R = 17;
const ARC_BOW = 66;
const ARC_TILT = 0.62;

// ── 걸음마다의 지속시간. 걸음 하나는 `여기 + stepMs` 다 (S-piece).
const SURVEY_MS = 300;
const READY_MS = 280;
const TRAVEL_MS = 460;
const RELEASE_MS = 240;
const TRACE_MS = 420;
const HALT_MS = 360;
const FRAME_MS = 16;

export type CycleStageEdge = { from: string; to: string };
export type CycleStageBoard = { vertices: string[]; edges: CycleStageEdge[] };
export type CycleStageLoad = { id: string; load: number };
export type CycleStageRelease = { to: string; load: number };
export type CycleStageExtract = { id: string; slot: number; released: CycleStageRelease[] };
export type CycleStageWait = {
  from: string;
  on: string;
  closes: boolean;
  trailing: boolean;
  ring: string[];
};
export type CycleStageHalt = { extracted: string[]; stuck: string[]; total: number };

type Pt = { x: number; y: number };

/** 간선 하나의 기하. SVG 의 길이/점 조회 API 를 쓰지 않고 직접 셈한다. */
type Geom =
  | { kind: 'line'; p0: Pt; p2: Pt }
  | { kind: 'quad'; p0: Pt; p1: Pt; p2: Pt };

type EdgeItem = {
  key: string;
  from: string;
  to: string;
  geom: Geom;
  path: SVGPathElement;
  head: SVGPathElement;
};

type NodeItem = {
  id: string;
  group: SVGGElement;
  disc: SVGCircleElement;
  label: SVGTextElement;
  ghost: SVGCircleElement;
  home: Pt;
  at: Pt;
  scale: number;
  dx: number;
  dy: number;
};

type BadgeItem = {
  id: string;
  group: SVGGElement;
  box: SVGRectElement;
  label: SVGTextElement;
  home: Pt;
};

type SlotItem = { index: number; box: SVGRectElement; center: Pt; mark: SVGPathElement };

/** 토큰 hex 에 알파를 얹는 순수 변환 (S-view Exception — 색 리터럴이 아니다). */
function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function pointAt(g: Geom, t: number): Pt {
  if (g.kind === 'line') {
    return { x: g.p0.x + (g.p2.x - g.p0.x) * t, y: g.p0.y + (g.p2.y - g.p0.y) * t };
  }
  const u = 1 - t;
  return {
    x: u * u * g.p0.x + 2 * u * t * g.p1.x + t * t * g.p2.x,
    y: u * u * g.p0.y + 2 * u * t * g.p1.y + t * t * g.p2.y,
  };
}

function tangentAtEnd(g: Geom): Pt {
  if (g.kind === 'line') return { x: g.p2.x - g.p0.x, y: g.p2.y - g.p0.y };
  return { x: 2 * (g.p2.x - g.p1.x), y: 2 * (g.p2.y - g.p1.y) };
}

function geomPath(g: Geom): string {
  if (g.kind === 'line') return `M ${g.p0.x} ${g.p0.y} L ${g.p2.x} ${g.p2.y}`;
  return `M ${g.p0.x} ${g.p0.y} Q ${g.p1.x} ${g.p1.y} ${g.p2.x} ${g.p2.y}`;
}

/** 샘플링으로 대략 길이를 잰다. `getTotalLength` 는 환경에 따라 없다. */
function geomLength(g: Geom): number {
  let total = 0;
  let prev = pointAt(g, 0);
  for (let i = 1; i <= 24; i += 1) {
    const cur = pointAt(g, i / 24);
    total += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
  }
  return total;
}

function arrowHead(g: Geom): string {
  const tip = g.p2;
  const dir = tangentAtEnd(g);
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const back = { x: tip.x - ux * 10, y: tip.y - uy * 10 };
  const nx = -uy * 5;
  const ny = ux * 5;
  return `M ${tip.x} ${tip.y} L ${back.x + nx} ${back.y + ny} L ${back.x - nx} ${back.y - ny} Z`;
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);

/**
 * 좌우 순서를 구조에서 얻는다. 짐 0 인 것부터 알파벳 순으로 벗겨 내고, 끝내
 * 안 벗겨지는 것들을 알파벳 순으로 뒤에 붙인다. 흐름이 왼쪽에서 오른쪽으로
 * 읽히고, 고리에 걸린 것들이 오른편에 모인다.
 */
function readingOrder(vertices: string[], edges: CycleStageEdge[]): string[] {
  const sorted = [...vertices].sort();
  const load = new Map<string, number>();
  for (const v of sorted) load.set(v, 0);
  for (const e of edges) {
    const cur = load.get(e.to);
    if (cur !== undefined) load.set(e.to, cur + 1);
  }
  const out: string[] = [];
  const gone = new Set<string>();
  for (;;) {
    const next = sorted.find((v) => !gone.has(v) && (load.get(v) ?? 0) === 0);
    if (next === undefined) break;
    gone.add(next);
    out.push(next);
    for (const e of edges) {
      if (e.from !== next || gone.has(e.to)) continue;
      load.set(e.to, (load.get(e.to) ?? 0) - 1);
    }
  }
  for (const v of sorted) if (!gone.has(v)) out.push(v);
  return out;
}

export const cycleBlocksOrderStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    // ── 뒷일 관리. destroy 가 하나도 남기지 않게 한 곳에 모은다.
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiting = new Set<() => void>();

    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    }

    function animate(duration: number, step: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || duration <= 0) {
          if (!destroyed) step(1);
          resolve();
          return;
        }
        waiting.add(resolve);
        const started = Date.now();
        const tick = (): void => {
          if (destroyed) {
            waiting.delete(resolve);
            resolve();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / duration);
          step(p);
          if (p >= 1) {
            waiting.delete(resolve);
            resolve();
            return;
          }
          later(tick, FRAME_MS);
        };
        tick();
      });
    }

    // ── 그림판. 캔버스는 러너 것이므로 우리 것만 g 하나에 담아 둔다.
    const root = el('g');
    svg.appendChild(root);

    const layerTint = el('g');
    const layerEdges = el('g');
    const layerLane = el('g');
    const layerNodes = el('g');
    const layerFx = el('g');
    root.append(layerTint, layerEdges, layerLane, layerNodes, layerFx);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(caption);

    let board: CycleStageBoard = { vertices: [], edges: [] };
    let order: string[] = [];
    const column = new Map<string, number>();
    const nodes = new Map<string, NodeItem>();
    const badges = new Map<string, BadgeItem>();
    const edgeItems = new Map<string, EdgeItem>();
    let slots: SlotItem[] = [];
    let colW = COL_MAX_W;

    const edgeKey = (from: string, to: string): string => `${from}>${to}`;
    const colX = (i: number): number =>
      Math.round((W - order.length * colW) / 2) + colW / 2 + i * colW;

    function clearLayer(layer: SVGGElement): void {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    function setNodeTransform(n: NodeItem): void {
      n.group.setAttribute(
        'transform',
        `translate(${n.at.x + n.dx}, ${n.at.y + n.dy}) scale(${n.scale})`,
      );
    }

    function buildGeom(from: string, to: string): Geom {
      const ia = column.get(from) ?? 0;
      const ib = column.get(to) ?? 0;
      const xa = colX(ia);
      const xb = colX(ib);
      const dir = ib >= ia ? 1 : -1;
      const span = Math.abs(ib - ia);
      const mutual = board.edges.some((e) => e.from === to && e.to === from);

      if (!mutual && span <= 1) {
        return {
          kind: 'line',
          p0: { x: xa + dir * (NODE_R + 3), y: NODE_CY },
          p2: { x: xb - dir * (NODE_R + 11), y: NODE_CY },
        };
      }
      // 서로 가리키는 짝은 위아래로 갈라 두 활을 만든다 — 둘이 모여 고리가 된다.
      const bow = mutual ? (dir > 0 ? -ARC_BOW : ARC_BOW) : -(ARC_BOW - 10 + span * 22);
      const side = bow < 0 ? -1 : 1;
      const sa = dir > 0 ? side * ARC_TILT : Math.PI - side * ARC_TILT;
      const ea = dir > 0 ? Math.PI - side * ARC_TILT : side * ARC_TILT;
      return {
        kind: 'quad',
        p0: { x: xa + NODE_R * Math.cos(sa), y: NODE_CY + NODE_R * Math.sin(sa) },
        p1: { x: (xa + xb) / 2, y: NODE_CY + bow },
        p2: { x: xb + (NODE_R + 9) * Math.cos(ea), y: NODE_CY + (NODE_R + 9) * Math.sin(ea) },
      };
    }

    function paintEdge(item: EdgeItem, tone: 'idle' | 'released' | 'ring'): void {
      if (tone === 'released') {
        item.path.setAttribute('stroke', c.border);
        item.path.setAttribute('stroke-width', '1.5');
        item.path.setAttribute('stroke-dasharray', '3 5');
        item.head.setAttribute('fill', c.border);
        return;
      }
      const stroke = tone === 'ring' ? c.danger : c.textMuted;
      item.path.setAttribute('stroke', stroke);
      item.path.setAttribute('stroke-width', tone === 'ring' ? '3' : '1.8');
      item.path.removeAttribute('stroke-dasharray');
      item.head.setAttribute('fill', stroke);
    }

    function paintNode(item: NodeItem, tone: 'idle' | 'ready' | 'taken' | 'stuck'): void {
      const fill =
        tone === 'ready' ? c.accent : tone === 'taken' ? c.itemSorted : c.bg;
      const ink =
        tone === 'ready' ? c.stateInk : tone === 'taken' ? c.textInverse : c.text;
      const stroke = tone === 'stuck' ? c.danger : tone === 'ready' ? c.accent : c.border;
      item.disc.setAttribute('fill', fill);
      item.disc.setAttribute('stroke', stroke);
      item.disc.setAttribute('stroke-width', tone === 'stuck' ? '2.5' : '2');
      item.label.setAttribute('fill', ink);
    }

    function paintBadge(item: BadgeItem, tone: 'idle' | 'zero' | 'stuck'): void {
      item.box.setAttribute('fill', tone === 'zero' ? c.accent : c.bgSubtle);
      item.box.setAttribute('stroke', tone === 'stuck' ? c.danger : c.border);
      item.label.setAttribute('fill', tone === 'zero' ? c.stateInk : tone === 'stuck' ? c.danger : c.text);
    }

    /** 판 전체를 처음 상태로 다시 그린다. `rewind` 도 이 길을 쓴다. */
    function draw(spec: CycleStageBoard): void {
      board = { vertices: [...spec.vertices], edges: spec.edges.map((e) => ({ ...e })) };
      order = readingOrder(board.vertices, board.edges);
      column.clear();
      order.forEach((v, i) => column.set(v, i));
      nodes.clear();
      badges.clear();
      edgeItems.clear();
      slots = [];

      clearLayer(layerTint);
      clearLayer(layerEdges);
      clearLayer(layerLane);
      clearLayer(layerNodes);
      clearLayer(layerFx);
      caption.textContent = '';
      caption.setAttribute('fill', c.text);

      const n = order.length;
      colW = Math.min(COL_MAX_W, Math.floor((W - SIDE_MIN * 2) / Math.max(1, n)));
      if (n === 0) return;

      // 아래 — 꺼낸 것을 담는 자리. 정점 수만큼 두어, 끝내 비는 자리가 곧 답이다.
      const laneLabel = el('text', {
        x: Math.round((W - n * colW) / 2),
        y: LANE_LABEL_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      laneLabel.textContent = tr('label.order', 'Order taken out');
      layerLane.appendChild(laneLabel);

      const slotW = Math.min(SLOT_MAX_W, colW - 18);
      for (let i = 0; i < n; i += 1) {
        const cx = colX(i);
        const box = el('rect', {
          x: cx - slotW / 2,
          y: LANE_TOP,
          width: slotW,
          height: LANE_H,
          rx: 8,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 4',
        });
        const ordinal = el('text', {
          x: cx - slotW / 2 + 7,
          y: LANE_TOP + 14,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        ordinal.textContent = String(i + 1);
        const mark = el('path', {
          d: `M ${cx - 11} ${LANE_TOP + LANE_H / 2} L ${cx + 11} ${LANE_TOP + LANE_H / 2}`,
          stroke: c.danger,
          'stroke-width': 3,
          'stroke-linecap': 'round',
          opacity: 0,
        });
        layerLane.append(box, ordinal, mark);
        slots.push({ index: i, box, center: { x: cx, y: LANE_TOP + LANE_H / 2 }, mark });
      }

      // 가운데 — 간선.
      for (const e of board.edges) {
        const geom = buildGeom(e.from, e.to);
        const path = el('path', { d: geomPath(geom), fill: 'none', 'stroke-linecap': 'round' });
        const head = el('path', { d: arrowHead(geom) });
        const item: EdgeItem = { key: edgeKey(e.from, e.to), from: e.from, to: e.to, geom, path, head };
        paintEdge(item, 'idle');
        layerEdges.append(path, head);
        edgeItems.set(item.key, item);
      }

      // 위 — 정점과 그것이 이고 있는 수.
      for (const v of order) {
        const i = column.get(v) ?? 0;
        const home = { x: colX(i), y: NODE_CY };

        const ghost = el('circle', {
          cx: home.x,
          cy: home.y,
          r: NODE_R,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 5',
          opacity: 0,
        });
        layerNodes.appendChild(ghost);

        const group = el('g');
        const disc = el('circle', { cx: 0, cy: 0, r: NODE_R });
        const label = el('text', {
          x: 0,
          y: 6,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': '600',
        });
        label.textContent = v;
        group.append(disc, label);
        layerNodes.appendChild(group);

        const item: NodeItem = {
          id: v,
          group,
          disc,
          label,
          ghost,
          home,
          at: { ...home },
          scale: 1,
          dx: 0,
          dy: 0,
        };
        paintNode(item, 'idle');
        setNodeTransform(item);
        nodes.set(v, item);

        const badgeHome = { x: home.x, y: home.y + BADGE_DY };
        const bgroup = el('g', { opacity: 0 });
        const box = el('rect', {
          x: -BADGE_W / 2,
          y: -BADGE_H / 2,
          width: BADGE_W,
          height: BADGE_H,
          rx: 6,
          'stroke-width': 1.5,
        });
        const blabel = el('text', {
          x: 0,
          y: 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        bgroup.append(box, blabel);
        bgroup.setAttribute('transform', `translate(${badgeHome.x}, ${badgeHome.y})`);
        layerNodes.appendChild(bgroup);

        const bitem: BadgeItem = { id: v, group: bgroup, box, label: blabel, home: badgeHome };
        paintBadge(bitem, 'idle');
        badges.set(v, bitem);
      }
    }

    // ── projector 가 부르는 표면 ────────────────────────────────────────────

    function setBoard(spec: CycleStageBoard): void {
      draw(spec);
    }

    async function survey(loads: CycleStageLoad[], text: string): Promise<void> {
      caption.textContent = text;
      for (const row of loads) {
        const b = badges.get(row.id);
        if (!b) continue;
        b.label.textContent = String(row.load);
        paintBadge(b, row.load === 0 ? 'zero' : 'idle');
      }
      // 짐이 위에서 내려앉는다 — 나타나는 것이 아니라 얹히는 것이다.
      await animate(SURVEY_MS, (p) => {
        const k = ease(p);
        for (const row of loads) {
          const b = badges.get(row.id);
          if (!b) continue;
          b.group.setAttribute('opacity', String(k));
          b.group.setAttribute(
            'transform',
            `translate(${b.home.x}, ${b.home.y - (1 - k) * 22})`,
          );
        }
      });
    }

    async function scan(ready: string[], remaining: string[], text: string): Promise<void> {
      caption.textContent = text;
      if (ready.length > 0) {
        for (const id of ready) {
          const n = nodes.get(id);
          const b = badges.get(id);
          if (n) paintNode(n, 'ready');
          if (b) paintBadge(b, 'zero');
        }
        // 꺼낼 수 있는 것은 한 번 떠오른다.
        await animate(READY_MS, (p) => {
          const lift = Math.sin(p * Math.PI) * 9;
          for (const id of ready) {
            const n = nodes.get(id);
            if (!n) continue;
            n.dy = -lift;
            setNodeTransform(n);
          }
        });
        return;
      }
      // 아무도 못 나간다. 흔들리기만 하고 제자리다 — 이것이 멈춤이다.
      caption.setAttribute('fill', c.danger);
      for (const id of remaining) {
        const n = nodes.get(id);
        const b = badges.get(id);
        if (n) paintNode(n, 'stuck');
        if (b) paintBadge(b, 'stuck');
      }
      await animate(READY_MS + 120, (p) => {
        const shake = Math.sin(p * Math.PI * 6) * (1 - p) * 4;
        for (const id of remaining) {
          const n = nodes.get(id);
          if (!n) continue;
          n.dx = shake;
          setNodeTransform(n);
        }
      });
      for (const id of remaining) {
        const n = nodes.get(id);
        if (!n) continue;
        n.dx = 0;
        setNodeTransform(n);
      }
    }

    async function extract(row: CycleStageExtract, text: string): Promise<void> {
      caption.textContent = text;
      const n = nodes.get(row.id);
      const slot = slots[row.slot];
      const b = badges.get(row.id);
      if (!n || !slot) return;

      paintNode(n, 'taken');
      if (b) b.group.setAttribute('opacity', '0');
      for (const item of edgeItems.values()) {
        if (item.from === row.id) paintEdge(item, 'released');
      }

      // 판에서 자리로 내려간다. 자리에 놓이면 판에는 빈 테두리만 남는다.
      const from = { ...n.home };
      const to = slot.center;
      const targetScale = SLOT_R / NODE_R;
      n.dy = 0;
      n.dx = 0;
      await animate(TRAVEL_MS, (p) => {
        const k = ease(p);
        n.at = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
        n.scale = 1 + (targetScale - 1) * k;
        n.ghost.setAttribute('opacity', String(k));
        setNodeTransform(n);
      });
      slot.box.removeAttribute('stroke-dasharray');
      slot.box.setAttribute('stroke', c.itemSorted);

      if (row.released.length === 0) return;

      // 짐 한 조각이 떨어져 나간다.
      const chips: SVGRectElement[] = [];
      for (const rel of row.released) {
        const target = badges.get(rel.to);
        if (!target) continue;
        target.label.textContent = String(rel.load);
        paintBadge(target, rel.load === 0 ? 'zero' : 'idle');
        const chip = el('rect', {
          x: target.home.x - 5,
          y: target.home.y - 5,
          width: 10,
          height: 10,
          rx: 2,
          fill: c.textMuted,
        });
        layerFx.appendChild(chip);
        chips.push(chip);
      }
      await animate(RELEASE_MS, (p) => {
        for (const chip of chips) {
          chip.setAttribute('transform', `translate(0, ${ease(p) * 30})`);
          chip.setAttribute('opacity', String(1 - p));
        }
      });
      for (const chip of chips) chip.remove();
    }

    async function traceWait(row: CycleStageWait, text: string): Promise<void> {
      caption.textContent = text;
      caption.setAttribute('fill', c.danger);

      // 기다리는 쪽에서 기다림을 받는 쪽으로 화살표를 **거슬러** 올라간다.
      const item = edgeItems.get(edgeKey(row.on, row.from));
      const dot = el('circle', { r: 5.5, fill: c.danger });
      layerFx.appendChild(dot);

      if (item) {
        paintEdge(item, 'ring');
        await animate(TRACE_MS, (p) => {
          const at = pointAt(item.geom, 1 - ease(p));
          dot.setAttribute('cx', String(at.x));
          dot.setAttribute('cy', String(at.y));
        });
      }
      dot.remove();

      for (const id of [row.from, row.on]) {
        const n = nodes.get(id);
        if (n) paintNode(n, 'stuck');
      }
      if (row.trailing) {
        const n = nodes.get(row.from);
        if (n) n.disc.setAttribute('stroke-dasharray', '5 4');
      }
      if (row.closes) await closeRing(row.ring);
    }

    /** 고리가 닫히는 순간. 걸어온 활들을 이어 한 바퀴를 그린다. */
    async function closeRing(ring: string[]): Promise<void> {
      if (ring.length < 2) return;
      const parts: Geom[] = [];
      for (let i = 0; i < ring.length; i += 1) {
        const waiter = ring[i]!;
        const on = ring[(i + 1) % ring.length]!;
        const item = edgeItems.get(edgeKey(on, waiter));
        if (!item) return;
        paintEdge(item, 'ring');
        parts.push(item.geom);
      }
      // 활을 이어 붙인다. 이음매는 L 로 건너뛰는데, 그 자리는 정점 원판 아래라
      // 보이지 않는다. 이어 놓으면 두 활이 닫힌 한 바퀴가 된다.
      const d =
        parts
          .map((g, i) =>
            i === 0
              ? geomPath(g)
              : `L ${g.p0.x} ${g.p0.y} ${geomPath(g).replace(/^M [^A-Z]*/, '')}`,
          )
          .join(' ') + ' Z';
      const length = parts.reduce((sum, g) => sum + geomLength(g), 0);

      const lens = el('path', {
        d,
        fill: withAlpha(c.danger, 0.08),
        stroke: c.danger,
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'fill-opacity': 0,
        'stroke-dasharray': `${Math.round(length)} ${Math.round(length)}`,
        'stroke-dashoffset': Math.round(length),
      });
      layerTint.appendChild(lens);
      await animate(TRACE_MS, (p) => {
        const k = ease(p);
        lens.setAttribute('stroke-dashoffset', String(Math.round(length * (1 - k))));
        lens.setAttribute('fill-opacity', String(k));
      });
    }

    async function halt(row: CycleStageHalt, text: string): Promise<void> {
      caption.textContent = text;
      caption.setAttribute('fill', c.danger);

      for (let i = row.extracted.length; i < slots.length; i += 1) {
        const slot = slots[i];
        if (!slot) continue;
        slot.box.setAttribute('stroke', c.danger);
        slot.mark.setAttribute('opacity', '1');
      }
      // 남은 것들이 한 번 내려앉고 굳는다.
      await animate(HALT_MS, (p) => {
        const settle = Math.sin(p * Math.PI) * 5;
        for (const id of row.stuck) {
          const n = nodes.get(id);
          if (!n) continue;
          n.dy = settle;
          setNodeTransform(n);
        }
      });
      for (const id of row.stuck) {
        const n = nodes.get(id);
        if (!n) continue;
        n.dy = 0;
        setNodeTransform(n);
      }
    }

    function rewind(): void {
      draw(board);
    }

    if (params.initialData) {
      const raw = params.initialData as { vertices?: unknown; edges?: unknown };
      const vertices = Array.isArray(raw.vertices)
        ? raw.vertices.filter((v): v is string => typeof v === 'string')
        : [];
      const edges = Array.isArray(raw.edges)
        ? raw.edges.filter(
            (e): e is CycleStageEdge =>
              typeof e === 'object' &&
              e !== null &&
              typeof (e as CycleStageEdge).from === 'string' &&
              typeof (e as CycleStageEdge).to === 'string',
          )
        : [];
      draw({ vertices, edges });
    } else {
      draw({ vertices: [], edges: [] });
    }

    return {
      setBoard,
      survey,
      scan,
      extract,
      traceWait,
      halt,
      rewind,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const resolve of waiting) resolve();
        waiting.clear();
        root.remove();
      },
    };
  },
};
