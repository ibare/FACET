/**
 * forwarding-table 무대 — 한 문으로 들어온 패킷들이 표의 줄에 따라 서로 다른 문으로 흩어져 나간다.
 *
 * 위에는 들어오는 문 앞에 줄 선 패킷들, 가운데는 라우터와 그 안의 표, 아래는 나가는 문마다
 * 내려가는 갈래와 그 끝의 넘길 곳. 걸음마다 맨 앞 패킷이 문으로 들어와 맡을 줄 옆에 멈췄다가
 * 그 줄의 문으로 빠져 제 갈래에 쌓인다. 끝 화면에 갈래마다 쌓인 패킷이 남는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { ForwardingTableScene, SceneBase } from './scene.js';

const H = 490;
const M = 16;
/** 한 걸음 운동의 길이 (ms) */
const MOVE_MS = 1100;
/** 운동 가운데 패킷이 줄 옆에 닿는 자리와 떠나는 자리 */
const REACH_ROW = 0.35;
const LEAVE_ROW = 0.5;

const SVG_NS = 'http://www.w3.org/2000/svg';

function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? num(v) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  opts: { size: string; fill: string; mono?: boolean; anchor?: string; weight?: string },
): SVGElement {
  const node = el(
    'text',
    {
      x,
      y,
      'font-family': opts.mono === true ? fonts.mono : fonts.body,
      'font-size': opts.size,
      fill: opts.fill,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'central',
    },
    parent,
  );
  if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
  node.textContent = text;
  return node;
}

/** 글자 폭 어림 — 고정폭은 0.6 em, 본문은 넓은 글자(한글 · 한자꼴)만 1 em */
function textWidth(text: string, px: number, mono: boolean): number {
  if (mono) return text.length * px * 0.6;
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x1100 && c <= 0xffdc ? px : px * 0.56;
  }
  return w;
}

interface Point {
  x: number;
  y: number;
}

interface Layout {
  cardW: number;
  cardH: number;
  queueY: number;
  slotStep: number;
  laneX: number;
  routerTop: number;
  routerBottom: number;
  bottomLaneY: number;
  tableX: number;
  hopX: number;
  doorColX: number;
  rowY: number[];
  rowH: number;
  /** 나가는 문 이름 → 갈래의 가운데 x */
  columnX: Map<string, number>;
  columns: string[];
  slotBottom: number;
  slotPitch: number;
  hopY: number;
}

function layoutOf(base: SceneBase, t: Translate): Layout {
  const sm = parseFloat(fontSizes.sm);
  const xs = parseFloat(fontSizes.xs);
  const W = PIECE_CANVAS_W;
  const n = base.packets.length;

  const longest = Math.max(1, ...base.packets.map((p) => p.length));
  const cardH = sm + 10;
  const cardW = Math.min((W - 2 * M) / 3, longest * sm * 0.6 + 16);

  // 들어오는 문은 오른쪽 통로 위에 둔다. 줄 선 패킷은 그 왼쪽으로 늘어선다
  const laneX = W - M - 12 - cardW / 2;
  const slotStep = n > 1 ? Math.min(cardW + 8, (laneX - M - cardW / 2) / (n - 1)) : 0;
  const queueY = 46;

  const routerTop = 76;
  const rowH = 28;
  const rowY = base.table.map((_, i) => routerTop + 58 + i * rowH);
  const lastRow = rowY.length > 0 ? (rowY[rowY.length - 1] as number) : routerTop + 58;
  const bottomLaneY = lastRow + rowH / 2 + 8 + cardH / 2;
  const routerBottom = bottomLaneY + cardH / 2 + 8;

  // 표의 세 칸 — 글자 폭에서 역산하고 남는 폭은 칸 사이에 나눈다
  const netW = Math.max(
    textWidth(t('head.net', 'Destination network'), xs, false),
    ...base.table.map((r) => textWidth(r.net, sm, true)),
  );
  const directText = t('label.direct', 'direct');
  const hopW = Math.max(
    textWidth(t('head.hop', 'Next hop'), xs, false),
    ...base.table.map((r) => (r.hop === null ? textWidth(directText, sm, false) : textWidth(r.hop, sm, true))),
  );
  const doorW = Math.max(
    textWidth(t('head.door', 'Interface'), xs, false),
    ...base.table.map((r) => textWidth(r.door, sm, true)),
  );
  const tableX = M + 18;
  const room = laneX - cardW / 2 - 24 - tableX - netW - hopW - doorW;
  const gap = Math.max(12, Math.min(56, room / 2));
  const hopX = tableX + netW + gap;
  const doorColX = hopX + hopW + gap;

  const columns: string[] = [];
  for (const r of base.table) {
    if (r.door !== base.inDoor && !columns.includes(r.door)) columns.push(r.door);
  }
  const colW = (W - 2 * M) / Math.max(1, columns.length);
  const columnX = new Map<string, number>();
  columns.forEach((d, i) => columnX.set(d, M + colW * (i + 0.5)));

  const hopY = H - 72;
  // 갈래의 패킷은 넘길 곳 바로 위부터 위로 쌓인다 — 건네진 자리에 선다
  const slotBottom = hopY - 22 - cardH / 2;
  const slotTopLimit = routerBottom + 22 + cardH / 2;
  const slotPitch = Math.min(cardH + 6, (slotBottom - slotTopLimit) / Math.max(1, n - 1));

  return {
    cardW,
    cardH,
    queueY,
    slotStep,
    laneX,
    routerTop,
    routerBottom,
    bottomLaneY,
    tableX,
    hopX,
    doorColX,
    rowY,
    rowH,
    columnX,
    columns,
    slotBottom,
    slotPitch,
    hopY,
  };
}

