/**
 * lost-link-stage — 연결 유실 조각의 전용 stage view.
 *
 * ── 형태가 어디서 왔는가
 *
 * 동사는 "떨어져 나간다" 다. 그래서 이 화면의 뼈대는 **가로줄 하나와 그 아래의
 * 빈 자리**다. 위쪽 줄은 head 에서 화살표를 따라 닿을 수 있는 곳이고, 점선
 * 아래는 메모리에는 남았지만 들어갈 길이 없는 곳이다. 노드는 사라지지 않는다 —
 * 줄에서 떨어져 아래로 기울며 내려앉을 뿐이다.
 *
 * 세 가지가 실제로 **움직인다**. 색 전환이 아니다.
 *   - 새 노드가 위에서 내려와 줄 위에 뜬다 (staged)
 *   - 화살표 끝이 원래 겨누던 노드에서 다른 노드로 **건너간다** (moveLink)
 *   - 붙들어 주는 화살표를 잃은 무리가 왼쪽을 축으로 기울며 떨어진다 (detach)
 *
 * ── 닿을 수 없음은 그리는 것이 아니라 계산한다
 *
 * 어떤 노드가 위태로운지 이 view 는 통보받지 않는다. 매 프레임 head 에서
 * 화살표를 따라가 닿는 집합을 구하고, 거기 들지 못한 노드에 위험 색을 준다.
 * 그래서 "화살표를 옮기는 순간 뒤가 끊긴다" 가 주장이 아니라 화면의 결과가 된다.
 *
 * 화면 문자는 하나도 이 파일에 없다. 캡션·라벨·각주는 projector 가 넣어 준다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type Palette,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 좌표계. 폭은 조각 공통값이고 세로는 내용이 정한다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 336;

const NODE_W = 56;
const NODE_H = 36;
const SLOT_X0 = 84;
const SLOT_PITCH = 90;

/** 닿을 수 있는 줄. */
const LANE_Y = 116;
/** 아직 사슬에 들지 못한 새 노드가 뜨는 자리 — 줄 위. */
const STAGE_Y = 40;
/** 화면 밖 위쪽. 새 노드는 여기서 내려오고, 되돌릴 때 여기로 올라간다. */
const OFFSCREEN_Y = -60;
/** 닿을 수 있는 곳과 없는 곳의 경계. */
const BOUNDARY_Y = 190;
/** 떨어져 나간 무리가 내려앉는 자리. */
const FALLEN_Y = 224;
const FALL_DRIFT_X = 18;
const FALL_TILT_DEG = -6;

const HEAD_LABEL_X = 20;
const HEAD_ARROW_X = 58;
const CAPTION_Y = 286;
const CAPTION_LINE_H = 18;
const NOTE_Y = 324;

const ARROW_HEAD = 7;
const ARROW_GAP = 5;

const DUR_STAGE = 520;
const DUR_LINK = 480;
const DUR_FALL = 720;
const DUR_SETTLE = 620;
const DUR_REWIND = 560;

/** 한 줄에 담을 글자 폭 예산. 한글은 두 칸, 라틴은 한 칸으로 센다. */
const CAPTION_BUDGET = 72;

type NodeBox = {
  id: string;
  value: number;
  x: number;
  y: number;
  /** 줄에서 떨어져 나갔는가. */
  fallen: boolean;
  /** 이 판에서 새로 들어온 노드인가 — 아직 아무도 안 가리켜도 위험이 아니다. */
  fresh: boolean;
};

type Link = {
  from: string;
  to: string;
  /** 화살표가 건너오기 전에 겨누던 노드. 건너는 동안만 값이 있다. */
  prevTo: string | null;
  /** 건너기 진행도 0→1. 1 이면 to 를 온전히 겨눈 상태. */
  prog: number;
  /** 이번 걸음에 손댄 화살표인가. */
  active: boolean;
};

type Point = { x: number; y: number };

type InitSpec = {
  nodes: { id: string; value: number }[];
};

function slotX(index: number): number {
  return SLOT_X0 + index * SLOT_PITCH;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

function easeInQuad(p: number): number {
  return p * p;
}

function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 글자 폭 어림 — 한글 한 자는 라틴 두 자 몫을 먹는다. */
function visualWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x1100 ? 2 : 1;
  return w;
}

