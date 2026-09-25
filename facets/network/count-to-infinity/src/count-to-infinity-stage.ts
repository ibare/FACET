/**
 * count-to-infinity stage — 두 라우터의 수가 서로의 칸 위에 한 칸씩 얹히며 오르는 계단.
 *
 * 아래 줄은 망과 라우터와 선(바닥), 그 위 세로 축은 수(1 부터 infinity 까지).
 * 칸 하나는 라우터가 적은 수이고, 받친 칸과 선으로 이어진다. 알림은 보낸 이의 칸을 베낀 조각이
 * 받는 이의 기둥으로 건너가 한 칸 올라서며 새 칸이 된다 — 옛 칸은 자취로 남는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { currentBlock, type CountBlock, type CountToInfinityScene } from './scene.js';

const H = 480;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SLIDE_MS = 260;
const RISE_MS = 220;
const PRESS_MS = 160;
const CUT_MS = 420;

type Layout = {
  colX: (i: number) => number;
  levelY: (d: number) => number;
  rowY: number;
  bw: number;
  bh: number;
  netW: number;
  unit: number;
};

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function layoutOf(scene: CountToInfinityScene): Layout {
  const W = PIECE_CANVAS_W;
  const cols = scene.routers.length + 1;
  const pad = Math.min(72, W * 0.12);
  const span = cols > 1 ? (W - 2 * pad) / (cols - 1) : 0;
  const rowY = H - 46;
  const ground = rowY - 34;
  const top = 72; // infinity + 1 칸의 자리 — 눌리기 전 한 칸 넘친 수가 선다
  const unit = (ground - top) / Math.max(1, scene.infinity);
  const charW = parseFloat(fontSizes.sm) * 0.62;
  return {
    colX: (i) => round2(pad + i * span),
    levelY: (d) => round2(ground - (d - 1) * unit),
    rowY,
    bw: Math.min(38, span * 0.3),
    bh: Math.min(17, unit - 3),
    netW: round2(scene.net.length * charW + 18),
    unit,
  };
}

export const countToInfinityStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: number },
      parent: Element = svg,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: round2(x),
          y: round2(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'middle',
          ...(opts.weight ? { 'font-weight': opts.weight } : {}),
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function colOf(scene: CountToInfinityScene, router: string): number {
      const i = scene.routers.indexOf(router);
      if (i < 0) throw new Error(`count-to-infinity stage: 없는 라우터 ${router}`);
      return i + 1;
    }

    function arrow(x1: number, y: number, x2: number, stroke: string, parent: Element = svg): void {
      const dir = x2 > x1 ? 1 : -1;
      el('line', { x1, y1: y, x2, y2: y, stroke, 'stroke-width': 1.6 }, parent);
      el(
        'path',
        { d: `M ${x2} ${y} L ${round2(x2 - dir * 6)} ${y - 4} L ${round2(x2 - dir * 6)} ${y + 4} Z`, fill: stroke },
        parent,
      );
    }

    function caption(scene: CountToInfinityScene): void {
      const W = PIECE_CANVAS_W;
      let first = '';
      const step = scene.step;
      if (step.kind === 'idle') {
        if (scene.trail.length > 0) {
          first = t('caption.start', 'Converged. Every router has a route to {net}.', { net: scene.net });
        }
      } else if (step.kind === 'cut') {
        first = t('caption.cut', 'Link {a}–{b} is cut. The route of {lost} is gone, and no one is told.', {
          a: step.a,
          b: step.b,
          lost: step.lost.join(' · '),
        });
      } else if (scene.ended) {
        first = t('caption.end', 'Round {round}. Count {inf}: {routers}. Only now is the network unreachable.', {
          round: step.round,
          inf: scene.infinity,
          routers: scene.reached.join(' · '),
        });
      } else {
        first = t('caption.round', "Round {round}: each writes down the other's count plus one.", {
          round: step.round,
        });
      }
      if (first) label(first, W / 2, 22, { size: fontSizes.md, weight: 600 });
      if (scene.round > 0) {
        label(t('caption.notices', 'Notices sent: {count}', { count: scene.notices }), W / 2, 44, {
          fill: colors.textMuted,
        });
      }
    }

    type Drawn = { cutHalves: [SVGLineElement, SVGLineElement] | null; cutSpan: [number, number] };

    /**
     * 장면을 세운다. `upto` 는 보일 자취의 끝(그 번호 앞까지), `labelsUpto` 는 이번 걸음 알림 중
     * 이미 내려앉은 수. 운동은 이 둘을 줄여 그린 뒤 그 위에 조각을 띄운다.
     */
    function drawStatic(scene: CountToInfinityScene, upto = scene.trail.length, labelsUpto = Infinity): Drawn {
      svg.textContent = '';
      const W = PIECE_CANVAS_W;
      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });
      const drawn: Drawn = { cutHalves: null, cutSpan: [0, 0] };
      if (scene.routers.length === 0) return drawn;
      const L = layoutOf(scene);
      caption(scene);

      // 천장 — 닿을 수 없음. infinity 칸은 선 위에 선다
      const ceilY = round2(L.levelY(scene.infinity) + L.unit / 2);
      el('line', {
        x1: 8,
        y1: ceilY,
        x2: W - 8,
        y2: ceilY,
        stroke: colors.danger,
        'stroke-width': 1.2,
        'stroke-dasharray': '5 4',
      });
      label(t('label.unreachable', 'Unreachable: {n}', { n: scene.infinity }), 10, ceilY - 9, {
        size: fontSizes.xs,
        fill: colors.danger,
        anchor: 'start',
      });

      // 바닥 — 망 · 라우터 · 선
      const netX = L.colX(0);
      el('line', {
        x1: round2(netX + L.netW / 2),
        y1: L.rowY,
        x2: round2(L.colX(1) - 15),
        y2: L.rowY,
        stroke: colors.border,
        'stroke-width': 2,
      });
      for (const [a, b] of scene.links) {
        const xa = L.colX(colOf(scene, a));
        const xb = L.colX(colOf(scene, b));
        const lo = Math.min(xa, xb) + 15;
        const hi = Math.max(xa, xb) - 15;
        const isCut =
          scene.cut !== null &&
          ((scene.cut[0] === a && scene.cut[1] === b) || (scene.cut[0] === b && scene.cut[1] === a));
        if (!isCut) {
          el('line', { x1: lo, y1: L.rowY, x2: hi, y2: L.rowY, stroke: colors.border, 'stroke-width': 2 });
          continue;
        }
        const mid = round2((lo + hi) / 2);
        const gap = 14;
        const left = el('line', {
          x1: lo,
          y1: L.rowY,
          x2: round2(mid - gap),
          y2: L.rowY,
          stroke: colors.danger,
          'stroke-width': 2,
        });
        const right = el('line', {
          x1: round2(mid + gap),
          y1: L.rowY,
          x2: hi,
          y2: L.rowY,
          stroke: colors.danger,
          'stroke-width': 2,
        });
        drawn.cutHalves = [left, right];
        drawn.cutSpan = [mid, gap];
      }
      el('rect', {
        x: round2(netX - L.netW / 2),
        y: L.rowY - 13,
        width: L.netW,
        height: 26,
        rx: 4,
        fill: colors.bgSubtle,
        stroke: colors.border,
      });
      label(scene.net, netX, L.rowY, { mono: true, fill: colors.text });
      for (const [i, r] of scene.routers.entries()) {
        const x = L.colX(i + 1);
        el('circle', { cx: x, cy: L.rowY, r: 15, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.6 });
        label(r, x, L.rowY, { weight: 600 });
      }

      // 다음 홉 — 라우터 아래 화살표
      const hopY = L.rowY + 26;
      for (const [i, r] of scene.routers.entries()) {
        const bi = currentBlock(scene.trail, r, upto);
        if (bi < 0) continue;
        const blk = scene.trail[bi] as CountBlock;
        const x = L.colX(i + 1);
        const toX = blk.on < 0 ? netX : L.colX(colOf(scene, (scene.trail[blk.on] as CountBlock).router));
        const dir = toX > x ? 1 : -1;
        arrow(round2(x + dir * 6), hopY, round2(x + dir * 34), colors.textMuted);
      }
      if (scene.trail.length > 0) {
        label(t('label.nextHop', 'next hop'), netX, hopY, { size: fontSizes.xs, fill: colors.textMuted });
      }

      // 계단 — 받침 선 먼저, 칸은 그 위에
      const visible = scene.trail.slice(0, upto);
      const isCurrent = (i: number): boolean => {
        const b = visible[i] as CountBlock;
        return currentBlock(visible, b.router) === i;
      };
      const newSet = new Set<number>();
      if (scene.step.kind === 'round') {
        for (const m of scene.step.moves) if (m.block < upto) newSet.add(m.block);
      }
      const posOf = (b: CountBlock): [number, number] => [L.colX(colOf(scene, b.router)), L.levelY(b.d)];
      for (const [i, b] of visible.entries()) {
        if (b.on < 0) continue;
        const s = visible[b.on] as CountBlock;
        const [x1, y1] = posOf(s);
        const [x2, y2] = posOf(b);
        const broken = b.broken || s.broken;
        el('line', {
          x1,
          y1,
          x2,
          y2,
          stroke: broken ? colors.danger : isCurrent(i) ? colors.text : colors.border,
          'stroke-width': isCurrent(i) ? 1.8 : 1.1,
          ...(broken ? { 'stroke-dasharray': '4 3' } : {}),
        });
      }
      for (const [i, b] of visible.entries()) {
        const [x, y] = posOf(b);
        const cur = isCurrent(i);
        let fill = 'none';
        let stroke = colors.border;
        let ink = colors.textMuted;
        if (b.broken) {
          stroke = colors.danger;
          ink = colors.danger;
        } else if (cur && scene.ended && b.d === scene.infinity) {
          fill = colors.danger;
          stroke = colors.danger;
          ink = colors.textInverse;
        } else if (cur && newSet.has(i)) {
          fill = colors.itemActive;
          stroke = colors.itemActive;
          ink = colors.textInverse;
        } else if (cur) {
          fill = colors.bg;
          stroke = colors.text;
          ink = colors.text;
        }
        el('rect', {
          x: round2(x - L.bw / 2),
          y: round2(y - L.bh / 2),
          width: L.bw,
          height: L.bh,
          rx: 3,
          fill: fill === 'none' ? colors.bg : fill,
          stroke,
          'stroke-width': cur ? 1.6 : 1,
          ...(b.broken ? { 'stroke-dasharray': '3 2' } : {}),
        });
        label(String(b.d), x, y, { mono: true, fill: ink, weight: cur ? 600 : 400 });
      }

      // 이번 걸음에 얹힌 칸 옆 — 무엇 위에 무엇을 더했나
      if (scene.step.kind === 'round') {
        for (const [k, m] of scene.step.moves.entries()) {
          if (k >= labelsUpto || m.block >= upto) continue;
          const b = scene.trail[m.block] as CountBlock;
          const [x, y] = posOf(b);
          const side = L.colX(colOf(scene, m.to)) >= L.colX(colOf(scene, m.from)) ? 1 : -1;
          if (m.sum !== m.set) {
            // 눌린 수는 넘친 칸 자리(천장 위)에 적는다
            label(t('label.capped', '{told} + 1 = {sum}', { told: m.told, sum: m.sum }), x, L.levelY(m.sum), {
              size: fontSizes.xs,
              fill: colors.danger,
              mono: true,
            });
            continue;
          }
          label(t('label.plusOne', '{told} + 1', { told: m.told }), x + side * (L.bw / 2 + 7), y, {
            size: fontSizes.xs,
            fill: colors.textMuted,
            anchor: side > 0 ? 'start' : 'end',
            mono: true,
          });
        }
      }
      return drawn;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) return resolve();
        const done = (): void => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    /** 정해진 시간 동안 p 를 0 → 1 로 흘린다. 세대가 바뀌면 물러난다. */
    async function tween(ms: number, mine: number, fn: (p: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.round(ms / 16));
      for (let f = 1; f <= frames; f += 1) {
        await wait(ms / frames);
        if (mine !== gen || destroyed) return false;
        const p = f / frames;
        fn(p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
      }
      return true;
    }

    async function playCut(next: CountToInfinityScene, mine: number): Promise<void> {
      const drawn = drawStatic(next);
      if (!drawn.cutHalves) return;
      const [left, right] = drawn.cutHalves;
      const [mid, gap] = drawn.cutSpan;
      // 끝 자리에 서 있는 두 토막을 아직 못 벌어진 만큼 되돌려 두고 벌린다
      const place = (p: number): void => {
        left.setAttribute('x2', String(round2(mid - gap * p)));
        right.setAttribute('x1', String(round2(mid + gap * p)));
      };
      place(0);
      await tween(CUT_MS, mine, place);
    }

    async function playRound(next: CountToInfinityScene, mine: number): Promise<void> {
      if (next.step.kind !== 'round') return;
      const L = layoutOf(next);
      for (const [k, m] of next.step.moves.entries()) {
        if (mine !== gen || destroyed) return;
        drawStatic(next, m.block, k);
        const on = (next.trail[m.block] as CountBlock).on;
        const src = next.trail[on] as CountBlock;
        const fromX = L.colX(colOf(next, src.router));
        const toX = L.colX(colOf(next, m.to));
        const g = el('g', { transform: `translate(${fromX} ${L.levelY(src.d)})` });
        el(
          'rect',
          {
            x: round2(-L.bw / 2),
            y: round2(-L.bh / 2),
            width: L.bw,
            height: L.bh,
            rx: 3,
            fill: colors.accent,
            stroke: colors.accent,
          },
          g,
        );
        const num = label(String(m.told), 0, 0, { mono: true, fill: colors.text, weight: 600 }, g);
        const at = (x: number, y: number): void => g.setAttribute('transform', `translate(${round2(x)} ${round2(y)})`);
        const y0 = L.levelY(m.told);
        if (!(await tween(SLIDE_MS, mine, (p) => at(fromX + (toX - fromX) * p, y0)))) return;
        num.textContent = String(m.sum);
        const ySum = L.levelY(m.sum);
        if (!(await tween(RISE_MS, mine, (p) => at(toX, y0 + (ySum - y0) * p)))) return;
        if (m.sum !== m.set) {
          num.textContent = String(m.set);
          const ySet = L.levelY(m.set);
          if (!(await tween(PRESS_MS, mine, (p) => at(toX, ySum + (ySet - ySum) * p)))) return;
        }
      }
    }

    return {
      async render(next: CountToInfinityScene, _prev: CountToInfinityScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate) {
          drawStatic(next);
          return;
        }
        if (next.step.kind === 'cut') await playCut(next, mine);
        else if (next.step.kind === 'round') await playRound(next, mine);
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy() {
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