/** 갈래마다 몇째로 쌓였는가 — 자취에서 파생 */
function stackIndex(scene: ForwardingTableScene, base: SceneBase, upto: number): number {
  const target = scene.sent[upto];
  if (target === undefined) return 0;
  const door = base.table[target.row]?.door;
  let k = 0;
  for (let i = 0; i < upto; i += 1) {
    const s = scene.sent[i];
    if (s !== undefined && base.table[s.row]?.door === door) k += 1;
  }
  return k;
}

interface Drawn {
  /** 이번 걸음의 강조(줄 띠 · 문 · 갈래) — 패킷이 줄에 닿을 때 드러난다 */
  highlight: SVGElement | null;
  /** 이번에 나간 패킷의 정적 카드 — 운동 동안 숨긴다 */
  arrived: SVGElement | null;
  /** 아직 줄 선 패킷 카드들 (줄 차례대로) */
  queue: SVGElement[];
  /** 운동 층 */
  overlay: SVGElement;
}

function drawCard(
  parent: Element,
  c: Point,
  lay: Layout,
  text: string,
  stroke: string,
  colors: Palette,
  strokeWidth: number,
): SVGElement {
  const g = el('g', {}, parent);
  el(
    'rect',
    {
      x: c.x - lay.cardW / 2,
      y: c.y - lay.cardH / 2,
      width: lay.cardW,
      height: lay.cardH,
      rx: 4,
      fill: colors.bg,
      stroke,
      'stroke-width': strokeWidth,
    },
    g,
  );
  label(g, c.x, c.y, text, { size: fontSizes.sm, fill: colors.text, mono: true, anchor: 'middle' });
  return g;
}

