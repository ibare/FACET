/**
 * copy-to-followers 무대.
 *
 * 위에 클라이언트, 아래에 노드 칸이 나란히 선다. 한 열쇠는 어느 노드에서나 같은 줄에 적히므로
 * 사본이 번지면 칸들이 같은 모양으로 겹쳐 보인다.
 *
 * 운동
 *   write      쓰기 칩이 클라이언트에서 리더 칸의 제 줄로 내려앉는다
 *   replicate  리더의 줄에서 사본이 떨어져 나와 팔로워 칸의 같은 줄로 옆걸음한다 (한 시계)
 *   ack        ok 가 리더에서 클라이언트로 올라간다
 *   stop       멈춘 노드 칸이 내려앉으며 흐려진다
 *   read       읽기가 클라이언트에서 그 노드의 줄로 가고, 답이 거꾸로 돌아온다
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
import type { CopyNode, CopyToFollowersScene } from './scene.js';

const H = 300;
const NS = 'http://www.w3.org/2000/svg';

const MARGIN = 16;
const COL_GAP_MAX = 24;
const CLIENT_Y = 14;
const CLIENT_H = 48;
const PANEL_Y = 94;
const PANEL_H = 158;
const HEAD_H = 38;
const ROW_H_MAX = 40;
const CHIP_H_MAX = 30;
const CAPTION_Y = H - 18;
/** 멈춘 노드 칸이 내려앉는 깊이 */
const DROP = 12;
const DOWN_OPACITY = 0.4;

const MOVE_MS = 650;
const STOP_MS = 500;
const READ_LEG_MS = 420;

type Point = { x: number; y: number };

type Layout = {
  colW: number;
  panelX: (i: number) => number;
  rowY: (row: number) => number;
  chipW: number;
  chipH: number;
  client: { x: number; y: number; w: number; h: number };
  clientChip: Point;
};

function layoutFor(scene: CopyToFollowersScene): Layout {
  const n = Math.max(1, scene.nodes.length);
  const gap = Math.min(COL_GAP_MAX, (PIECE_CANVAS_W - 2 * MARGIN) / (n * 8));
  const colW = (PIECE_CANVAS_W - 2 * MARGIN - (n - 1) * gap) / n;
  const rows = Math.max(1, scene.capacity);
  const rowH = Math.min(ROW_H_MAX, (PANEL_H - HEAD_H - 12) / rows);
  const chipH = Math.min(CHIP_H_MAX, rowH - 6);
  const chipW = colW - 24;
  const clientW = colW;
  return {
    colW,
    panelX: (i) => MARGIN + i * (colW + gap),
    rowY: (row) => PANEL_Y + HEAD_H + 8 + rowH * row + rowH / 2,
    chipW,
    chipH,
    client: { x: MARGIN, y: CLIENT_Y, w: clientW, h: CLIENT_H },
    clientChip: { x: MARGIN + clientW - 12 - chipW * 0.3, y: CLIENT_Y + CLIENT_H / 2 },
  };
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  text: string,
  x: number,
  y: number,
  opts: { fill: string; size: string; anchor?: string; family?: string; weight?: string },
): SVGTextElement {
  const node = el(
    'text',
    {
      x,
      y,
      fill: opts.fill,
      'font-size': opts.size,
      'font-family': opts.family ?? fonts.body,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'central',
    },
    parent,
  );
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = text;
  return node;
}

function pairText(key: string, value: number): string {
  return `${key}=${value}`;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function isScene(v: unknown): v is CopyToFollowersScene {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as { nodes?: unknown }).nodes) &&
    typeof (v as { capacity?: unknown }).capacity === 'number'
  );
}

type Handles = {
  /** `${node}\u0000${key}` → 그 줄의 칩 묶음 */
  chips: Map<string, SVGGElement>;
  panels: Map<string, SVGGElement>;
  clientChip: SVGGElement | null;
  overlay: SVGGElement;
  layout: Layout;
};

function chipKey(node: string, key: string): string {
  return `${node}\u0000${key}`;
}

