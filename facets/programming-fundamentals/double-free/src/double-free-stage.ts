/**
 * double-free 의 무대 — 한 칸이 두 번 나간다.
 *
 * 왼쪽에 프로그램, 가운데 스택 칸(a · b · c), 오른쪽에 힙 칸과 새 땅, 그 아래 빈 자리 목록.
 * 목록의 표(주소 쪽지)가 움직이는 주인공이다 — free 는 칸에서 쪽지를 떼어 목록 맨 앞으로 밀어 넣고,
 * allocate 는 맨 앞 쪽지를 꺼내 이름의 칸으로 날려 보낸다. 같은 주소의 쪽지가 둘이면 둘 다 나간다.
 * 넣기는 값이 이름의 화살표를 타고 칸으로 들어가 앞 값을 밀어낸다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { DoubleFreeScene, SlotVal } from './scene.js';

const H = 286;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 16;
/** 한 걸음의 운동 */
const MOVE_MS = 420;

const CODE_TOP = 44;
const LINE_H = 22;
const ROW_TOP = 40;
const ROW_H = 44;
const BOX_H = 30;
const CELL_H = 44;
const TICKET_W = 52;
const TICKET_H = 28;
const TICKET_GAP = 6;
const LIST_TITLE_Y = 128;
const TRAY_Y = 136;
const CAPTION_Y = H - 36;

type Attrs = Record<string, string | number>;

function rnd(x: number): number {
  const v = Math.round(x * 100) / 100;
  return v === 0 ? 0 : v;
}

function put(parent: Element, tag: string, attrs: Attrs, content?: string): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(rnd(v)) : v);
  }
  if (content !== undefined) node.textContent = content;
  parent.appendChild(node);
  return node;
}

