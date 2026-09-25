/**
 * NAT 매핑 테이블 stage — 표의 줄이 주인공이다.
 *
 * 위가 밖(먼 쪽 호스트), 가운데 띠가 NAT 와 그 표, 아래가 안(안쪽 호스트)이다.
 * - 나감: 안쪽에서 올라온 패킷이 표에 멈춰 제 주소 둘을 칸에 내려놓고, 공인 포트가 NAT 주소에서
 *   열쇠 칸으로 떨어져 줄이 적힌다. 패킷은 밖으로 빠져나간다.
 * - 들어옴: 밖에서 내려온 패킷이 띠 위 경계에 멈춘다. 받는 포트가 떨어져 나와 열쇠 칸을 타고
 *   내려가 제 줄에 닿는다. 그 줄의 안쪽 주소가 패킷으로 올라와 받는 이를 갈아 끼우고,
 *   패킷은 띠를 지나 안쪽 주인에게 내려간다.
 * - 줄이 없으면 포트는 열쇠 칸 끝까지 미끄러져 떨어지고, 패킷은 경계에 멈춘 채 남는다.
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
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { NatEndpoint, NatMappingTableScene } from './scene.js';

const H = 372;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 12;
const HOST_H = 28;
const HOST_W_MAX = 170;
const HEADER_H = 22;
const ROW_H_MAX = 30;
/** 줄을 뺀 나머지가 차지하는 세로 — 줄이 늘면 줄 높이를 줄여 H 안에 담는다 */
const ROWS_BUDGET = 60;
/** 버림 표지를 카드 오른쪽에 둘 때 필요한 폭의 하한 */
const DROPPED_LABEL_ROOM = 90;

const MS_RISE = 350;
const MS_WRITE = 300;
const MS_LEAVE = 350;
const MS_ARRIVE = 300;
const MS_LOOKUP = 350;
const MS_SWAP = 300;
const MS_DESCEND = 350;
const MS_SLIDE = 400;
const MS_FALL = 200;

type Pt = { x: number; y: number };

type Layout = {
  w: number;
  smPx: number;
  xsPx: number;
  charW: number;
  cardW: number;
  cardH: number;
  remoteX: number[];
  insideX: number[];
  hostW: number;
  remoteTop: number;
  parkTop: number;
  bandTop: number;
  bandBottom: number;
  tableTop: number;
  rowH: number;
  colX: [number, number, number, number];
  insideTop: number;
  deliverTop: number;
  captionY: number;
};

