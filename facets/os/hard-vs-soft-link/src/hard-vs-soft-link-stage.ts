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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type {
  HardVsSoftLinkHop,
  HardVsSoftLinkScene,
  HardVsSoftLinkTrail,
} from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 두 종류의 이름 — 하드 링크(보통 파일에 곧장 닿는 이름)와 심볼릭 링크 */
const HARD_INDEX = 0;
const SOFT_INDEX = 1;

const FRAME_MS = 16;
const HOP_MS = 700;
const FOLLOW_MS = 1300;
const MISS_MS = 900;
const UNLINK_MS = 600;

type Pt = { x: number; y: number };
type Box = { x0: number; x1: number; y0: number; y1: number; fieldY: number };
type Geo = {
  W: number;
  dirX0: number;
  dirX1: number;
  inoX: number;
  rowCx: number;
  rowH: number;
  headY: number;
  rows: Map<string, number>;
  boxes: Map<number, Box>;
  laneX: number;
  laneY: number;
  fieldH: number;
};

/** 움직임 한 컷 — 어느 자취를 어디서부터 얼마나 그렸는가, 또는 지우기가 얼마나 지났는가 */
type Anim =
  | { kind: 'trail'; start: string; fromHop: number; p: number }
  | { kind: 'unlink'; p: number };

function rnd(n: number): number {
  const v = Math.round(n * 10) / 10;
  return v === 0 ? 0 : v;
}

function geometry(scene: HardVsSoftLinkScene): Geo {
  const W = PIECE_CANVAS_W;
  const laneX = 14;
  const dirX0 = 34;
  const dirX1 = Math.round(W * 0.42);
  const inoW = Math.round(W * 0.09);
  const headY = 76;
  const rowTop = 86;
  const boxX0 = Math.round(W * 0.64);
  const boxX1 = W - 20;
  const boxH = 80;
  const boxGap = 10;
  // 칸 수가 늘면 간격을 줄여 담는다. 세로는 바뀌지 않는다.
  const room = H - rowTop - 60;
  const pitch = Math.min(48, room / Math.max(1, scene.slots.length));
  const rowH = Math.min(40, pitch - 8);
  const rows = new Map<string, number>();
  scene.slots.forEach((slot, i) => rows.set(slot.name, rowTop + i * pitch + rowH / 2));

  const boxes = new Map<number, Box>();
  let floor = rowTop - boxGap;
  for (const node of scene.inodes) {
    // inode 상자는 처음에 그 번호를 적은 칸들의 가운데 높이에 둔다. 지워도 옮기지 않는다. 앞 상자와 겹치면 아래로 민다.
    const ys: number[] = [];
    for (const slot of scene.slots) {
      if (slot.ino !== node.ino) continue;
      const y = rows.get(slot.name);
      if (y === undefined) throw new Error(`hard-vs-soft-link-stage: 이름 ${slot.name} 의 칸이 없다`);
      ys.push(y);
    }
    const lowest = floor + boxGap + boxH / 2;
    const mean = ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : lowest;
    const cy = Math.max(mean, lowest);
    const y0 = cy - boxH / 2;
    boxes.set(node.ino, { x0: boxX0, x1: boxX1, y0, y1: y0 + boxH, fieldY: y0 + 52 });
    floor = y0 + boxH;
  }
  const laneY = Math.min(H - 14, floor + 22);
  return {
    W,
    dirX0,
    dirX1,
    inoX: dirX1 - inoW,
    rowCx: dirX0 + (dirX1 - inoW - dirX0) / 2,
    rowH,
    headY,
    rows,
    boxes,
    laneX,
    laneY,
    fieldH: 20,
  };
}

function rowY(geo: Geo, name: string): number {
  const y = geo.rows.get(name);
  if (y === undefined) throw new Error(`hard-vs-soft-link-stage: 이름 ${name} 의 칸이 없다`);
  return y;
}

function boxOf(geo: Geo, ino: number): Box {
  const b = geo.boxes.get(ino);
  if (b === undefined) throw new Error(`hard-vs-soft-link-stage: inode ${ino} 의 상자가 없다`);
  return b;
}

