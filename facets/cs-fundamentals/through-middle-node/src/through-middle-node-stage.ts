/**
 * through-middle-node-stage — 곧은 길이 꺾인 길에게 자리를 내주는 화면.
 *
 * 정점은 원둘레에 놓되, 주어진 간선이 원둘레의 변이 되도록 이웃 순서를 찾는다
 * (`ringOrder`). 그러면 아직 없는 길만 대각선으로 남아, "가운데를 거치는 길" 이
 * 도형을 가로지르는 모양이 된다.
 *
 * 아는 거리는 모두 **곧은 줄** 하나로 그린다. 그 줄이 짧아지는 순간에만 줄이
 * 가운데 정점 쪽으로 휘어 그 점을 지나갔다가, 새 수를 달고 다시 곧게 펴진다.
 * 이 조각에서 위치가 움직이는 것은 그 대목과 물음이 길을 짚어 가는 점뿐이다.
 *
 * 오른쪽 장부는 물음이 몇 번이나 되풀이되는지를 남긴다. 가운데 후보 하나가
 * 한 칸(열)이고, 그 아래 칸 하나가 물음 하나다. 재생이 끝난 뒤에도 그림이
 * 스스로 "이만큼 물어 이만큼만 그렇다" 라고 말하게 하는 자리다.
 */

import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 312;

/** 정점을 얹는 타원. 오른쪽 장부 자리를 빼고 왼쪽 폭을 채운다. */
const CENTER_X = 200;
const CENTER_Y = 138;
const RING_RX = 150;
const RING_RY = 94;
const NODE_R = 19;

const LEDGER_LEFT = 408;
const LEDGER_RIGHT = 592;
const LEDGER_COL_MAX = 46;
const LEDGER_TOP = 58;
const LEDGER_BOTTOM = 214;
const LEDGER_ROW_MAX = 23;

const FORMULA_Y = 272;
const CAPTION_Y = 298;

/** 배지는 줄 위 이 자리에 얹힌다. 0.5 로 두면 휠 때 가운데 정점 위에 겹친다. */
const BADGE_T = 0.32;
const BADGE_OFFSET = 13;

const INFINITY_MARK = '∞';
const YES_MARK = '✓';
const NO_MARK = '✗';

type Pt = { x: number; y: number };

export type ThroughMiddleNodeStageEdge = { from: string; to: string; weight: number };

export type ThroughMiddleNodeScene = {
  nodes: string[];
  edges: ThroughMiddleNodeStageEdge[];
};

export type ThroughMiddleNodeLedger = {
  middles: string[];
  rows: number;
};

export type ThroughMiddleNodeQuestion = {
  from: string;
  to: string;
  middle: string;
  middleIndex: number;
  pairIndex: number;
  legA: number | null;
  legB: number | null;
  sum: number | null;
  current: number | null;
  shorter: boolean;
};

/**
 * 장부 한 칸의 상태.
 *
 * "아니다" 를 둘로 가른다 — `no` 는 길이 끊겨 재 볼 것도 없던 자리이고,
 * `weighed` 는 길이 다 있어 재 보았는데 더 멀던 자리다. 같은 회색으로 두면
 * 장부가 그 구분을 지우고, 그러면 이 조각의 물음이 "길이 있는가" 로만 읽힌다.
 */
type SlotState = 'idle' | 'asking' | 'no' | 'weighed' | 'yes';

type Chord = {
  from: string;
  to: string;
  /** 배지에 새기는 글자. 아직 없는 길이면 ∞ 다. */
  label: string;
  kind: 'road' | 'ghost';
  improved: boolean;
  /** 지금 물음의 대상인가. */
  hot: boolean;
  /** 0 이면 곧은 줄, 1 이면 가운데 정점을 지나는 줄. */
  bend: number;
  rest: Pt;
  pierce: Pt | null;
  badgeScale: number;
  group: SVGGElement;
  path: SVGPathElement;
  head: SVGPolygonElement;
  badge: SVGGElement;
  badgeBox: SVGRectElement;
  badgeText: SVGTextElement;
};

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