function shown(v: SlotVal): string {
  if (v === null) return '';
  return v === 'null' ? 'null' : String(v);
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** 캔버스에서 셈한 자리 */
type Geom = {
  fs: number;
  charW: number;
  codeW: number;
  sx: number;
  boxX: number;
  boxW: number;
  hx: number;
  cellW: number;
  outY: number;
  rowY(i: number): number;
  lineTop(i: number): number;
  cellX(addr: number): number;
  ticketX(k: number): number;
  arrow(i: number, addr: number): [number, number, number, number, number, number, number, number];
};

function measure(scene: DoubleFreeScene): Geom {
  const fs = parseFloat(fontSizes.sm);
  const charW = fs * 0.6;
  let longest = 0;
  for (const l of scene.code) longest = Math.max(longest, l.text.length + l.indent * 4);
  const codeW = longest * charW + 20;
  const sx = PAD + codeW + 24;
  const boxX = sx + 30;
  const boxW = 56;
  const heapW = Math.min(220, PIECE_CANVAS_W - PAD - (boxX + boxW + 100));
  const hx = PIECE_CANVAS_W - PAD - heapW;
  const cellW = 56;
  const n = scene.slots.length;
  const rowY = (i: number): number => ROW_TOP + i * ROW_H;
  const cellX = (addr: number): number => hx + (addr - scene.heapBase) * cellW;
  return {
    fs,
    charW,
    codeW,
    sx,
    boxX,
    boxW,
    hx,
    cellW,
    outY: ROW_TOP + n * ROW_H,
    rowY,
    lineTop: (i) => CODE_TOP + i * LINE_H,
    cellX,
    ticketX: (k) => hx + TICKET_GAP + k * (TICKET_W + TICKET_GAP),
    arrow(i, addr) {
      const x1 = boxX + boxW;
      const y1 = rowY(i) + BOX_H / 2;
      const x2 = cellX(addr);
      const y2 = ROW_TOP + 10 + (n > 1 ? (i * (CELL_H - 20)) / (n - 1) : (CELL_H - 20) / 2);
      const dx = (x2 - x1) * 0.45;
      return [x1, y1, x1 + dx, y1, x2 - dx, y2, x2 - 6, y2];
    },
  };
}

function bezier(
  g: [number, number, number, number, number, number, number, number],
  s: number,
): [number, number] {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = g;
  const u = 1 - s;
  const a = u * u * u;
  const b = 3 * u * u * s;
  const c = 3 * u * s * s;
  const d = s * s * s;
  return [a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3];
}

/** 정적 그리기가 운동에 넘기는 손잡이 */
type Handles = {
  geom: Geom;
  marker: SVGElement | null;
  slotText: SVGElement[];
  arrows: SVGElement[];
  cellRect: Map<number, SVGElement>;
  cellText: Map<number, SVGElement>;
  land: SVGElement | null;
  tickets: SVGElement[];
  outText: SVGElement | null;
  top: SVGElement;
};

function caption(scene: DoubleFreeScene, t: Translate): [string, string] {
  const s = scene.step;
  if (s === null) return ['', ''];
  if (s.kind === 'start') {
    return [
      t('caption.start', 'Start. Stack slots set aside: {names}.', {
        names: scene.slots.map((x) => x.name).join(', '),
      }),
      '',
    ];
  }
  if (s.kind === 'alloc') {
    if (s.source === 'land') {
      return [
        t('caption.allocLand', '{name} = {addr}, cut from new land.', { name: s.name, addr: s.addr }),
        t('detail.land', 'New land now starts at {end}.', { end: scene.landEnd }),
      ];
    }
    const cell = scene.cells.find((c) => c.addr === s.addr);
    const holders = cell ? cell.holders : [];
    return [
      t('caption.allocList', '{name} = {addr}, taken from the front of the free list.', {
        name: s.name,
        addr: s.addr,
      }),
      holders.length > 1
        ? t('detail.holders', 'Cell {addr} is held by: {names}.', {
            addr: s.addr,
            names: holders.join(', '),
          })
        : t('detail.left', 'Left in the free list: {n}.', { n: scene.freelist.length }),
    ];
  }
  if (s.kind === 'free') {
    return [
      t('caption.free', 'free({name}) puts {addr} at the front of the free list.', {
        name: s.name,
        addr: s.addr,
      }),
      t('detail.copies', 'Times {addr} is in the list: {n}.', {
        addr: s.addr,
        n: scene.freelist.filter((a) => a === s.addr).length,
      }),
    ];
  }
  if (s.kind === 'store') {
    return [
      t('caption.store', 'valueAt({name}) = {value} writes into cell {addr}.', {
        name: s.name,
        value: shown(s.value),
        addr: s.addr,
      }),
      s.was === null ? '' : t('detail.was', 'Overwritten: {was}.', { was: shown(s.was) }),
    ];
  }
  return [
    t('caption.show', 'show valueAt({name}) prints {value}.', { name: s.name, value: shown(s.value) }),
    s.mine === null
      ? ''
      : t('detail.mine', 'Put in through {name}: {mine}.', { name: s.name, mine: shown(s.mine) }),
  ];
}

function drawStatic(
  svg: SVGSVGElement,
  scene: DoubleFreeScene,
  C: Palette,
  t: Translate,
): Handles {
  svg.textContent = '';
  const g = measure(scene);
  const root = put(svg, 'g', {});
  const mono = { 'font-family': fonts.mono, 'font-size': fontSizes.sm };
  const body = { 'font-family': fonts.body };
  const hues = categorical(Math.max(1, scene.slots.length), 'vivid');
  const step = scene.step;
  const current = step !== null && step.kind !== 'start' ? step.line : -1;

  // 프로그램
  let marker: SVGElement | null = null;
  if (current >= 0) {
    marker = put(root, 'g', { transform: `translate(0 ${rnd(g.lineTop(current))})` });
    put(marker, 'rect', { x: PAD, y: 1, width: g.codeW, height: LINE_H - 2, rx: 3, fill: C.bgSubtle });
    put(marker, 'rect', { x: PAD, y: 1, width: 3, height: LINE_H - 2, fill: C.accent });
  }
  scene.code.forEach((l, i) => {
    put(
      root,
      'text',
      {
        x: PAD + 10 + l.indent * 4 * g.charW,
        y: g.lineTop(i) + 15,
        fill: i === current ? C.text : C.textMuted,
        ...mono,
      },
      l.text,
    );
  });

  // 제목
  const titleAttrs = { fill: C.textMuted, 'font-size': fontSizes.xs, ...body };
  if (scene.slots.length > 0) {
    put(root, 'text', { x: g.sx, y: 26, ...titleAttrs }, t('label.stack', 'Stack'));
    put(root, 'text', { x: g.hx, y: 26, ...titleAttrs }, t('label.heap', 'Heap'));
    put(root, 'text', { x: g.hx, y: LIST_TITLE_Y, ...titleAttrs }, t('label.list', 'Free list'));
  }

  // 힙 — 뗀 칸과 새 땅
  const cellRect = new Map<number, SVGElement>();
  const cellText = new Map<number, SVGElement>();
  let land: SVGElement | null = null;
  if (scene.slots.length > 0) {
    const landX = g.cellX(scene.landEnd);
    const right = PIECE_CANVAS_W - PAD;
    land = put(root, 'g', {});
    put(land, 'rect', {
      x: landX,
      y: ROW_TOP,
      width: Math.max(0, right - landX),
      height: CELL_H,
      fill: 'none',
      stroke: C.border,
      'stroke-dasharray': '4 3',
    });
    put(
      land,
      'text',
      { x: landX + 8, y: ROW_TOP + CELL_H / 2 + 4, fill: C.textMuted, 'font-size': fontSizes.xs, ...body },
      t('label.land', 'New land'),
    );
    put(
      land,
      'text',
      { x: landX + 2, y: ROW_TOP + CELL_H + 14, fill: C.textMuted, ...mono, 'font-size': fontSizes.xs },
      String(scene.landEnd),
    );
    for (const cell of scene.cells) {
      const x = g.cellX(cell.addr);
      const shared = cell.holders.length > 1;
      const r = put(root, 'rect', {
        x,
        y: ROW_TOP,
        width: g.cellW,
        height: CELL_H,
        rx: 3,
        fill: C.bg,
        stroke: shared ? C.danger : C.text,
        'stroke-width': shared ? 2 : 1.25,
      });
      cellRect.set(cell.addr, r);
      cellText.set(
        cell.addr,
        put(
          root,
          'text',
          {
            x: x + g.cellW / 2,
            y: ROW_TOP + CELL_H / 2 + 6,
            'text-anchor': 'middle',
            fill: C.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
          },
          shown(cell.value),
        ),
      );
      put(
        root,
        'text',
        {
          x: x + g.cellW / 2,
          y: ROW_TOP + CELL_H + 14,
          'text-anchor': 'middle',
          fill: C.textMuted,
          ...mono,
          'font-size': fontSizes.xs,
        },
        String(cell.addr),
      );
    }

    // 빈 자리 목록 — 쟁반과 쪽지
    put(root, 'rect', {
      x: g.hx,
      y: TRAY_Y,
      width: right - g.hx,
      height: TICKET_H + 8,
      rx: 4,
      fill: 'none',
      stroke: C.border,
    });
  }
  const tickets: SVGElement[] = [];
  scene.freelist.forEach((addr, k) => {
    const dup = scene.freelist.filter((a) => a === addr).length > 1;
    const tk = put(root, 'g', { transform: `translate(${rnd(g.ticketX(k))} ${TRAY_Y + 4})` });
    put(tk, 'rect', {
      x: 0,
      y: 0,
      width: TICKET_W,
      height: TICKET_H,
      rx: 4,
      fill: C.bgSubtle,
      stroke: dup ? C.danger : C.border,
      'stroke-width': dup ? 2 : 1,
    });
    put(tk, 'text', { x: TICKET_W / 2, y: TICKET_H / 2 + 4, 'text-anchor': 'middle', fill: C.text, ...mono }, String(addr));
    tickets.push(tk);
  });

  // 스택 칸과 화살표
  const slotText: SVGElement[] = [];
  const arrows: SVGElement[] = [];
  scene.slots.forEach((slot, i) => {
    const y = g.rowY(i);
    const hue = hues[i] ?? C.text;
    put(root, 'text', { x: g.sx, y: y + 14, fill: hue, ...mono, 'font-weight': 600 }, slot.name);
    put(
      root,
      'text',
      { x: g.sx, y: y + 27, fill: C.textMuted, ...mono, 'font-size': fontSizes.xs },
      String(slot.addr),
    );
    put(root, 'rect', { x: g.boxX, y, width: g.boxW, height: BOX_H, rx: 3, fill: C.bg, stroke: C.border });
    const v = scene.vals[i] ?? null;
    slotText.push(
      put(
        root,
        'text',
        { x: g.boxX + g.boxW / 2, y: y + BOX_H / 2 + 4, 'text-anchor': 'middle', fill: C.text, ...mono },
        shown(v),
      ),
    );
    const target = typeof v === 'number' ? scene.cells.find((c) => c.addr === v) : undefined;
    const arrow = put(root, 'g', {});
    if (target !== undefined) {
      const holds = target.holders.includes(slot.name);
      const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = g.arrow(i, target.addr);
      const path = `M ${rnd(x1)} ${rnd(y1)} C ${rnd(c1x)} ${rnd(c1y)}, ${rnd(c2x)} ${rnd(c2y)}, ${rnd(x2)} ${rnd(y2)}`;
      const line: Attrs = { d: path, fill: 'none', stroke: hue, 'stroke-width': 1.5 };
      if (!holds) {
        line['stroke-dasharray'] = '4 3';
        line['stroke-opacity'] = 0.55;
      }
      put(arrow, 'path', line);
      put(arrow, 'polygon', {
        points: `${rnd(x2 + 6)},${rnd(y2)} ${rnd(x2 - 1)},${rnd(y2 - 4)} ${rnd(x2 - 1)},${rnd(y2 + 4)}`,
        fill: hue,
        'fill-opacity': holds ? 1 : 0.55,
      });
    }
    arrows.push(arrow);
  });

  // 출력
  let outText: SVGElement | null = null;
  if (scene.slots.length > 0) {
    put(root, 'text', { x: g.sx, y: g.outY + 12, ...titleAttrs }, t('label.output', 'Output'));
    put(root, 'rect', {
      x: g.boxX,
      y: g.outY + 18,
      width: g.boxW,
      height: BOX_H - 2,
      rx: 3,
      fill: C.bgSubtle,
      stroke: C.border,
    });
    outText = put(
      root,
      'text',
      { x: g.boxX + g.boxW / 2, y: g.outY + 18 + BOX_H / 2 + 3, 'text-anchor': 'middle', fill: C.text, ...mono },
      scene.out.map((o) => String(o)).join(' '),
    );
  }

  // 캡션
  const [main, detail] = caption(scene, t);
  put(root, 'text', { x: PAD, y: CAPTION_Y, fill: C.text, 'font-size': fontSizes.md, ...body }, main);
  put(root, 'text', { x: PAD, y: CAPTION_Y + 20, fill: C.textMuted, 'font-size': fontSizes.sm, ...body }, detail);

  // 운동이 올라탈 맨 위 층
  const top = put(root, 'g', {});
  return { geom: g, marker, slotText, arrows, cellRect, cellText, land, tickets, outText, top };
}

/** 날아가는 쪽지 · 값 한 개 */
function chip(parent: SVGElement, C: Palette, label: string, w: number, fill: string): SVGElement {
  const node = put(parent, 'g', {});
  put(node, 'rect', { x: -w / 2, y: -TICKET_H / 2, width: w, height: TICKET_H, rx: 4, fill, stroke: C.text });
  put(
    node,
    'text',
    { x: 0, y: 4, 'text-anchor': 'middle', fill: C.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm },
    label,
  );
  return node;
}

function place(node: SVGElement, x: number, y: number): void {
  node.setAttribute('transform', `translate(${rnd(x)} ${rnd(y)})`);
}

export const doubleFreeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const C = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function tween(mine: number, ms: number, frame: (k: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const k = clamp01((Date.now() - start) / ms);
          frame(k);
          if (k >= 1) {
            finish(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: DoubleFreeScene,
      prev: DoubleFreeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(svg, next, C, t);
      const s = next.step;
      if (!opts.animate || prev === null || s === null || s.kind === 'start') return;
      const g = h.geom;
      const slotIdx = next.slots.findIndex((x) => x.name === s.name);
      const slotMid = (i: number): [number, number] => [g.boxX + g.boxW / 2, g.rowY(i) + BOX_H / 2];
      const cellMid = (addr: number): [number, number] => [g.cellX(addr) + g.cellW / 2, ROW_TOP + CELL_H / 2];
      const ticketMid = (k: number): [number, number] => [g.ticketX(k) + TICKET_W / 2, TRAY_Y + 4 + TICKET_H / 2];
      const lerp = (a: [number, number], b: [number, number], k: number): [number, number] => [
        a[0] + (b[0] - a[0]) * k,
        a[1] + (b[1] - a[1]) * k,
      ];

      // 줄 표시가 앞 줄에서 미끄러져 온다
      const fromTop = s.from >= 0 ? g.lineTop(s.from) : g.lineTop(s.line);
      const toTop = g.lineTop(s.line);
      const moveMarker = (k: number): void => {
        if (h.marker) h.marker.setAttribute('transform', `translate(0 ${rnd(fromTop + (toTop - fromTop) * k)})`);
      };

      let frame: (k: number) => void;
      if (s.kind === 'alloc') {
        const slotT = h.slotText[slotIdx];
        const arrow = h.arrows[slotIdx];
        const flier = chip(h.top, C, String(s.addr), TICKET_W, C.bgSubtle);
        const cellR = h.cellRect.get(s.addr);
        const cellT = h.cellText.get(s.addr);
        const landShift = g.cellX(s.landBefore) - g.cellX(next.landEnd);
        const start: [number, number] =
          s.source === 'land' ? cellMid(s.addr) : ticketMid(0);
        const end = slotMid(slotIdx);
        const split = s.source === 'land' ? 0.45 : 0;
        frame = (raw) => {
          const k = ease(raw);
          moveMarker(k);
          if (s.source === 'land') {
            // 새 땅의 끝이 밀려나며 칸이 드러난다
            const grow = clamp01(raw / split);
            if (cellR) cellR.setAttribute('width', String(rnd(g.cellW * grow)));
            if (cellT) cellT.setAttribute('opacity', grow < 1 ? '0' : '1');
            if (h.land) h.land.setAttribute('transform', `translate(${rnd(landShift * (1 - ease(grow)))} 0)`);
          } else {
            // 남은 쪽지가 한 자리씩 앞으로
            h.tickets.forEach((tk, j) => {
              place(tk, g.ticketX(j + 1) + (g.ticketX(j) - g.ticketX(j + 1)) * k, TRAY_Y + 4);
            });
          }
          const fly = ease(clamp01((raw - split) / (1 - split)));
          const [x, y] = lerp(start, end, fly);
          place(flier, x, y);
          flier.setAttribute('opacity', raw < split ? '0' : '1');
          const arrived = raw >= 1;
          if (slotT) slotT.setAttribute('opacity', arrived ? '1' : '0');
          if (arrow) arrow.setAttribute('opacity', arrived ? '1' : '0');
        };
      } else if (s.kind === 'free') {
        // 칸에서 쪽지가 떨어져 목록 맨 앞으로, 앞에 있던 쪽지는 한 자리 뒤로
        const from = cellMid(s.addr);
        frame = (raw) => {
          const k = ease(raw);
          moveMarker(k);
          h.tickets.forEach((tk, j) => {
            if (j === 0) {
              const [x, y] = lerp(from, ticketMid(0), k);
              place(tk, x - TICKET_W / 2, y - TICKET_H / 2);
            } else {
              place(tk, g.ticketX(j - 1) + (g.ticketX(j) - g.ticketX(j - 1)) * k, TRAY_Y + 4);
            }
          });
        };
      } else if (s.kind === 'store') {
        // 값이 이름의 화살표를 타고 칸으로 들어가 앞 값을 밀어낸다
        const geo = g.arrow(slotIdx, s.addr);
        const flier = chip(h.top, C, shown(s.value), 30, C.bg);
        const cellT = h.cellText.get(s.addr);
        const [cx, cy] = cellMid(s.addr);
        const old =
          s.was === null
            ? null
            : put(
                h.top,
                'text',
                {
                  x: cx,
                  y: cy + 6,
                  'text-anchor': 'middle',
                  fill: C.textMuted,
                  'font-family': fonts.mono,
                  'font-size': fontSizes.lg,
                },
                shown(s.was),
              );
        const hit = 0.6;
        frame = (raw) => {
          const k = ease(raw);
          moveMarker(k);
          const go = clamp01(raw / hit);
          const [bx, by] = bezier(geo, ease(go));
          const [x, y] = go < 1 ? [bx, by] : [cx, cy];
          place(flier, x, y);
          flier.setAttribute('opacity', go < 1 ? '1' : '0');
          if (cellT) cellT.setAttribute('opacity', go < 1 ? '0' : '1');
          if (old) {
            const fall = ease(clamp01((raw - hit) / (1 - hit)));
            old.setAttribute('transform', `translate(0 ${rnd(fall * 34)})`);
            old.setAttribute('opacity', String(rnd(1 - fall)));
          }
        };
      } else {
        // 이름의 화살표를 따라가 칸을 읽고, 그 값이 출력으로 내려온다
        const geo = g.arrow(slotIdx, s.addr);
        const reader = put(h.top, 'circle', { cx: 0, cy: 0, r: 5, fill: C.accent, stroke: C.text });
        const flier = chip(h.top, C, shown(s.value), 30, C.bg);
        const outMid: [number, number] = [g.boxX + g.boxW / 2, g.outY + 18 + (BOX_H - 2) / 2];
        const half = 0.5;
        frame = (raw) => {
          const k = ease(raw);
          moveMarker(k);
          const a = clamp01(raw / half);
          const [rx, ry] = bezier(geo, ease(a));
          reader.setAttribute('cx', String(rnd(rx)));
          reader.setAttribute('cy', String(rnd(ry)));
          reader.setAttribute('opacity', a < 1 ? '1' : '0');
          const b = ease(clamp01((raw - half) / (1 - half)));
          const [x, y] = lerp(cellMid(s.addr), outMid, b);
          place(flier, x, y);
          flier.setAttribute('opacity', raw < half ? '0' : '1');
          if (h.outText) h.outText.setAttribute('opacity', raw >= 1 ? '1' : '0');
        };
      }

      const ok = await tween(mine, MOVE_MS, frame);
      if (!ok || destroyed || mine !== gen) return;
      drawStatic(svg, next, C, t);
    }

    return {
      render,
      destroy(): void {
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
