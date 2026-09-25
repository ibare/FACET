/**
 * rewrite-address-port stage — 패킷이 NAT 경계를 넘으며 보낸 이 칸의 값이 빠지고 공인 값이 끼워진다.
 *
 * 위는 안쪽(사설), 가운데 가로 점선이 NAT 경계, 아래는 밖(공인). 패킷은 칸 넷이 가로로 선 꾸러미이고,
 * 칸의 가로 자리는 안과 밖에서 같다 — 받는 이 두 칸은 위에서 아래까지 한 줄로 곧게 이어지고,
 * 보낸 이 두 칸만 값이 갈린다. 끼워지는 값은 경계 왼쪽의 NAT 상자에서 날아온다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { RewriteScene } from './scene.js';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';

const ARRIVE_MS = 500;
const SWAP_MS = 500;
const LEAVE_MS = 400;

/** 가로 여백 · 칸 사이 · 폭 상한 배율 */
const PAD = 12;
const CELL_GAP = 8;
const MAX_STRETCH = 1.5;
const GUTTER_MAX = 150;

interface Layout {
  W: number;
  gutter: number;
  badgeX: number;
  cellX: number[];
  cellW: number[];
  rowH: number;
  insideY: number[];
  outsideY: number[];
  boundaryY: number;
  natTop: number;
  natH: number;
  publicChip: { x: number; y: number };
  nextChip: { x: number; y: number };
  headerGroupY: number;
  headerSubY: number;
  publicLabelY: number;
  serverY: number;
  captionY: number[];
}

const r1 = (v: number): number => {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
};

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function layoutFor(scene: RewriteScene): Layout {
  const W = PIECE_CANVAS_W;
  const fs = parseFloat(fontSizes.sm);
  const charW = fs * 0.62;
  const gutter = Math.min(GUTTER_MAX, Math.round(W * 0.24));
  const badgeX = gutter + 13;
  const x0 = gutter + 28;
  const n = scene.packets.length;

  const lastPort = scene.firstPort + n - 1;
  const chars = [
    Math.max(scene.publicAddress.length, ...scene.packets.map((p) => p.original.address.length)),
    Math.max(String(lastPort).length, ...scene.packets.map((p) => String(p.original.port).length)),
    Math.max(...scene.packets.map((p) => p.dst.address.length)),
    Math.max(...scene.packets.map((p) => String(p.dst.port).length)),
  ];
  const need = chars.map((c) => c * charW + 20);
  const sum = need.reduce((a, b) => a + b, 0);
  const avail = W - PAD - x0 - CELL_GAP * (need.length - 1);
  const stretch = Math.min(MAX_STRETCH, avail / sum);
  const cellW = need.map((w) => r1(w * stretch));
  const cellX: number[] = [];
  let x = x0;
  for (const w of cellW) {
    cellX.push(r1(x));
    x += w + CELL_GAP;
  }

  const captionY = [H - 32, H - 12];
  const serverY = H - 58;
  const insideTop = 48;
  const outsideBottom = serverY - 20;
  // 경계 띠 — NAT 상자와 위아래 틈, 그리고 밖 쪽 이름 한 줄
  const natH = 66;
  const band = natH + 56;
  const zone = (outsideBottom - insideTop - band) / 2;
  const pitch = Math.min(38, (zone + 10) / n);
  const rowH = Math.min(26, pitch - 10);
  const insideY = scene.packets.map((_, i) => r1(insideTop + rowH / 2 + i * pitch));
  const insideBottom = insideTop + (n - 1) * pitch + rowH;
  const outsideTop = outsideBottom - ((n - 1) * pitch + rowH);
  const outsideY = scene.packets.map((_, i) => r1(outsideTop + rowH / 2 + i * pitch));
  const boundaryY = r1((insideBottom + outsideTop) / 2 - 8);
  const natTop = r1(boundaryY - natH / 2);
  const boxCx = r1(gutter / 2 + 2);

  return {
    W,
    gutter,
    badgeX,
    cellX,
    cellW,
    rowH,
    insideY,
    outsideY,
    boundaryY,
    natTop,
    natH,
    publicChip: { x: boxCx, y: r1(natTop + 36) },
    nextChip: { x: r1(gutter - 30), y: r1(natTop + 56) },
    headerGroupY: 14,
    headerSubY: 32,
    publicLabelY: r1(outsideTop - 10),
    serverY,
    captionY,
  };
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
  content: string,
  opts: { size?: string; fill: string; anchor?: string; mono?: boolean; weight?: number },
): SVGTextElement {
  const node = el(
    'text',
    {
      x: r1(x),
      y: r1(y),
      'font-family': opts.mono ? fonts.mono : fonts.body,
      'font-size': opts.size ?? fontSizes.sm,
      fill: opts.fill,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'central',
    },
    parent,
  );
  if (opts.weight) node.setAttribute('font-weight', String(opts.weight));
  node.textContent = content;
  return node;
}

