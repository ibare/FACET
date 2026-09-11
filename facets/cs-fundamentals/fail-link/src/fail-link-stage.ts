/**
 * fail-link-stage — 미끄러지는 것을 보이는 그림.
 *
 * 화면은 두 층이다. 위는 훑는 텍스트 한 줄, 아래는 패턴 넷이 이룬 나무.
 * 커서는 **자리를 옮겨 다니는 고리** 하나뿐이고, 이 조각이 말하려는 것은 그 고리가
 * 뿌리로 되돌아가지 않고 나무를 가로질러 **옆으로 미끄러지는** 한 순간이다.
 * 그래서 운동은 전부 좌표 이동이다 — 색이 바뀌는 것은 이미 지나간 자리의 흔적뿐.
 *
 * 세로는 여기서 정한다 (가로는 러너가 `PIECE_CANVAS_W` 로 준다). 마디 자리는
 * 캔버스에서 역산하므로 선언에 좌표가 없다 (S-piece).
 */

import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 글줄 하나 + 깊이 다섯 줄 + 캡션 세 줄이 들어가는 높이. */
const H = 400;

// ── 텍스트 줄
const TEXT_TOP = 16;
const TEXT_H = 38;
/** 글자 칸의 **상한**. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 66;
const CELL_SIDE_MIN = 40;
const MATCH_BAR_Y = 58;

// ── 나무
/** 뿌리 한가운데의 세로 자리. */
const TREE_TOP = 94;
const ROW_H = 53;
const NODE_R = 18;
/** 잎이 놓이는 가로 여백. 나머지 폭은 잎들이 고르게 나눠 갖는다. */
const TREE_SIDE = 96;
const CURSOR_R = NODE_R + 5;
const ARC_BOW_MAX = 46;

// ── 캡션
const CAPTION_TOP = 346;
const CAPTION_LINE_H = 20;
const CAPTION_LINES = 3;
const CAPTION_SIDE = 24;

// ── 걸음마다의 애니메이션 길이(ms). stepMs 는 이것이 끝난 뒤부터 잰다.
const GROW_MS = 200;
const LINK_MS = 420;
const STEP_MS = 340;
const SHAKE_MS = 300;
const DEAD_MS = 220;
const SLIDE_MS = 640;
const GHOST_MS = 760;
const SETTLE_MS = 240;
const FRAME_MS = 16;

/** 그래픽에 새겨진 표식 — 번역 대상이 아니다 (C10). */
const ROOT_GLYPH = 'root';

type Pt = { x: number; y: number };

/** 걸음마다 projector 가 좁혀 넘기는 마디 구조. */
export type FailLinkWireNode = {
  id: number;
  parent: number;
  ch: string;
  word: string;
  depth: number;
  terminal: string | null;
};

export type FailLinkScanStep = {
  index: number;
  ch: string;
  from: number;
  to: number;
  matched: string | null;
};

export type FailLinkSlideStep = {
  index: number;
  from: number;
  to: number;
};

export type FailLinkNaiveStep = {
  from: number;
  missed: string;
};

type Laid = FailLinkWireNode & Pt;

type NodeEl = {
  g: SVGGElement;
  circle: SVGCircleElement;
  glyph: SVGTextElement;
  /** 패턴이 끝나는 마디의 안쪽 고리. 아니면 null. */
  inner: SVGCircleElement | null;
  /** 패턴이 끝나는 마디 옆의 글자열. 아니면 null. */
  tag: SVGTextElement | null;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function quad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

function quadLength(a: Pt, c: Pt, b: Pt): number {
  let total = 0;
  let prev = a;
  for (let i = 1; i <= 24; i += 1) {
    const cur = quad(a, c, b, i / 24);
    total += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
  }
  return total;
}

/**
 * 실패 링크가 지나는 길. 두 마디를 잇는 선을 바깥(아래쪽)으로 부풀려 마디를
 * 피한다. 링크 층을 마디 층보다 먼저 붙이므로 겹치는 자리는 마디가 가린다.
 */
function arcControl(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const bow = Math.min(ARC_BOW_MAX, len * 0.18);
  return { x: (a.x + b.x) / 2 + nx * bow, y: (a.y + b.y) / 2 + ny * bow };
}

/** 글자 하나의 대략 폭. 줄바꿈 자리를 잡는 데만 쓴다. */
function charWidth(ch: string, size: number): number {
  const code = ch.codePointAt(0) ?? 0;
  const wide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60);
  return wide ? size : size * 0.55;
}