function hopPath(geo: Geo, hop: HardVsSoftLinkHop): Pt[] {
  if (hop.kind === 'entry') {
    const y = rowY(geo, hop.name);
    const b = boxOf(geo, hop.ino);
    return [
      { x: geo.rowCx, y },
      { x: geo.dirX1, y },
      { x: b.x0, y: (b.y0 + b.y1) / 2 },
    ];
  }
  // 적힌 이름이 링크 inode 에서 나와 디렉터리 바깥 길을 돌아 다시 그 디렉터리의 칸으로 들어간다.
  const b = boxOf(geo, hop.via);
  const fx = (b.x0 + b.x1) / 2;
  const y = rowY(geo, hop.name);
  return [
    { x: fx, y: b.fieldY + geo.fieldH / 2 },
    { x: fx, y: geo.laneY },
    { x: geo.laneX, y: geo.laneY },
    { x: geo.laneX, y },
    { x: geo.rowCx, y },
  ];
}

function polyLen(pts: readonly Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a === undefined || b === undefined) throw new Error('hard-vs-soft-link-stage: 꺾은선이 비었다');
    n += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return n;
}

/** 꺾은선의 앞 len 만큼 */
function cut(pts: readonly Pt[], len: number): Pt[] {
  const first = pts[0];
  if (first === undefined) throw new Error('hard-vs-soft-link-stage: 꺾은선이 비었다');
  const out: Pt[] = [first];
  let left = len;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a === undefined || b === undefined) throw new Error('hard-vs-soft-link-stage: 꺾은선이 비었다');
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (left >= d) {
      out.push(b);
      left -= d;
      continue;
    }
    const f = d === 0 ? 0 : left / d;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    break;
  }
  return out;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function startKind(scene: HardVsSoftLinkScene, start: string): number {
  const entry = scene.slots.find((e) => e.name === start);
  if (entry === undefined) throw new Error(`hard-vs-soft-link-stage: 찾기를 시작한 이름 ${start} 의 칸이 없다`);
  const node = scene.inodes.find((n) => n.ino === entry.ino);
  if (node === undefined) throw new Error(`hard-vs-soft-link-stage: inode ${entry.ino} 이 없다`);
  return node.kind === 'symlink' ? SOFT_INDEX : HARD_INDEX;
}