function endpoint(address: string, port: number): string {
  return `${address}:${port}`;
}

export const rewriteAddressPortStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 만든 손잡이 — 운동이 이것을 만진다 */
    let groups: SVGGElement[] = [];
    let cellTexts: SVGTextElement[][] = [];
    let nextPortText: SVGTextElement | null = null;

    function drawStatic(scene: RewriteScene): Layout {
      svg.textContent = '';
      const L = layoutFor(scene);
      const { W } = L;

      // 안쪽 바탕 — 경계선 위
      el('rect', { x: 0, y: 44, width: W, height: r1(L.boundaryY - 44), fill: c.bgSubtle }, svg);
      el(
        'line',
        {
          x1: 4,
          x2: W - 4,
          y1: L.boundaryY,
          y2: L.boundaryY,
          stroke: c.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '6 4',
        },
        svg,
      );

      // 칸 머리 — 보낸 이 두 칸, 받는 이 두 칸
      const groupsOf: Array<[number, number, string]> = [
        [0, 1, t('slot.sender', 'Sender')],
        [2, 3, t('slot.receiver', 'Receiver')],
      ];
      for (const [a, b, text] of groupsOf) {
        const left = L.cellX[a]!;
        const right = L.cellX[b]! + L.cellW[b]!;
        label(svg, (left + right) / 2, L.headerGroupY, text, {
          fill: c.text,
          anchor: 'middle',
          size: fontSizes.sm,
          weight: 600,
        });
        el(
          'line',
          { x1: left, x2: r1(right), y1: 23, y2: 23, stroke: c.border, 'stroke-width': 1 },
          svg,
        );
      }
      L.cellX.forEach((cx, col) => {
        const text = col % 2 === 0 ? t('slot.address', 'address') : t('slot.port', 'port');
        label(svg, cx + L.cellW[col]! / 2, L.headerSubY, text, {
          fill: c.textMuted,
          anchor: 'middle',
          size: fontSizes.xs,
        });
      });

      // 쪽 이름
      label(svg, PAD, L.headerSubY, t('label.inside', 'Private side'), {
        fill: c.textMuted,
        size: fontSizes.xs,
      });
      label(svg, PAD, L.publicLabelY, t('label.outside', 'Public side'), {
        fill: c.textMuted,
        size: fontSizes.xs,
      });
      scene.packets.forEach((_, i) => {
        label(svg, PAD, L.insideY[i]!, t('label.device', 'Device {n}', { n: i + 1 }), {
          fill: c.text,
          size: fontSizes.sm,
        });
      });

      // NAT 상자 — 끼울 값이 여기서 나간다
      const boxW = L.gutter - 12;
      el(
        'rect',
        {
          x: 6,
          y: L.natTop,
          width: boxW,
          height: L.natH,
          rx: 6,
          fill: c.bg,
          stroke: c.primary,
          'stroke-width': 1.5,
        },
        svg,
      );
      label(svg, 14, L.natTop + 14, t('label.nat', 'NAT'), {
        fill: c.primary,
        size: fontSizes.xs,
        weight: 700,
      });
      label(svg, L.publicChip.x, L.publicChip.y, scene.publicAddress, {
        fill: c.text,
        mono: true,
        anchor: 'middle',
      });
      label(svg, 14, L.nextChip.y, t('label.nextPort', 'Next port'), {
        fill: c.textMuted,
        size: fontSizes.xs,
      });
      nextPortText = label(svg, L.nextChip.x, L.nextChip.y, String(scene.nextPort), {
        fill: c.text,
        mono: true,
        anchor: 'middle',
      });

      // 받는 쪽 — 서버
      const dsts = [...new Set(scene.packets.map((p) => endpoint(p.dst.address, p.dst.port)))];
      label(svg, PAD, L.serverY, t('label.server', 'Server'), { fill: c.text, size: fontSizes.sm });
      label(svg, L.cellX[2]!, L.serverY, dsts.join('  ·  '), { fill: c.text, mono: true });

      // 떠난 자리 — 안쪽에서 보낸 그대로
      scene.packets.forEach((p, i) => {
        if (p.place === 'inside') return;
        drawPacket(svg, L, L.insideY[i]!, i, [p.original.address, String(p.original.port)], p, true);
      });

      // 패킷
      groups = [];
      cellTexts = [];
      scene.packets.forEach((p, i) => {
        const y = p.place === 'inside' ? L.insideY[i]! : p.place === 'boundary' ? L.boundaryY : L.outsideY[i]!;
        const g = el('g', {}, svg);
        const texts = drawPacket(g, L, y, i, [p.src.address, String(p.src.port)], p, false);
        groups.push(g);
        cellTexts.push(texts);
      });

      // 캡션
      const lines = captionFor(scene);
      lines.forEach((line, k) => {
        label(svg, W / 2, L.captionY[k]!, line, {
          fill: k === 0 ? c.text : c.textMuted,
          anchor: 'middle',
          size: fontSizes.sm,
        });
      });
      return L;
    }

    function drawPacket(
      parent: Element,
      L: Layout,
      y: number,
      i: number,
      src: [string, string],
      p: RewriteScene['packets'][number],
      ghost: boolean,
    ): SVGTextElement[] {
      const top = r1(y - L.rowH / 2);
      const last = L.cellX.length - 1;
      const right = L.cellX[last]! + L.cellW[last]!;
      el(
        'rect',
        {
          x: L.gutter + 2,
          y: r1(top - 4),
          width: r1(right + 4 - (L.gutter + 2)),
          height: L.rowH + 8,
          rx: 8,
          fill: ghost ? 'none' : c.bg,
          stroke: ghost ? c.border : c.textMuted,
          'stroke-width': 1,
          ...(ghost ? { 'stroke-dasharray': '4 3' } : {}),
        },
        parent,
      );
      el(
        'circle',
        { cx: L.badgeX, cy: r1(y), r: 8, fill: ghost ? c.border : c.text },
        parent,
      );
      label(parent, L.badgeX, y, String(i + 1), {
        fill: ghost ? c.textMuted : c.textInverse,
        size: fontSizes.xs,
        anchor: 'middle',
        weight: 700,
      });
      const values = [src[0], src[1], p.dst.address, String(p.dst.port)];
      const swapped = [p.addressSwapped, p.portSwapped, false, false];
      return values.map((v, col) => {
        const hot = !ghost && swapped[col]!;
        el(
          'rect',
          {
            x: L.cellX[col]!,
            y: top,
            width: L.cellW[col]!,
            height: L.rowH,
            rx: 4,
            fill: ghost ? 'none' : c.bgSubtle,
            stroke: hot ? c.itemActive : c.border,
            'stroke-width': hot ? 2 : 1,
            ...(ghost ? { 'stroke-dasharray': '4 3' } : {}),
          },
          parent,
        );
        return label(parent, L.cellX[col]! + L.cellW[col]! / 2, y, v, {
          fill: ghost ? c.textMuted : c.text,
          mono: true,
          anchor: 'middle',
        });
      });
    }

    function captionFor(scene: RewriteScene): string[] {
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return [
            t('caption.start', 'Waiting inside: {list}', {
              list: scene.packets.map((p) => endpoint(p.original.address, p.original.port)).join('  ·  '),
            }),
          ];
        case 'arrive':
          return [t('caption.arrive', 'Packet {n} reaches the NAT boundary.', { n: step.index + 1 })];
        case 'address':
          return [
            t('caption.address', 'Sender address — out: {was}, in: {now}', {
              was: step.was,
              now: step.now,
            }),
          ];
        case 'port': {
          const p = scene.packets[step.index]!;
          return [
            t('caption.port', 'Sender port — out: {was}, in: {now}', { was: step.was, now: step.now }),
            t('caption.now', 'Leaves as {src} → {dst}', {
              src: endpoint(p.src.address, p.src.port),
              dst: endpoint(p.dst.address, p.dst.port),
            }),
          ];
        }
      }
    }

    function tween(ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        let done = false;
        let startAt = -1;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const frame = (now: number): void => {
          if (done) return;
          if (startAt < 0) startAt = now;
          const p = clamp01((now - startAt) / ms);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame((ts) => {
            frames.delete(id);
            frame(ts);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((ts) => {
          frames.delete(id);
          frame(ts);
        });
        frames.add(id);
      });
    }

    const live = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 칸 하나의 값을 갈아 끼운다 — 옛 값이 위로 빠져나가고 새 값이 NAT 상자에서 날아와 박힌다.
     * `lift` 는 패킷 묶음이 지금 끝 자리에서 얼마나 떨어져 있는가(묶음 좌표로 옮기는 데 쓴다).
     */
    async function swapCell(
      mine: number,
      L: Layout,
      i: number,
      col: number,
      was: string,
      now: string,
      from: { x: number; y: number },
      cellY: number,
      lift: number,
    ): Promise<void> {
      const g = groups[i];
      const real = cellTexts[i]?.[col];
      if (!g || !real) return;
      real.setAttribute('opacity', '0');
      const cx = L.cellX[col]! + L.cellW[col]! / 2;
      const outgoing = label(g, cx, cellY, was, { fill: c.textMuted, mono: true, anchor: 'middle' });
      const incoming = label(g, from.x, from.y - lift, now, {
        fill: c.itemActive,
        mono: true,
        anchor: 'middle',
        weight: 700,
      });
      const rise = L.rowH * 1.4;
      await tween(SWAP_MS, (p) => {
        const a = ease(clamp01(p / 0.55));
        outgoing.setAttribute('y', String(r1(cellY - rise * a)));
        outgoing.setAttribute('opacity', String(r1(1 - a)));
        const b = ease(clamp01((p - 0.3) / 0.7));
        incoming.setAttribute('x', String(r1(from.x + (cx - from.x) * b)));
        incoming.setAttribute('y', String(r1(from.y - lift + (cellY - (from.y - lift)) * b)));
      });
      if (!live(mine)) return;
    }

    return {
      async render(next: RewriteScene, _prev: RewriteScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        const L = drawStatic(next);
        if (!opts.animate || destroyed) return;
        const step = next.step;

        if (step.kind === 'arrive') {
          const g = groups[step.index];
          if (!g) return;
          const dy = L.insideY[step.index]! - L.boundaryY;
          g.setAttribute('transform', `translate(0, ${r1(dy)})`);
          await tween(ARRIVE_MS, (p) => {
            g.setAttribute('transform', `translate(0, ${r1(dy * (1 - ease(p)))})`);
          });
        } else if (step.kind === 'address') {
          await swapCell(mine, L, step.index, 0, step.was, step.now, L.publicChip, L.boundaryY, 0);
        } else if (step.kind === 'port') {
          const g = groups[step.index];
          if (!g) return;
          const outY = L.outsideY[step.index]!;
          const lift = L.boundaryY - outY;
          g.setAttribute('transform', `translate(0, ${r1(lift)})`);
          // 운동 동안 칩은 지금 끼워지는 값을 든다 — 다음 값으로 넘어가는 것은 끝의 drawStatic 이 한다
          if (nextPortText) nextPortText.textContent = String(step.now);
          await swapCell(mine, L, step.index, 1, String(step.was), String(step.now), L.nextChip, outY, lift);
          if (!live(mine)) return;
          await tween(LEAVE_MS, (p) => {
            g.setAttribute('transform', `translate(0, ${r1(lift * (1 - ease(p)))})`);
          });
        }
        if (live(mine)) drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