function textWidth(s: string, size: number): number {
  let total = 0;
  for (const ch of s) total += charWidth(ch, size);
  return total;
}

/** 한 줄로 넘치는 캡션을 낱말 경계에서 접는다. */
function wrap(s: string, size: number, maxW: number, maxLines: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const candidate = cur === '' ? word : `${cur} ${word}`;
    if (textWidth(candidate, size) <= maxW || cur === '') {
      cur = candidate;
      continue;
    }
    lines.push(cur);
    cur = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur !== '') lines.push(cur);
  return lines.slice(0, maxLines);
}

/** 선언에서 그림이 쓰는 것만 좁혀 낸다 (C9). 좁히는 규칙은 여기 한 벌뿐이다. */
function readScene(initialData: Record<string, unknown> | undefined): { text: string } {
  const raw = initialData ?? {};
  return { text: typeof raw.text === 'string' ? raw.text : '' };
}

/**
 * 잎을 왼쪽부터 차례로 세우고 안쪽 마디는 자식들의 가운데에 둔다. 잎 사이 간격은
 * 캔버스 폭에서 역산하므로 나무가 넓어지면 저절로 폭을 채운다.
 */
function layoutTree(nodes: FailLinkWireNode[], w: number): Laid[] {
  const kids = new Map<number, number[]>();
  for (const n of nodes) {
    if (n.parent < 0) continue;
    const list = kids.get(n.parent);
    if (list === undefined) kids.set(n.parent, [n.id]);
    else list.push(n.id);
  }

  const slot = new Map<number, number>();
  let leaves = 0;
  const walk = (id: number): number => {
    const children = kids.get(id) ?? [];
    if (children.length === 0) {
      const s = leaves;
      leaves += 1;
      slot.set(id, s);
      return s;
    }
    let sum = 0;
    for (const child of children) sum += walk(child);
    const s = sum / children.length;
    slot.set(id, s);
    return s;
  };
  if (nodes.length > 0) walk(0);

  const span = Math.max(1, leaves - 1);
  const gap = (w - TREE_SIDE * 2) / span;
  return nodes.map((n) => ({
    ...n,
    x: TREE_SIDE + (slot.get(n.id) ?? 0) * gap,
    y: TREE_TOP + n.depth * ROW_H,
  }));
}

