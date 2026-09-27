/**
 * world-to-camera 의 무대 — 위에서 내려다본 세상(x 는 오른쪽, z 는 아래쪽)과 좌표 표.
 *
 * 캔버스의 틀이 곧 카메라 좌표계다. 원점 표지와 −z 화살표는 움직이지 않고, 점 넷과
 * 눈이 한 덩어리로 옮겨 가고(translate) 원점 둘레로 돈다(rotate). 도는 동안의 자리는
 * 알고리즘의 rotateY 로 각을 나누어 셈한다 — 호를 따라 돌아 거리가 끝까지 그대로다.
 * 그 뒤 z = 0 선이 앞과 뒤를 가르고, 점마다 그 선까지 내린 줄로 z 의 부호를 읽는다.
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
} from '@ffacet/core/runtime';
import { rotateY, type Vec3, type WorldObjectId } from './algorithm.js';
import type { WorldToCameraScene } from './scene.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MOVE_MS = 900;
const DROP_MS = 500;
/** 한 칸(세계 좌표 1)의 픽셀 상한 */
const UNIT_MAX = 40;
/** 범위 둘레에 두는 여백 (세계 좌표) */
const PAD_UNITS = 1;
const TABLE_W = 284;

type Attrs = Record<string, string | number>;

function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  // 화면의 음수는 빼기 기호(U+2212)로 쓴다
  return s.startsWith('-') ? `\u2212${s.slice(1)}` : s;
}

function vecStr(v: Vec3, digits: number): string {
  return `(${fmt(v[0], digits)}, ${fmt(v[1], digits)}, ${fmt(v[2], digits)})`;
}

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** 그 프레임에 무엇이 어디 있는가 — 정적 그리기는 장면 그대로, 운동은 사이 값으로 */
type Frame = {
  pos: Record<string, Vec3>;
  eye: Vec3;
  forward: Vec3;
  shade: number;
  drop: Record<string, number>;
};

