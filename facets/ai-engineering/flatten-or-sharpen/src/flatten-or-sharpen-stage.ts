/**
 * flatten-or-sharpen 의 그림.
 *
 * 온도 하나가 몫의 띠 한 줄이다. 띠는 캔버스 폭을 다섯 후보의 몫으로 나눈 것이고,
 * 후보는 늘 표의 차례로 붙어 있다. 새 온도가 오면 앞 줄의 복제본이 아래로 내려가면서
 * 경계가 미끄러진다 — 1등 칸이 넓어지면 몫이 위로 쏠린 것이고 좁아지면 아래 후보들로
 * 퍼진 것이다. 두 줄 사이에는 후보마다 흐름 띠가 남아 몫이 어디서 어디로 옮겨 갔는지
 * 보인다. 후보의 차례가 바뀌지 않으므로 흐름 띠는 서로 엇갈리지 않는다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { FlattenOrSharpenBand, FlattenOrSharpenScene } from './scene.js';

const H = 372;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 왼쪽 온도 이름표 자리 */
const LABEL_X = 16;
/** 띠가 시작하는 가로 자리. 오른쪽 여백은 LABEL_X 와 같게 */
const BAR_X0 = 108;
/** 문맥 · 범례 줄 */
const HEAD_Y = 26;
/** 첫 띠의 윗변과 마지막 띠의 아랫변이 들어갈 구간 */
const BANDS_TOP = 52;
const BANDS_BOTTOM = 288;
/** 띠 두께 상한 */
const BAND_H_MAX = 40;
/** 캡션 줄 */
const CAPTION_Y = [312, 334, 356];

/** 경계가 미끄러지는 시간과 한 프레임 */
const MOVE_MS = 1000;
const FRAME_MS = 20;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function fmtP(p: number): string {
  return p.toFixed(2);
}

function fmtT(t: number): string {
  return t.toFixed(1);
}

/** 몫을 차례로 쌓은 경계 — 표 차례 그대로, 길이는 후보 수 + 1 */
function edges(probs: readonly number[], x0: number, width: number): number[] {
  const out = [x0];
  let acc = 0;
  for (const p of probs) {
    acc += p;
    out.push(x0 + acc * width);
  }
  return out;
}

type Geometry = { bandH: number; pitch: number; x0: number; width: number };

function geometry(count: number): Geometry {
  const width = PIECE_CANVAS_W - BAR_X0 - LABEL_X;
  const span = BANDS_TOP > BANDS_BOTTOM ? 0 : BANDS_BOTTOM - BANDS_TOP;
  const bandH = Math.min(BAND_H_MAX, count > 0 ? span / (count * 2 - 1) : BAND_H_MAX);
  // 줄 사이 틈은 띠 두께보다 넓게 — 흐름 띠가 기울기를 보일 자리
  const pitch = count > 1 ? Math.min((span - bandH) / (count - 1), bandH * 2.4) : 0;
  return { bandH, pitch, x0: BAR_X0, width };
}

function bandTop(g: Geometry, i: number): number {
  return BANDS_TOP + g.pitch * i;
}

function orderText(tokens: readonly string[], rank: readonly number[]): string {
  return rank.map((i) => tokens[i] ?? '').join(' > ');
}

