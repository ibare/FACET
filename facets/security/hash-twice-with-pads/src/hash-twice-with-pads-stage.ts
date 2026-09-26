/**
 * hash-twice-with-pads 의 무대.
 *
 * 두 줄 — 위가 안쪽 접기, 아래가 바깥 접기. 줄마다 [열쇠 칸 ‖ 메시지 칸] → H → 값 칸.
 * 왼쪽 기둥에 ipad · K · opad 가 서고, K 가 무늬와 겹친 값이 열쇠 칸으로 들어간다.
 * 주인공은 걸음 4 — 안쪽 줄 끝의 값이 줄 사이를 지나 바깥 줄의 메시지 칸으로 옮겨 간다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { HashTwiceScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 276;
/** 한 걸음의 운동 — 앞 절반은 들어가고 뒤 절반은 나온다 */
const MOVE_MS = 400;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

type Layout = {
  boxW: number;
  boxH: number;
  hW: number;
  padX: number;
  keyX: number;
  msgX: number;
  hX: number;
  outX: number;
  innerY: number;
  outerY: number;
  midY: number;
  captionY: number;
};

/** 캔버스 폭에서 칸 자리를 역산한다. 상수는 상한만. */
function layout(): Layout {
  const W = PIECE_CANVAS_W;
  const margin = Math.round(W * 0.03);
  const boxW = Math.min(84, Math.round(W * 0.13));
  const hW = Math.min(60, Math.round(W * 0.09));
  const concatGap = Math.round(boxW * 0.2);
  const xorGap = Math.round(boxW * 0.5);
  const inner = W - 2 * margin;
  const fixed = boxW * 4 + hW + concatGap + xorGap;
  const flowGap = Math.max(20, Math.round((inner - fixed) / 2));
  const padX = margin + boxW / 2;
  const keyX = padX + boxW + xorGap;
  const msgX = keyX + boxW + concatGap;
  const hX = msgX + boxW / 2 + flowGap + hW / 2;
  const outX = hX + hW / 2 + flowGap + boxW / 2;
  return {
    boxW,
    boxH: 34,
    hW,
    padX,
    keyX,
    msgX,
    hX,
    outX,
    innerY: 78,
    outerY: 196,
    midY: 137,
    captionY: H - 18,
  };
}

function hex4(v: number): string {
  return v.toString(16).padStart(4, '0');
}

function hexBytes(bytes: readonly number[], sep: string): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join(sep);
}

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

/** 꺾은선 위의 자리 — 길이 비율로 */
function along(points: readonly Pt[], p: number): Pt {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(len);
    total += len;
  }
  let d = total * p;
  for (let i = 1; i < points.length; i += 1) {
    const len = lens[i - 1] as number;
    if (d <= len || i === points.length - 1) {
      return lerp(points[i - 1] as Pt, points[i] as Pt, len === 0 ? 1 : Math.min(1, d / len));
    }
    d -= len;
  }
  throw new Error('hash-twice-with-pads-stage: 꺾은선이 비었다');
}