export const worldToCameraStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Attrs, parent: Element, content?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (content !== undefined) node.textContent = content;
      parent.appendChild(node);
      return node;
    }

    function nameOf(id: WorldObjectId): string {
      switch (id) {
        case 'tree':
          return t('label.tree', 'Tree');
        case 'house':
          return t('label.house', 'House');
        case 'rock':
          return t('label.rock', 'Rock');
        case 'lamp':
          return t('label.lamp', 'Lamp');
        default:
          throw new Error(`world-to-camera-stage: 이름을 모르는 식별자 ${String(id)}`);
      }
    }

    const tableX = W - 16 - TABLE_W;
    const plot = { left: 16, right: tableX - 20, top: 52, bottom: H - 16 };

    function layout(scene: WorldToCameraScene): { unit: number; ox: number; oy: number } {
      const b = scene.bounds;
      if (!b) throw new Error('world-to-camera-stage: 범위 없이 자리를 셈하려 했다');
      const xSpan = b.xMax - b.xMin + 2 * PAD_UNITS;
      const zSpan = b.zMax - b.zMin + 2 * PAD_UNITS;
      const pw = plot.right - plot.left;
      const ph = plot.bottom - plot.top;
      const unit = Math.min(pw / xSpan, ph / zSpan, UNIT_MAX);
      const ox = plot.left + (pw - xSpan * unit) / 2 + (PAD_UNITS - b.xMin) * unit;
      const oy = plot.top + (ph - zSpan * unit) / 2 + (PAD_UNITS - b.zMin) * unit;
      return { unit, ox, oy };
    }

    function arrowHead(parent: Element, x1: number, y1: number, x2: number, y2: number, color: string): void {
      const a = Math.atan2(y2 - y1, x2 - x1);
      const size = 7;
      const p1 = [x2 - size * Math.cos(a - 0.45), y2 - size * Math.sin(a - 0.45)];
      const p2 = [x2 - size * Math.cos(a + 0.45), y2 - size * Math.sin(a + 0.45)];
      el('polygon', { points: `${x2},${y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`, fill: color }, parent);
    }

    function drawPlot(scene: WorldToCameraScene, f: Frame, parent: Element): void {
      const { unit, ox, oy } = layout(scene);
      const sx = (v: Vec3): number => ox + v[0] * unit;
      const sy = (v: Vec3): number => oy + v[2] * unit;
      const g = el('g', {}, parent);
      const smPx = parseFloat(fontSizes.sm);

      // 앞(z < 0) 과 뒤를 가르는 선 — 세상이 다 돈 뒤에만 있다
      if (f.shade > 0) {
        el(
          'rect',
          { x: plot.left, y: plot.top, width: plot.right - plot.left, height: oy - plot.top, fill: colors.bgSubtle, opacity: f.shade },
          g,
        );
        el('line', { x1: plot.left, y1: oy, x2: plot.right, y2: oy, stroke: colors.border, 'stroke-width': 1.5, opacity: f.shade }, g);
        const lab = { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted, opacity: f.shade };
        el('text', { ...lab, x: plot.left + 4, y: plot.top + 14 }, g, t('label.front', 'Front'));
        el('text', { ...lab, x: plot.left + 4, y: oy + 16 }, g, t('label.behind', 'Behind'));
      }

      // 움직이지 않는 틀 — 원점과 −z
      const zTip = oy - 2.4 * unit;
      el('line', { x1: ox, y1: oy, x2: ox, y2: zTip, stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, g);
      arrowHead(g, ox, oy, ox, zTip, colors.textMuted);
      el(
        'text',
        { x: ox, y: zTip - 6, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted },
        g,
        t('label.minusZ', '−z'),
      );
      el('line', { x1: ox - 6, y1: oy, x2: ox + 6, y2: oy, stroke: colors.textMuted, 'stroke-width': 1 }, g);
      el('line', { x1: ox, y1: oy - 6, x2: ox, y2: oy + 6, stroke: colors.textMuted, 'stroke-width': 1 }, g);
      el(
        'text',
        { x: ox - 8, y: oy + 16, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted },
        g,
        t('label.origin', 'Origin'),
      );

      const ex = sx(f.eye);
      const ey = sy(f.eye);

      // 눈이 보는 쪽 — 부채꼴 하나
      const fa = Math.atan2(f.forward[2], f.forward[0]);
      const reach = 2 * unit;
      const half = 0.45;
      el(
        'polygon',
        {
          points: `${ex},${ey} ${ex + reach * Math.cos(fa - half)},${ey + reach * Math.sin(fa - half)} ${ex + reach * Math.cos(fa + half)},${ey + reach * Math.sin(fa + half)}`,
          fill: colors.primary,
          opacity: 0.1,
        },
        g,
      );

      // 눈과 점을 잇는 줄 — 움직이는 내내 길이가 그대로다
      for (const id of scene.ids) {
        const p = f.pos[id]!;
        el('line', { x1: ex, y1: ey, x2: sx(p), y2: sy(p), stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '2 3' }, g);
      }

      // z = 0 선까지 내린 줄
      for (const j of scene.judged) {
        const k = f.drop[j.id] ?? 1;
        const p = f.pos[j.id]!;
        const x = sx(p);
        const y0 = sy(p);
        el('line', { x1: x, y1: y0, x2: x, y2: y0 + (oy - y0) * k, stroke: colors.text, 'stroke-width': 1.5 }, g);
      }

      for (const id of scene.ids) {
        const p = f.pos[id]!;
        const x = sx(p);
        const y = sy(p);
        const verdict = scene.judged.find((j) => j.id === id);
        if (verdict === undefined) {
          el('circle', { cx: x, cy: y, r: 5, fill: colors.text }, g);
        } else if (verdict.side === 'front') {
          el('circle', { cx: x, cy: y, r: 7, fill: colors.accent, stroke: colors.text, 'stroke-width': 1.5 }, g);
        } else {
          el('circle', { cx: x, cy: y, r: 7, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5, 'stroke-dasharray': '3 2' }, g);
        }
        el(
          'text',
          { x: x + 10, y: y + smPx / 3, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
          g,
          nameOf(id),
        );
      }

      // 눈 — 원과 앞 방향 화살표
      const tipX = ex + f.forward[0] * 1.4 * unit;
      const tipY = ey + f.forward[2] * 1.4 * unit;
      el('line', { x1: ex, y1: ey, x2: tipX, y2: tipY, stroke: colors.primary, 'stroke-width': 2 }, g);
      arrowHead(g, ex, ey, tipX, tipY, colors.primary);
      el('circle', { cx: ex, cy: ey, r: 6, fill: colors.bg, stroke: colors.primary, 'stroke-width': 2 }, g);
      el('circle', { cx: ex, cy: ey, r: 2.5, fill: colors.primary }, g);
      el(
        'text',
        { x: ex + 9, y: ey + 16, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: colors.primary },
        g,
        t('label.eye', 'Eye'),
      );
    }

    function drawCaption(scene: WorldToCameraScene, parent: Element): void {
      const s = scene.step;
      let text: string;
      switch (s.kind) {
        case 'start': {
          if (!scene.forward) return;
          text = t('caption.start', 'Eye at {eye}, yaw {yaw}° · eye forward {forward}', {
            eye: vecStr(scene.eye, 2),
            yaw: fmt(scene.yaw, 1),
            forward: vecStr(scene.forward, 3),
          });
          break;
        }
        case 'translate':
          text = t('caption.translate', 'The whole world shifts by {offset} · eye now at {eye}', {
            offset: vecStr(s.offset, 2),
            eye: vecStr(scene.eye, 2),
          });
          break;
        case 'rotate': {
          if (!scene.forward) throw new Error('world-to-camera-stage: 돌린 뒤 눈의 앞이 없다');
          text = t('caption.rotate', 'The whole world turns {angle}° about the y axis · eye forward now {forward}', {
            angle: fmt(s.angle, 1),
            forward: vecStr(scene.forward, 3),
          });
          break;
        }
        case 'judge': {
          const j = scene.judged.find((x) => x.id === s.id);
          if (!j) throw new Error(`world-to-camera-stage: 판정이 없는 점 ${s.id}`);
          text =
            j.side === 'front'
              ? t('caption.judgeFront', '{name}: camera z {z} < 0', { name: nameOf(j.id), z: fmt(j.z, 2) })
              : t('caption.judgeBehind', '{name}: camera z {z} > 0', { name: nameOf(j.id), z: fmt(j.z, 2) });
          break;
        }
      }
      el(
        'text',
        { x: 16, y: 28, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: colors.text },
        parent,
        text,
      );
    }

    function drawTable(scene: WorldToCameraScene, parent: Element): void {
      const g = el('g', {}, parent);
      const colX = { x: tableX + 98, y: tableX + 140, z: tableX + 188, d: tableX + 234, v: tableX + 244 };
      const head = { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted, 'text-anchor': 'end' };
      const headY = 84;
      el('text', { ...head, x: colX.x, y: headY }, g, t('label.colX', 'x'));
      el('text', { ...head, x: colX.y, y: headY }, g, t('label.colY', 'y'));
      el('text', { ...head, x: colX.z, y: headY }, g, t('label.colZ', 'z'));
      el('text', { ...head, x: colX.d, y: headY }, g, t('label.dist', 'Dist.'));
      el('line', { x1: tableX, y1: headY + 8, x2: tableX + TABLE_W, y2: headY + 8, stroke: colors.border, 'stroke-width': 1 }, g);

      const rowH = 30;
      const num = { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text, 'text-anchor': 'end' };
      const nameAttrs = { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text };
      const coords = (v: Vec3, y: number): void => {
        el('text', { ...num, x: colX.x, y }, g, fmt(v[0], 2));
        el('text', { ...num, x: colX.y, y }, g, fmt(v[1], 2));
        el('text', { ...num, x: colX.z, y }, g, fmt(v[2], 2));
      };

      let y = headY + 8 + rowH - 10;
      el('text', { ...nameAttrs, x: tableX, y, 'font-weight': 600, fill: colors.primary }, g, t('label.eye', 'Eye'));
      coords(scene.eye, y);

      const step = scene.step;
      for (const id of scene.ids) {
        y += rowH;
        const p = scene.pos[id]!;
        if (step.kind === 'judge' && step.id === id) {
          el('rect', { x: tableX - 6, y: y - rowH + 10, width: TABLE_W + 6, height: rowH, fill: colors.bgSubtle }, g);
        }
        const verdict = scene.judged.find((j) => j.id === id);
        if (verdict !== undefined) {
          const box = { x: colX.z - 42, y: y - 15, width: 46, height: 20, rx: 3 };
          if (verdict.side === 'front') {
            el('rect', { ...box, fill: colors.accent }, g);
          } else {
            el('rect', { ...box, fill: 'none', stroke: colors.text, 'stroke-dasharray': '3 2' }, g);
          }
        }
        el('text', { ...nameAttrs, x: tableX, y }, g, nameOf(id));
        el('text', { ...num, x: colX.x, y }, g, fmt(p[0], 2));
        el('text', { ...num, x: colX.y, y }, g, fmt(p[1], 2));
        el(
          'text',
          { ...num, x: colX.z, y, fill: verdict?.side === 'front' ? colors.stateInk : colors.text },
          g,
          fmt(p[2], 2),
        );
        const d = scene.distances?.[id];
        if (d !== undefined) el('text', { ...num, x: colX.d, y, fill: colors.textMuted }, g, fmt(d, 2));
        if (verdict !== undefined) {
          el(
            'text',
            { ...nameAttrs, x: colX.v, y, 'font-size': fontSizes.xs, 'font-weight': 600 },
            g,
            verdict.side === 'front' ? t('label.front', 'Front') : t('label.behind', 'Behind'),
          );
        }
      }

      if (scene.judged.length > 0) {
        const front = scene.judged.filter((j) => j.side === 'front').length;
        el(
          'text',
          { ...nameAttrs, x: tableX, y: y + 40, 'font-size': fontSizes.md, 'font-weight': 600 },
          g,
          t('label.tally', 'Front {front} · Behind {behind}', { front, behind: scene.judged.length - front }),
        );
      }
    }

    function restFrame(scene: WorldToCameraScene): Frame {
      if (!scene.forward) throw new Error('world-to-camera-stage: 눈의 앞 없이 그리려 했다');
      return { pos: scene.pos, eye: scene.eye, forward: scene.forward, shade: scene.pose === 'camera' ? 1 : 0, drop: {} };
    }

    let plotLayer: SVGElement | null = null;

    function drawStatic(scene: WorldToCameraScene): void {
      svg.textContent = '';
      plotLayer = null;
      drawCaption(scene, svg);
      if (!scene.bounds) return;
      drawTable(scene, svg);
      plotLayer = el('g', {}, svg);
      drawPlot(scene, restFrame(scene), plotLayer);
    }

    function redrawPlot(scene: WorldToCameraScene, f: Frame): void {
      if (!plotLayer) throw new Error('world-to-camera-stage: 그림 층이 없다');
      plotLayer.textContent = '';
      drawPlot(scene, f, plotLayer);
    }

    /** ms 동안 프레임마다 onFrame(0..1). 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(mine: number, ms: number, onFrame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const k = Math.min(1, (Date.now() - start) / ms);
          onFrame(ease(k));
          if (k >= 1) return done();
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
      next: WorldToCameraScene,
      prev: WorldToCameraScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      if (!opts.animate || prev === null || destroyed || !next.bounds) return;
      const step = next.step;
      const rest = restFrame(next);
      switch (step.kind) {
        case 'start':
          return;
        case 'translate': {
          const off = step.offset;
          const eyeFrom = step.eyeFrom;
          await tween(mine, MOVE_MS, (k) => {
            const pos: Record<string, Vec3> = {};
            for (const id of next.ids) {
              const from = step.from[id];
              if (!from) throw new Error(`world-to-camera-stage: ${id} 의 출발 자리가 없다`);
              pos[id] = [from[0] + off[0] * k, from[1] + off[1] * k, from[2] + off[2] * k];
            }
            const eye: Vec3 = [eyeFrom[0] + off[0] * k, eyeFrom[1] + off[1] * k, eyeFrom[2] + off[2] * k];
            redrawPlot(next, { ...rest, pos, eye, shade: 0 });
          });
          break;
        }
        case 'rotate': {
          await tween(mine, MOVE_MS, (k) => {
            const pos: Record<string, Vec3> = {};
            for (const id of next.ids) {
              const from = step.from[id];
              if (!from) throw new Error(`world-to-camera-stage: ${id} 의 출발 자리가 없다`);
              pos[id] = rotateY(from, step.angle * k);
            }
            redrawPlot(next, { ...rest, pos, forward: rotateY(step.forwardFrom, step.angle * k), shade: k });
          });
          break;
        }
        case 'judge': {
          await tween(mine, DROP_MS, (k) => {
            redrawPlot(next, { ...rest, drop: { [step.id]: k } });
          });
          break;
        }
      }
      if (mine === gen && !destroyed) drawStatic(next);
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