/** 캡션이 캔버스를 넘지 않게 낱말 경계에서 두 줄까지 접는다. */
function wrapCaption(text: string): string[] {
  if (visualWidth(text) <= CAPTION_BUDGET) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (visualWidth(next) > CAPTION_BUDGET && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

export const lostLinkStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors: Palette = getColors(params.theme);

    const svg = params.canvas;
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('role', 'img');
    svg.style.fontFamily = fonts.body;

    let nodes: NodeBox[] = [];
    let links: Link[] = [];
    let laneOrder: string[] = [];
    /** 처음 사슬의 노드 차례. 되돌리기는 언제나 여기로 돌아간다. */
    let baseline: string[] = [];
    let headTo = '';
    let tilt = 0;
    let caption = '';
    let note = '';
    let bandAbove = '';
    let bandBelow = '';

    let rafId = 0;
    let generation = 0;
    let destroyed = false;

    // ── 모델 조회 ───────────────────────────────────────────────────────
    const nodeById = (id: string): NodeBox | undefined => nodes.find((n) => n.id === id);

    /** head 에서 화살표를 따라 실제로 닿는 노드 집합. 건너는 중인 화살표는 아직 옛 목표를 가리킨다. */
    function reachableSet(): Set<string> {
      const next = new Map<string, string>();
      for (const l of links) next.set(l.from, l.prog >= 1 ? l.to : (l.prevTo ?? l.to));
      const seen = new Set<string>();
      let cur: string | undefined = headTo;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        cur = next.get(cur);
      }
      return seen;
    }

    function hasReferrer(id: string): boolean {
      return links.some((l) => (l.prog >= 1 ? l.to : (l.prevTo ?? l.to)) === id);
    }

    /** 떨어져 나간 무리가 기우는 축 — 무리의 맨 왼쪽. 왼쪽에 걸린 채 뒤가 처지는 모양. */
    function fallPivot(): Point {
      const fallen = nodes.filter((n) => n.fallen);
      if (fallen.length === 0) return { x: 0, y: 0 };
      let min = fallen[0];
      for (const n of fallen) if (n.x < min.x) min = n;
      return { x: min.x, y: min.y + NODE_H / 2 };
    }

    /** 기울기까지 반영한 실제 중심. 화살표도 노드도 이 좌표만 본다. */
    function centerOf(n: NodeBox, pivot: Point): Point {
      const cx = n.x + NODE_W / 2;
      const cy = n.y + NODE_H / 2;
      if (!n.fallen || tilt === 0) return { x: cx, y: cy };
      const rad = (tilt * Math.PI) / 180;
      const dx = cx - pivot.x;
      const dy = cy - pivot.y;
      return {
        x: pivot.x + dx * Math.cos(rad) - dy * Math.sin(rad),
        y: pivot.y + dx * Math.sin(rad) + dy * Math.cos(rad),
      };
    }

    /** 중심에서 목표 쪽으로 나간 광선이 상자 테두리와 만나는 점. */
    function edgePoint(center: Point, toward: Point): Point {
      const dx = toward.x - center.x;
      const dy = toward.y - center.y;
      if (dx === 0 && dy === 0) return center;
      const sx = dx === 0 ? Number.POSITIVE_INFINITY : NODE_W / 2 / Math.abs(dx);
      const sy = dy === 0 ? Number.POSITIVE_INFINITY : NODE_H / 2 / Math.abs(dy);
      const s = Math.min(sx, sy);
      return { x: center.x + dx * s, y: center.y + dy * s };
    }

    // ── 그리기 ─────────────────────────────────────────────────────────
    function drawArrow(from: Point, to: Point, stroke: string, width: number, dashed: boolean): SVGGElement {
      const g = svgEl('g', {});
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const tipX = to.x - ux * ARROW_GAP;
      const tipY = to.y - uy * ARROW_GAP;
      const baseX = tipX - ux * ARROW_HEAD;
      const baseY = tipY - uy * ARROW_HEAD;
      const line = svgEl('line', {
        x1: from.x,
        y1: from.y,
        x2: baseX,
        y2: baseY,
        stroke,
        'stroke-width': width,
        'stroke-linecap': 'round',
      });
      if (dashed) line.setAttribute('stroke-dasharray', '4 4');
      g.appendChild(line);
      g.appendChild(
        svgEl('polygon', {
          points: [
            `${tipX},${tipY}`,
            `${baseX - uy * ARROW_HEAD * 0.42},${baseY + ux * ARROW_HEAD * 0.42}`,
            `${baseX + uy * ARROW_HEAD * 0.42},${baseY - ux * ARROW_HEAD * 0.42}`,
          ].join(' '),
          fill: stroke,
        }),
      );
      return g;
    }

    function drawNode(n: NodeBox, pivot: Point, reach: Set<string>): SVGGElement {
      const c = centerOf(n, pivot);
      const pending = n.fresh && !hasReferrer(n.id);
      const lost = !reach.has(n.id) && !pending;

      const stroke = lost ? colors.danger : pending ? colors.itemActive : colors.border;
      const fill = lost ? colors.bgSubtle : colors.itemDefault;
      const valueFill = n.fallen ? colors.textMuted : colors.text;

      const g = svgEl('g', {});
      if (n.fallen && tilt !== 0) g.setAttribute('transform', `rotate(${tilt} ${c.x} ${c.y})`);
      if (n.fallen) g.setAttribute('opacity', '0.82');

      const rect = svgEl('rect', {
        x: c.x - NODE_W / 2,
        y: c.y - NODE_H / 2,
        width: NODE_W,
        height: NODE_H,
        rx: 5,
        fill,
        stroke,
        'stroke-width': lost || pending ? 2 : 1.2,
      });
      if (pending) rect.setAttribute('stroke-dasharray', '5 3');
      g.appendChild(rect);

      const value = svgEl('text', {
        x: c.x,
        y: c.y + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: valueFill,
      });
      value.textContent = String(n.value);
      g.appendChild(value);

      const name = svgEl('text', {
        x: c.x,
        y: c.y - NODE_H / 2 - 7,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: lost ? colors.danger : colors.textMuted,
      });
      name.textContent = n.id;
      g.appendChild(name);
      return g;
    }

    function render(): void {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const pivot = fallPivot();
      const reach = reachableSet();

      // 경계 — 여기 위는 닿는 곳, 아래는 남아 있으나 들어갈 길이 없는 곳.
      svg.appendChild(
        svgEl('line', {
          x1: 16,
          y1: BOUNDARY_Y,
          x2: W - 16,
          y2: BOUNDARY_Y,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '6 6',
        }),
      );
      const above = svgEl('text', {
        x: W - 18,
        y: BOUNDARY_Y - 8,
        'text-anchor': 'end',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      above.textContent = bandAbove;
      svg.appendChild(above);

      if (nodes.some((n) => n.fallen)) {
        const below = svgEl('text', {
          x: W - 18,
          y: BOUNDARY_Y + 18,
          'text-anchor': 'end',
          'font-size': fontSizes.xs,
          fill: colors.danger,
        });
        below.textContent = bandBelow;
        svg.appendChild(below);
      }

      // head — 사슬로 들어가는 유일한 입구.
      const first = nodeById(headTo);
      const headLabel = svgEl('text', {
        x: HEAD_LABEL_X,
        y: LANE_Y + NODE_H / 2 + 4,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      // `head` 는 번역하지 않는 표식이다 — 한국어 문서도 그대로 쓰는 말이라
      // 키를 만들지 않는다 (C10 의 표식 판정 2번).
      headLabel.textContent = 'head';
      svg.appendChild(headLabel);
      if (first && !first.fallen) {
        const target = centerOf(first, pivot);
        const start = { x: HEAD_ARROW_X, y: LANE_Y + NODE_H / 2 };
        svg.appendChild(drawArrow(start, edgePoint(target, start), colors.text, 1.6, false));
      }

      // 화살표. 건너는 중이면 끝점이 옛 목표에서 새 목표로 이동한다.
      for (const l of links) {
        const from = nodeById(l.from);
        const to = nodeById(l.to);
        if (!from || !to) continue;
        const fromC = centerOf(from, pivot);
        const toC = centerOf(to, pivot);
        let end = edgePoint(toC, fromC);
        if (l.prog < 1) {
          // 건너는 중이면 옛 목표에서, 새로 나는 중이면 제 몸에서 끝점이 출발한다.
          const prev = l.prevTo ? nodeById(l.prevTo) : undefined;
          const origin = prev
            ? edgePoint(centerOf(prev, pivot), fromC)
            : edgePoint(fromC, end);
          end = { x: lerp(origin.x, end.x, l.prog), y: lerp(origin.y, end.y, l.prog) };
        }
        const start = edgePoint(fromC, end);
        if (Math.hypot(end.x - start.x, end.y - start.y) < ARROW_GAP + ARROW_HEAD) continue;
        const dead = !reach.has(l.from);
        const stroke = l.active ? colors.itemActive : dead ? colors.textMuted : colors.text;
        svg.appendChild(drawArrow(start, end, stroke, l.active ? 2.4 : 1.6, false));
      }

      for (const n of nodes) svg.appendChild(drawNode(n, pivot, reach));

      // 캡션과 각주.
      const lines = wrapCaption(caption);
      lines.forEach((line, i) => {
        const text = svgEl('text', {
          x: W / 2,
          y: CAPTION_Y + i * CAPTION_LINE_H,
          'text-anchor': 'middle',
          'font-size': fontSizes.md,
          fill: colors.text,
        });
        text.textContent = line;
        svg.appendChild(text);
      });

      const noteText = svgEl('text', {
        x: W / 2,
        y: NOTE_Y,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      noteText.textContent = note;
      svg.appendChild(noteText);
    }

    // ── 시간 ───────────────────────────────────────────────────────────
    function cancelFrame(): void {
      if (rafId !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      rafId = 0;
    }

    /**
     * 한 동작을 시간에 펼친다. init 이 새 판을 열면 세대가 올라가 진행 중이던
     * 동작은 스스로 물러난다 (다시 보기를 누른 순간 옛 동작이 화면을 덮지 않도록).
     */
    function tween(duration: number, ease: (p: number) => number, apply: (p: number) => void): Promise<void> {
      const mine = generation;
      const finish = (): void => {
        apply(1);
        render();
      };
      if (destroyed || typeof requestAnimationFrame !== 'function') {
        finish();
        return Promise.resolve();
      }
      const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const t0 = now();
      return new Promise<void>((resolve) => {
        const frame = (): void => {
          if (destroyed || mine !== generation) {
            resolve();
            return;
          }
          const p = Math.min(1, (now() - t0) / duration);
          apply(ease(p));
          render();
          if (p < 1) {
            rafId = requestAnimationFrame(frame);
          } else {
            rafId = 0;
            resolve();
          }
        };
        rafId = requestAnimationFrame(frame);
      });
    }

    /** 여러 노드를 각자의 목적지로 동시에 옮긴다. */
    function glide(
      targets: Map<string, Point>,
      duration: number,
      ease: (p: number) => number,
      tiltTo = tilt,
    ): Promise<void> {
      const starts = new Map<string, Point>();
      for (const [id] of targets) {
        const n = nodeById(id);
        if (n) starts.set(id, { x: n.x, y: n.y });
      }
      const tiltFrom = tilt;
      return tween(duration, ease, (p) => {
        for (const [id, to] of targets) {
          const n = nodeById(id);
          const from = starts.get(id);
          if (!n || !from) continue;
          n.x = lerp(from.x, to.x, p);
          n.y = lerp(from.y, to.y, p);
        }
        tilt = lerp(tiltFrom, tiltTo, p);
      });
    }

    function laneTargets(order: string[]): Map<string, Point> {
      const map = new Map<string, Point>();
      order.forEach((id, i) => map.set(id, { x: slotX(i), y: LANE_Y }));
      return map;
    }

    function clearActive(): void {
      for (const l of links) l.active = false;
    }

    // ── projector 가 부르는 표면 ────────────────────────────────────────
    function init(spec: InitSpec): void {
      generation += 1;
      cancelFrame();
      nodes = spec.nodes.map((n, i) => ({
        id: n.id,
        value: n.value,
        x: slotX(i),
        y: LANE_Y,
        fallen: false,
        fresh: false,
      }));
      links = [];
      for (let i = 0; i + 1 < spec.nodes.length; i += 1) {
        links.push({ from: spec.nodes[i].id, to: spec.nodes[i + 1].id, prevTo: null, prog: 1, active: false });
      }
      laneOrder = spec.nodes.map((n) => n.id);
      baseline = [...laneOrder];
      headTo = spec.nodes[0]?.id ?? '';
      tilt = 0;
      render();
    }

    function setCaption(text: string): void {
      caption = text;
      render();
    }

    function setNote(text: string): void {
      note = text;
      render();
    }

    function setBandLabels(aboveText: string, belowText: string): void {
      bandAbove = aboveText;
      bandBelow = belowText;
      render();
    }

    /** 새 노드가 위에서 내려와 줄 바로 위에 뜬다. 아직 아무도 가리키지 않는다. */
    async function stageNode(id: string, value: number, after: string): Promise<void> {
      clearActive();
      const slot = laneOrder.indexOf(after) + 1;
      const x = slotX(slot);
      if (!nodeById(id)) {
        nodes.push({ id, value, x, y: OFFSCREEN_Y, fallen: false, fresh: true });
      }
      await glide(new Map([[id, { x, y: STAGE_Y }]]), DUR_STAGE, easeOutCubic);
    }

    /** 없던 화살표가 제 몸에서 자라 나와 목표에 닿는다. 아무에게서도 빼앗지 않는다. */
    async function addLink(from: string, to: string): Promise<void> {
      clearActive();
      const existing = links.find((l) => l.from === from);
      const link: Link = existing ?? { from, to, prevTo: null, prog: 0, active: false };
      link.to = to;
      link.prevTo = null;
      link.prog = 0;
      link.active = true;
      if (!existing) links.push(link);
      await tween(DUR_LINK, easeOutCubic, (p) => {
        link.prog = p;
      });
      link.prog = 1;
    }

    /** 있던 화살표의 끝이 다른 노드로 건너간다. 원래 겨누던 쪽은 겨눔을 잃는다. */
    async function moveLink(from: string, to: string): Promise<void> {
      clearActive();
      const link = links.find((l) => l.from === from);
      if (!link) {
        await addLink(from, to);
        return;
      }
      link.prevTo = link.to;
      link.to = to;
      link.prog = 0;
      link.active = true;
      await tween(DUR_LINK, easeInOutCubic, (p) => {
        link.prog = p;
      });
      link.prevTo = null;
      link.prog = 1;
    }

    /** 붙들어 주는 화살표를 잃은 무리가 왼쪽에 걸린 채 기울며 줄에서 떨어진다. */
    async function detach(ids: string[]): Promise<void> {
      clearActive();
      const targets = new Map<string, Point>();
      for (const id of ids) {
        const n = nodeById(id);
        if (!n) continue;
        n.fallen = true;
        targets.set(id, { x: n.x + FALL_DRIFT_X, y: FALLEN_Y });
      }
      laneOrder = laneOrder.filter((id) => !ids.includes(id));
      if (targets.size === 0) return;
      await glide(targets, DUR_FALL, easeInQuad, FALL_TILT_DEG);
    }

    /** 새 노드가 줄 안으로 내려앉고, 뒤쪽이 자리를 내어 준다. */
    async function settle(id: string, after: string): Promise<void> {
      clearActive();
      if (!laneOrder.includes(id)) {
        const at = laneOrder.indexOf(after) + 1;
        laneOrder.splice(at, 0, id);
      }
      const n = nodeById(id);
      if (n) n.fresh = false;
      await glide(laneTargets(laneOrder), DUR_SETTLE, easeOutCubic);
    }

    /** 처음 자리로. 떨어진 무리는 줄로 올라오고 끼워 넣던 노드는 화면 밖으로 물러난다. */
    async function rewind(): Promise<void> {
      clearActive();
      links = [];
      for (let i = 0; i + 1 < baseline.length; i += 1) {
        links.push({ from: baseline[i], to: baseline[i + 1], prevTo: null, prog: 1, active: false });
      }
      laneOrder = [...baseline];
      headTo = baseline[0] ?? headTo;
      for (const n of nodes) n.fallen = false;

      const targets = laneTargets(laneOrder);
      for (const n of nodes) {
        if (!baseline.includes(n.id)) targets.set(n.id, { x: n.x, y: OFFSCREEN_Y });
      }
      await glide(targets, DUR_REWIND, easeOutCubic, 0);
      nodes = nodes.filter((n) => baseline.includes(n.id));
      render();
    }

    function destroy(): void {
      destroyed = true;
      cancelFrame();
      if (svg.parentNode) svg.parentNode.removeChild(svg);
    }

    render();

    return {
      init,
      setCaption,
      setNote,
      setBandLabels,
      stageNode,
      addLink,
      moveLink,
      detach,
      settle,
      rewind,
      destroy,
    };
  },
};