function sameOrder(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export const flattenOrSharpenStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<FlattenOrSharpenScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function put(
      tag: string,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function write(
      content: string,
      x: number,
      y: number,
      opts: { size: string; fill: string; mono?: boolean; anchor?: string; weight?: number },
    ): void {
      const node = put('text', {
        x: r2(x),
        y: r2(y),
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size,
        fill: opts.fill,
        'text-anchor': opts.anchor ?? 'start',
        'font-weight': opts.weight ?? 400,
      });
      node.textContent = content;
    }

    /** 흐름 띠 하나 — 윗줄 칸 [a0,a1] 에서 아랫줄 칸 [b0,b1] 로 */
    function ribbon(
      a0: number, a1: number, yTop: number,
      b0: number, b1: number, yBot: number,
      fill: string,
    ): void {
      const ym = (yTop + yBot) / 2;
      const d =
        `M ${r2(a0)} ${r2(yTop)} L ${r2(a1)} ${r2(yTop)} ` +
        `C ${r2(a1)} ${r2(ym)} ${r2(b1)} ${r2(ym)} ${r2(b1)} ${r2(yBot)} ` +
        `L ${r2(b0)} ${r2(yBot)} ` +
        `C ${r2(b0)} ${r2(ym)} ${r2(a0)} ${r2(ym)} ${r2(a0)} ${r2(yTop)} Z`;
      put('path', { d, fill, 'fill-opacity': 0.28, stroke: 'none' });
    }

    function drawHead(scene: FlattenOrSharpenScene, palette: readonly string[]): void {
      if (scene.context === '') return;
      write(scene.context, LABEL_X, HEAD_Y, { size: fontSizes.md, fill: colors.text, mono: true, weight: 600 });
      let x = LABEL_X + scene.context.length * 8.4 + 28;
      scene.tokens.forEach((tok, i) => {
        put('rect', { x: r2(x), y: HEAD_Y - 10, width: 10, height: 10, rx: 2, fill: palette[i] ?? colors.border });
        write(tok, x + 14, HEAD_Y, { size: fontSizes.sm, fill: colors.textMuted, mono: true });
        x += 14 + tok.length * 7.2 + 16;
      });
    }

    function drawBand(
      scene: FlattenOrSharpenScene,
      palette: readonly string[],
      g: Geometry,
      band: FlattenOrSharpenBand,
      xs: readonly number[],
      y: number,
    ): void {
      write(t('label.temp', 'T {t}', { t: fmtT(band.t) }), LABEL_X, y + g.bandH * 0.45, {
        size: fontSizes.lg, fill: colors.text, weight: 600,
      });
      write(t('label.divide', 'logits ÷ {t}', { t: fmtT(band.t) }), LABEL_X, y + g.bandH * 0.9, {
        size: fontSizes.xs, fill: colors.textMuted,
      });
      scene.tokens.forEach((tok, i) => {
        const a = xs[i];
        const b = xs[i + 1];
        const w = b - a;
        if (w <= 0) return;
        put('rect', { x: r2(a), y: r2(y), width: r2(w), height: r2(g.bandH), fill: palette[i] ?? colors.border });
        const mid = (a + b) / 2;
        const p = band.probs[i] ?? 0;
        if (w >= Math.max(tok.length * 6.6, 28) + 8) {
          write(tok, mid, y + g.bandH * 0.4, { size: fontSizes.xs, fill: colors.stateInk, mono: true, anchor: 'middle' });
          write(fmtP(p), mid, y + g.bandH * 0.82, { size: fontSizes.sm, fill: colors.stateInk, anchor: 'middle', weight: 600 });
        } else if (w >= 32) {
          write(fmtP(p), mid, y + g.bandH * 0.62, { size: fontSizes.sm, fill: colors.stateInk, anchor: 'middle', weight: 600 });
        }
      });
      // 칸 사이 가는 경계 — 몫이 아주 작은 칸도 있다는 표시
      for (let i = 1; i < xs.length - 1; i += 1) {
        put('line', {
          x1: r2(xs[i]), y1: r2(y), x2: r2(xs[i]), y2: r2(y + g.bandH),
          stroke: colors.bg, 'stroke-width': 1,
        });
      }
    }

    function drawCaption(scene: FlattenOrSharpenScene): void {
      const n = scene.bands.length;
      if (n === 0) return;
      const now = scene.bands[n - 1];
      const top = now.rank[0] ?? 0;
      const last = now.rank[now.rank.length - 1] ?? 0;
      const tokTop = scene.tokens[top] ?? '';
      const tokLast = scene.tokens[last] ?? '';
      const lines: string[] = [];
      if (n === 1) {
        lines.push(t('caption.first', 'T {t}: every logit ÷ {t}, then softmax. Top {top} holds {p}.', {
          t: fmtT(now.t), top: tokTop, p: fmtP(now.probs[top] ?? 0),
        }));
        lines.push(t('caption.last', 'Last place {last}: {l}.', { last: tokLast, l: fmtP(now.probs[last] ?? 0) }));
        lines.push(t('caption.order', 'Order: {order}', { order: orderText(scene.tokens, now.rank) }));
      } else {
        const was = scene.bands[n - 2];
        const vars = {
          was: fmtT(was.t), t: fmtT(now.t), top: tokTop,
          pw: fmtP(was.probs[top] ?? 0), p: fmtP(now.probs[top] ?? 0),
        };
        lines.push(
          (now.probs[top] ?? 0) > (was.probs[top] ?? 0)
            ? t('caption.gather', 'T {was} → {t}: the shares crowd toward top {top}, {pw} → {p}.', vars)
            : t('caption.spread', 'T {was} → {t}: the shares spill down the list. Top {top}: {pw} → {p}.', vars),
        );
        lines.push(t('caption.lastMove', 'Last place {last}: {lw} → {l}.', {
          last: tokLast, lw: fmtP(was.probs[last] ?? 0), l: fmtP(now.probs[last] ?? 0),
        }));
        const order = orderText(scene.tokens, now.rank);
        const kept = scene.bands.every((b) => sameOrder(b.rank, now.rank));
        lines.push(
          kept
            ? t('caption.orderSame', 'Order unchanged: {order}', { order })
            : t('caption.orderChanged', 'Order changed: {order}', { order }),
        );
      }
      lines.forEach((line, i) => {
        write(line, LABEL_X, CAPTION_Y[i] ?? CAPTION_Y[CAPTION_Y.length - 1], {
          size: i === 0 ? fontSizes.md : fontSizes.sm,
          fill: i === 0 ? colors.text : colors.textMuted,
          weight: i === 0 ? 600 : 400,
        });
      });
    }

    /**
     * 장면 전체를 세운다. k 는 마지막 줄이 제자리에 온 정도 (1 이면 정적 화면).
     * 첫 줄은 왼쪽 끝에서 폭이 펼쳐지고, 둘째 줄부터는 앞 줄 자리에서 내려오며 경계가 옮겨 간다.
     */
    function draw(scene: FlattenOrSharpenScene, k: number): void {
      svg.textContent = '';
      const palette = categorical(scene.tokens.length);
      drawHead(scene, palette);
      const n = scene.bands.length;
      if (n === 0) return;
      const g = geometry(n);
      const rows = scene.bands.map((band, i) => {
        const home = edges(band.probs, g.x0, g.width);
        if (i < n - 1 || k >= 1) return { band, xs: home, y: bandTop(g, i) };
        if (i === 0) return { band, xs: home.map((x) => lerp(g.x0, x, k)), y: bandTop(g, 0) };
        const from = edges(scene.bands[i - 1].probs, g.x0, g.width);
        return {
          band,
          xs: home.map((x, j) => lerp(from[j] ?? x, x, k)),
          y: lerp(bandTop(g, i - 1), bandTop(g, i), k),
        };
      });
      // 흐름 띠를 먼저 — 띠 밑에 깔린다
      for (let i = 1; i < rows.length; i += 1) {
        const up = rows[i - 1];
        const down = rows[i];
        const yTop = up.y + g.bandH;
        if (down.y <= yTop) continue;
        scene.tokens.forEach((_, j) => {
          ribbon(up.xs[j], up.xs[j + 1], yTop, down.xs[j], down.xs[j + 1], down.y, palette[j] ?? colors.border);
        });
      }
      rows.forEach((row) => drawBand(scene, palette, g, row.band, row.xs, row.y));
      drawCaption(scene);
    }

    function tick(): Promise<boolean> {
      return new Promise((resolve) => {
        const wake = (): void => {
          timers.delete(id);
          clearTimeout(id);
          resolve(false);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(wake);
          resolve(true);
        }, FRAME_MS);
        timers.add(id);
        waiters.add(wake);
      });
    }

    return {
      async render(next, prev, opts): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const grew =
          next.step !== null &&
          next.step.kind === 'band' &&
          (prev === null || prev.bands.length < next.bands.length);
        if (!opts.animate || !grew) {
          draw(next, 1);
          return;
        }
        draw(next, 0);
        const frames = Math.max(1, Math.round(MOVE_MS / FRAME_MS));
        for (let f = 1; f <= frames; f += 1) {
          if (!(await tick())) return;
          if (mine !== gen || destroyed) return;
          draw(next, easeInOut(f / frames));
        }
        if (mine !== gen || destroyed) return;
        draw(next, 1);
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