export const hardVsSoftLinkStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const kindColors = categorical(2, 'vivid');
    const smPx = parseFloat(fontSizes.sm);
    const monoW = smPx * 0.62;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(rnd(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; family?: string; fill?: string; anchor?: string; weight?: string; opacity?: number },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-size': opts.size ?? fontSizes.sm,
          'font-family': opts.family ?? fonts.body,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      if (opts.opacity !== undefined) node.setAttribute('opacity', String(rnd(opts.opacity)));
      node.textContent = text;
      return node;
    }

    function colorOf(scene: HardVsSoftLinkScene, start: string): string {
      const c = kindColors[startKind(scene, start)];
      if (c === undefined) throw new Error('hard-vs-soft-link-stage: 색이 없다');
      return c;
    }

    function caption(scene: HardVsSoftLinkScene): string {
      const s = scene.step;
      if (s === null) return t('caption.ready', 'Directory {dir}. Name to delete: {name}', { dir: scene.dir, name: scene.pending });
      if (s.kind === 'unlink') {
        return t('caption.unlink', 'Entry {name} removed. Links of inode {ino}: {n}', { name: s.name, ino: s.ino, n: s.links });
      }
      if (s.kind === 'miss') {
        return t('caption.miss', 'Look up again in {dir}: {name} → no entry. The link is broken.', { dir: scene.dir, name: s.name });
      }
      if (s.follow) {
        return t('caption.follow', 'Look up again in {dir}: {name} → inode {ino}', { dir: scene.dir, name: s.name, ino: s.ino });
      }
      if (s.target !== null) {
        return t('caption.reachLink', '{name} → inode {ino}: symbolic link. Written name: {target}', {
          name: s.name,
          ino: s.ino,
          target: s.target,
        });
      }
      return t('caption.reachFile', '{name} → inode {ino}: regular file', { name: s.name, ino: s.ino });
    }

    function tokenAt(layer: Element, at: Pt, text: string, fill: string): void {
      const w = text.length * monoW + 14;
      const h = smPx + 10;
      el('rect', { x: at.x - w / 2, y: at.y - h / 2, width: w, height: h, rx: h / 2, fill }, layer);
      label(layer, at.x, at.y, text, { family: fonts.mono, fill: colors.textInverse, anchor: 'middle', weight: '600' });
    }

    function arrowHead(layer: Element, a: Pt, b: Pt, fill: string): void {
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const s = 8;
      const p1 = { x: b.x - s * Math.cos(ang - 0.45), y: b.y - s * Math.sin(ang - 0.45) };
      const p2 = { x: b.x - s * Math.cos(ang + 0.45), y: b.y - s * Math.sin(ang + 0.45) };
      el('path', { d: `M${rnd(b.x)},${rnd(b.y)} L${rnd(p1.x)},${rnd(p1.y)} L${rnd(p2.x)},${rnd(p2.y)} Z`, fill }, layer);
    }

    function hopLabel(hop: HardVsSoftLinkHop): string {
      return hop.name;
    }

    /** 장면 전체를 세운다. anim 이 있으면 그 컷의 모습으로. */
    function draw(scene: HardVsSoftLinkScene, anim: Anim | null): void {
      svg.textContent = '';
      const geo = geometry(scene);
      const trailLayer = el('g', {}, svg);
      const boxLayer = el('g', {}, svg);
      const rowLayer = el('g', {}, svg);
      const markLayer = el('g', {}, svg);

      label(svg, geo.dirX0, 26, caption(scene), { size: fontSizes.md, fill: colors.text, weight: '600' });

      // 디렉터리
      label(rowLayer, geo.dirX0, 54, scene.dir, { size: fontSizes.md, family: fonts.mono, weight: '700' });
      label(rowLayer, geo.dirX0 + 10, geo.headY, t('label.colName', 'Name'), { size: fontSizes.xs, fill: colors.textMuted });
      label(rowLayer, (geo.inoX + geo.dirX1) / 2, geo.headY, t('label.colInode', 'inode'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'middle',
      });

      // 자취 — 줄을 먼저 긋고, 상자와 칸이 그 위를 덮는다
      let token: { at: Pt; text: string; fill: string } | null = null;
      const ends: { a: Pt; b: Pt; fill: string; broken: boolean }[] = [];
      for (const trail of scene.trails) {
        const fill = colorOf(scene, trail.start);
        const drawn = drawTrail(trailLayer, geo, trail, fill, anim);
        if (drawn.token !== null) token = { at: drawn.token.at, text: drawn.token.text, fill };
        for (const end of drawn.ends) ends.push({ ...end, fill });
      }

      // inode 상자
      for (const node of scene.inodes) {
        const b = boxOf(geo, node.ino);
        el('rect', { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, rx: 6, fill: colors.bgSubtle, stroke: colors.border }, boxLayer);
        label(boxLayer, b.x0 + 10, b.y0 + 16, t('label.inode', 'inode {ino}', { ino: node.ino }), {
          family: fonts.mono,
          weight: '700',
        });
        const count = scene.links?.find((l) => l.ino === node.ino);
        if (count !== undefined) {
          const step = scene.step;
          const shift = anim?.kind === 'unlink' && step?.kind === 'unlink' && step.ino === node.ino && step.was !== null;
          if (shift && step?.kind === 'unlink' && step.was !== null) {
            // 링크 수가 하나 준다 — 앞 수가 위로 빠지고 새 수가 아래에서 올라온다
            const p = anim.p;
            label(boxLayer, b.x1 - 10, b.y0 + 16 - 10 * p, t('label.links', 'Links: {n}', { n: step.was }), {
              anchor: 'end',
              fill: colors.itemActive,
              opacity: 1 - p,
            });
            label(boxLayer, b.x1 - 10, b.y0 + 16 + 10 * (1 - p), t('label.links', 'Links: {n}', { n: count.n }), {
              anchor: 'end',
              fill: colors.itemActive,
              opacity: p,
            });
          } else {
            const changed = scene.step?.kind === 'unlink' && scene.step.ino === node.ino;
            label(boxLayer, b.x1 - 10, b.y0 + 16, t('label.links', 'Links: {n}', { n: count.n }), {
              anchor: 'end',
              fill: changed ? colors.itemActive : colors.textMuted,
            });
          }
        }
        if (node.kind === 'file') {
          label(boxLayer, b.x0 + 10, b.y0 + 38, t('label.kindFile', 'regular file'), { fill: colors.textMuted });
        } else {
          label(boxLayer, b.x0 + 10, b.y0 + 34, t('label.kindLink', 'symbolic link'), { fill: colors.textMuted });
          const waiting = scene.trails.some((tr) => {
            const last = tr.hops[tr.hops.length - 1];
            return last !== undefined && last.kind === 'entry' && last.ino === node.ino;
          });
          el(
            'rect',
            {
              x: b.x0 + 8,
              y: b.fieldY,
              width: b.x1 - b.x0 - 16,
              height: geo.fieldH,
              rx: 4,
              fill: colors.bg,
              stroke: waiting ? kindColors[SOFT_INDEX] ?? colors.border : colors.border,
              'stroke-width': waiting ? 2 : 1,
            },
            boxLayer,
          );
          label(boxLayer, b.x0 + 14, b.fieldY + geo.fieldH / 2, t('label.written', 'Written name: {name}', { name: node.target }), {
            family: fonts.mono,
          });
        }
      }

      // 디렉터리 칸
      const cellW = geo.dirX1 - geo.dirX0;
      scene.slots.forEach((slot) => {
        const name = slot.name;
        const y = rowY(geo, name);
        const entry = scene.entries.find((e) => e.name === name);
        const y0 = y - geo.rowH / 2;
        if (entry === undefined) {
          const broken = scene.trails.some((tr) => {
            const last = tr.hops[tr.hops.length - 1];
            return last !== undefined && last.kind === 'miss' && last.name === name;
          });
          el(
            'rect',
            {
              x: geo.dirX0,
              y: y0,
              width: cellW,
              height: geo.rowH,
              rx: 4,
              fill: 'none',
              stroke: broken ? colors.danger : colors.border,
              'stroke-dasharray': '5 4',
            },
            rowLayer,
          );
          const step = scene.step;
          if (anim?.kind === 'unlink' && step?.kind === 'unlink' && step.name === name) {
            // 지운 이름이 칸 밖으로 빠져나간다
            const p = anim.p;
            label(rowLayer, geo.dirX0 + 10 - 70 * p, y, name, { family: fonts.mono, opacity: 1 - p });
            label(rowLayer, (geo.inoX + geo.dirX1) / 2, y, String(step.ino), {
              family: fonts.mono,
              anchor: 'middle',
              opacity: 1 - p,
            });
          }
          return;
        }
        el('rect', { x: geo.dirX0, y: y0, width: cellW, height: geo.rowH, rx: 4, fill: colors.bgSubtle, stroke: colors.border }, rowLayer);
        el('line', { x1: geo.inoX, y1: y0, x2: geo.inoX, y2: y0 + geo.rowH, stroke: colors.border }, rowLayer);
        label(rowLayer, geo.dirX0 + 10, y, name, { family: fonts.mono });
        label(rowLayer, (geo.inoX + geo.dirX1) / 2, y, String(entry.ino), { family: fonts.mono, anchor: 'middle', weight: '700' });
      });

      // 끝 표시 — 닿았으면 화살촉, 끊겼으면 가위표
      for (const end of ends) {
        if (!end.broken) {
          arrowHead(markLayer, end.a, end.b, end.fill);
          continue;
        }
        const s = 7;
        const c = end.b;
        el('path', { d: `M${rnd(c.x - s)},${rnd(c.y - s)} L${rnd(c.x + s)},${rnd(c.y + s)} M${rnd(c.x - s)},${rnd(c.y + s)} L${rnd(c.x + s)},${rnd(c.y - s)}`, stroke: colors.danger, 'stroke-width': 3, 'stroke-linecap': 'round' }, markLayer);
      }
      if (token !== null) tokenAt(markLayer, token.at, token.text, token.fill);
    }

    /** 자취 하나를 긋는다. 움직이는 중이면 그만큼만 긋고 끝에 이름표를 돌려준다. */
    function drawTrail(
      layer: Element,
      geo: Geo,
      trail: HardVsSoftLinkTrail,
      fill: string,
      anim: Anim | null,
    ): { token: { at: Pt; text: string } | null; ends: { a: Pt; b: Pt; broken: boolean }[] } {
      const paths = trail.hops.map((h) => hopPath(geo, h));
      const moving = anim?.kind === 'trail' && anim.start === trail.start ? anim : null;
      const fixedCount = moving === null ? paths.length : moving.fromHop;
      // 다 그은 마디의 끝 — inode 에 닿은 마디는 화살촉, 빈자리에 닿은 마디는 가위표
      const ends: { a: Pt; b: Pt; broken: boolean }[] = [];
      for (let i = 0; i < fixedCount; i += 1) {
        const pts = paths[i];
        const hop = trail.hops[i];
        if (pts === undefined || hop === undefined) throw new Error('hard-vs-soft-link-stage: 자취 마디가 없다');
        polyline(layer, pts, fill);
        if (hop.kind === 'follow') continue;
        const b = pts[pts.length - 1];
        const a = pts[pts.length - 2];
        if (a === undefined || b === undefined) throw new Error('hard-vs-soft-link-stage: 꺾은선이 짧다');
        ends.push({ a, b, broken: hop.kind === 'miss' });
      }
      if (moving !== null) {
        const rest = paths.slice(moving.fromHop);
        const total = rest.reduce((a, pts) => a + polyLen(pts), 0);
        let left = total * moving.p;
        let token: { at: Pt; text: string } | null = null;
        for (let i = 0; i < rest.length; i += 1) {
          const pts = rest[i];
          const hop = trail.hops[moving.fromHop + i];
          if (pts === undefined || hop === undefined) throw new Error('hard-vs-soft-link-stage: 자취 마디가 없다');
          const len = polyLen(pts);
          const part = cut(pts, Math.min(len, left));
          if (part.length > 1) polyline(layer, part, fill);
          const tip = part[part.length - 1];
          if (left <= len) {
            if (tip === undefined) throw new Error('hard-vs-soft-link-stage: 꺾은선이 비었다');
            token = { at: tip, text: hopLabel(hop) };
            break;
          }
          left -= len;
        }
        return { token, ends };
      }
      return { token: null, ends };
    }

    function polyline(layer: Element, pts: readonly Pt[], stroke: string): void {
      el(
        'polyline',
        {
          points: pts.map((p) => `${rnd(p.x)},${rnd(p.y)}`).join(' '),
          fill: 'none',
          stroke,
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
        },
        layer,
      );
    }

    function run(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const began = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          const p = Math.min(1, (Date.now() - began) / ms);
          frame(ease(p));
          if (p >= 1) {
            done();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: HardVsSoftLinkScene,
      _prev: HardVsSoftLinkScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || step === null) {
        draw(next, null);
        return;
      }
      if (step.kind === 'unlink') {
        await run(UNLINK_MS, mine, (p) => draw(next, { kind: 'unlink', p }));
      } else {
        const trail = next.trails.find((tr) => tr.start === step.start);
        if (trail === undefined) throw new Error(`hard-vs-soft-link-stage: ${step.start} 의 자취가 없다`);
        // 이번 걸음이 더한 마디 — 따라가기와 끊김은 되돌아가는 길부터, 곧장 찾기는 마지막 마디만
        const added = step.kind === 'miss' ? 1 : step.follow ? 2 : 1;
        const fromHop = trail.hops.length - added;
        const ms = step.kind === 'miss' ? MISS_MS : step.follow ? FOLLOW_MS : HOP_MS;
        await run(ms, mine, (p) => draw(next, { kind: 'trail', start: step.start, fromHop, p }));
      }
      if (mine !== gen || destroyed) return;
      draw(next, null);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