export const hashTwiceWithPadsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [innerColor, outerColor] = categorical(2, 'vivid');
    if (innerColor === undefined || outerColor === undefined) {
      throw new Error('hash-twice-with-pads-stage: categorical(2) 가 두 색을 주지 않았다');
    }
    const L = layout();
    const textPx = parseFloat(fontSizes.sm);
    const valuePx = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles = new Map<string, SVGGElement>();
    let motionLayer: SVGGElement | null = null;

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

    function label(parent: Element, x: number, y: number, text: string, color: string): void {
      const node = el(
        'text',
        {
          x: round(x),
          y: round(y),
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: color,
        },
        parent,
      );
      node.textContent = text;
    }

    type BoxStyle = { stroke: string; fill: string; ink: string; dashed?: boolean; strokeW?: number };

    /** 가운데를 원점으로 둔 값 칸. 값이 null 이면 빈 칸(점선) */
    function valueBox(parent: Element, at: Pt, value: string | null, style: BoxStyle): SVGGElement {
      const g = el('g', { transform: `translate(${round(at.x)},${round(at.y)})` }, parent);
      el(
        'rect',
        {
          x: round(-L.boxW / 2),
          y: round(-L.boxH / 2),
          width: L.boxW,
          height: L.boxH,
          rx: 5,
          fill: value === null ? 'none' : style.fill,
          stroke: style.stroke,
          'stroke-width': style.strokeW ?? 1.5,
          ...(value === null || style.dashed ? { 'stroke-dasharray': '4 3' } : {}),
        },
        g,
      );
      if (value !== null) {
        const txt = el(
          'text',
          {
            x: 0,
            y: round(valuePx * 0.36),
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 600,
            fill: style.ink,
          },
          g,
        );
        txt.textContent = value;
      }
      return g;
    }

    function line(parent: Element, pts: readonly Pt[], stroke: string, dashed: boolean): void {
      el(
        'polyline',
        {
          points: pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' '),
          fill: 'none',
          stroke,
          'stroke-width': 1.2,
          ...(dashed ? { 'stroke-dasharray': '4 3' } : {}),
        },
        parent,
      );
    }

    function arrowHead(parent: Element, tip: Pt, dir: 'right' | 'down', color: string): void {
      const s = 5;
      const pts =
        dir === 'right'
          ? [tip, { x: tip.x - s, y: tip.y - s * 0.7 }, { x: tip.x - s, y: tip.y + s * 0.7 }]
          : [tip, { x: tip.x - s * 0.7, y: tip.y - s }, { x: tip.x + s * 0.7, y: tip.y - s }];
      el('polygon', { points: pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' '), fill: color }, parent);
    }

    /** 안쪽 줄 끝에서 줄 사이를 지나 바깥 메시지 칸으로 — 옮겨 가는 길 */
    function carryPath(): Pt[] {
      return [
        { x: L.outX, y: L.innerY },
        { x: L.outX, y: L.midY },
        { x: L.msgX, y: L.midY },
        { x: L.msgX, y: L.outerY },
      ];
    }

    function drawRow(
      root: Element,
      scene: HashTwiceScene,
      which: 'inner' | 'outer',
    ): void {
      const inner = which === 'inner';
      const y = inner ? L.innerY : L.outerY;
      const color = inner ? innerColor as string : outerColor as string;
      const labelY = inner ? y - L.boxH / 2 - 8 : y + L.boxH / 2 + 16;
      const half = L.boxH / 2;

      // 줄의 흐름: 무늬 → 열쇠 칸, 메시지 칸 → H → 값 칸
      const padRight = L.padX + L.boxW / 2;
      const keyLeft = L.keyX - L.boxW / 2;
      line(root, [{ x: padRight, y }, { x: keyLeft - 1, y }], colors.border, false);
      arrowHead(root, { x: keyLeft - 1, y }, 'right', colors.border);
      const xorText = el(
        'text',
        {
          x: round((padRight + keyLeft) / 2),
          y: round(y - 6),
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        root,
      );
      xorText.textContent = t('label.xorKey', '⊕K');
      const concat = el(
        'text',
        {
          x: round((L.keyX + L.msgX) / 2),
          y: round(y + textPx * 0.36),
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        root,
      );
      concat.textContent = '‖';
      const hLeft = L.hX - L.hW / 2;
      const hRight = L.hX + L.hW / 2;
      line(root, [{ x: L.msgX + L.boxW / 2, y }, { x: hLeft - 1, y }], colors.border, false);
      arrowHead(root, { x: hLeft - 1, y }, 'right', colors.border);
      line(root, [{ x: hRight, y }, { x: L.outX - L.boxW / 2 - 1, y }], colors.border, false);
      arrowHead(root, { x: L.outX - L.boxW / 2 - 1, y }, 'right', colors.border);

      // 무늬
      const pad = inner ? scene.base.ipad : scene.base.opad;
      handles.set(
        inner ? 'ipad' : 'opad',
        valueBox(root, { x: L.padX, y }, hex4(pad), { stroke: colors.border, fill: colors.bgSubtle, ink: colors.text }),
      );
      label(root, L.padX, labelY, inner ? t('label.ipad', 'ipad') : t('label.opad', 'opad'), colors.textMuted);

      // 열쇠 칸
      const keyVal = inner ? scene.innerKey : scene.outerKey;
      handles.set(
        inner ? 'innerKey' : 'outerKey',
        valueBox(root, { x: L.keyX, y }, keyVal === null ? null : hex4(keyVal), {
          stroke: color,
          fill: colors.bg,
          ink: colors.text,
        }),
      );
      label(
        root,
        L.keyX,
        labelY,
        inner ? t('label.innerKey', 'inner key') : t('label.outerKey', 'outer key'),
        colors.textMuted,
      );

      // 메시지 칸 — 안쪽은 메시지, 바깥은 안쪽 값이 옮겨 올 자리
      if (inner) {
        handles.set(
          'innerMsg',
          valueBox(root, { x: L.msgX, y }, hexBytes(scene.base.messageBytes, ''), {
            stroke: colors.textMuted,
            fill: colors.bg,
            ink: colors.text,
          }),
        );
        label(root, L.msgX, labelY, t('label.message', 'message {m}', { m: scene.base.message }), colors.textMuted);
      } else {
        const carried = scene.outerInput !== null;
        handles.set(
          'outerMsg',
          valueBox(
            root,
            { x: L.msgX, y },
            carried && scene.innerValue !== null ? hex4(scene.innerValue) : null,
            { stroke: carried ? innerColor as string : colors.textMuted, fill: colors.bg, ink: colors.text, strokeW: carried ? 2.5 : 1.5 },
          ),
        );
        label(root, L.msgX, labelY, t('label.messageSlot', 'message slot'), colors.textMuted);
      }

      // H
      const done = inner ? scene.innerValue !== null : scene.hmac !== null;
      const hG = el('g', { transform: `translate(${round(L.hX)},${round(y)})` }, root);
      el(
        'rect',
        {
          x: round(-L.hW / 2),
          y: round(-half - 4),
          width: L.hW,
          height: L.boxH + 8,
          rx: 8,
          fill: done ? colors.bgSubtle : colors.bg,
          stroke: color,
          'stroke-width': 2,
        },
        hG,
      );
      const hText = el(
        'text',
        {
          x: 0,
          y: round(valuePx * 0.4),
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          fill: colors.text,
        },
        hG,
      );
      hText.textContent = t('label.hash', 'H');
      handles.set(inner ? 'innerH' : 'outerH', hG);

      // 값 칸
      if (inner) {
        const carried = scene.outerInput !== null;
        const v = scene.innerValue;
        handles.set(
          'innerOut',
          valueBox(root, { x: L.outX, y }, v === null || carried ? null : hex4(v), {
            stroke: color,
            fill: colors.bg,
            ink: colors.text,
            strokeW: 2.5,
          }),
        );
        label(root, L.outX, labelY, t('label.innerValue', 'inner value'), colors.textMuted);
      } else {
        const v = scene.hmac;
        handles.set(
          'outerOut',
          valueBox(root, { x: L.outX, y }, v === null ? null : hex4(v), {
            stroke: v === null ? color : colors.text,
            fill: colors.accent,
            ink: colors.stateInk,
            strokeW: v === null ? 1.5 : 2,
          }),
        );
        label(root, L.outX, labelY, t('label.hmac', 'HMAC'), colors.textMuted);
      }
    }

    function caption(scene: HashTwiceScene): string {
      const s = scene.step;
      switch (s.kind) {
        case 'start':
          return t('caption.start', 'Key K = {k} · message {m}', {
            k: hex4(scene.base.key),
            m: scene.base.message,
          });
        case 'xor-inner': {
          if (scene.innerKey === null) throw new Error('hash-twice-with-pads-stage: 안쪽 열쇠가 없다');
          return t('caption.xorInner', 'Inner key: K ⊕ ipad = {k} ⊕ {p} = {r}', {
            k: hex4(scene.base.key),
            p: hex4(scene.base.ipad),
            r: hex4(scene.innerKey),
          });
        }
        case 'fold-inner': {
          if (scene.innerKey === null || scene.innerValue === null) {
            throw new Error('hash-twice-with-pads-stage: 안쪽 접기의 값이 없다');
          }
          return t('caption.foldInner', 'Inner fold: H({a} ‖ {b}) = {r}', {
            a: hex4(scene.innerKey),
            b: hexBytes(scene.base.messageBytes, ''),
            r: hex4(scene.innerValue),
          });
        }
        case 'xor-outer': {
          if (scene.outerKey === null) throw new Error('hash-twice-with-pads-stage: 바깥 열쇠가 없다');
          return t('caption.xorOuter', 'Outer key: K ⊕ opad = {k} ⊕ {p} = {r}', {
            k: hex4(scene.base.key),
            p: hex4(scene.base.opad),
            r: hex4(scene.outerKey),
          });
        }
        case 'carry': {
          if (scene.innerValue === null || scene.outerInput === null) {
            throw new Error('hash-twice-with-pads-stage: 옮겨 간 값이 없다');
          }
          return t('caption.carry', 'Inner value {v} takes the message slot — outer input: {bytes}', {
            v: hex4(scene.innerValue),
            bytes: hexBytes(scene.outerInput, ' '),
          });
        }
        case 'fold-outer': {
          if (scene.outerKey === null || scene.innerValue === null || scene.hmac === null) {
            throw new Error('hash-twice-with-pads-stage: 바깥 접기의 값이 없다');
          }
          return t('caption.foldOuter', 'Outer fold: H({a} ‖ {b}) = {r} — HMAC', {
            a: hex4(scene.outerKey),
            b: hex4(scene.innerValue),
            r: hex4(scene.hmac),
          });
        }
      }
    }

    function drawStatic(scene: HashTwiceScene): void {
      svg.textContent = '';
      handles = new Map();
      const root = el('g', {}, svg);

      // 옮겨 간 자취 — 안쪽 값 칸에서 바깥 메시지 칸까지
      if (scene.outerInput !== null) {
        const path = carryPath().map((p, i, arr) => {
          if (i === 0) return { x: p.x, y: p.y + L.boxH / 2 };
          if (i === arr.length - 1) return { x: p.x, y: p.y - L.boxH / 2 - 2 };
          return p;
        });
        line(root, path, innerColor as string, true);
        const tip = path[path.length - 1] as Pt;
        arrowHead(root, tip, 'down', innerColor as string);
      }

      drawRow(root, scene, 'inner');
      drawRow(root, scene, 'outer');

      // 열쇠 K — 두 무늬 사이
      handles.set(
        'k',
        valueBox(root, { x: L.padX, y: L.midY }, hex4(scene.base.key), {
          stroke: colors.text,
          fill: colors.bg,
          ink: colors.text,
          strokeW: 2,
        }),
      );
      label(root, L.padX + L.boxW / 2 + 12, L.midY + textPx * 0.36, t('label.key', 'K'), colors.text);

      const cap = el(
        'text',
        {
          x: round(PIECE_CANVAS_W / 2),
          y: L.captionY,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        root,
      );
      cap.textContent = caption(scene);
      motionLayer = el('g', {}, svg);
    }

    function handle(id: string): SVGGElement {
      const h = handles.get(id);
      if (h === undefined) throw new Error(`hash-twice-with-pads-stage: 손잡이 ${id} 가 없다`);
      return h;
    }

    function place(g: SVGGElement, at: Pt, scale: number): void {
      g.setAttribute(
        'transform',
        scale === 1
          ? `translate(${round(at.x)},${round(at.y)})`
          : `translate(${round(at.x)},${round(at.y)}) scale(${round(scale)})`,
      );
    }

    function ghostOf(id: string): SVGGElement {
      if (motionLayer === null) throw new Error('hash-twice-with-pads-stage: 운동 층이 없다');
      const g = handle(id).cloneNode(true);
      if (!(g instanceof SVGGElement)) throw new Error(`hash-twice-with-pads-stage: ${id} 복제가 g 가 아니다`);
      motionLayer.appendChild(g);
      return g;
    }

    /** 한 시계 — 진행률 p 를 0 에서 1 까지 흘린다. 세대가 바뀌면 멈춘다 */
    function run(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / MOVE_MS);
          frame(p);
          if (p >= 1) {
            wake();
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

    /** K 가 무늬로 올라가 겹치고, 겹친 값이 열쇠 칸으로 나간다 */
    async function animateXor(mine: number, which: 'inner' | 'outer'): Promise<void> {
      const y = which === 'inner' ? L.innerY : L.outerY;
      const target = handle(which === 'inner' ? 'innerKey' : 'outerKey');
      const ghost = ghostOf('k');
      const kHome: Pt = { x: L.padX, y: L.midY };
      const padAt: Pt = { x: L.padX, y };
      const slot: Pt = { x: L.keyX, y };
      target.setAttribute('visibility', 'hidden');
      await run(mine, (p) => {
        if (p < 0.5) {
          place(ghost, lerp(kHome, padAt, ease(p * 2)), 1);
        } else {
          ghost.setAttribute('visibility', 'hidden');
          target.removeAttribute('visibility');
          place(target, lerp(padAt, slot, ease((p - 0.5) * 2)), 1);
        }
      });
    }

    /** 열쇠 칸과 메시지 칸이 H 로 빨려 들고, 값이 H 에서 나온다 */
    async function animateFold(mine: number, which: 'inner' | 'outer'): Promise<void> {
      const inner = which === 'inner';
      const y = inner ? L.innerY : L.outerY;
      const keyGhost = ghostOf(inner ? 'innerKey' : 'outerKey');
      const msgGhost = ghostOf(inner ? 'innerMsg' : 'outerMsg');
      const out = handle(inner ? 'innerOut' : 'outerOut');
      const hPt: Pt = { x: L.hX, y };
      const keyAt: Pt = { x: L.keyX, y };
      const msgAt: Pt = { x: L.msgX, y };
      const outAt: Pt = { x: L.outX, y };
      out.setAttribute('visibility', 'hidden');
      await run(mine, (p) => {
        if (p < 0.5) {
          const q = ease(p * 2);
          place(keyGhost, lerp(keyAt, hPt, q), 1 - 0.8 * q);
          place(msgGhost, lerp(msgAt, hPt, q), 1 - 0.8 * q);
        } else {
          keyGhost.setAttribute('visibility', 'hidden');
          msgGhost.setAttribute('visibility', 'hidden');
          out.removeAttribute('visibility');
          const q = ease((p - 0.5) * 2);
          place(out, lerp(hPt, outAt, q), 0.3 + 0.7 * q);
        }
      });
    }

    /** 안쪽 값이 줄 사이를 지나 바깥 메시지 칸으로 옮겨 간다 */
    async function animateCarry(mine: number): Promise<void> {
      const moving = handle('outerMsg');
      const path = carryPath();
      await run(mine, (p) => {
        place(moving, along(path, ease(p)), 1);
      });
    }

    async function render(
      next: HashTwiceScene,
      prev: HashTwiceScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate || prev === null) return;
      switch (next.step.kind) {
        case 'start':
          return;
        case 'xor-inner':
          await animateXor(mine, 'inner');
          break;
        case 'fold-inner':
          await animateFold(mine, 'inner');
          break;
        case 'xor-outer':
          await animateXor(mine, 'outer');
          break;
        case 'carry':
          await animateCarry(mine);
          break;
        case 'fold-outer':
          await animateFold(mine, 'outer');
          break;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
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
