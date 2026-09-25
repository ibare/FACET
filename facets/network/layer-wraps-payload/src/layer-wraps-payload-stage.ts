/**
 * layer-wraps-payload 의 무대.
 *
 * 동사는 "씌워진다". 한 호스트 안의 층이 위에서 아래로 줄을 이루고, 짐은 한 걸음에 한 줄씩
 * 내려간다. 내려앉은 줄에서 그 층의 머리가 왼쪽 바깥에서 밀려 들어와 붙고(링크는 꼬리가
 * 오른쪽 바깥에서), 봉투가 안의 것을 통째로 감싼다. 안의 것은 가로 자리가 그대로다 —
 * 열리지도 바뀌지도 않는다. 가로 길이는 바이트에 비례해, 지나온 줄에 남은 윤곽이 불어난 크기를 보인다.
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
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { WrapLayerId } from './algorithm.js';
import type { LayerWrapsScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 420;

/** 왼쪽 층 이름 칸의 끝 · 오른쪽 크기 칸의 폭 */
const LABEL_COL = 104;
const SIZE_COL = 60;
const SIDE_PAD = 14;
/** 위쪽 머리글 띠 · 아래쪽 캡션 띠 */
const TOP_BAND = 40;
const BOTTOM_BAND = 110;
/** 가장 안쪽(응용 데이터) 상자의 높이 상한과 봉투 한 겹의 두께 상한 */
const CORE_H_MAX = 18;
const PAD_MAX = 5;
/** 줄 간격 상한 */
const ROW_GAP_MAX = 68;
/** 머리 · 꼬리가 밀려 들어오기 시작하는 거리 */
const SLIDE_MAX = 70;

const DROP_MS = 300;
const WRAP_MS = 300;
const WIRE_MS = 420;
const FRAME_MS = 16;

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

interface Geometry {
  x0: number;
  scale: number;
  dataX: number;
  dataW: number;
  coreH: number;
  pad: number;
  rowGap: number;
  rowY(r: number): number;
  /** 깊이 d(씌운 층 수) 에서의 바깥 가장자리 */
  outer(d: number): { x: number; w: number; h: number };
  /** 층 k(1 부터) 의 머리 · 꼬리 자리 */
  headOf(k: number): { x: number; w: number };
  tailOf(k: number): { x: number; w: number };
}

function geometry(scene: LayerWrapsScene): Geometry {
  const W = PIECE_CANVAS_W;
  const x0 = LABEL_COL;
  const x1 = W - SIZE_COL;
  let span = scene.payload;
  let headSum = 0;
  for (const l of scene.layers) {
    span += l.head + l.tail;
    headSum += l.head;
  }
  const scale = (x1 - x0) / span;
  const dataX = x0 + headSum * scale;
  const dataW = scene.payload * scale;
  const rows = scene.layers.length + 2; // 응용 + 층들 + 선
  const rowGap = Math.min(ROW_GAP_MAX, (H - TOP_BAND - 12 - BOTTOM_BAND) / (rows - 1));
  const pad = Math.min(PAD_MAX, (rowGap - 20 - CORE_H_MAX) / (2 * Math.max(1, scene.layers.length)));
  const coreH = CORE_H_MAX;
  const cumHead = (k: number): number => {
    let s = 0;
    for (let i = 0; i < k; i += 1) s += scene.layers[i]!.head;
    return s;
  };
  const cumTail = (k: number): number => {
    let s = 0;
    for (let i = 0; i < k; i += 1) s += scene.layers[i]!.tail;
    return s;
  };
  return {
    x0,
    scale,
    dataX,
    dataW,
    coreH,
    pad,
    rowGap,
    rowY: (r) => TOP_BAND + 12 + r * rowGap,
    outer: (d) => {
      const x = dataX - cumHead(d) * scale;
      const w = (scene.payload + cumHead(d) + cumTail(d)) * scale;
      return { x, w, h: coreH + 2 * pad * d };
    },
    headOf: (k) => ({ x: dataX - cumHead(k) * scale, w: scene.layers[k - 1]!.head * scale }),
    tailOf: (k) => ({
      x: dataX + dataW + cumTail(k - 1) * scale,
      w: scene.layers[k - 1]!.tail * scale,
    }),
  };
}

