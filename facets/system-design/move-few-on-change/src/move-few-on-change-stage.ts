import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { MoveFewScene, Placed } from './scene.js';
import { movedCounts } from './scene.js';

const H = 410;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로 여백 · 두 판 사이 틈. 판의 폭은 캔버스에서 역산한다. */
const SIDE = 14;
const GUTTER = 26;
const PANEL_W = (PIECE_CANVAS_W - SIDE * 2 - GUTTER) / 2;

/** 세로 자리 — 위에서 아래로: 판 이름 · 구조(고리 / 번호 칸) · 셈 한 줄 · 서버 머리 · 칸 · 판정 · 누계 · 캡션 */
const Y_TITLE = 20;
const RING_CY = 76;
const RING_R = 36;
const Y_FORMULA = 64;
const IDX_TOP = 88;
const IDX_H = 26;
const Y_DETAIL = 140;
const Y_NAME = 162;
const Y_POS = 184;
const BIN_TOP = 192;
const BIN_BOTTOM = 338;
const Y_VERDICT = 356;
const Y_TALLY = 377;
const Y_CAPTION = 402;

const ROW_MAX = 20;
const CHIP_W_MAX = 60;
const MOVE_MS = 450;
const REMOVE_MS = 420;

type Side = 'ring' | 'mod';

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function node<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(n);
  return n;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  style: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
): SVGTextElement {
  const n = node(parent, 'text', {
    x,
    y,
    'font-family': style.mono === true ? fonts.mono : fonts.body,
    'font-size': style.size,
    fill: style.fill,
    'text-anchor': style.anchor ?? 'middle',
  });
  if (style.weight !== undefined) n.setAttribute('font-weight', style.weight);
  n.textContent = text;
  return n;
}

/** 링 자리 → 고리 위 점. 0 이 맨 위, 수가 커지면 시계 방향. */
function onRing(cx: number, pos: number, size: number, radius: number): { x: number; y: number } {
  const a = (pos / size) * Math.PI * 2;
  return { x: cx + radius * Math.sin(a), y: RING_CY - radius * Math.cos(a) };
}

/** 고리의 호 (from, to] — from < to 로 펴서 받는다. */
function arcPath(cx: number, from: number, to: number, size: number): string {
  const p0 = onRing(cx, from, size, RING_R);
  const p1 = onRing(cx, to, size, RING_R);
  const large = to - from > size / 2 ? 1 : 0;
  return `M ${r2(p0.x)} ${r2(p0.y)} A ${RING_R} ${RING_R} 0 ${large} 1 ${r2(p1.x)} ${r2(p1.y)}`;
}

function panelX(side: Side): number {
  return side === 'ring' ? SIDE : SIDE + PANEL_W + GUTTER;
}

