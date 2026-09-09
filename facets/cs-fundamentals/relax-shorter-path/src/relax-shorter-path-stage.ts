/**
 * relax-shorter-path-stage — 완화(relaxation) 조각의 시각화.
 *
 * ── 왜 이 모양인가
 *
 * 질문의 동사가 **내려간다** 이므로, 정점이 이고 있는 수를 세로 자 위의 높이로
 * 옮겨 놓았다. 열마다 세로 레일이 있고 수를 적은 패는 그 수의 높이에 붙는다.
 * 큰 수는 위, 작은 수는 아래. 완화가 일어나면 패는 레일을 따라 **실제로 아래로
 * 미끄러진다.** 색만 바뀌는 것이 아니다.
 *
 * 두 사건이 화면에서 갈리는 것이 이 조각의 요지다.
 *   - 처음 적는다 → 패가 간선 호를 타고 **옆에서 날아와** 레일에 앉는다.
 *   - 이미 적힌 수가 내려간다 → 옛 수가 그 자리에 **지운 자국(취소선)** 으로
 *     남고, 패는 레일을 따라 **수직으로 내려간다.** 지나온 자국이 뒤에 남는다.
 *
 * 자국은 전부 아래를 향한다. 위로 난 자국이 하나도 없다는 것이 마지막 화면이
 * 하는 말이다.
 *
 * 눈금 위 끝(scaleMax)은 선언값이며 재생 중 나오는 어떤 수보다 크다. 높이는
 * 마운트 뒤 바뀌지 않는다 (S-view).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

/**
 * projector 가 좁혀서 넘기는 판 구성 (C9). stage 안에서만 쓰는 이름이라 내보내지
 * 않는다 — projector 는 자기 파일 위쪽에 view 계약을 따로 적는다.
 */
type RelaxStageSpec = {
  vertices: string[];
  source: string;
  scaleMax: number;
};

type RelaxWrite = { vertex: string; from: string; weight: number; value: number };
type RelaxProbe = {
  from: string;
  to: string;
  weight: number;
  candidate: number;
  current: number;
};
type RelaxDescend = { vertex: string; fromValue: number; toValue: number };

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 374;

const LEGEND_Y = 20;
const UNKNOWN_Y = 52; // ∞ 배지 중심 — 자 바깥, "아직 모름" 의 자리
const SEPARATOR_Y = 76;
const RAIL_TOP = 92; // 눈금 위 끝 (= scaleMax)
const RAIL_BOTTOM = 296; // 눈금 아래 끝 (= 0)
const VERTEX_CY = 330;
const VERTEX_R = 17;
const CAPTION_Y = 362;

const AXIS_LABEL_X = 34;
const PLOT_LEFT = 44;
const PLOT_RIGHT = W - 22;

const COL_MAX_W = 136;
const COL_SIDE_MIN = 26;

const TOKEN_W = 48;
const TOKEN_H = 22;