export const copyToFollowersStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const chipFont = fontSizes.md;
    const smallFont = fontSizes.sm;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function drawChip(
      parent: Element,
      at: Point,
      w: number,
      h: number,
      text: string,
      style: { fill: string; stroke: string; ink: string; strokeWidth: number },
    ): SVGGElement {
      const g = el('g', {}, parent);
      el(
        'rect',
        {
          x: at.x - w / 2,
          y: at.y - h / 2,
          width: w,
          height: h,
          rx: 5,
          fill: style.fill,
          stroke: style.stroke,
          'stroke-width': style.strokeWidth,
        },
        g,
      );
      label(g, text, at.x, at.y, { fill: style.ink, size: chipFont, anchor: 'middle', family: fonts.mono });
      return g;
    }

    function roleText(node: CopyNode): string {
      if (node.down) return t('label.stopped', 'stopped');
      return node.leader ? t('label.leader', 'leader') : t('label.follower', 'follower');
    }

    function captionText(scene: CopyToFollowersScene): string {
      const step = scene.step;
      if (step === null) return t('caption.start', 'Every node is empty.');
      switch (step.kind) {
        case 'write':
          return t('caption.write', 'Write {cmd} lands on the leader first. Copies: {n}', {
            cmd: pairText(step.key, step.value),
            n: step.copies,
          });
        case 'replicate':
          return t('caption.replicate', 'The leader sends {cmd} to every follower at once. Copies: {n}', {
            cmd: pairText(step.key, step.value),
            n: step.copies,
          });
        case 'ack':
          return t('caption.ack', 'Reply comes back only after all have written: ok. Copies: {n}', {
            n: step.copies,
          });
        case 'stop':
          return t('caption.stop', 'Node {node} stops.', { node: step.node });
        case 'read':
          return t('caption.read', 'Read {key} goes to {node}. Answer: {value}. Live copies: {n}', {
            key: step.key,
            node: step.node,
            value: step.value,
            n: step.live,
          });
      }
    }

    function drawStatic(scene: CopyToFollowersScene): Handles {
      svg.textContent = '';
      const L = layoutFor(scene);
      const step = scene.step;
      const chips = new Map<string, SVGGElement>();
      const panels = new Map<string, SVGGElement>();

      // 클라이언트
      const client = el('g', {}, svg);
      el(
        'rect',
        {
          x: L.client.x,
          y: L.client.y,
          width: L.client.w,
          height: L.client.h,
          rx: 8,
          fill: colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '4 3',
        },
        client,
      );
      label(client, t('label.client', 'client'), L.client.x + 12, L.client.y + L.client.h / 2, {
        fill: colors.textMuted,
        size: smallFont,
      });

      // 노드 칸
      scene.nodes.forEach((node, i) => {
        const x = L.panelX(i);
        const g = el('g', {}, svg);
        if (node.down) {
          g.setAttribute('transform', `translate(0 ${DROP})`);
          g.setAttribute('opacity', String(DOWN_OPACITY));
        }
        el(
          'rect',
          {
            x,
            y: PANEL_Y,
            width: L.colW,
            height: PANEL_H,
            rx: 8,
            fill: colors.bgSubtle,
            stroke: node.leader && !node.down ? colors.primary : colors.border,
            'stroke-width': node.leader && !node.down ? 2 : 1,
          },
          g,
        );
        label(g, node.id, x + 12, PANEL_Y + HEAD_H / 2, {
          fill: colors.text,
          size: fontSizes.lg,
          family: fonts.mono,
          weight: '600',
        });
        label(g, roleText(node), x + L.colW - 12, PANEL_Y + HEAD_H / 2, {
          fill: node.down ? colors.danger : node.leader ? colors.primary : colors.textMuted,
          size: smallFont,
          anchor: 'end',
        });
        el(
          'line',
          { x1: x + 8, y1: PANEL_Y + HEAD_H, x2: x + L.colW - 8, y2: PANEL_Y + HEAD_H, stroke: colors.border },
          g,
        );
        node.entries.forEach((entry, row) => {
          const marked =
            step !== null &&
            step.kind !== 'stop' &&
            step.key === entry.key &&
            ((step.kind === 'write' && step.node === node.id) ||
              (step.kind === 'replicate' && (step.to.includes(node.id) || step.from === node.id)) ||
              (step.kind === 'ack' && !node.down) ||
              (step.kind === 'read' && step.node === node.id));
          const stroke =
            !marked || step === null
              ? colors.border
              : step.kind === 'ack'
                ? colors.success
                : step.kind === 'read'
                  ? colors.primary
                  : colors.itemActive;
          const chip = drawChip(
            g,
            { x: x + L.colW / 2, y: L.rowY(row) },
            L.chipW,
            L.chipH,
            pairText(entry.key, entry.value),
            { fill: colors.bg, stroke, ink: colors.text, strokeWidth: marked ? 2 : 1 },
          );
          chips.set(chipKey(node.id, entry.key), chip);
        });
        panels.set(node.id, g);
      });

      // 클라이언트가 쥔 것 — 응답 ok 또는 읽어 온 값
      let clientChip: SVGGElement | null = null;
      if (step !== null && step.kind === 'ack') {
        clientChip = drawChip(svg, L.clientChip, L.chipW * 0.6, L.chipH, t('label.ok', 'ok'), {
          fill: colors.success,
          stroke: colors.success,
          ink: colors.textInverse,
          strokeWidth: 1,
        });
      } else if (step !== null && step.kind === 'read') {
        const i = scene.nodes.findIndex((n) => n.id === step.node);
        if (i < 0) throw new Error(`copy-to-followers: 읽기를 받은 노드 '${step.node}' 가 장면에 없다`);
        const node = scene.nodes[i];
        const row = node === undefined ? -1 : node.entries.findIndex((e) => e.key === step.key);
        if (row < 0) throw new Error(`copy-to-followers: ${step.node} 에 '${step.key}' 줄이 없다`);
        // 읽기가 오간 길
        el(
          'line',
          {
            x1: L.clientChip.x,
            y1: L.clientChip.y + L.chipH / 2,
            x2: L.panelX(i) + L.colW / 2,
            y2: PANEL_Y,
            stroke: colors.primary,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 4',
          },
          svg,
        );
        clientChip = drawChip(svg, L.clientChip, L.chipW * 0.6, L.chipH, pairText(step.key, step.value), {
          fill: colors.primary,
          stroke: colors.primary,
          ink: colors.textInverse,
          strokeWidth: 1,
        });
      }

      const overlay = el('g', {}, svg);

      label(svg, captionText(scene), PIECE_CANVAS_W / 2, CAPTION_Y, {
        fill: colors.text,
        size: fontSizes.md,
        anchor: 'middle',
      });

      return { chips, panels, clientChip, overlay, layout: L };
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish();
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

    /** 끝 자리에 선 요소를 (dx, dy) 만큼 떨어진 곳에서 출발시킨다. */
    function offset(g: Element, dx: number, dy: number, p: number): void {
      const k = 1 - p;
      g.setAttribute('transform', `translate(${round(dx * k)} ${round(dy * k)})`);
    }

    function nodePoint(scene: CopyToFollowersScene, L: Layout, id: string, key: string): Point {
      const i = scene.nodes.findIndex((n) => n.id === id);
      const node = scene.nodes[i];
      if (i < 0 || node === undefined) throw new Error(`copy-to-followers: 모르는 노드 '${id}'`);
      const row = node.entries.findIndex((e) => e.key === key);
      if (row < 0) throw new Error(`copy-to-followers: ${id} 에 '${key}' 줄이 없다`);
      return { x: L.panelX(i) + L.colW / 2, y: L.rowY(row) };
    }

    async function animate(scene: CopyToFollowersScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const h = drawStatic(scene);
      const L = h.layout;
      const alive = (): boolean => mine === gen && !destroyed;

      if (step.kind === 'write') {
        const chip = h.chips.get(chipKey(step.node, step.key));
        if (!chip) throw new Error('copy-to-followers: 적힌 칩이 없다');
        const end = nodePoint(scene, L, step.node, step.key);
        await tween(MOVE_MS, mine, (p) => offset(chip, L.clientChip.x - end.x, L.clientChip.y - end.y, p));
      } else if (step.kind === 'replicate') {
        const src = nodePoint(scene, L, step.from, step.key);
        const moving = step.to.map((id) => {
          const chip = h.chips.get(chipKey(id, step.key));
          if (!chip) throw new Error(`copy-to-followers: ${id} 의 사본 칩이 없다`);
          const end = nodePoint(scene, L, id, step.key);
          return { chip, dx: src.x - end.x, dy: src.y - end.y };
        });
        await tween(MOVE_MS, mine, (p) => {
          for (const m of moving) offset(m.chip, m.dx, m.dy, p);
        });
      } else if (step.kind === 'ack') {
        const chip = h.clientChip;
        if (!chip) throw new Error('copy-to-followers: ok 칩이 없다');
        const src = nodePoint(scene, L, step.node, step.key);
        await tween(MOVE_MS, mine, (p) => offset(chip, src.x - L.clientChip.x, src.y - L.clientChip.y, p));
      } else if (step.kind === 'stop') {
        const g = h.panels.get(step.node);
        if (!g) throw new Error(`copy-to-followers: ${step.node} 칸이 없다`);
        await tween(STOP_MS, mine, (p) => {
          g.setAttribute('transform', `translate(0 ${round(DROP * p)})`);
          g.setAttribute('opacity', String(round(1 - (1 - DOWN_OPACITY) * p)));
        });
      } else {
        const chip = h.clientChip;
        if (!chip) throw new Error('copy-to-followers: 읽은 값 칩이 없다');
        const target = nodePoint(scene, L, step.node, step.key);
        // 나가는 물음 — 장면에 남지 않는 것이라 덧층에 잠시 둔다
        chip.setAttribute('opacity', '0');
        const ask = drawChip(h.overlay, L.clientChip, L.chipW * 0.4, L.chipH, step.key, {
          fill: colors.bg,
          stroke: colors.primary,
          ink: colors.primary,
          strokeWidth: 2,
        });
        await tween(READ_LEG_MS, mine, (p) =>
          offset(ask, target.x - L.clientChip.x, target.y - L.clientChip.y, 1 - p),
        );
        if (!alive()) return;
        h.overlay.textContent = '';
        chip.removeAttribute('opacity');
        await tween(READ_LEG_MS, mine, (p) =>
          offset(chip, target.x - L.clientChip.x, target.y - L.clientChip.y, p),
        );
      }
      if (!alive()) return;
      drawStatic(scene);
    }

    function render(
      next: unknown,
      prev: unknown,
      opts: { animate: boolean },
    ): void | Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      if (!isScene(next)) {
        svg.textContent = '';
        return;
      }
      if (!opts.animate || prev === null || next.step === null) {
        drawStatic(next);
        return;
      }
      return animate(next, mine);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