export const failLinkStageView: CanvasView = {
  canvas: { height: H },

  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);
    const w = svg.viewBox.baseVal.width || 0;
    const W = w > 0 ? w : 620;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 한꺼번에 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

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

    /** 끝나는 시각이 있는 되풀이. destroy 되면 다음 프레임에서 빠져나온다. */
    async function tween(ms: number, step: (p: number) => void): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (destroyed) return;
        const p = ms <= 0 ? 1 : Math.min(1, (Date.now() - start) / ms);
        step(ease(p));
        if (p >= 1) return;
        await wait(FRAME_MS);
      }
    }

    // ── 층. 먼저 붙인 것이 아래로 깔린다.
    const gEdges = el('g');
    const gArcs = el('g');
    const gNodes = el('g');
    const gMarks = el('g');
    const gTokens = el('g');
    const gText = el('g');
    const gCaption = el('g');
    svg.append(gEdges, gArcs, gNodes, gMarks, gTokens, gText, gCaption);

    // ── 훑는 글줄
    const cellW = Math.min(
      CELL_MAX_W,
      Math.floor((W - CELL_SIDE_MIN * 2) / Math.max(1, scene.text.length)),
    );
    const stripW = cellW * scene.text.length;
    const originX = Math.round((W - stripW) / 2);
    const cellX = (i: number): number => originX + i * cellW;

    const cells: { box: SVGRectElement; glyph: SVGTextElement }[] = [];
    for (let i = 0; i < scene.text.length; i += 1) {
      const box = el('rect', {
        x: cellX(i) + 3,
        y: TEXT_TOP,
        width: cellW - 6,
        height: TEXT_H,
        rx: 6,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1.4,
      });
      const glyph = el('text', {
        x: cellX(i) + cellW / 2,
        y: TEXT_TOP + TEXT_H / 2 + 7,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        fill: c.text,
      });
      glyph.textContent = scene.text[i] ?? '';
      gText.append(box, glyph);
      cells.push({ box, glyph });
    }

    const stripCursor = el('rect', {
      x: cellX(0) - cellW,
      y: TEXT_TOP - 2,
      width: cellW - 2,
      height: TEXT_H + 4,
      rx: 8,
      fill: 'none',
      stroke: c.itemActive,
      'stroke-width': 3,
      opacity: 0,
    });
    gText.append(stripCursor);

    const matchBars: SVGRectElement[] = [];

    // ── 캡션
    const captionLines: SVGTextElement[] = [];
    for (let i = 0; i < CAPTION_LINES; i += 1) {
      const line = el('text', {
        x: W / 2,
        y: CAPTION_TOP + i * CAPTION_LINE_H,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      gCaption.append(line);
      captionLines.push(line);
    }

    // ── 나무 (tree-ready 가 올 때 세운다)
    let laid: Laid[] = [];
    const nodeEls = new Map<number, NodeEl>();
    const edgeEls = new Map<number, SVGLineElement>();
    const arcEls = new Map<number, SVGPathElement>();
    const matchedNodes = new Set<number>();

    const cursor = el('circle', {
      r: CURSOR_R,
      cx: 0,
      cy: 0,
      fill: 'none',
      stroke: c.itemActive,
      'stroke-width': 3,
      opacity: 0,
    });
    const ghost = el('circle', {
      r: CURSOR_R,
      cx: 0,
      cy: 0,
      fill: 'none',
      stroke: c.ghostOutline,
      'stroke-width': 2.4,
      'stroke-dasharray': '5 5',
      opacity: 0,
    });
    gTokens.append(ghost, cursor);

    const at = (id: number): Pt => {
      const node = laid[id];
      return node === undefined ? { x: W / 2, y: TREE_TOP } : { x: node.x, y: node.y };
    };

    const placeNode = (id: number, pt: Pt): void => {
      const item = nodeEls.get(id);
      if (item === undefined) return;
      item.g.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
      const edge = edgeEls.get(id);
      if (edge !== undefined) {
        edge.setAttribute('x2', String(pt.x));
        edge.setAttribute('y2', String(pt.y));
      }
    };

    const showCaption = (text: string): void => {
      const lines = wrap(text, 14, W - CAPTION_SIDE * 2, CAPTION_LINES);
      captionLines.forEach((line, i) => {
        line.textContent = lines[i] ?? '';
      });
    };

    const clearMarks = (): void => {
      while (gMarks.firstChild) gMarks.removeChild(gMarks.firstChild);
    };

    /** 나무만 남기고 자취를 모두 지운다. */
    const resetVisual = (): void => {
      for (const [id, item] of nodeEls) {
        const node = laid[id];
        item.g.setAttribute('opacity', id === 0 ? '1' : '0');
        item.circle.setAttribute('fill', c.itemDefault);
        item.circle.setAttribute('stroke', c.border);
        item.glyph.setAttribute('fill', c.text);
        item.tag?.setAttribute('opacity', '0');
        item.tag?.setAttribute('fill', c.textMuted);
        if (node !== undefined) {
          placeNode(id, node.parent < 0 ? node : at(node.parent));
        }
      }
      for (const edge of edgeEls.values()) edge.setAttribute('opacity', '0');
      for (const arc of arcEls.values()) arc.remove();
      arcEls.clear();
      matchedNodes.clear();
      clearMarks();
      for (const bar of matchBars) bar.remove();
      matchBars.length = 0;
      cursor.setAttribute('opacity', '0');
      ghost.setAttribute('opacity', '0');
      stripCursor.setAttribute('opacity', '0');
      stripCursor.setAttribute('x', String(cellX(0) - cellW));
      for (const cell of cells) {
        cell.box.setAttribute('fill', c.itemDefault);
        cell.box.setAttribute('stroke', c.border);
        cell.glyph.setAttribute('fill', c.text);
      }
      showCaption('');
    };

    const buildTree = (nodes: FailLinkWireNode[]): void => {
      while (gEdges.firstChild) gEdges.removeChild(gEdges.firstChild);
      while (gNodes.firstChild) gNodes.removeChild(gNodes.firstChild);
      for (const arc of arcEls.values()) arc.remove();
      arcEls.clear();
      nodeEls.clear();
      edgeEls.clear();

      laid = [];
      for (const node of layoutTree(nodes, W)) laid[node.id] = node;

      for (const node of laid) {
        if (node === undefined) continue;

        if (node.parent >= 0) {
          const parent = at(node.parent);
          const edge = el('line', {
            x1: parent.x,
            y1: parent.y,
            x2: parent.x,
            y2: parent.y,
            stroke: c.border,
            'stroke-width': 2,
            opacity: 0,
          });
          gEdges.append(edge);
          edgeEls.set(node.id, edge);
        }

        const g = el('g', { opacity: node.id === 0 ? 1 : 0 });
        const circle = el('circle', {
          r: NODE_R,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1.8,
        });
        const glyph = el('text', {
          y: node.id === 0 ? 4 : 5,
          'text-anchor': 'middle',
          'font-family': node.id === 0 ? fonts.body : fonts.mono,
          'font-size': node.id === 0 ? fontSizes.xs : fontSizes.md,
          fill: c.text,
        });
        glyph.textContent = node.id === 0 ? ROOT_GLYPH : node.ch;
        g.append(circle, glyph);

        let inner: SVGCircleElement | null = null;
        let tag: SVGTextElement | null = null;
        if (node.terminal !== null) {
          inner = el('circle', {
            r: NODE_R - 4,
            fill: 'none',
            stroke: c.text,
            'stroke-width': 1.2,
          });
          g.insertBefore(inner, glyph);
          tag = el('text', {
            x: NODE_R + 8,
            y: 4,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
            opacity: 0,
          });
          tag.textContent = node.terminal;
          g.append(tag);
        }

        gNodes.append(g);
        nodeEls.set(node.id, { g, circle, glyph, inner, tag });
      }

      resetVisual();
    };

    const showArc = (from: number, to: number): SVGPathElement => {
      const existing = arcEls.get(from);
      if (existing !== undefined) return existing;
      const a = at(from);
      const b = at(to);
      const ctrl = arcControl(a, b);
      const arc = el('path', {
        d: `M ${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`,
        fill: 'none',
        stroke: c.textMuted,
        'stroke-width': 1.4,
        opacity: 0,
      });
      gArcs.append(arc);
      arcEls.set(from, arc);
      return arc;
    };

    const stage = {
      /** 자리를 미리 잡는다. 아직 뿌리만 보인다. */
      prepareTree(nodes: FailLinkWireNode[]): void {
        buildTree(nodes);
      },

      rewind(): void {
        resetVisual();
      },

      /** 새로 생긴 마디들이 부모 자리에서 제 자리로 자라 나온다. */
      async growPattern(nodeIds: number[]): Promise<void> {
        for (const id of nodeIds) {
          const node = laid[id];
          const item = nodeEls.get(id);
          if (node === undefined || item === undefined) continue;
          const from = at(node.parent);
          const to = { x: node.x, y: node.y };
          const edge = edgeEls.get(id);
          edge?.setAttribute('opacity', '1');
          item.g.setAttribute('opacity', '1');
          await tween(GROW_MS, (p) => {
            placeNode(id, { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) });
            item.circle.setAttribute('opacity', String(Math.min(1, p * 1.6)));
            item.glyph.setAttribute('opacity', String(Math.min(1, p * 1.6)));
          });
          if (item.tag !== null) {
            const tag = item.tag;
            await tween(GROW_MS, (p) => {
              tag.setAttribute('x', String(NODE_R + lerp(0, 8, p)));
              tag.setAttribute('opacity', String(p));
            });
          }
        }
      },

      /** 작은 알갱이가 길을 따라 굴러가며 실패 링크를 그어 놓는다. */
      async linkFail(from: number, to: number): Promise<void> {
        const a = at(from);
        const b = at(to);
        const ctrl = arcControl(a, b);
        const arc = showArc(from, to);
        const total = quadLength(a, ctrl, b);
        arc.setAttribute('stroke-dasharray', String(total));
        arc.setAttribute('stroke-dashoffset', String(total));
        arc.setAttribute('opacity', '0.5');

        const bead = el('circle', { r: 6, fill: c.itemActive, cx: a.x, cy: a.y });
        gTokens.append(bead);
        await tween(LINK_MS, (p) => {
          const pt = quad(a, ctrl, b, p);
          bead.setAttribute('cx', String(pt.x));
          bead.setAttribute('cy', String(pt.y));
          arc.setAttribute('stroke-dashoffset', String(total * (1 - p)));
        });
        bead.remove();
        arc.setAttribute('stroke-dasharray', '5 5');
        arc.setAttribute('stroke-dashoffset', '0');
      },

      /** 글줄의 커서가 한 칸 나아가고, 나무의 고리가 가지를 타고 내려간다. */
      async advanceScan(step: FailLinkScanStep): Promise<void> {
        const fromPt = at(step.from);
        const toPt = at(step.to);
        if (cursor.getAttribute('opacity') !== '1') {
          cursor.setAttribute('cx', String(fromPt.x));
          cursor.setAttribute('cy', String(fromPt.y));
          cursor.setAttribute('opacity', '1');
        }

        for (let i = 0; i < step.index; i += 1) {
          cells[i]?.box.setAttribute('fill', c.bgSubtle);
          cells[i]?.glyph.setAttribute('fill', c.textMuted);
        }
        const stripFrom = Number(stripCursor.getAttribute('x') ?? 0);
        const stripTo = cellX(step.index) + 1;
        stripCursor.setAttribute('opacity', '1');

        const moving = step.from !== step.to;
        await tween(moving ? STEP_MS : SHAKE_MS, (p) => {
          stripCursor.setAttribute('x', String(lerp(stripFrom, stripTo, p)));
          if (moving) {
            cursor.setAttribute('cx', String(lerp(fromPt.x, toPt.x, p)));
            cursor.setAttribute('cy', String(lerp(fromPt.y, toPt.y, p)));
          } else {
            // 이을 길이 없어 제자리다. 흔들려서 그것을 말한다.
            cursor.setAttribute('cx', String(fromPt.x + Math.sin(p * Math.PI * 3) * 6));
          }
        });

        if (step.matched !== null) {
          const span = step.matched.length;
          const start = Math.max(0, step.index - span + 1);
          const bar = el('rect', {
            x: cellX(start) + 3,
            y: MATCH_BAR_Y,
            width: cellX(step.index) + cellW - 3 - (cellX(start) + 3),
            height: 4,
            rx: 2,
            fill: c.itemPivot,
          });
          gText.append(bar);
          matchBars.push(bar);

          const item = nodeEls.get(step.to);
          item?.circle.setAttribute('fill', c.itemPivot);
          item?.circle.setAttribute('stroke', c.text);
          item?.glyph.setAttribute('fill', c.stateInk);
          item?.tag?.setAttribute('fill', c.text);
          matchedNodes.add(step.to);
        }
      },

      /** 이 조각의 한 순간 — 고리가 나무를 가로질러 옆으로 미끄러진다. */
      async slideToFail(step: FailLinkSlideStep): Promise<void> {
        const a = at(step.from);
        const b = at(step.to);
        const ctrl = arcControl(a, b);
        const arc = showArc(step.from, step.to);
        arc.setAttribute('stroke', c.itemActive);
        arc.setAttribute('stroke-width', '2.6');
        arc.setAttribute('opacity', '1');

        // 이어갈 길이 없다는 것부터 보인다 — 있었어야 할 자식 자리에 빈 칸.
        const deadPt = { x: a.x, y: a.y + ROW_H * 0.62 };
        const dead = el('g', { opacity: 0 });
        const slot = el('circle', {
          cx: deadPt.x,
          cy: deadPt.y,
          r: NODE_R - 4,
          fill: 'none',
          stroke: c.danger,
          'stroke-width': 1.6,
          'stroke-dasharray': '4 4',
        });
        const barA = el('line', {
          x1: deadPt.x - 6,
          y1: deadPt.y - 6,
          x2: deadPt.x + 6,
          y2: deadPt.y + 6,
          stroke: c.danger,
          'stroke-width': 2,
        });
        const barB = el('line', {
          x1: deadPt.x + 6,
          y1: deadPt.y - 6,
          x2: deadPt.x - 6,
          y2: deadPt.y + 6,
          stroke: c.danger,
          'stroke-width': 2,
        });
        dead.append(slot, barA, barB);
        gMarks.append(dead);
        await tween(DEAD_MS, (p) => {
          dead.setAttribute('opacity', String(p));
          dead.setAttribute('transform', `translate(0 ${lerp(-10, 0, p)})`);
        });

        await tween(SLIDE_MS, (p) => {
          const pt = quad(a, ctrl, b, p);
          cursor.setAttribute('cx', String(pt.x));
          cursor.setAttribute('cy', String(pt.y));
          if (p > 0.7) dead.setAttribute('opacity', String((1 - p) / 0.3));
        });
        dead.remove();
        arc.setAttribute('stroke-width', '2');
      },

      /** 대비 — 그 자리에서 처음으로 돌아갔다면 어디까지 잃었는가. */
      async showNaiveRestart(step: FailLinkNaiveStep): Promise<void> {
        const a = at(step.from);
        const root = at(0);
        const ctrl = { x: lerp(a.x, root.x, 0.5), y: a.y + 28 };
        ghost.setAttribute('cx', String(a.x));
        ghost.setAttribute('cy', String(a.y));
        ghost.setAttribute('opacity', '1');
        await tween(GHOST_MS, (p) => {
          const pt = quad(a, ctrl, root, p);
          ghost.setAttribute('cx', String(pt.x));
          ghost.setAttribute('cy', String(pt.y));
        });

        const lost = step.missed.split(',').map((s) => s.trim()).filter((s) => s !== '');
        for (const word of lost) {
          const node = laid.find((n) => n !== undefined && n.terminal === word);
          if (node === undefined) continue;
          const ring = el('circle', {
            cx: node.x,
            cy: node.y,
            r: CURSOR_R + 3,
            fill: 'none',
            stroke: c.danger,
            'stroke-width': 2,
            'stroke-dasharray': '4 4',
            opacity: 0,
          });
          const tagX =
            node.x + NODE_R + 16 + textWidth(word, 11);
          const label = el('text', {
            x: tagX,
            y: node.y + 4,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.danger,
            opacity: 0,
          });
          label.textContent = tr('label.missed', 'missed');
          gMarks.append(ring, label);
          await tween(SETTLE_MS, (p) => {
            ring.setAttribute('opacity', String(p));
            ring.setAttribute('r', String(lerp(CURSOR_R + 12, CURSOR_R + 3, p)));
            label.setAttribute('opacity', String(p));
          });
        }
      },

      /** 유령을 거두고, 미끄러진 길과 거둔 것만 남긴다. */
      async finish(): Promise<void> {
        const ghostY = Number(ghost.getAttribute('cy') ?? 0);
        await tween(SETTLE_MS, (p) => {
          ghost.setAttribute('opacity', String(1 - p));
          ghost.setAttribute('cy', String(ghostY + p * 14));
        });
        ghost.setAttribute('opacity', '0');
        clearMarks();
        await tween(SETTLE_MS, (p) => {
          const pulse = Math.sin(p * Math.PI);
          cursor.setAttribute('r', String(CURSOR_R + pulse * 5));
        });
        cursor.setAttribute('r', String(CURSOR_R));
      },

      setCaption(text: string): void {
        showCaption(text);
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };

    // 러너 밖에서 마운트해도 글줄은 선다 — 컨테이너는 러너가 준 그대로 둔다.
    void container;
    return stage;
  },
};