function fmt(e: NatEndpoint): string {
  return `${e.addr}:${e.port}`;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function spread(n: number, w: number): number[] {
  const inner = w - PAD * 2;
  const xs: number[] = [];
  for (let i = 0; i < n; i += 1) xs.push(r2(PAD + ((i + 0.5) * inner) / n));
  return xs;
}

function layoutOf(scene: NatMappingTableScene): Layout {
  const w = PIECE_CANVAS_W;
  const smPx = parseFloat(fontSizes.sm);
  const xsPx = parseFloat(fontSizes.xs);
  const charW = smPx * 0.62;
  let maxChars = 0;
  const all: string[] = [];
  for (const r of scene.rows) all.push(fmt(r.inside), fmt(r.remote));
  for (const r of scene.returned) all.push(fmt(r.inside), fmt(r.remote));
  for (const d of scene.dropped) all.push(fmt(d.remote), `${scene.publicAddr}:${d.port}`);
  for (const s of all) maxChars = Math.max(maxChars, s.length);
  maxChars = Math.max(maxChars, 16);
  const cardW = r2(charW * maxChars + 30);
  const cardH = r2(smPx * 2 + 16);
  const nR = Math.max(1, scene.remoteHosts.length);
  const nI = Math.max(1, scene.insideHosts.length);
  const hostW = r2(Math.min(HOST_W_MAX, (w - PAD * 2) / Math.max(nR, nI) - 16));
  const remoteTop = 22;
  const parkTop = remoteTop + HOST_H + 8;
  const bandTop = parkTop + cardH + 6;
  const tableTop = bandTop + 24;
  const rowH = r2(Math.min(ROW_H_MAX, ROWS_BUDGET / Math.max(1, scene.capacity)));
  const bandBottom = r2(tableTop + HEADER_H + rowH * Math.max(1, scene.capacity) + 10);
  const insideTop = bandBottom + 22;
  const deliverTop = insideTop + HOST_H + 8;
  const captionY = r2(deliverTop + cardH + 30);
  const x0 = PAD + 8;
  const x3 = w - PAD - 8;
  const tw = x3 - x0;
  const colX: [number, number, number, number] = [
    x0,
    r2(x0 + tw * 0.2),
    r2(x0 + tw * 0.6),
    x3,
  ];
  return {
    w,
    smPx,
    xsPx,
    charW,
    cardW,
    cardH,
    remoteX: spread(nR, w),
    insideX: spread(nI, w),
    hostW,
    remoteTop,
    parkTop,
    bandTop,
    bandBottom,
    tableTop,
    rowH,
    colX,
    insideTop,
    deliverTop,
    captionY,
  };
}

function rowTop(L: Layout, i: number): number {
  return r2(L.tableTop + HEADER_H + i * L.rowH);
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  opts: { size: string; fill: string; family?: string; anchor?: string; weight?: string },
): SVGTextElement {
  const node = el(
    'text',
    {
      x: r2(x),
      y: r2(y),
      'font-size': opts.size,
      'font-family': opts.family ?? fonts.body,
      fill: opts.fill,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'middle',
    },
    parent,
  );
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = text;
  return node;
}

/** 패킷 카드 — 첫 줄 보낸 이, 둘째 줄 받는 이. 좌상단을 (0,0) 에 두고 transform 으로 옮긴다 */
function packetCard(
  parent: Element,
  L: Layout,
  c: Palette,
  from: string,
  to: string,
  stroke: string,
  strokeW: number,
): { g: SVGGElement; toText: SVGTextElement } {
  const g = el('g', {}, parent);
  el(
    'rect',
    {
      x: 0,
      y: 0,
      width: L.cardW,
      height: L.cardH,
      rx: 5,
      fill: c.bg,
      stroke,
      'stroke-width': strokeW,
    },
    g,
  );
  const line1 = r2(8 + L.smPx / 2);
  const line2 = r2(L.cardH - 8 - L.smPx / 2);
  label(g, 8, line1, from, { size: fontSizes.sm, fill: c.text, family: fonts.mono });
  label(g, 8, line2, '→', { size: fontSizes.sm, fill: c.textMuted, family: fonts.mono });
  const toText = label(g, 22, line2, to, {
    size: fontSizes.sm,
    fill: c.text,
    family: fonts.mono,
  });
  return { g, toText };
}

function place(g: SVGGElement, p: Pt): void {
  g.setAttribute('transform', `translate(${r2(p.x)},${r2(p.y)})`);
}

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

type Handles = {
  /** 공인 포트 → 그 줄의 칸 글자들 (열쇠 · 안쪽 · 먼 쪽 · 안쪽 띠) */
  rowParts: Map<number, SVGElement[]>;
  /** 공인 포트 → 그 줄의 강조 테두리 */
  rowMark: Map<number, SVGElement>;
  delivered: SVGGElement[];
  dropped: SVGGElement[];
};

export const natMappingTableStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function colorOf(scene: NatMappingTableScene, insideAddr: string): string {
      const idx = scene.insideHosts.indexOf(insideAddr);
      const pal = categorical(Math.max(1, scene.insideHosts.length));
      return idx >= 0 ? (pal[idx] ?? c.border) : c.border;
    }

    function captionOf(scene: NatMappingTableScene): string {
      const step = scene.step;
      if (step === null) {
        return t('caption.empty', 'The table is empty. Public address: {addr}.', {
          addr: scene.publicAddr,
        });
      }
      if (step.kind === 'write') {
        const row = scene.rows.find((r) => r.port === step.port);
        return t('caption.write', 'Out from {inside}. Row written for public port {port}.', {
          inside: row ? fmt(row.inside) : '',
          port: step.port,
        });
      }
      if (step.kind === 'return') {
        const last = scene.returned[scene.returned.length - 1];
        return t('caption.return', 'In to public port {port}. Row found. Back to: {inside}.', {
          port: step.port,
          inside: last ? fmt(last.inside) : '',
        });
      }
      return t('caption.drop', 'In to public port {port}. No row. Dropped at the boundary.', {
        port: step.port,
      });
    }

    function drawStatic(scene: NatMappingTableScene): Handles {
      svg.textContent = '';
      const L = layoutOf(scene);
      const handles: Handles = {
        rowParts: new Map(),
        rowMark: new Map(),
        delivered: [],
        dropped: [],
      };

      // 밖
      label(svg, PAD, 10, t('label.outside', 'Outside'), {
        size: fontSizes.xs,
        fill: c.textMuted,
      });
      scene.remoteHosts.forEach((addr, i) => {
        const x = L.remoteX[i] ?? 0;
        el(
          'rect',
          {
            x: r2(x - L.hostW / 2),
            y: L.remoteTop,
            width: L.hostW,
            height: HOST_H,
            rx: 4,
            fill: c.bgSubtle,
            stroke: c.border,
          },
          svg,
        );
        label(svg, x, L.remoteTop + HOST_H / 2, addr, {
          size: fontSizes.sm,
          fill: c.text,
          family: fonts.mono,
          anchor: 'middle',
        });
      });

      // NAT 띠
      el(
        'rect',
        {
          x: 0,
          y: L.bandTop,
          width: L.w,
          height: r2(L.bandBottom - L.bandTop),
          fill: c.bgSubtle,
        },
        svg,
      );
      el('line', { x1: 0, x2: L.w, y1: L.bandTop, y2: L.bandTop, stroke: c.text, 'stroke-width': 2 }, svg);
      el(
        'line',
        { x1: 0, x2: L.w, y1: L.bandBottom, y2: L.bandBottom, stroke: c.text, 'stroke-width': 2 },
        svg,
      );
      const natLabel = label(svg, PAD, L.bandTop + 12, t('label.nat', 'NAT'), {
        size: fontSizes.xs,
        fill: c.textMuted,
        weight: '600',
      });
      natLabel.setAttribute('data-role', 'nat');
      label(svg, PAD + 36, L.bandTop + 12, scene.publicAddr, {
        size: fontSizes.sm,
        fill: c.text,
        family: fonts.mono,
        weight: '600',
      });

      // 표 머리
      const [x0, x1, x2, x3] = L.colX;
      el(
        'rect',
        {
          x: x0,
          y: L.tableTop,
          width: r2(x1 - x0),
          height: r2(HEADER_H + L.rowH * Math.max(1, scene.capacity)),
          fill: c.bg,
          stroke: c.text,
          'stroke-width': 1.5,
        },
        svg,
      );
      el(
        'rect',
        {
          x: x1,
          y: L.tableTop,
          width: r2(x3 - x1),
          height: r2(HEADER_H + L.rowH * Math.max(1, scene.capacity)),
          fill: c.bg,
          stroke: c.border,
        },
        svg,
      );
      el('line', { x1: x2, x2: x2, y1: L.tableTop, y2: r2(L.tableTop + HEADER_H + L.rowH * Math.max(1, scene.capacity)), stroke: c.border }, svg);
      el('line', { x1: x0, x2: x3, y1: r2(L.tableTop + HEADER_H), y2: r2(L.tableTop + HEADER_H), stroke: c.border }, svg);
      const hy = L.tableTop + HEADER_H / 2;
      label(svg, x0 + 8, hy, t('col.port', 'Public port'), {
        size: fontSizes.xs,
        fill: c.text,
        weight: '600',
      });
      label(svg, x1 + 12, hy, t('col.inside', 'Inside'), { size: fontSizes.xs, fill: c.textMuted });
      label(svg, x2 + 8, hy, t('col.remote', 'Remote'), { size: fontSizes.xs, fill: c.textMuted });

      // 줄
      const step = scene.step;
      scene.rows.forEach((row, i) => {
        const top = rowTop(L, i);
        const cy = top + L.rowH / 2;
        if (i > 0) {
          el('line', { x1: x0, x2: x3, y1: top, y2: top, stroke: c.border }, svg);
        }
        const stripe = el(
          'rect',
          {
            x: r2(x1 + 2),
            y: r2(top + 4),
            width: 4,
            height: r2(L.rowH - 8),
            fill: colorOf(scene, row.inside.addr),
          },
          svg,
        );
        const key = label(svg, x0 + 8, cy, String(row.port), {
          size: fontSizes.sm,
          fill: c.text,
          family: fonts.mono,
          weight: '600',
        });
        const inside = label(svg, x1 + 12, cy, fmt(row.inside), {
          size: fontSizes.sm,
          fill: c.text,
          family: fonts.mono,
        });
        const remote = label(svg, x2 + 8, cy, fmt(row.remote), {
          size: fontSizes.sm,
          fill: c.textMuted,
          family: fonts.mono,
        });
        handles.rowParts.set(row.port, [key, inside, remote, stripe]);
        if (step !== null && step.kind !== 'drop' && step.port === row.port) {
          const mark = el(
            'rect',
            {
              x: r2(x0 + 1),
              y: r2(top + 1),
              width: r2(x3 - x0 - 2),
              height: r2(L.rowH - 2),
              fill: 'none',
              stroke: step.kind === 'write' ? c.primary : c.accent,
              'stroke-width': 2.5,
            },
            svg,
          );
          handles.rowMark.set(row.port, mark);
        }
      });

      // 안
      label(svg, PAD, L.bandBottom + 10, t('label.inside', 'Inside'), {
        size: fontSizes.xs,
        fill: c.textMuted,
      });
      scene.insideHosts.forEach((addr, i) => {
        const x = L.insideX[i] ?? 0;
        el(
          'rect',
          {
            x: r2(x - L.hostW / 2),
            y: L.insideTop,
            width: L.hostW,
            height: HOST_H,
            rx: 4,
            fill: c.bgSubtle,
            stroke: colorOf(scene, addr),
            'stroke-width': 2,
          },
          svg,
        );
        label(svg, x, L.insideTop + HOST_H / 2, addr, {
          size: fontSizes.sm,
          fill: c.text,
          family: fonts.mono,
          anchor: 'middle',
        });
      });

      // 되돌려진 답 — 안쪽 주인 아래에 받은 차례로 조금씩 비껴 쌓인다
      const perInside = new Map<string, number>();
      scene.returned.forEach((r, k) => {
        const n = perInside.get(r.inside.addr) ?? 0;
        perInside.set(r.inside.addr, n + 1);
        const isNow = step !== null && step.kind === 'return' && k === scene.returned.length - 1;
        const { g } = packetCard(
          svg,
          L,
          c,
          fmt(r.remote),
          fmt(r.inside),
          isNow ? c.accent : colorOf(scene, r.inside.addr),
          isNow ? 2.5 : 1.5,
        );
        place(g, deliverAt(L, scene, r.inside.addr, n));
        handles.delivered.push(g);
      });

      // 버려진 패킷 — 보낸 이 아래, 경계 위에 멈춰 있다
      const perRemote = new Map<string, number>();
      scene.dropped.forEach((d, k) => {
        const n = perRemote.get(d.remote.addr) ?? 0;
        perRemote.set(d.remote.addr, n + 1);
        const { g } = packetCard(
          svg,
          L,
          c,
          fmt(d.remote),
          `${scene.publicAddr}:${d.port}`,
          c.danger,
          step !== null && step.kind === 'drop' && k === scene.dropped.length - 1 ? 2.5 : 1.5,
        );
        const at = parkAt(L, scene, d.remote.addr, n);
        place(g, at);
        // 오른쪽에 자리가 모자라면 카드 왼쪽에 붙인다 — 말이 길어지는 언어가 캔버스 밖으로 나가지 않게
        const room = L.w - (at.x + L.cardW);
        const onRight = room >= DROPPED_LABEL_ROOM;
        label(
          g,
          onRight ? L.cardW + 6 : -6,
          L.cardH / 2,
          t('label.dropped', 'Dropped'),
          {
            size: fontSizes.xs,
            fill: c.danger,
            weight: '600',
            anchor: onRight ? 'start' : 'end',
          },
        );
        handles.dropped.push(g);
      });

      label(svg, L.w / 2, L.captionY, captionOf(scene), {
        size: fontSizes.md,
        fill: c.text,
        anchor: 'middle',
      });
      return handles;
    }

    function deliverAt(L: Layout, scene: NatMappingTableScene, addr: string, n: number): Pt {
      const i = scene.insideHosts.indexOf(addr);
      const x = L.insideX[i] ?? L.w / 2;
      return { x: r2(x - L.cardW / 2 + n * 6), y: r2(L.deliverTop + n * 4) };
    }

    function parkAt(L: Layout, scene: NatMappingTableScene, addr: string, n: number): Pt {
      const i = scene.remoteHosts.indexOf(addr);
      const x = L.remoteX[i] ?? L.w / 2;
      return { x: r2(x - L.cardW / 2 + n * 6), y: r2(L.parkTop - n * 4) };
    }

    function remoteCardAt(L: Layout, scene: NatMappingTableScene, addr: string): Pt {
      const i = scene.remoteHosts.indexOf(addr);
      const x = L.remoteX[i] ?? L.w / 2;
      return { x: r2(x - L.cardW / 2), y: L.remoteTop };
    }

    function insideCardAt(L: Layout, scene: NatMappingTableScene, addr: string): Pt {
      const i = scene.insideHosts.indexOf(addr);
      const x = L.insideX[i] ?? L.w / 2;
      return { x: r2(x - L.cardW / 2), y: L.insideTop };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) return resolve();
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

    /** ms 동안 p 를 0→1 로 흘린다. 세대가 바뀌거나 거두어지면 곧바로 풀린다 */
    async function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const p = Math.min(1, (Date.now() - start) / ms);
        frame(ease(p));
        if (p >= 1) return true;
        await wait(16);
      }
    }

    async function animateWrite(
      scene: NatMappingTableScene,
      h: Handles,
      port: number,
      mine: number,
    ): Promise<void> {
      const L = layoutOf(scene);
      const idx = scene.rows.findIndex((r) => r.port === port);
      const row = scene.rows[idx];
      const parts = h.rowParts.get(port);
      if (!row || !parts) return;
      const mark = h.rowMark.get(port);
      for (const p of parts) p.setAttribute('opacity', '0');
      mark?.setAttribute('opacity', '0');

      const layer = el('g', {}, svg);
      const color = colorOf(scene, row.inside.addr);
      const { g } = packetCard(layer, L, c, fmt(row.inside), fmt(row.remote), color, 2);
      const top = rowTop(L, idx);
      const from = insideCardAt(L, scene, row.inside.addr);
      const stop: Pt = { x: r2(L.colX[1] + 8), y: r2(top + L.rowH / 2 - L.cardH / 2) };
      place(g, from);
      if (!(await tween(MS_RISE, mine, (p) => place(g, lerp(from, stop, p))))) return;

      // 주소 둘이 카드에서 칸으로 내려앉고, 공인 포트가 NAT 주소 곁에서 열쇠 칸으로 떨어진다
      const cy = top + L.rowH / 2;
      const flyIn = label(layer, stop.x + 22, stop.y + L.cardH - 8 - L.smPx / 2, fmt(row.inside), {
        size: fontSizes.sm,
        fill: c.text,
        family: fonts.mono,
      });
      const flyRemote = label(layer, stop.x + 8, stop.y + 8 + L.smPx / 2, fmt(row.remote), {
        size: fontSizes.sm,
        fill: c.textMuted,
        family: fonts.mono,
      });
      const flyPort = label(layer, PAD + 36, L.bandTop + 12, String(port), {
        size: fontSizes.sm,
        fill: c.primary,
        family: fonts.mono,
        weight: '600',
      });
      const a0: Pt = { x: stop.x + 22, y: stop.y + L.cardH - 8 - L.smPx / 2 };
      const a1: Pt = { x: L.colX[1] + 12, y: cy };
      const b0: Pt = { x: stop.x + 8, y: stop.y + 8 + L.smPx / 2 };
      const b1: Pt = { x: L.colX[2] + 8, y: cy };
      const c0: Pt = { x: PAD + 36, y: L.bandTop + 12 };
      const c1: Pt = { x: L.colX[0] + 8, y: cy };
      g.setAttribute('opacity', '0.35');
      const ok = await tween(MS_WRITE, mine, (p) => {
        const a = lerp(a0, a1, p);
        const b = lerp(b0, b1, p);
        const k = lerp(c0, c1, p);
        flyIn.setAttribute('x', String(r2(a.x)));
        flyIn.setAttribute('y', String(r2(a.y)));
        flyRemote.setAttribute('x', String(r2(b.x)));
        flyRemote.setAttribute('y', String(r2(b.y)));
        flyPort.setAttribute('x', String(r2(k.x)));
        flyPort.setAttribute('y', String(r2(k.y)));
      });
      if (!ok) return;
      flyIn.remove();
      flyRemote.remove();
      flyPort.remove();
      for (const p of parts) p.removeAttribute('opacity');
      mark?.removeAttribute('opacity');
      g.removeAttribute('opacity');

      // 패킷은 밖으로 빠져나간다
      const out = remoteCardAt(L, scene, row.remote.addr);
      await tween(MS_LEAVE, mine, (p) => {
        place(g, lerp(stop, out, p));
        g.setAttribute('opacity', String(r2(1 - p)));
      });
    }

    async function animateReturn(
      scene: NatMappingTableScene,
      h: Handles,
      port: number,
      mine: number,
    ): Promise<void> {
      const L = layoutOf(scene);
      const k = scene.returned.length - 1;
      const r = scene.returned[k];
      const card = h.delivered[k];
      const idx = scene.rows.findIndex((row) => row.port === port);
      if (!r || !card || idx < 0) return;
      const mark = h.rowMark.get(port);
      card.setAttribute('opacity', '0');
      mark?.setAttribute('opacity', '0');

      const layer = el('g', {}, svg);
      const { g, toText } = packetCard(
        layer,
        L,
        c,
        fmt(r.remote),
        `${scene.publicAddr}:${port}`,
        c.accent,
        2.5,
      );
      const from = remoteCardAt(L, scene, r.remote.addr);
      const park = parkAt(L, scene, r.remote.addr, 0);
      place(g, from);
      if (!(await tween(MS_ARRIVE, mine, (p) => place(g, lerp(from, park, p))))) return;

      // 받는 포트가 떨어져 나와 열쇠 칸을 타고 제 줄까지 내려간다
      const line2y = park.y + L.cardH - 8 - L.smPx / 2;
      const portX0 = park.x + 22 + (scene.publicAddr.length + 1) * L.charW;
      const chip = label(layer, portX0, line2y, String(port), {
        size: fontSizes.sm,
        fill: c.accent,
        family: fonts.mono,
        weight: '700',
      });
      const top = rowTop(L, idx);
      const cy = top + L.rowH / 2;
      const k0: Pt = { x: portX0, y: line2y };
      const kMid: Pt = { x: L.colX[0] + 8, y: L.tableTop + HEADER_H / 2 };
      const k1: Pt = { x: L.colX[0] + 8, y: cy };
      const ok1 = await tween(MS_LOOKUP, mine, (p) => {
        const q = p < 0.5 ? lerp(k0, kMid, p * 2) : lerp(kMid, k1, (p - 0.5) * 2);
        chip.setAttribute('x', String(r2(q.x)));
        chip.setAttribute('y', String(r2(q.y)));
      });
      if (!ok1) return;
      chip.remove();
      mark?.removeAttribute('opacity');

      // 그 줄의 안쪽 주소가 패킷으로 올라와 받는 이를 갈아 끼운다
      const copy = label(layer, L.colX[1] + 12, cy, fmt(r.inside), {
        size: fontSizes.sm,
        fill: c.text,
        family: fonts.mono,
        weight: '600',
      });
      const s0: Pt = { x: L.colX[1] + 12, y: cy };
      const s1: Pt = { x: park.x + 22, y: line2y };
      const ok2 = await tween(MS_SWAP, mine, (p) => {
        const q = lerp(s0, s1, p);
        copy.setAttribute('x', String(r2(q.x)));
        copy.setAttribute('y', String(r2(q.y)));
        toText.setAttribute('opacity', String(r2(1 - p)));
      });
      if (!ok2) return;
      copy.remove();
      toText.removeAttribute('opacity');
      toText.textContent = fmt(r.inside);

      // 띠를 지나 안쪽 주인에게 내려간다
      const n = scene.returned.slice(0, k).filter((x) => x.inside.addr === r.inside.addr).length;
      const dest = deliverAt(L, scene, r.inside.addr, n);
      await tween(MS_DESCEND, mine, (p) => place(g, lerp(park, dest, p)));
    }

    async function animateDrop(
      scene: NatMappingTableScene,
      h: Handles,
      port: number,
      mine: number,
    ): Promise<void> {
      const L = layoutOf(scene);
      const k = scene.dropped.length - 1;
      const d = scene.dropped[k];
      const card = h.dropped[k];
      if (!d || !card) return;
      card.setAttribute('opacity', '0');

      const layer = el('g', {}, svg);
      const { g } = packetCard(
        layer,
        L,
        c,
        fmt(d.remote),
        `${scene.publicAddr}:${port}`,
        c.border,
        1.5,
      );
      const from = remoteCardAt(L, scene, d.remote.addr);
      const n = scene.dropped.slice(0, k).filter((x) => x.remote.addr === d.remote.addr).length;
      const park = parkAt(L, scene, d.remote.addr, n);
      place(g, from);
      if (!(await tween(MS_ARRIVE, mine, (p) => place(g, lerp(from, park, p))))) return;

      // 받는 포트가 열쇠 칸을 끝까지 미끄러지지만 닿는 줄이 없다
      const line2y = park.y + L.cardH - 8 - L.smPx / 2;
      const portX0 = park.x + 22 + (scene.publicAddr.length + 1) * L.charW;
      const chip = label(layer, portX0, line2y, String(port), {
        size: fontSizes.sm,
        fill: c.accent,
        family: fonts.mono,
        weight: '700',
      });
      const k0: Pt = { x: portX0, y: line2y };
      const kMid: Pt = { x: L.colX[0] + 8, y: L.tableTop + HEADER_H / 2 };
      const kEnd: Pt = { x: L.colX[0] + 8, y: L.bandBottom - 4 };
      const ok1 = await tween(MS_SLIDE, mine, (p) => {
        const q = p < 0.35 ? lerp(k0, kMid, p / 0.35) : lerp(kMid, kEnd, (p - 0.35) / 0.65);
        chip.setAttribute('x', String(r2(q.x)));
        chip.setAttribute('y', String(r2(q.y)));
      });
      if (!ok1) return;
      chip.setAttribute('fill', c.danger);
      const ok2 = await tween(MS_FALL, mine, (p) => {
        chip.setAttribute('y', String(r2(kEnd.y + p * 14)));
        chip.setAttribute('opacity', String(r2(1 - p)));
      });
      if (!ok2) return;
      chip.remove();
      g.remove();
      card.removeAttribute('opacity');
    }

    return {
      render(
        next: NatMappingTableScene,
        prev: NatMappingTableScene | null,
        opts: { animate: boolean },
      ): Promise<void> | void {
        const scene = next;
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(scene);
        const step = scene.step;
        if (!opts.animate || step === null || prev === null || next === prev) return;
        const run =
          step.kind === 'write'
            ? animateWrite(scene, h, step.port, mine)
            : step.kind === 'return'
              ? animateReturn(scene, h, step.port, mine)
              : animateDrop(scene, h, step.port, mine);
        return run.then(() => {
          if (mine === gen && !destroyed) drawStatic(scene);
        });
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    } as SceneRenderer<NatMappingTableScene> as ViewInstance;
  },
};