export const moveFewOnChangeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** drawStatic 이 매번 새로 짓는 손잡이 — 운동이 만진다. */
    let chips = new Map<string, SVGGElement>();
    let succArc: SVGPathElement | null = null;
    let idxBoxes = new Map<number, SVGGElement>();
    let motionLayer: SVGGElement | null = null;

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

    /** 한 시계 — k 를 0 → 1 로 흘린다. 세대가 바뀌면 물러난다. */
    async function tween(mine: number, ms: number, draw: (k: number) => void): Promise<boolean> {
      const frame = 16;
      const n = Math.max(1, Math.round(ms / frame));
      for (let i = 1; i <= n; i += 1) {
        if (mine !== gen || destroyed) return false;
        await wait(frame);
        if (mine !== gen || destroyed) return false;
        draw(ease(i / n));
      }
      return true;
    }

    function serverColor(scene: MoveFewScene, id: string): string {
      const i = scene.serverIds.indexOf(id);
      const c = categorical(scene.serverIds.length, 'vivid')[i];
      if (c === undefined) throw new Error(`move-few-on-change stage: 서버 ${id} 의 색이 없다`);
      return c;
    }

    function binWidth(scene: MoveFewScene): number {
      return PANEL_W / scene.serverIds.length;
    }

    function columnX(scene: MoveFewScene, side: Side, id: string): number {
      const i = scene.serverIds.indexOf(id);
      if (i < 0) throw new Error(`move-few-on-change stage: 서버 ${id} 의 칸이 없다`);
      return panelX(side) + binWidth(scene) * (i + 0.5);
    }

    function rowH(scene: MoveFewScene): number {
      if (scene.base === null) throw new Error('move-few-on-change stage: 바탕 없이 칸 높이를 물었다');
      return Math.min(ROW_MAX, (BIN_BOTTOM - BIN_TOP) / scene.base.rows);
    }

    function rowY(scene: MoveFewScene, row: number): number {
      return BIN_TOP + 4 + rowH(scene) * row;
    }

    /** 칸 안의 차례: 처음 쥔 키는 키 차례로 제 줄에 머문다 (떠나면 빈 자리가 남는다), 옮겨 온 키는 그 아래로 온 차례대로. */
    function home(scene: MoveFewScene, side: Side, key: string): { server: string; row: number } {
      const base = scene.base;
      if (base === null) throw new Error('move-few-on-change stage: 바탕이 없다');
      const k = base.keys.find((x) => x.id === key);
      if (k === undefined) throw new Error(`move-few-on-change stage: 키 ${key} 가 바탕에 없다`);
      const owner = side === 'ring' ? k.ringOwner : k.modOwner;
      const row = base.keys.filter((x) => (side === 'ring' ? x.ringOwner : x.modOwner) === owner).findIndex((x) => x.id === key);
      return { server: owner, row };
    }

    function arrival(scene: MoveFewScene, side: Side, p: Placed): { server: string; row: number } {
      const base = scene.base;
      if (base === null) throw new Error('move-few-on-change stage: 바탕이 없다');
      const to = side === 'ring' ? p.ringTo : p.modTo;
      const originals = base.keys.filter((x) => (side === 'ring' ? x.ringOwner : x.modOwner) === to).length;
      const moved = scene.placed.filter((q) => (side === 'ring' ? q.ringMoved && q.ringTo === to : q.modMoved && q.modTo === to));
      const j = moved.findIndex((q) => q.key === p.key);
      if (j < 0) throw new Error(`move-few-on-change stage: 옮겨 온 키 ${p.key} 의 줄이 없다`);
      return { server: to, row: originals + j };
    }

    function drawChip(
      layer: Element,
      scene: MoveFewScene,
      side: Side,
      key: string,
      at: { server: string; row: number },
      look: 'waiting' | 'orphan' | 'stayed' | 'moved',
      current: boolean,
    ): SVGGElement {
      const w = Math.min(CHIP_W_MAX, binWidth(scene) - 8);
      const h = rowH(scene) - 3;
      const x = columnX(scene, side, at.server);
      const y = rowY(scene, at.row);
      const g = node(layer, 'g', {});
      const fill = look === 'moved' ? colors.accent : look === 'stayed' ? colors.bgSubtle : colors.bg;
      const stroke = current ? colors.primary : look === 'moved' ? colors.accent : look === 'stayed' ? colors.text : colors.border;
      const rect = node(g, 'rect', {
        x: x - w / 2,
        y,
        width: w,
        height: h,
        rx: 3,
        fill,
        stroke,
        'stroke-width': current ? 2 : 1,
      });
      if (look === 'orphan') rect.setAttribute('stroke-dasharray', '3 2');
      label(g, x, y + h / 2 + 4, key, {
        size: fontSizes.xs,
        fill: look === 'moved' ? colors.stateInk : look === 'orphan' ? colors.textMuted : colors.text,
        mono: true,
      });
      return g;
    }

    function drawGhost(layer: Element, scene: MoveFewScene, side: Side, at: { server: string; row: number }, current: boolean): void {
      const w = Math.min(CHIP_W_MAX, binWidth(scene) - 8);
      const h = rowH(scene) - 3;
      const x = columnX(scene, side, at.server);
      node(layer, 'rect', {
        x: x - w / 2,
        y: rowY(scene, at.row),
        width: w,
        height: h,
        rx: 3,
        fill: 'none',
        stroke: current ? colors.primary : colors.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '2 3',
      });
    }

    function drawRing(scene: MoveFewScene, cur: Placed | null): void {
      const base = scene.base;
      if (base === null) throw new Error('move-few-on-change stage: 바탕이 없다');
      const cx = panelX('ring') + PANEL_W / 2;
      const size = base.ringSize;
      const live = base.servers.filter((s) => scene.removal === null || s.id !== scene.removal.server);
      const order = [...live].sort((a, b) => a.pos - b.pos);
      node(svg, 'circle', { cx, cy: RING_CY, r: RING_R, fill: 'none', stroke: colors.border, 'stroke-width': 1 });
      order.forEach((s, i) => {
        const prevS = order[(i - 1 + order.length) % order.length];
        if (prevS === undefined) throw new Error('move-few-on-change stage: 고리의 앞 서버가 없다');
        const from = prevS.pos < s.pos ? prevS.pos : prevS.pos - size;
        const arc = node(svg, 'path', {
          d: arcPath(cx, from, s.pos, size),
          fill: 'none',
          stroke: serverColor(scene, s.id),
          'stroke-width': 6,
          'stroke-linecap': 'butt',
        });
        if (scene.removal !== null && s.id === scene.removal.successor) succArc = arc;
      });
      for (const k of base.keys) {
        const isCur = cur !== null && cur.key === k.id;
        const p = onRing(cx, k.pos, size, RING_R + 10);
        node(svg, 'circle', {
          cx: p.x,
          cy: p.y,
          r: isCur ? 4 : 2,
          fill: isCur ? colors.accent : colors.textMuted,
          stroke: isCur ? colors.text : 'none',
          'stroke-width': 1,
        });
      }
      for (const s of base.servers) {
        const p = onRing(cx, s.pos, size, RING_R);
        const gone = scene.removal !== null && s.id === scene.removal.server;
        if (gone) {
          node(svg, 'path', {
            d: `M ${r2(p.x - 4)} ${r2(p.y - 4)} L ${r2(p.x + 4)} ${r2(p.y + 4)} M ${r2(p.x + 4)} ${r2(p.y - 4)} L ${r2(p.x - 4)} ${r2(p.y + 4)}`,
            stroke: colors.textMuted,
            'stroke-width': 1.5,
          });
        } else {
          node(svg, 'circle', { cx: p.x, cy: p.y, r: 5, fill: serverColor(scene, s.id), stroke: colors.bg, 'stroke-width': 2 });
        }
      }
    }

    function drawIndexBox(layer: Element, scene: MoveFewScene, index: number, x: number, current: boolean): SVGGElement {
      const w = Math.min(34, binWidth(scene) - 16);
      const g = node(layer, 'g', {});
      node(g, 'rect', {
        x: x - w / 2,
        y: IDX_TOP,
        width: w,
        height: IDX_H,
        rx: 4,
        fill: current ? colors.accent : colors.bgSubtle,
        stroke: current ? colors.accent : colors.border,
        'stroke-width': 1,
      });
      label(g, x, IDX_TOP + IDX_H / 2 + 5, String(index), {
        size: fontSizes.md,
        fill: current ? colors.stateInk : colors.text,
        mono: true,
      });
      return g;
    }

    function drawModHead(scene: MoveFewScene, cur: Placed | null): void {
      const survivors = scene.removal === null ? scene.serverIds : scene.removal.survivors;
      const cx = panelX('mod') + PANEL_W / 2;
      label(svg, cx, Y_FORMULA, t('label.modN', 'h mod {n}', { n: survivors.length }), {
        size: fontSizes.xl,
        fill: colors.text,
        mono: true,
      });
      survivors.forEach((id, i) => {
        const box = drawIndexBox(svg, scene, i, columnX(scene, 'mod', id), cur !== null && cur.modIndex === i);
        idxBoxes.set(i, box);
      });
    }

    function drawPanel(scene: MoveFewScene, side: Side, cur: Placed | null): void {
      const base = scene.base;
      if (base === null) throw new Error('move-few-on-change stage: 바탕이 없다');
      const bw = binWidth(scene);
      for (const s of base.servers) {
        const x = columnX(scene, side, s.id);
        const gone = scene.removal !== null && s.id === scene.removal.server;
        node(svg, 'rect', {
          x: x - bw / 2 + 3,
          y: BIN_TOP,
          width: bw - 6,
          height: BIN_BOTTOM - BIN_TOP,
          rx: 4,
          fill: gone ? 'none' : colors.bgSubtle,
          stroke: gone ? colors.textMuted : 'none',
          'stroke-width': 1,
          'stroke-dasharray': gone ? '4 3' : 'none',
        });
        const name = label(svg, x, Y_NAME, s.id, { size: fontSizes.sm, fill: gone ? colors.textMuted : colors.text, mono: true });
        if (gone) name.setAttribute('text-decoration', 'line-through');
        node(svg, 'rect', { x: x - 18, y: Y_NAME + 5, width: 36, height: 3, fill: gone ? colors.border : serverColor(scene, s.id) });
        if (side === 'ring') {
          label(svg, x, Y_POS, String(s.pos), { size: fontSizes.xs, fill: colors.textMuted, mono: true });
        }
      }
      const placedBy = new Map(scene.placed.map((p) => [p.key, p] as const));
      for (const k of base.keys) {
        const p = placedBy.get(k.id);
        const isCur = cur !== null && cur.key === k.id;
        const from = home(scene, side, k.id);
        if (p === undefined) {
          const orphan = scene.removal !== null && from.server === scene.removal.server;
          chips.set(`${side}:${k.id}`, drawChip(svg, scene, side, k.id, from, orphan ? 'orphan' : 'waiting', false));
          continue;
        }
        const moved = side === 'ring' ? p.ringMoved : p.modMoved;
        if (moved) {
          drawGhost(svg, scene, side, from, isCur);
          chips.set(`${side}:${k.id}`, drawChip(svg, scene, side, k.id, arrival(scene, side, p), 'moved', isCur));
        } else {
          chips.set(`${side}:${k.id}`, drawChip(svg, scene, side, k.id, from, 'stayed', isCur));
        }
      }
    }

    function drawVerdicts(cur: Placed, scene: MoveFewScene): void {
      const base = scene.base;
      if (base === null) throw new Error('move-few-on-change stage: 바탕이 없다');
      const k = base.keys.find((x) => x.id === cur.key);
      if (k === undefined) throw new Error(`move-few-on-change stage: 키 ${cur.key} 가 바탕에 없다`);
      const rx = panelX('ring') + PANEL_W / 2;
      const mx = panelX('mod') + PANEL_W / 2;
      const n0 = scene.serverIds.length;
      const n1 = scene.removal === null ? n0 : scene.removal.survivors.length;
      label(svg, rx, Y_DETAIL, t('label.pos', 'Position: {p}', { p: k.pos }), { size: fontSizes.sm, fill: colors.textMuted });
      label(svg, mx, Y_DETAIL, t('label.modPair', 'h mod {n0} = {a} → h mod {n1} = {b}', { n0, a: k.modIndex, n1, b: cur.modIndex }), {
        size: fontSizes.sm,
        fill: colors.textMuted,
        mono: true,
      });
      const ringText = cur.ringMoved
        ? t('label.moved', 'Moved · {from} → {to}', { from: k.ringOwner, to: cur.ringTo })
        : t('label.stayed', 'Stayed · {server}', { server: cur.ringTo });
      const modText = cur.modMoved
        ? t('label.moved', 'Moved · {from} → {to}', { from: k.modOwner, to: cur.modTo })
        : t('label.stayed', 'Stayed · {server}', { server: cur.modTo });
      label(svg, rx, Y_VERDICT, ringText, { size: fontSizes.sm, fill: cur.ringMoved ? colors.text : colors.textMuted, weight: cur.ringMoved ? '600' : '400' });
      label(svg, mx, Y_VERDICT, modText, { size: fontSizes.sm, fill: cur.modMoved ? colors.text : colors.textMuted, weight: cur.modMoved ? '600' : '400' });
    }

    function currentPlaced(scene: MoveFewScene): Placed | null {
      if (scene.step.kind !== 'place') return null;
      const key = scene.step.key;
      const p = scene.placed.find((q) => q.key === key);
      if (p === undefined) throw new Error(`move-few-on-change stage: 이번 걸음의 키 ${key} 가 자취에 없다`);
      return p;
    }

    function drawStatic(scene: MoveFewScene): void {
      svg.textContent = '';
      chips = new Map();
      idxBoxes = new Map();
      succArc = null;
      node(svg, 'rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: colors.bg });
      label(svg, panelX('ring') + PANEL_W / 2, Y_TITLE, t('label.ring', 'Hash ring'), {
        size: fontSizes.md,
        fill: colors.text,
        weight: '600',
      });
      label(svg, panelX('mod') + PANEL_W / 2, Y_TITLE, t('label.mod', 'Remainder hashing'), {
        size: fontSizes.md,
        fill: colors.text,
        weight: '600',
      });
      node(svg, 'line', {
        x1: PIECE_CANVAS_W / 2,
        y1: 8,
        x2: PIECE_CANVAS_W / 2,
        y2: Y_TALLY + 6,
        stroke: colors.border,
        'stroke-width': 1,
      });
      if (scene.base === null) {
        motionLayer = node(svg, 'g', {});
        return;
      }
      const cur = currentPlaced(scene);
      drawRing(scene, cur);
      drawModHead(scene, cur);
      drawPanel(scene, 'ring', cur);
      drawPanel(scene, 'mod', cur);
      if (cur !== null) drawVerdicts(cur, scene);

      const total = scene.base.keys.length;
      const moved = movedCounts(scene);
      label(svg, panelX('ring') + PANEL_W / 2, Y_TALLY, t('label.tally', 'Moved: {n} / {total}', { n: moved.ring, total }), {
        size: fontSizes.lg,
        fill: colors.text,
        weight: '600',
      });
      label(svg, panelX('mod') + PANEL_W / 2, Y_TALLY, t('label.tally', 'Moved: {n} / {total}', { n: moved.mod, total }), {
        size: fontSizes.lg,
        fill: colors.text,
        weight: '600',
      });

      let caption: string;
      if (scene.step.kind === 'start') {
        caption = t('caption.start', 'Servers: {n} · Keys: {k}', { n: scene.base.servers.length, k: total });
      } else if (scene.step.kind === 'remove') {
        if (scene.removal === null) throw new Error('move-few-on-change stage: 빠진 걸음인데 자취가 없다');
        caption = t('caption.remove', 'Removed: {server}', { server: scene.removal.server });
      } else {
        caption = t('caption.place', 'Placing again: {key}', { key: scene.step.key });
      }
      label(svg, PIECE_CANVAS_W / 2, Y_CAPTION, caption, { size: fontSizes.md, fill: colors.text });
      motionLayer = node(svg, 'g', {});
    }

    /** 걸음 1 — 빠진 서버의 호를 다음 서버가 넘겨받고, 나머지 번호 칸이 남은 서버로 한 칸씩 당겨진다. */
    async function animateRemove(mine: number, scene: MoveFewScene): Promise<void> {
      const base = scene.base;
      const removal = scene.removal;
      if (base === null || removal === null) throw new Error('move-few-on-change stage: 빠짐 운동에 바탕이 없다');
      const arc = succArc;
      const layer = motionLayer;
      if (arc === null || layer === null) throw new Error('move-few-on-change stage: 빠짐 운동의 손잡이가 없다');
      const size = base.ringSize;
      const cx = panelX('ring') + PANEL_W / 2;
      const gone = base.servers.find((s) => s.id === removal.server);
      const succ = base.servers.find((s) => s.id === removal.successor);
      if (gone === undefined || succ === undefined) throw new Error('move-few-on-change stage: 빠진 서버 · 다음 서버가 바탕에 없다');
      const live = base.servers.filter((s) => s.id !== removal.server).sort((a, b) => a.pos - b.pos);
      const si = live.findIndex((s) => s.id === succ.id);
      const before = live[(si - 1 + live.length) % live.length];
      if (before === undefined) throw new Error('move-few-on-change stage: 다음 서버의 앞 서버가 없다');
      const end = succ.pos;
      const startFrom = gone.pos < end ? gone.pos : gone.pos - size;
      const startTo0 = before.pos < end ? before.pos : before.pos - size;
      const startTo = startTo0 <= startFrom ? startTo0 : startTo0 - size;

      // 번호 칸: i 번 칸이 servers[i] 밑에서 survivors[i] 밑으로. 남은 번호가 없는 칸은 접힌다.
      const shifts: Array<{ box: SVGGElement; dx: number }> = [];
      for (const [i, box] of idxBoxes) {
        const fromId = scene.serverIds[i];
        const toId = removal.survivors[i];
        if (fromId === undefined || toId === undefined) throw new Error(`move-few-on-change stage: 번호 ${i} 의 칸이 없다`);
        shifts.push({ box, dx: columnX(scene, 'mod', fromId) - columnX(scene, 'mod', toId) });
      }
      const lastIdx = scene.serverIds.length - 1;
      const lastId = scene.serverIds[lastIdx];
      if (lastId === undefined) throw new Error('move-few-on-change stage: 마지막 번호의 서버가 없다');
      const lx = columnX(scene, 'mod', lastId);
      const folding = drawIndexBox(layer, scene, lastIdx, lx, false);
      const cy = IDX_TOP + IDX_H / 2;

      const draw = (k: number): void => {
        const s = startFrom + (startTo - startFrom) * k;
        arc.setAttribute('d', arcPath(cx, s, end, size));
        for (const { box, dx } of shifts) box.setAttribute('transform', `translate(${r2(dx * (1 - k))} 0)`);
        const sc = r2(1 - k);
        folding.setAttribute('transform', `translate(${r2(lx * (1 - sc))} ${r2(cy * (1 - sc))}) scale(${sc})`);
      };
      draw(0);
      if (!(await tween(mine, REMOVE_MS, draw))) return;
      drawStatic(scene);
    }

    /** 걸음 2.. — 옮겨 가는 키가 앞 서버 칸에서 새 서버 칸으로 건너간다. 두 쪽이 한 시계로. */
    async function animatePlace(mine: number, scene: MoveFewScene, cur: Placed): Promise<void> {
      const legs: Array<{ g: SVGGElement; dx: number; dy: number }> = [];
      for (const side of ['ring', 'mod'] as const) {
        const moved = side === 'ring' ? cur.ringMoved : cur.modMoved;
        if (!moved) continue;
        const g = chips.get(`${side}:${cur.key}`);
        if (g === undefined) throw new Error(`move-few-on-change stage: ${side} 쪽 ${cur.key} 의 조각이 없다`);
        const from = home(scene, side, cur.key);
        const to = arrival(scene, side, cur);
        legs.push({
          g,
          dx: columnX(scene, side, from.server) - columnX(scene, side, to.server),
          dy: rowY(scene, from.row) - rowY(scene, to.row),
        });
      }
      if (legs.length === 0) return;
      const draw = (k: number): void => {
        for (const { g, dx, dy } of legs) {
          // 건너가는 길에 살짝 떠오른다 — 칸 사이를 넘는 것이 보이게
          const lift = -14 * Math.sin(Math.PI * k);
          g.setAttribute('transform', `translate(${r2(dx * (1 - k))} ${r2(dy * (1 - k) + lift)})`);
        }
      };
      draw(0);
      if (!(await tween(mine, MOVE_MS, draw))) return;
      drawStatic(scene);
    }

    return {
      render(next: MoveFewScene, prev: MoveFewScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return Promise.resolve();
        drawStatic(next);
        if (!opts.animate || prev === null) return Promise.resolve();
        if (next.step.kind === 'remove' && prev.removal === null) return animateRemove(mine, next);
        if (next.step.kind === 'place' && next.placed.length === prev.placed.length + 1) {
          const cur = currentPlaced(next);
          if (cur === null) throw new Error('move-few-on-change stage: 놓는 걸음에 키가 없다');
          return animatePlace(mine, next, cur);
        }
        return Promise.resolve();
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
    };
  },
};