interface Handles {
  /** 이번 걸음에 씌운 층의 부분 — 봉투 · 머리 · 꼬리 */
  env: SVGRectElement | null;
  head: SVGGElement | null;
  tail: SVGGElement | null;
  /** 이번 걸음 이전부터 있던 것 전부 */
  inner: SVGGElement | null;
  /** 짐 전체 */
  packet: SVGGElement | null;
  /** 운동이 끝난 뒤에야 서는 것 (바이트 수 · 데이터 몫 괄호) */
  late: SVGGElement | null;
}

export const layerWrapsPayloadStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const smallPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function layerName(id: WrapLayerId | 'application'): string {
      switch (id) {
        case 'application':
          return t('label.application', 'Application');
        case 'transport':
          return t('label.transport', 'Transport');
        case 'network':
          return t('label.network', 'Network');
        case 'link':
          return t('label.link', 'Link');
      }
    }

    function word(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { anchor?: string; size?: string; fill?: string; weight?: string; family?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'font-weight': opts.weight ?? '400',
          fill: opts.fill ?? colors.text,
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    /** 깊이 d 의 짐을 그린다. 바깥 층부터 그려 안쪽이 위에 오게 한다. */
    function drawPacket(
      scene: LayerWrapsScene,
      g: Geometry,
      d: number,
      y: number,
      parent: Element,
      palette: readonly string[],
    ): Handles {
      const packet = el('g', {}, parent);
      const handles: Handles = {
        env: null,
        head: null,
        tail: null,
        inner: null,
        packet,
        late: null,
      };
      if (d > 0) {
        const o = g.outer(d);
        handles.env = el(
          'rect',
          {
            x: o.x,
            y: y - o.h / 2,
            width: o.w,
            height: o.h,
            rx: 3,
            fill: palette[d]!,
            'fill-opacity': 0.2,
            stroke: palette[d]!,
            'stroke-width': 1.5,
          },
          packet,
        );
        const hd = g.headOf(d);
        const headG = el('g', {}, packet);
        el('rect', { x: hd.x, y: y - o.h / 2, width: hd.w, height: o.h, rx: 3, fill: palette[d]! }, headG);
        handles.head = headG;
        const tl = g.tailOf(d);
        if (tl.w > 0) {
          const tailG = el('g', {}, packet);
          el('rect', { x: tl.x, y: y - o.h / 2, width: tl.w, height: o.h, rx: 2, fill: palette[d]! }, tailG);
          handles.tail = tailG;
        }
      }
      const inner = el('g', {}, packet);
      handles.inner = inner;
      for (let k = d - 1; k >= 1; k -= 1) {
        const o = g.outer(k);
        el(
          'rect',
          {
            x: o.x,
            y: y - o.h / 2,
            width: o.w,
            height: o.h,
            rx: 3,
            fill: palette[k]!,
            'fill-opacity': 0.2,
            stroke: palette[k]!,
            'stroke-width': 1.5,
          },
          inner,
        );
        const hd = g.headOf(k);
        el('rect', { x: hd.x, y: y - o.h / 2, width: hd.w, height: o.h, rx: 3, fill: palette[k]! }, inner);
        const tl = g.tailOf(k);
        if (tl.w > 0) {
          el('rect', { x: tl.x, y: y - o.h / 2, width: tl.w, height: o.h, rx: 2, fill: palette[k]! }, inner);
        }
      }
      el(
        'rect',
        { x: g.dataX, y: y - g.coreH / 2, width: g.dataW, height: g.coreH, rx: 3, fill: palette[0]! },
        inner,
      );

      // 바이트 수 — 짐 위에 한 줄로. 운동이 끝난 뒤 선다.
      const late = el('g', {}, parent);
      handles.late = late;
      const top = y - g.outer(d).h / 2 - smallPx * 0.7;
      word(late, g.dataX + g.dataW / 2, top, String(scene.payload), {
        anchor: 'middle',
        size: fontSizes.xs,
        fill: colors.textMuted,
        family: fonts.mono,
      });
      for (let k = 1; k <= d; k += 1) {
        const rec = scene.wraps[k - 1]!;
        const hd = g.headOf(k);
        word(late, hd.x + hd.w / 2, top, String(rec.head), {
          anchor: 'middle',
          size: fontSizes.xs,
          fill: colors.textMuted,
          family: fonts.mono,
        });
        const tl = g.tailOf(k);
        if (rec.tail > 0) {
          word(late, tl.x + tl.w / 2, top, String(rec.tail), {
            anchor: 'middle',
            size: fontSizes.xs,
            fill: colors.textMuted,
            family: fonts.mono,
          });
        }
      }
      return handles;
    }

    function drawStatic(scene: LayerWrapsScene): Handles {
      svg.textContent = '';
      const g = geometry(scene);
      const L = scene.layers.length;
      const palette = categorical(L + 1, 'vivid');
      const d = scene.wraps.length;
      const onWire = scene.wire !== null;
      const curRow = onWire ? L + 1 : d;
      const W = PIECE_CANVAS_W;
      const sizeX = W - SIDE_PAD;

      const root = el('g', {}, svg);

      // 크기 칸 머리글
      word(root, sizeX, TOP_BAND - 18, t('label.bytes', 'bytes'), {
        anchor: 'end',
        size: fontSizes.xs,
        fill: colors.textMuted,
      });

      // 층 줄 — 응용 · 층들 · 선
      const rowIds: (WrapLayerId | 'application')[] = ['application', ...scene.layers.map((l) => l.id)];
      rowIds.forEach((id, r) => {
        const y = g.rowY(r);
        const reached = r <= d;
        el('rect', { x: SIDE_PAD, y: y - 4, width: 8, height: 8, rx: 2, fill: palette[r]! }, root);
        word(root, SIDE_PAD + 14, y, layerName(id), {
          fill: reached ? colors.text : colors.textMuted,
          weight: r === curRow ? '600' : '400',
        });
      });
      const wireY = g.rowY(L + 1);
      el(
        'line',
        { x1: g.x0 - 6, y1: wireY, x2: W - SIZE_COL + 6, y2: wireY, stroke: colors.textMuted, 'stroke-width': 2 },
        root,
      );
      word(root, SIDE_PAD + 14, wireY, t('label.wire', 'Wire'), {
        fill: onWire ? colors.text : colors.textMuted,
        weight: onWire ? '600' : '400',
      });

      // 지나온 줄 — 그 층을 떠날 때의 바깥 윤곽과 크기
      for (let r = 0; r <= d; r += 1) {
        const y = g.rowY(r);
        const size = r === 0 ? scene.payload : scene.wraps[r - 1]!.size;
        const isCur = r === curRow;
        if (!isCur) {
          const o = g.outer(r);
          el(
            'rect',
            {
              x: o.x,
              y: y - o.h / 2,
              width: o.w,
              height: o.h,
              rx: 3,
              fill: 'none',
              stroke: colors.border,
              'stroke-width': 1.2,
              'stroke-dasharray': '4 3',
            },
            root,
          );
        }
        word(root, sizeX, y, String(size), {
          anchor: 'end',
          family: fonts.mono,
          fill: isCur ? colors.text : colors.textMuted,
          weight: isCur ? '600' : '400',
        });
      }
      if (onWire && scene.wire !== null) {
        word(root, sizeX, wireY, String(scene.wire.total), {
          anchor: 'end',
          family: fonts.mono,
          fill: colors.text,
          weight: '600',
        });
      }

      // 지금의 짐
      const handles = drawPacket(scene, g, d, g.rowY(curRow), root, palette);

      // 선에 오른 뒤 — 그 안의 응용 데이터 몫을 괄호로
      if (onWire && handles.late !== null) {
        const by = wireY + g.outer(d).h / 2 + 7;
        const bx0 = g.dataX;
        const bx1 = g.dataX + g.dataW;
        el(
          'path',
          {
            d: `M${r2(bx0)} ${r2(by - 4)} L${r2(bx0)} ${r2(by)} L${r2(bx1)} ${r2(by)} L${r2(bx1)} ${r2(by - 4)}`,
            fill: 'none',
            stroke: palette[0]!,
            'stroke-width': 1.5,
          },
          handles.late,
        );
        word(handles.late, (bx0 + bx1) / 2, by + smallPx, t('label.data', 'application data'), {
          anchor: 'middle',
          size: fontSizes.xs,
          fill: colors.textMuted,
        });
      }

      // 캡션 — 지금 일어나는 일과 그 수
      const capY = H - 44;
      const cap = el('g', {}, root);
      const cx = W / 2;
      let line1 = '';
      let line2 = '';
      const step = scene.step;
      if (step.kind === 'start') {
        line1 = t('caption.start', 'Application hands its data down.');
        line2 = t('value.size', 'Size: {size}', { size: scene.payload });
      } else if (step.kind === 'wrap') {
        const rec = scene.wraps[d - 1]!;
        const name = layerName(rec.layer);
        if (rec.tail > 0) {
          line1 = t('caption.wrapTail', '{layer} layer wraps a header in front and a trailer behind.', {
            layer: name,
          });
          line2 = t('value.headTail', 'Header: {head}. Trailer: {tail}. Size: {size}', {
            head: rec.head,
            tail: rec.tail,
            size: rec.size,
          });
        } else {
          line1 = t('caption.wrap', '{layer} layer wraps a header around the outside.', { layer: name });
          line2 = t('value.head', 'Header: {head}. Size: {size}', { head: rec.head, size: rec.size });
        }
      } else if (scene.wire !== null) {
        const share = scene.wire.share.toFixed(2);
        line1 = t('caption.wire', 'The whole frame goes onto the wire.');
        line2 = t('value.wire', 'Total: {total}. Added: {added}. Application data share: {share}', {
          total: scene.wire.total,
          added: scene.wire.added,
          share,
        });
      }
      word(cap, cx, capY, line1, { anchor: 'middle', size: fontSizes.md, fill: colors.text });
      word(cap, cx, capY + 20, line2, {
        anchor: 'middle',
        size: fontSizes.sm,
        fill: colors.textMuted,
        family: fonts.mono,
      });

      return handles;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
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
          timers.delete(id);
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(1 - (1 - p) * (1 - p));
          if (p >= 1) {
            finish(true);
            return;
          }
          id = setTimeout(tick, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        let id = setTimeout(tick, FRAME_MS);
        timers.add(id);
      });
    }

    async function render(
      next: LayerWrapsScene,
      _prev: LayerWrapsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const h = drawStatic(next);
      if (!opts.animate) return;
      const g = geometry(next);
      const L = next.layers.length;
      const step = next.step;

      if (step.kind === 'wrap') {
        const d = next.wraps.length;
        const dy = g.rowY(d) - g.rowY(d - 1);
        const inner = h.inner;
        if (inner === null) return;
        const outerParts = [h.env, h.head, h.tail].filter((n): n is NonNullable<typeof n> => n !== null);
        for (const n of outerParts) n.setAttribute('visibility', 'hidden');
        h.late?.setAttribute('visibility', 'hidden');
        // 안의 것이 한 줄 아래로 내려앉는다
        const ok = await tween(DROP_MS, mine, (p) => {
          inner.setAttribute('transform', `translate(0 ${r2(-dy * (1 - p))})`);
        });
        if (!ok || mine !== gen || destroyed) return;
        inner.removeAttribute('transform');
        for (const n of outerParts) n.removeAttribute('visibility');
        // 머리는 왼쪽 바깥에서, 꼬리는 오른쪽 바깥에서 밀려와 붙고, 봉투가 감싼다
        const innerBox = g.outer(d - 1);
        const full = g.outer(d);
        const slide = Math.min(SLIDE_MAX, g.x0 - SIDE_PAD);
        const y = g.rowY(d);
        const ok2 = await tween(WRAP_MS, mine, (p) => {
          h.head?.setAttribute('transform', `translate(${r2(-slide * (1 - p))} 0)`);
          h.tail?.setAttribute('transform', `translate(${r2(slide * (1 - p))} 0)`);
          if (h.env !== null) {
            const x = innerBox.x + (full.x - innerBox.x) * p;
            const w = innerBox.w + (full.w - innerBox.w) * p;
            const hh = innerBox.h + (full.h - innerBox.h) * p;
            h.env.setAttribute('x', String(r2(x)));
            h.env.setAttribute('width', String(r2(w)));
            h.env.setAttribute('y', String(r2(y - hh / 2)));
            h.env.setAttribute('height', String(r2(hh)));
          }
        });
        if (!ok2 || mine !== gen || destroyed) return;
        drawStatic(next);
        return;
      }

      if (step.kind === 'wire') {
        const packet = h.packet;
        if (packet === null) return;
        const dy = g.rowY(L + 1) - g.rowY(next.wraps.length);
        h.late?.setAttribute('visibility', 'hidden');
        // 다 씌운 짐이 통째로 선 위로 내려앉는다
        const ok = await tween(WIRE_MS, mine, (p) => {
          packet.setAttribute('transform', `translate(0 ${r2(-dy * (1 - p))})`);
        });
        if (!ok || mine !== gen || destroyed) return;
        drawStatic(next);
      }
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