function pairKey(from: string, to: string): string {
  return `${from}>${to}`;
}

function unit(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function lerpPt(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

function quadAt(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

function quadTangent(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  return {
    x: 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x),
    y: 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y),
  };
}

/**
 * 줄 바깥쪽을 가리키는 법선. 배지를 도형 밖으로 밀어내 줄과 겹치지 않게 한다.
 * 도형 한가운데를 지나는 대각선은 안팎이 정해지지 않으므로 위쪽(없으면 오른쪽)을
 * 택한다 — 두 대각선이 서로 다른 쪽으로 비켜 앉는다.
 */
function outwardNormal(at: Pt, tangent: Pt): Pt {
  const len = Math.hypot(tangent.x, tangent.y) || 1;
  let nx = -tangent.y / len;
  let ny = tangent.x / len;
  const side = nx * (at.x - CENTER_X) + ny * (at.y - CENTER_Y);
  if (side < -1e-6) return { x: -nx, y: -ny };
  if (side <= 1e-6 && (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0))) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

/**
 * 원둘레에 놓을 차례. 주어진 간선이 변이 되도록 이어지는 고리를 찾는다.
 * 고리가 없으면 선언 순서 그대로 놓는다 — 그림이 덜 곱더라도 틀리지는 않는다.
 */
function ringOrder(nodes: string[], edges: ThroughMiddleNodeStageEdge[]): string[] {
  if (nodes.length < 3) return [...nodes];
  const near = new Map<string, Set<string>>();
  for (const id of nodes) near.set(id, new Set<string>());
  for (const edge of edges) {
    near.get(edge.from)?.add(edge.to);
    near.get(edge.to)?.add(edge.from);
  }
  const first = nodes[0] as string;
  const path = [first];
  const used = new Set([first]);
  let visits = 0;
  const walk = (): boolean => {
    visits += 1;
    if (visits > 4000) return false;
    const last = path[path.length - 1] as string;
    if (path.length === nodes.length) return near.get(last)?.has(first) === true;
    for (const id of nodes) {
      if (used.has(id) || near.get(last)?.has(id) !== true) continue;
      used.add(id);
      path.push(id);
      if (walk()) return true;
      path.pop();
      used.delete(id);
    }
    return false;
  };
  return walk() ? [...path] : [...nodes];
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

export const throughMiddleNodeStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    // 러너가 붙여 준 캔버스를 떼지 않는다. 비울 것은 캔버스 안쪽뿐이다 (S-view).
    svg.textContent = '';

    let destroyed = false;
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임·타이머를 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지
     * 않으므로 `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면
     * `await ctx.emit` 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과
     * projector 와 SVG 트리가 통째로 붙들린다. 글 하나에 조각이 여럿 박히고
     * 스크롤로 mount/unmount 가 되풀이되면 그것이 쌓인다 (S-view).
     */
    const waiters = new Set<() => void>();

    const nextFrame = (cb: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => cb())
        : (setTimeout(cb, 16) as unknown as number);
    const dropFrame = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };

    /** 스스로 다음 회차를 예약하는 루프. destroy 가 프레임을 거두고 기다리던 것을 깨운다. */
    function animate(durationMs: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || durationMs <= 0) {
          if (!destroyed) apply(1);
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / durationMs);
          apply(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          id = nextFrame(tick);
          frames.add(id);
        };
        id = nextFrame(tick);
        frames.add(id);
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    // ── 뼈대 ────────────────────────────────────────────────────────────────
    const root = el('g');
    const chordLayer = el('g');
    const probeLayer = el('g', { opacity: 0 });
    const nodeLayer = el('g');
    const ledgerLayer = el('g');
    root.appendChild(chordLayer);
    root.appendChild(probeLayer);
    root.appendChild(nodeLayer);
    root.appendChild(ledgerLayer);

    const formulaText = el('text', {
      x: W / 2,
      y: FORMULA_Y,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    formulaText.setAttribute('xml:space', 'preserve');
    const captionText = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.textMuted,
    });
    root.appendChild(formulaText);
    root.appendChild(captionText);
    svg.appendChild(root);

    // 물음이 길을 짚어 가는 점과, 길이 끊긴 자리를 막는 빗장.
    const probeA = el('path', { fill: 'none', 'stroke-linecap': 'round' });
    const probeB = el('path', { fill: 'none', 'stroke-linecap': 'round' });
    const probeDot = el('circle', { r: 5.5, fill: colors.itemComparing });
    const barrier = el('line', {
      stroke: colors.ghostOutline,
      'stroke-width': 3,
      'stroke-linecap': 'round',
      opacity: 0,
    });
    probeLayer.appendChild(probeA);
    probeLayer.appendChild(probeB);
    probeLayer.appendChild(barrier);
    probeLayer.appendChild(probeDot);

    // ── 상태 ────────────────────────────────────────────────────────────────
    let scene: ThroughMiddleNodeScene = { nodes: [], edges: [] };
    const spot = new Map<string, Pt>();
    const nodeShapes = new Map<string, { group: SVGGElement; disc: SVGCircleElement; ring: SVGCircleElement; text: SVGTextElement }>();
    const chords = new Map<string, Chord>();
    const slots: SVGRectElement[][] = [];
    const columnHeads: SVGTextElement[] = [];
    let middleNow: string | null = null;
    /** 마지막 물음이 짚어 간 길. 되돌아 나올 때 그대로 거꾸로 밟는다. */
    let walkDot: ((u: number) => void) | null = null;

    // ── 정점 ────────────────────────────────────────────────────────────────
    function layoutNodes(): void {
      spot.clear();
      const ring = ringOrder(scene.nodes, scene.edges);
      const count = Math.max(1, ring.length);
      ring.forEach((id, i) => {
        const angle = Math.PI + (i * 2 * Math.PI) / count;
        spot.set(id, {
          x: CENTER_X + RING_RX * Math.cos(angle),
          y: CENTER_Y + RING_RY * Math.sin(angle),
        });
      });
    }

    function drawNodes(): void {
      nodeLayer.textContent = '';
      nodeShapes.clear();
      for (const id of scene.nodes) {
        const at = spot.get(id);
        if (!at) continue;
        const group = el('g', { transform: `translate(${at.x} ${at.y})` });
        const ring = el('circle', {
          r: NODE_R,
          fill: 'none',
          stroke: colors.itemActive,
          'stroke-width': 2,
          opacity: 0,
        });
        const disc = el('circle', {
          r: NODE_R,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 2,
        });
        const text = el('text', {
          x: 0,
          y: 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: colors.text,
        });
        text.textContent = id;
        group.appendChild(ring);
        group.appendChild(disc);
        group.appendChild(text);
        nodeLayer.appendChild(group);
        nodeShapes.set(id, { group, disc, ring, text });
      }
    }

    function placeNode(id: string, scale: number): void {
      const shape = nodeShapes.get(id);
      const at = spot.get(id);
      if (!shape || !at) return;
      shape.group.setAttribute('transform', `translate(${at.x} ${at.y}) scale(${scale})`);
    }

    // ── 길 ──────────────────────────────────────────────────────────────────
    function restCtrl(from: string, to: string): Pt {
      const a = spot.get(from);
      const b = spot.get(to);
      if (!a || !b) return { x: CENTER_X, y: CENTER_Y };
      const mid = lerpPt(a, b, 0.5);
      // 반대 방향 길이 함께 있으면 둘이 겹친다. 진행 방향의 왼쪽으로 비켜
      // 앉히면 반대편 길은 저절로 반대쪽으로 간다.
      const opposed = scene.edges.some((e) => e.from === to && e.to === from);
      if (!opposed) return mid;
      const dir = unit(a, b);
      return { x: mid.x - dir.y * 11, y: mid.y + dir.x * 11 };
    }

    /** t=0.5 에서 가운데 정점을 지나는 제어점. */
    function pierceCtrl(from: string, to: string, through: Pt): Pt {
      const a = spot.get(from);
      const b = spot.get(to);
      if (!a || !b) return through;
      return { x: 2 * through.x - (a.x + b.x) / 2, y: 2 * through.y - (a.y + b.y) / 2 };
    }

    function renderChord(chord: Chord): void {
      const a = spot.get(chord.from);
      const b = spot.get(chord.to);
      if (!a || !b) return;
      const ctrl = chord.pierce ? lerpPt(chord.rest, chord.pierce, chord.bend) : chord.rest;
      const out = unit(a, ctrl);
      const into = unit(ctrl, b);
      const start = { x: a.x + out.x * (NODE_R + 2), y: a.y + out.y * (NODE_R + 2) };
      const end = { x: b.x - into.x * (NODE_R + 7), y: b.y - into.y * (NODE_R + 7) };

      chord.path.setAttribute('d', `M ${start.x} ${start.y} Q ${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`);
      const angle = (Math.atan2(into.y, into.x) * 180) / Math.PI;
      chord.head.setAttribute('transform', `translate(${end.x} ${end.y}) rotate(${angle})`);

      const at = quadAt(start, ctrl, end, BADGE_T);
      const normal = outwardNormal(at, quadTangent(start, ctrl, end, BADGE_T));
      const bx = at.x + normal.x * BADGE_OFFSET;
      const by = at.y + normal.y * BADGE_OFFSET;
      chord.badge.setAttribute('transform', `translate(${bx} ${by}) scale(${chord.badgeScale})`);

      const width = 13 + chord.label.length * 7.5;
      chord.badgeBox.setAttribute('x', String(-width / 2));
      chord.badgeBox.setAttribute('width', String(width));
      chord.badgeText.textContent = chord.label;
    }

    function styleChord(chord: Chord): void {
      const ghost = chord.kind === 'ghost';
      const stroke = chord.hot
        ? colors.itemComparing
        : ghost
          ? colors.ghostOutline
          : chord.improved
            ? colors.text
            : colors.textMuted;
      const width = chord.hot ? 2.8 : ghost ? 1.6 : chord.improved ? 2.4 : 1.6;
      chord.path.setAttribute('stroke', stroke);
      chord.path.setAttribute('stroke-width', String(width));
      chord.path.setAttribute('stroke-dasharray', ghost ? '6 6' : 'none');
      chord.head.setAttribute('fill', stroke);
      chord.head.setAttribute('opacity', ghost ? '0.7' : '1');

      const filled = chord.improved && !ghost;
      chord.badgeBox.setAttribute('fill', filled ? colors.accent : colors.bg);
      chord.badgeBox.setAttribute('stroke', chord.hot ? colors.itemComparing : filled ? colors.accent : colors.border);
      chord.badgeText.setAttribute('fill', filled ? colors.stateInk : ghost ? colors.textMuted : colors.text);
    }

    function createChord(from: string, to: string, label: string, kind: 'road' | 'ghost'): Chord {
      const group = el('g');
      const path = el('path', { fill: 'none', 'stroke-linecap': 'round' });
      const head = el('polygon', { points: '0,0 -9,-4.6 -9,4.6' });
      const badge = el('g');
      const badgeBox = el('rect', { y: -9, height: 18, rx: 5, 'stroke-width': 1.4 });
      const badgeText = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      badge.appendChild(badgeBox);
      badge.appendChild(badgeText);
      group.appendChild(path);
      group.appendChild(head);
      group.appendChild(badge);
      chordLayer.appendChild(group);

      const chord: Chord = {
        from,
        to,
        label,
        kind,
        improved: false,
        hot: false,
        bend: 0,
        rest: restCtrl(from, to),
        pierce: null,
        badgeScale: 1,
        group,
        path,
        head,
        badge,
        badgeBox,
        badgeText,
      };
      chords.set(pairKey(from, to), chord);
      styleChord(chord);
      renderChord(chord);
      return chord;
    }

    function dropChord(chord: Chord): void {
      chord.group.remove();
      chords.delete(pairKey(chord.from, chord.to));
    }

    // ── 장부 ────────────────────────────────────────────────────────────────
    function slotFill(state: SlotState): { fill: string; stroke: string } {
      if (state === 'asking') return { fill: colors.itemComparing, stroke: colors.itemComparing };
      if (state === 'yes') return { fill: colors.accent, stroke: colors.accent };
      // 재 보고 물러난 자리는 짙은 회색 — 길이 끊겨 지나간 옅은 회색과 구별된다.
      if (state === 'weighed') return { fill: colors.textMuted, stroke: colors.textMuted };
      // 물었으나 아니었던 자리도 **찬 칸**이어야 한다. 비어 보이면 재생 도중에
      // 어디까지 물었는지 알 수 없고, 그러면 장부가 "많다" 를 말하지 못한다.
      if (state === 'no') return { fill: colors.border, stroke: colors.border };
      return { fill: 'none', stroke: colors.border };
    }

    function paintSlot(rect: SVGRectElement, state: SlotState): void {
      const tone = slotFill(state);
      rect.setAttribute('fill', tone.fill);
      rect.setAttribute('stroke', tone.stroke);
    }

    function buildLedger(ledger: ThroughMiddleNodeLedger): void {
      ledgerLayer.textContent = '';
      slots.length = 0;
      columnHeads.length = 0;
      const columns = Math.max(1, ledger.middles.length);
      const rows = Math.max(1, ledger.rows);
      const colPitch = Math.min(LEDGER_COL_MAX, (LEDGER_RIGHT - LEDGER_LEFT) / columns);
      const rowPitch = Math.min(LEDGER_ROW_MAX, (LEDGER_BOTTOM - LEDGER_TOP) / rows);
      const slotW = Math.max(10, colPitch - 20);
      const slotH = Math.max(6, rowPitch - 6);

      const label = el('text', {
        x: LEDGER_LEFT,
        y: 26,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      label.textContent = tr('label.ledger', 'questions asked');
      ledgerLayer.appendChild(label);

      ledger.middles.forEach((id, c) => {
        const cx = LEDGER_LEFT + colPitch * (c + 0.5);
        const head = el('text', {
          x: cx,
          y: 46,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        head.textContent = id;
        ledgerLayer.appendChild(head);
        columnHeads.push(head);

        const column: SVGRectElement[] = [];
        for (let r = 0; r < rows; r += 1) {
          const rect = el('rect', {
            x: cx - slotW / 2,
            y: LEDGER_TOP + rowPitch * r,
            width: slotW,
            height: slotH,
            rx: 2,
            'stroke-width': 1.2,
          });
          paintSlot(rect, 'idle');
          ledgerLayer.appendChild(rect);
          column.push(rect);
        }
        slots.push(column);
      });
    }

    function markSlot(column: number, row: number, state: SlotState): void {
      const rect = slots[column]?.[row];
      if (rect) paintSlot(rect, state);
    }

    function markColumn(index: number): void {
      columnHeads.forEach((head, i) => {
        head.setAttribute('fill', i === index ? colors.text : colors.textMuted);
        head.setAttribute('font-weight', i === index ? '700' : '400');
      });
    }

    // ── 글 ──────────────────────────────────────────────────────────────────
    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function show(value: number | null): string {
      return value === null ? INFINITY_MARK : String(value);
    }

    function formulaOf(q: ThroughMiddleNodeQuestion): string {
      return `${show(q.legA)} + ${show(q.legB)} = ${show(q.sum)}   <   ${show(q.current)}`;
    }

    function setFormula(text: string, tone: 'ask' | 'yes' | 'no'): void {
      formulaText.textContent = text;
      formulaText.setAttribute('fill', tone === 'no' ? colors.textMuted : colors.text);
      formulaText.setAttribute('font-weight', tone === 'yes' ? '700' : '400');
    }

    // ── 물음이 길을 짚는다 ──────────────────────────────────────────────────
    function legEnds(a: Pt, b: Pt): { s: Pt; e: Pt } {
      const dir = unit(a, b);
      return {
        s: { x: a.x + dir.x * (NODE_R + 2), y: a.y + dir.y * (NODE_R + 2) },
        e: { x: b.x - dir.x * (NODE_R + 2), y: b.y - dir.y * (NODE_R + 2) },
      };
    }

    function hideProbe(): void {
      probeLayer.setAttribute('opacity', '0');
      barrier.setAttribute('opacity', '0');
    }

    async function fadeProbe(ms: number): Promise<void> {
      await animate(ms, (p) => probeLayer.setAttribute('opacity', String(1 - p)));
      hideProbe();
    }

    async function runProbe(q: ThroughMiddleNodeQuestion): Promise<void> {
      const a = spot.get(q.from);
      const m = spot.get(q.middle);
      const b = spot.get(q.to);
      if (!a || !m || !b) return;

      const first = legEnds(a, m);
      const second = legEnds(m, b);
      const hasA = q.legA !== null;
      const hasB = q.legB !== null;

      probeA.setAttribute('d', `M ${first.s.x} ${first.s.y} L ${first.e.x} ${first.e.y}`);
      probeA.setAttribute('stroke', hasA ? colors.itemComparing : colors.ghostOutline);
      probeA.setAttribute('stroke-width', hasA ? '3.2' : '2');
      probeA.setAttribute('stroke-dasharray', hasA ? 'none' : '6 6');
      probeA.setAttribute('opacity', '1');

      probeB.setAttribute('d', `M ${second.s.x} ${second.s.y} L ${second.e.x} ${second.e.y}`);
      probeB.setAttribute('stroke', hasB ? colors.itemComparing : colors.ghostOutline);
      probeB.setAttribute('stroke-width', hasB ? '3.2' : '2');
      probeB.setAttribute('stroke-dasharray', hasB ? 'none' : '6 6');
      probeB.setAttribute('opacity', hasA ? '1' : '0');

      const dotAt = (u: number): Pt =>
        u <= 1 ? lerpPt(first.s, first.e, u) : lerpPt(second.s, second.e, u - 1);
      const moveDot = (u: number): void => {
        const at = dotAt(u);
        probeDot.setAttribute('cx', String(at.x));
        probeDot.setAttribute('cy', String(at.y));
      };
      const putBarrier = (at: Pt, along: Pt): void => {
        barrier.setAttribute('x1', String(at.x - along.y * 9));
        barrier.setAttribute('y1', String(at.y + along.x * 9));
        barrier.setAttribute('x2', String(at.x + along.y * 9));
        barrier.setAttribute('y2', String(at.y - along.x * 9));
        barrier.setAttribute('opacity', '1');
      };

      walkDot = moveDot;
      moveDot(0);
      barrier.setAttribute('opacity', '0');
      probeLayer.setAttribute('opacity', '1');

      if (!hasA) {
        // 첫 걸음부터 길이 없다. 나서자마자 막힌다.
        await animate(100, (p) => moveDot(0.28 * p));
        putBarrier(dotAt(0.28), unit(a, m));
        await animate(70, (p) => moveDot(0.28 - 0.14 * p));
        return;
      }
      if (!hasB) {
        // 가운데까지는 가지만 거기서 나가는 길이 없다.
        await animate(130, (p) => moveDot(p));
        putBarrier(dotAt(1), unit(m, b));
        await animate(70, (p) => moveDot(1 - 0.12 * p));
        return;
      }
      await animate(220, (p) => moveDot(2 * p));
    }

    // ── 재 보고 물러난다 ───────────────────────────────────────────────────
    /**
     * 길은 다 있었는데 더 멀어 그냥 두는 경우.
     *
     * 빗장에 막혀 튕기는 그림을 여기 쓰면 거짓이 된다 — 이쪽은 끝까지 갈 수
     * **있었고**, 가 보고 재 본 끝에 물러나는 것이다. 그래서 점이 도착점까지
     * 갔다가 가운데로 되돌아 나오고, 자리를 지킨 곧은 줄이 한 번 도드라진다.
     */
    async function refuse(chord: Chord): Promise<void> {
      await wait(70);
      await Promise.all([
        animate(200, (p) => walkDot?.(2 - p)),
        animate(200, (p) => probeLayer.setAttribute('opacity', String(1 - p))),
      ]);
      hideProbe();
      await animate(140, (p) => {
        chord.badgeScale = 1 + 0.3 * Math.sin(p * Math.PI);
        renderChord(chord);
      });
      chord.badgeScale = 1;
      renderChord(chord);
    }

    // ── 곧은 길이 자리를 내준다 ────────────────────────────────────────────
    async function pierce(q: ThroughMiddleNodeQuestion, chord: Chord): Promise<void> {
      const through = spot.get(q.middle);
      if (!through || q.sum === null) return;
      chord.pierce = pierceCtrl(chord.from, chord.to, through);

      if (chord.kind === 'ghost') {
        // 없던 길이다. 꺾인 채로 나타나 자리를 차지한다.
        chord.kind = 'road';
        chord.improved = true;
        chord.label = String(q.sum);
        chord.bend = 1;
        chord.group.setAttribute('opacity', '0');
        styleChord(chord);
        renderChord(chord);
        await Promise.all([
          animate(180, (p) => chord.group.setAttribute('opacity', String(p))),
          fadeProbe(180),
        ]);
      } else {
        // 곧던 줄이 가운데 한 점을 향해 휜다.
        await Promise.all([
          animate(260, (p) => {
            chord.bend = p;
            renderChord(chord);
          }),
          fadeProbe(200),
        ]);
        chord.improved = true;
        chord.label = String(q.sum);
        styleChord(chord);
        renderChord(chord);
      }

      await animate(120, (p) => {
        chord.badgeScale = 1 + 0.4 * Math.sin(p * Math.PI);
        renderChord(chord);
      });
      // 새 수를 달고 다시 곧아진다 — 이제 이 줄이 가운데를 거치는 길이다.
      await animate(280, (p) => {
        chord.bend = 1 - p;
        renderChord(chord);
      });
      chord.bend = 0;
      chord.badgeScale = 1;
      chord.pierce = null;
      renderChord(chord);
    }

    // ── 다시 세우기 ────────────────────────────────────────────────────────
    function rebuild(): void {
      hideProbe();
      chordLayer.textContent = '';
      chords.clear();
      ledgerLayer.textContent = '';
      slots.length = 0;
      columnHeads.length = 0;
      middleNow = null;
      setCaption('');
      setFormula('', 'ask');
      layoutNodes();
      drawNodes();
      for (const edge of scene.edges) {
        const known = chords.get(pairKey(edge.from, edge.to));
        if (known) {
          if (edge.weight < Number(known.label)) {
            known.label = String(edge.weight);
            renderChord(known);
          }
          continue;
        }
        createChord(edge.from, edge.to, String(edge.weight), 'road');
      }
    }

    return {
      setScene(next: ThroughMiddleNodeScene): void {
        scene = { nodes: [...next.nodes], edges: next.edges.map((e) => ({ ...e })) };
        rebuild();
      },

      rewind(): void {
        rebuild();
      },

      async openRoads(ledger: ThroughMiddleNodeLedger, caption: string): Promise<void> {
        setCaption(caption);
        buildLedger(ledger);
        // 장부가 오른쪽에서 미끄러져 들어온다.
        await animate(260, (p) => {
          ledgerLayer.setAttribute('opacity', String(p));
          ledgerLayer.setAttribute('transform', `translate(${(1 - p) * 14} 0)`);
        });
        ledgerLayer.setAttribute('transform', 'translate(0 0)');
      },

      async setMiddle(middle: string, order: number, caption: string): Promise<void> {
        setCaption(caption);
        setFormula('', 'ask');
        markColumn(order);
        const leaving = middleNow;
        middleNow = middle;
        const entering = nodeShapes.get(middle);
        const leavingShape = leaving === null ? undefined : nodeShapes.get(leaving);
        if (entering) {
          entering.disc.setAttribute('fill', colors.itemActive);
          entering.disc.setAttribute('stroke', colors.itemActive);
          entering.text.setAttribute('fill', colors.stateInk);
        }
        if (leavingShape) {
          leavingShape.disc.setAttribute('fill', colors.itemDefault);
          leavingShape.disc.setAttribute('stroke', colors.border);
          leavingShape.text.setAttribute('fill', colors.text);
          leavingShape.ring.setAttribute('opacity', '0');
        }
        // 가운데로 세운다 — 그 점만 한 뼘 일어선다.
        await animate(220, (p) => {
          if (leaving !== null) placeNode(leaving, 1.14 - 0.14 * p);
          placeNode(middle, 1 + 0.14 * p);
          entering?.ring.setAttribute('r', String(NODE_R + 7 * p));
          entering?.ring.setAttribute('opacity', String(0.45 * p));
        });
      },

      async ask(
        q: ThroughMiddleNodeQuestion,
        texts: { question: string; verdict: string },
      ): Promise<void> {
        setCaption(texts.question);
        setFormula(`${formulaOf(q)}   ?`, 'ask');
        markSlot(q.middleIndex, q.pairIndex, 'asking');

        const key = pairKey(q.from, q.to);
        const target = chords.get(key) ?? createChord(q.from, q.to, INFINITY_MARK, 'ghost');
        target.hot = true;
        styleChord(target);

        await runProbe(q);

        // 답은 세 갈래다 — 짧아진다 · 재 보니 더 멀다 · 길이 끊겼다.
        const weighed = q.legA !== null && q.legB !== null;
        setCaption(texts.verdict);
        if (q.shorter) {
          setFormula(`${formulaOf(q)}   ${YES_MARK}`, 'yes');
          await pierce(q, target);
        } else if (weighed) {
          setFormula(`${formulaOf(q)}   ${NO_MARK}`, 'no');
          await refuse(target);
        } else {
          setFormula(`${formulaOf(q)}   ${NO_MARK}`, 'no');
          await fadeProbe(90);
          if (target.kind === 'ghost') dropChord(target);
        }
        target.hot = false;
        if (chords.has(key)) styleChord(target);
        markSlot(q.middleIndex, q.pairIndex, q.shorter ? 'yes' : weighed ? 'weighed' : 'no');
      },

      async finish(caption: string): Promise<void> {
        setCaption(caption);
        setFormula('', 'ask');
        hideProbe();
        if (middleNow !== null) {
          const shape = nodeShapes.get(middleNow);
          if (shape) {
            shape.disc.setAttribute('fill', colors.itemDefault);
            shape.disc.setAttribute('stroke', colors.border);
            shape.text.setAttribute('fill', colors.text);
            shape.ring.setAttribute('opacity', '0');
          }
          placeNode(middleNow, 1);
          middleNow = null;
        }
        markColumn(-1);
        // 고쳐진 줄만 한 번씩 짚어 준다.
        for (const chord of chords.values()) {
          if (!chord.improved || destroyed) continue;
          await animate(110, (p) => {
            chord.badgeScale = 1 + 0.35 * Math.sin(p * Math.PI);
            renderChord(chord);
          });
          chord.badgeScale = 1;
          renderChord(chord);
          await wait(60);
        }
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) dropFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