const MS_SETTLE = 140;
const MS_ARC = 170;
const MS_FLY = 260;
const MS_TICK = 100;
const MS_FALL = 380;
const MS_FINISH = 180;

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function label(content: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

/** 이차 베지에 위의 한 점. DOM 의 getPointAtLength 에 기대지 않는다. */
function quadAt(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

/** 표본으로 재는 곡선 길이 — stroke-dashoffset 을 걸기 위한 근사값. */
function quadLength(p0: Pt, c: Pt, p1: Pt): number {
  let total = 0;
  let prev = p0;
  for (let i = 1; i <= 24; i++) {
    const cur = quadAt(p0, c, p1, i / 24);
    total += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
  }
  return total;
}

type TokenLook = 'written' | 'fresh' | 'falling' | 'probing' | 'final';

type VertexUI = {
  name: string;
  x: number;
  value: number | null;
  opened: boolean;
  badge: SVGGElement | null;
  token: SVGGElement | null;
  box: SVGRectElement | null;
  text: SVGTextElement | null;
  circle: SVGCircleElement;
  circleText: SVGTextElement;
};

export const relaxShorterPathStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    const frames = new Set<number>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    const now = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    const schedule = (fn: () => void): number =>
      hasRaf
        ? requestAnimationFrame(() => fn())
        : (setTimeout(fn, 16) as unknown as number);
    const unschedule = (id: number): void => {
      if (hasRaf) cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };

    /**
     * 프레임 보간. destroy 되면 즉시 resolve 해 projector 의 await 가 매달리지
     * 않게 한다. 예약한 프레임은 전부 frames 에 담아 destroy 에서 거둔다.
     */
    const tween = (ms: number, apply: (p: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const started = now();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed) {
            resolve();
            return;
          }
          const raw = Math.min(1, (now() - started) / ms);
          apply(1 - Math.pow(1 - raw, 3));
          if (raw >= 1) {
            resolve();
            return;
          }
          id = schedule(tick);
          frames.add(id);
        };
        id = schedule(tick);
        frames.add(id);
      });

    // ── 판 구성 ───────────────────────────────────────────────────────────────
    const root = el('g');
    svg.appendChild(root);

    let spec: RelaxStageSpec = { vertices: [], source: '', scaleMax: 1 };
    let vertices = new Map<string, VertexUI>();
    let gridLayer = el('g');
    let traceLayer = el('g');
    let ghostLayer = el('g');
    let arcLayer = el('g');
    let tokenLayer = el('g');
    let caption = label('', {});
    /** 방금 그린 간선 호. 물러나게 할 때 이것 하나만 손댄다. */
    let liveArc: SVGGElement | null = null;

    /** 지금 견주고 있는 후보 눈금. 버려지면 지우지 않고 그 자리에 남긴다. */
    let tick: {
      group: SVGGElement;
      bar: SVGLineElement;
      text: SVGTextElement;
      x: number;
      y: number;
    } | null = null;

    const valueY = (v: number): number => {
      const ratio = Math.max(0, Math.min(1, v / spec.scaleMax));
      return RAIL_BOTTOM - ratio * (RAIL_BOTTOM - RAIL_TOP);
    };

    const paint = (ui: VertexUI, look: TokenLook): void => {
      if (!ui.box || !ui.text) return;
      const fill =
        look === 'fresh'
          ? c.accent
          : look === 'falling'
            ? c.itemSwapping
            : look === 'final'
              ? c.itemSorted
              : c.bg;
      const stroke =
        look === 'probing'
          ? c.itemComparing
          : look === 'written'
            ? c.text
            : fill;
      const ink =
        look === 'fresh' || look === 'falling'
          ? c.stateInk
          : look === 'final'
            ? c.textInverse
            : c.text;
      ui.box.setAttribute('fill', fill);
      ui.box.setAttribute('stroke', stroke);
      ui.box.setAttribute('stroke-width', look === 'probing' ? '2.4' : '1.6');
      ui.text.setAttribute('fill', ink);
    };

    const placeToken = (ui: VertexUI, y: number, scale = 1): void => {
      ui.token?.setAttribute('transform', `translate(${ui.x} ${y}) scale(${scale})`);
    };

    const makeToken = (ui: VertexUI, value: number, look: TokenLook): void => {
      const g = el('g');
      const box = el('rect', {
        x: -TOKEN_W / 2,
        y: -TOKEN_H / 2,
        width: TOKEN_W,
        height: TOKEN_H,
        rx: 5,
      });
      const txt = label(String(value), {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': '600',
      });
      g.appendChild(box);
      g.appendChild(txt);
      tokenLayer.appendChild(g);
      ui.token = g;
      ui.box = box;
      ui.text = txt;
      ui.value = value;
      paint(ui, look);
      placeToken(ui, valueY(value));
    };

    const buildBoard = (): void => {
      root.textContent = '';
      vertices = new Map();
      tick = null;

      gridLayer = el('g');
      traceLayer = el('g');
      ghostLayer = el('g');
      arcLayer = el('g');
      tokenLayer = el('g');
      root.appendChild(gridLayer);
      root.appendChild(traceLayer);
      root.appendChild(ghostLayer);
      root.appendChild(arcLayer);
      root.appendChild(tokenLayer);

      const count = Math.max(1, spec.vertices.length);
      const colW = Math.min(COL_MAX_W, Math.floor((W - COL_SIDE_MIN * 2) / count));
      const originX = Math.round((W - count * colW) / 2);

      gridLayer.appendChild(
        label(tr('label.axis', 'distance from {source}', { source: spec.source }), {
          x: 20,
          y: LEGEND_Y,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        }),
      );

      // 눈금. 위 끝 위쪽은 자 바깥 — 아직 어떤 수도 적히지 않은 자리다.
      const step = Math.max(1, Math.round(spec.scaleMax / 3));
      for (let v = 0; v <= spec.scaleMax; v += step) {
        const y = valueY(v);
        gridLayer.appendChild(
          el('line', {
            x1: PLOT_LEFT,
            y1: y,
            x2: PLOT_RIGHT,
            y2: y,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 6',
          }),
        );
        gridLayer.appendChild(
          label(String(v), {
            x: AXIS_LABEL_X,
            y: y + 4,
            'text-anchor': 'end',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          }),
        );
      }
      gridLayer.appendChild(
        el('line', {
          x1: PLOT_LEFT,
          y1: SEPARATOR_Y,
          x2: PLOT_RIGHT,
          y2: SEPARATOR_Y,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '1 5',
        }),
      );
      gridLayer.appendChild(
        label('∞', {
          x: AXIS_LABEL_X,
          y: UNKNOWN_Y + 5,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.textMuted,
        }),
      );

      spec.vertices.forEach((name, i) => {
        const x = originX + colW * i + colW / 2;

        gridLayer.appendChild(
          el('line', {
            x1: x,
            y1: RAIL_TOP,
            x2: x,
            y2: RAIL_BOTTOM,
            stroke: c.border,
            'stroke-width': 3,
            'stroke-linecap': 'round',
          }),
        );

        const circle = el('circle', {
          cx: x,
          cy: VERTEX_CY,
          r: VERTEX_R,
          fill: c.bg,
          stroke: c.text,
          'stroke-width': 1.6,
        });
        const circleText = label(name, {
          x,
          y: VERTEX_CY + 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': '600',
          fill: c.text,
        });
        gridLayer.appendChild(circle);
        gridLayer.appendChild(circleText);

        const ui: VertexUI = {
          name,
          x,
          value: null,
          opened: false,
          badge: null,
          token: null,
          box: null,
          text: null,
          circle,
          circleText,
        };
        vertices.set(name, ui);

        if (name === spec.source) {
          makeToken(ui, 0, 'written');
        } else {
          const badge = el('g', { transform: `translate(${x} ${UNKNOWN_Y})` });
          badge.appendChild(
            el('rect', {
              x: -TOKEN_W / 2,
              y: -TOKEN_H / 2,
              width: TOKEN_W,
              height: TOKEN_H,
              rx: 5,
              fill: c.bg,
              stroke: c.border,
              'stroke-width': 1.4,
              'stroke-dasharray': '3 3',
            }),
          );
          badge.appendChild(
            label('∞', {
              x: 0,
              y: 5,
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.md,
              fill: c.textMuted,
            }),
          );
          gridLayer.appendChild(badge);
          ui.badge = badge;
        }
      });

      caption = label('', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      root.appendChild(caption);
    };

    // ── 간선 호 ───────────────────────────────────────────────────────────────
    /**
     * 무게만큼 위로 오르는 호. 시작은 편 정점의 패, 끝은 상대 열의 후보 높이다.
     * 호가 오르는 세로 길이가 곧 간선의 무게이며, 그 끝이 상대 열의 어느 높이에
     * 닿는지가 이 걸음의 물음이 된다.
     */
    const drawArc = async (
      from: VertexUI,
      to: VertexUI,
      candidate: number,
      weight: number,
      stroke: string,
    ): Promise<{ group: SVGGElement; p0: Pt; ctrl: Pt; p1: Pt }> => {
      const p0: Pt = { x: from.x, y: valueY(from.value ?? 0) };
      const p1: Pt = { x: to.x, y: valueY(candidate) };
      const ctrl: Pt = {
        x: (p0.x + p1.x) / 2,
        y: Math.max(RAIL_TOP - 8, Math.min(p0.y, p1.y) - 26),
      };
      const group = el('g');
      arcLayer.appendChild(group);
      liveArc = group;
      const path = el('path', {
        d: `M ${p0.x} ${p0.y} Q ${ctrl.x} ${ctrl.y} ${p1.x} ${p1.y}`,
        fill: 'none',
        stroke,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      const len = quadLength(p0, ctrl, p1);
      path.setAttribute('stroke-dasharray', String(len));
      path.setAttribute('stroke-dashoffset', String(len));
      group.appendChild(path);

      const mid = quadAt(p0, ctrl, p1, 0.5);
      const weightLabel = label(`+${weight}`, {
        x: mid.x,
        y: mid.y - 9,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': '600',
        fill: stroke,
        opacity: 0,
      });
      group.appendChild(weightLabel);

      await tween(MS_ARC, (p) => {
        path.setAttribute('stroke-dashoffset', String(len * (1 - p)));
        weightLabel.setAttribute('opacity', String(p));
      });
      return { group, p0, ctrl, p1 };
    };

    const clearTick = (): void => {
      tick?.group.remove();
      tick = null;
    };

    /**
     * 앞 걸음이 남긴 강조를 거둔다. 강조는 걸음이 끝나도 그대로 두어 다음 걸음이
     * 올 때까지 보이게 한다 — 읽는 시간이 걸음 간격에 있기 때문이다.
     */
    const normalize = (): void => {
      for (const ui of vertices.values()) {
        if (ui.token) paint(ui, ui.opened ? 'final' : 'written');
      }
    };

    // ── projector 가 부르는 메서드 ────────────────────────────────────────────
    const instance: ViewInstance = {
      reset(next: RelaxStageSpec): void {
        spec = next;
        liveArc = null;
        buildBoard();
      },

      setCaption(value: string): void {
        caption.textContent = value;
      },

      /** 지금까지 적힌 수가 가장 작은 정점 — 여기서 나가는 간선을 편다. */
      async settle(vertex: string): Promise<void> {
        arcLayer.textContent = '';
        liveArc = null;
        clearTick();
        normalize();
        const ui = vertices.get(vertex);
        if (!ui) return;
        ui.opened = true;
        ui.circle.setAttribute('fill', c.itemSorted);
        ui.circle.setAttribute('stroke', c.itemSorted);
        ui.circleText.setAttribute('fill', c.textInverse);
        paint(ui, 'final');
        await tween(MS_SETTLE, (p) => {
          const bump = 1 + 0.22 * Math.sin(p * Math.PI);
          ui.circle.setAttribute('r', String(VERTEX_R * bump));
        });
        ui.circle.setAttribute('r', String(VERTEX_R));
      },

      /** 적힌 수가 없던 열에 처음 적는다 — 패가 간선을 타고 옆에서 날아온다. */
      async write(w: RelaxWrite): Promise<void> {
        const from = vertices.get(w.from);
        const to = vertices.get(w.vertex);
        if (!from || !to) return;
        const arc = await drawArc(from, to, w.value, w.weight, c.accent);
        makeToken(to, w.value, 'fresh');
        to.token?.setAttribute('transform', `translate(${arc.p0.x} ${arc.p0.y}) scale(0.7)`);
        const badge = to.badge;
        to.badge = null;
        await tween(MS_FLY, (p) => {
          const at = quadAt(arc.p0, arc.ctrl, arc.p1, p);
          to.token?.setAttribute('transform', `translate(${at.x} ${at.y}) scale(${0.7 + 0.3 * p})`);
          badge?.setAttribute('opacity', String(1 - p));
        });
        badge?.remove();
        placeToken(to, valueY(w.value));
        arc.group.setAttribute('opacity', '0.42');
      },

      /** 이미 적힌 수와 견준다 — 호 끝이 그 수보다 아래를 가리키면 더 짧은 길이다. */
      async probe(p: RelaxProbe): Promise<void> {
        const from = vertices.get(p.from);
        const to = vertices.get(p.to);
        if (!from || !to) return;
        normalize();
        await drawArc(from, to, p.candidate, p.weight, c.itemComparing);
        paint(to, 'probing');
        clearTick();
        const y = valueY(p.candidate);
        const group = el('g', { opacity: 0 });
        const bar = el('line', {
          x1: to.x - 26,
          y1: y,
          x2: to.x + 26,
          y2: y,
          stroke: c.itemComparing,
          'stroke-width': 2.4,
          'stroke-linecap': 'round',
        });
        const text = label(String(p.candidate), {
          x: to.x + 33,
          y: y + 4,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': '600',
          fill: c.itemComparing,
        });
        group.appendChild(bar);
        group.appendChild(text);
        arcLayer.appendChild(group);
        await tween(MS_TICK, (t) => group.setAttribute('opacity', String(t)));
        tick = { group, bar, text, x: to.x, y };
      },

      /**
       * 적어 둔 수를 지우고 낮은 수로 다시 적는다. 옛 수는 취소선이 그어진 채
       * 제자리에 남고, 패는 레일을 따라 수직으로 내려가며 자국을 남긴다.
       */
      async descend(d: RelaxDescend): Promise<void> {
        const ui = vertices.get(d.vertex);
        if (!ui || !ui.token || !ui.text) return;
        clearTick();
        const fromY = valueY(d.fromValue);
        const toY = valueY(d.toValue);

        const ghost = el('g', { opacity: 0 });
        ghost.appendChild(
          label(String(d.fromValue), {
            x: ui.x,
            y: fromY + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          }),
        );
        ghost.appendChild(
          el('line', {
            x1: ui.x - 15,
            y1: fromY,
            x2: ui.x + 15,
            y2: fromY,
            stroke: c.textMuted,
            'stroke-width': 1.4,
          }),
        );
        ghostLayer.appendChild(ghost);

        const trace = el('line', {
          x1: ui.x,
          y1: fromY + 10,
          x2: ui.x,
          y2: fromY + 10,
          stroke: c.itemSwapping,
          'stroke-width': 3,
          'stroke-linecap': 'round',
          opacity: 0.45,
        });
        traceLayer.appendChild(trace);

        ui.text.textContent = String(d.toValue);
        ui.value = d.toValue;
        paint(ui, 'falling');
        await tween(MS_FALL, (p) => {
          const y = fromY + (toY - fromY) * p;
          placeToken(ui, y);
          trace.setAttribute('y2', String(Math.max(fromY + 10, y)));
          ghost.setAttribute('opacity', String(Math.min(1, p * 2)));
        });
        placeToken(ui, toY);
      },

      /**
       * 더 짧지 않다 — 적어 둔 수를 지우지 않는다.
       *
       * 후보 눈금을 **지우지 않는다.** 지우면 화면이 "아무 일도 없었다" 로
       * 읽히고, 그러면 이 걸음이 헛것이 된다. 후보는 취소선이 그어진 채 적힌
       * 수보다 **위에** 남는다 — 위에 있다는 것이 곧 버린 까닭이다.
       */
      async keep(vertex: string): Promise<void> {
        const ui = vertices.get(vertex);
        // 방금 그린 호만 점선으로 물러난다. 앞서 성사된 호까지 흐려 놓으면 그것도
        // 버려진 것처럼 읽힌다. dasharray 는 그려 넣을 때 path 에 직접 걸어 두었으므로
        // (draw-on) 여기서도 path 를 직접 고쳐야 먹는다.
        for (const path of Array.from(liveArc?.querySelectorAll('path') ?? [])) {
          path.setAttribute('stroke-dasharray', '5 5');
          path.setAttribute('stroke-dashoffset', '0');
        }
        liveArc?.setAttribute('opacity', '0.4');
        const rejected = tick;
        if (rejected) {
          rejected.bar.setAttribute('stroke', c.textMuted);
          rejected.bar.setAttribute('stroke-dasharray', '4 4');
          rejected.text.setAttribute('fill', c.textMuted);
          rejected.group.appendChild(
            el('line', {
              x1: rejected.x + 30,
              y1: rejected.y,
              x2: rejected.x + 52,
              y2: rejected.y,
              stroke: c.textMuted,
              'stroke-width': 1.4,
            }),
          );
        }
        if (!ui) return;
        // 패는 제자리를 지킨다. 자리를 지킨다는 것을 보이려 한 번 버티듯 눌렸다 펴진다.
        const y = valueY(ui.value ?? 0);
        await tween(MS_TICK * 2, (p) => {
          const squash = 1 - 0.07 * Math.sin(p * Math.PI);
          ui.token?.setAttribute('transform', `translate(${ui.x} ${y}) scale(1 ${squash})`);
        });
        placeToken(ui, y);
        paint(ui, ui.opened ? 'final' : 'written');
      },

      /** 다 폈다. 남은 자국은 모두 아래를 향한다. */
      async finish(): Promise<void> {
        arcLayer.textContent = '';
        liveArc = null;
        clearTick();
        for (const ui of vertices.values()) {
          ui.opened = true;
          ui.circle.setAttribute('fill', c.itemSorted);
          ui.circle.setAttribute('stroke', c.itemSorted);
          ui.circleText.setAttribute('fill', c.textInverse);
          paint(ui, 'final');
        }
        const traces = Array.from(traceLayer.children);
        await tween(MS_FINISH, (p) => {
          for (const t of traces) t.setAttribute('opacity', String(0.45 + 0.45 * Math.sin(p * Math.PI)));
        });
        for (const t of traces) t.setAttribute('opacity', '0.6');
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) unschedule(id);
        frames.clear();
        root.remove();
      },
    };

    buildBoard();
    return instance;
  },
};