export const forwardingTableStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function doorColor(lay: Layout, door: string): string {
      const i = lay.columns.indexOf(door);
      if (i < 0) return colors.textMuted;
      const palette = categorical(lay.columns.length, 'vivid');
      return palette[i] ?? colors.textMuted;
    }

    function drawStatic(scene: ForwardingTableScene): Drawn | null {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return null;
      const lay = layoutOf(base, t);
      const W = PIECE_CANVAS_W;
      const sentSet = new Set(scene.sent.map((s) => s.packet));
      const current = scene.step.kind === 'forward' ? scene.sent[scene.sent.length - 1] : undefined;
      const currentRow = current !== undefined ? base.table[current.row] : undefined;

      // 위: 보낸 곳 · 줄 선 패킷
      label(svg, M, 16, t('label.sender', 'From {addr}', { addr: base.sender }), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });

      // 라우터
      el(
        'rect',
        {
          x: M,
          y: lay.routerTop,
          width: W - 2 * M,
          height: lay.routerBottom - lay.routerTop,
          rx: 10,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1.5,
        },
        svg,
      );
      label(svg, M + 12, lay.routerTop + 16, t('role.router', 'Router'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        weight: '600',
      });

      // 이번 걸음의 강조 층 — 줄 띠는 글자 뒤에 깔린다
      const highlight = current !== undefined ? el('g', {}, svg) : null;
      if (highlight !== null && current !== undefined && currentRow !== undefined) {
        const y = lay.rowY[current.row] ?? 0;
        const color = doorColor(lay, currentRow.door);
        el(
          'rect',
          {
            x: lay.tableX - 8,
            y: y - lay.rowH / 2 + 2,
            width: lay.laneX + lay.cardW / 2 + 4 - (lay.tableX - 8),
            height: lay.rowH - 4,
            rx: 5,
            fill: color,
            'fill-opacity': 0.16,
            stroke: color,
            'stroke-width': 1.5,
          },
          highlight,
        );
      }

      // 표 머리와 줄
      const headY = lay.routerTop + 36;
      label(svg, lay.tableX, headY, t('head.net', 'Destination network'), { size: fontSizes.xs, fill: colors.textMuted });
      label(svg, lay.hopX, headY, t('head.hop', 'Next hop'), { size: fontSizes.xs, fill: colors.textMuted });
      label(svg, lay.doorColX, headY, t('head.door', 'Interface'), { size: fontSizes.xs, fill: colors.textMuted });
      el(
        'line',
        {
          x1: lay.tableX - 6,
          x2: lay.laneX - lay.cardW / 2 - 12,
          y1: headY + 11,
          y2: headY + 11,
          stroke: colors.border,
        },
        svg,
      );
      base.table.forEach((r, i) => {
        const y = lay.rowY[i] ?? 0;
        const isCurrent = current !== undefined && current.row === i;
        const weight = isCurrent ? '700' : '400';
        label(svg, lay.tableX, y, r.net, { size: fontSizes.sm, fill: colors.text, mono: true, weight });
        if (r.hop === null) {
          label(svg, lay.hopX, y, t('label.direct', 'direct'), { size: fontSizes.sm, fill: colors.textMuted, weight });
        } else {
          label(svg, lay.hopX, y, r.hop, { size: fontSizes.sm, fill: colors.text, mono: true, weight });
        }
        label(svg, lay.doorColX, y, r.door, {
          size: fontSizes.sm,
          fill: r.door === base.inDoor ? colors.textMuted : doorColor(lay, r.door),
          mono: true,
          weight: '700',
        });
      });

      // 문 — 들어오는 문은 위 가장자리, 나가는 문은 아래 가장자리
      const tabH = 18;
      const tabW = (d: string): number => d.length * parseFloat(fontSizes.xs) * 0.6 + 16;
      el(
        'rect',
        {
          x: lay.laneX - tabW(base.inDoor) / 2,
          y: lay.routerTop - tabH / 2,
          width: tabW(base.inDoor),
          height: tabH,
          rx: 3,
          fill: colors.bg,
          stroke: colors.text,
          'stroke-width': 1.5,
        },
        svg,
      );
      label(svg, lay.laneX, lay.routerTop, base.inDoor, {
        size: fontSizes.xs,
        fill: colors.text,
        mono: true,
        anchor: 'middle',
      });

      for (const door of lay.columns) {
        const cx = lay.columnX.get(door) ?? 0;
        const color = doorColor(lay, door);
        const row = base.table.find((r) => r.door === door);
        // 갈래 선
        el(
          'line',
          {
            x1: cx,
            x2: cx,
            y1: lay.routerBottom + tabH / 2,
            y2: lay.hopY - 12,
            stroke: color,
            'stroke-opacity': 0.45,
            'stroke-width': 1.5,
            'stroke-dasharray': '3 4',
          },
          svg,
        );
        el(
          'rect',
          {
            x: cx - tabW(door) / 2,
            y: lay.routerBottom - tabH / 2,
            width: tabW(door),
            height: tabH,
            rx: 3,
            fill: colors.bg,
            stroke: color,
            'stroke-width': 1.5,
          },
          svg,
        );
        label(svg, cx, lay.routerBottom, door, {
          size: fontSizes.xs,
          fill: colors.text,
          mono: true,
          anchor: 'middle',
        });
        // 넘길 곳 — 다음 라우터면 그 주소, 직접이면 그 망의 선 위에 목적지들이 선다
        if (row !== undefined && row.hop !== null) {
          const w = row.hop.length * parseFloat(fontSizes.sm) * 0.6 + 18;
          el(
            'rect',
            {
              x: cx - w / 2,
              y: lay.hopY - 12,
              width: w,
              height: 24,
              rx: 12,
              fill: colors.bg,
              stroke: color,
              'stroke-width': 2,
            },
            svg,
          );
          label(svg, cx, lay.hopY, row.hop, { size: fontSizes.sm, fill: colors.text, mono: true, anchor: 'middle' });
          label(svg, cx, lay.hopY + 24, t('role.router', 'Router'), {
            size: fontSizes.xs,
            fill: colors.textMuted,
            anchor: 'middle',
          });
        } else if (row !== undefined) {
          const half = lay.cardW / 2 + 16;
          el(
            'line',
            {
              x1: cx - half,
              x2: cx + half,
              y1: lay.hopY - 12,
              y2: lay.hopY - 12,
              stroke: color,
              'stroke-width': 3,
              'stroke-linecap': 'round',
            },
            svg,
          );
          label(svg, cx, lay.hopY + 4, row.net, { size: fontSizes.sm, fill: colors.textMuted, mono: true, anchor: 'middle' });
          label(svg, cx, lay.hopY + 24, t('label.direct', 'direct'), {
            size: fontSizes.xs,
            fill: colors.textMuted,
            anchor: 'middle',
          });
        }
      }

      // 이번 걸음의 문을 채운다
      if (highlight !== null && currentRow !== undefined) {
        const cx = lay.columnX.get(currentRow.door);
        if (cx !== undefined) {
          const color = doorColor(lay, currentRow.door);
          el(
            'rect',
            {
              x: cx - tabW(currentRow.door) / 2,
              y: lay.routerBottom - tabH / 2,
              width: tabW(currentRow.door),
              height: tabH,
              rx: 3,
              fill: color,
              stroke: color,
              'stroke-width': 1.5,
            },
            highlight,
          );
          label(highlight, cx, lay.routerBottom, currentRow.door, {
            size: fontSizes.xs,
            fill: colors.textInverse,
            mono: true,
            anchor: 'middle',
          });
        }
      }

      // 나간 패킷 — 갈래마다 쌓인다
      let arrived: SVGElement | null = null;
      scene.sent.forEach((s, i) => {
        const row = base.table[s.row];
        if (row === undefined) return;
        const cx = lay.columnX.get(row.door);
        if (cx === undefined) return;
        const k = stackIndex(scene, base, i);
        const dst = base.packets[s.packet] ?? '';
        const isCurrent = current !== undefined && i === scene.sent.length - 1;
        const card = drawCard(
          svg,
          { x: cx, y: lay.slotBottom - k * lay.slotPitch },
          lay,
          dst,
          doorColor(lay, row.door),
          colors,
          isCurrent ? 2.5 : 1.25,
        );
        if (isCurrent) arrived = card;
      });

      // 줄 선 패킷 — 맨 앞이 들어오는 문 바로 위
      const queue: SVGElement[] = [];
      let slot = 0;
      base.packets.forEach((dst, p) => {
        if (sentSet.has(p)) return;
        queue.push(
          drawCard(svg, { x: lay.laneX - slot * lay.slotStep, y: lay.queueY }, lay, dst, colors.textMuted, colors, 1.25),
        );
        slot += 1;
      });

      // 캡션 — 지금 일어나는 일만
      const capY1 = H - 30;
      const capY2 = H - 11;
      if (current === undefined || currentRow === undefined) {
        label(
          svg,
          M,
          capY1,
          t('caption.start', 'Packets waiting at {door}: {n}.', {
            door: base.inDoor,
            n: base.packets.length - scene.sent.length,
          }),
          { size: fontSizes.sm, fill: colors.text },
        );
      } else {
        const dst = base.packets[current.packet] ?? '';
        const first = current.fallback
          ? t('caption.noFit', 'No row fits {dst}; the default row {net} takes it.', { dst, net: currentRow.net })
          : t('caption.fit', 'Destination {dst} fits row {net}.', { dst, net: currentRow.net });
        const second =
          currentRow.hop === null
            ? t('caption.outDirect', 'Out through {door}, straight to {hop} itself.', {
                door: currentRow.door,
                hop: current.hop,
              })
            : t('caption.outRouter', 'Out through {door}, handed to router {hop}.', {
                door: currentRow.door,
                hop: current.hop,
              });
        label(svg, M, capY1, first, { size: fontSizes.sm, fill: colors.text });
        label(svg, M, capY2, second, { size: fontSizes.sm, fill: colors.text });
      }

      const overlay = el('g', {}, svg);
      return { highlight, arrived, queue, overlay };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    function pathOf(scene: ForwardingTableScene, lay: Layout, base: SceneBase): { toRow: Point[]; fromRow: Point[] } | null {
      const s = scene.sent[scene.sent.length - 1];
      if (s === undefined) return null;
      const row = base.table[s.row];
      const rowY = lay.rowY[s.row];
      if (row === undefined || rowY === undefined) return null;
      const cx = lay.columnX.get(row.door);
      if (cx === undefined) return null;
      const k = stackIndex(scene, base, scene.sent.length - 1);
      return {
        toRow: [
          { x: lay.laneX, y: lay.queueY },
          { x: lay.laneX, y: rowY },
        ],
        fromRow: [
          { x: lay.laneX, y: rowY },
          { x: lay.laneX, y: lay.bottomLaneY },
          { x: cx, y: lay.bottomLaneY },
          { x: cx, y: lay.routerBottom },
          { x: cx, y: lay.slotBottom - k * lay.slotPitch },
        ],
      };
    }

    function along(pts: Point[], f: number): Point {
      const segs: number[] = [];
      let total = 0;
      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1] as Point;
        const b = pts[i] as Point;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        segs.push(d);
        total += d;
      }
      let at = Math.max(0, Math.min(1, f)) * total;
      for (let i = 0; i < segs.length; i += 1) {
        const d = segs[i] as number;
        const a = pts[i] as Point;
        const b = pts[i + 1] as Point;
        if (at <= d || i === segs.length - 1) {
          const u = d === 0 ? 1 : Math.min(1, at / d);
          return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
        }
        at -= d;
      }
      return pts[pts.length - 1] as Point;
    }

    const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

    async function move(scene: ForwardingTableScene, drawn: Drawn, mine: number): Promise<void> {
      const base = scene.base;
      if (base === null) return;
      const lay = layoutOf(base, t);
      const path = pathOf(scene, lay, base);
      const current = scene.sent[scene.sent.length - 1];
      if (path === null || current === undefined) return;
      const row = base.table[current.row];
      if (row === undefined) return;

      drawn.arrived?.setAttribute('visibility', 'hidden');
      drawn.highlight?.setAttribute('visibility', 'hidden');
      const moving = drawCard(
        drawn.overlay,
        path.toRow[0] as Point,
        lay,
        base.packets[current.packet] ?? '',
        doorColor(lay, row.door),
        colors,
        2.5,
      );
      // 줄 선 패킷은 한 칸 뒤(왼쪽)에서 출발해 제자리로 온다
      const shiftFrom = -lay.slotStep;

      const apply = (f: number): void => {
        let p: Point;
        if (f < REACH_ROW) p = along(path.toRow, ease(f / REACH_ROW));
        else if (f < LEAVE_ROW) p = path.toRow[path.toRow.length - 1] as Point;
        else p = along(path.fromRow, ease((f - LEAVE_ROW) / (1 - LEAVE_ROW)));
        const start = path.toRow[0] as Point;
        moving.setAttribute('transform', `translate(${num(p.x - start.x)} ${num(p.y - start.y)})`);
        if (f >= REACH_ROW) drawn.highlight?.removeAttribute('visibility');
        const q = ease(Math.min(1, f / REACH_ROW));
        const dx = shiftFrom * (1 - q);
        for (const card of drawn.queue) card.setAttribute('transform', `translate(${num(dx)} 0)`);
      };

      apply(0);
      const t0 = performance.now();
      for (;;) {
        if (destroyed || mine !== gen) return;
        const f = Math.min(1, (performance.now() - t0) / MOVE_MS);
        apply(f);
        if (f >= 1) break;
        await wait(16);
      }
    }

    return {
      async render(next: ForwardingTableScene, prev: ForwardingTableScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const drawn = drawStatic(next);
        if (!opts.animate || drawn === null) return;
        const stepped = next.step.kind === 'forward' && prev !== null && prev.sent.length === next.sent.length - 1;
        if (!stepped) return;
        await move(next, drawn, mine);
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
