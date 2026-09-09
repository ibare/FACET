/**
 * 커널 트릭 조각 — stage view.
 *
 * 그림의 형태는 질문의 동사에서 나왔다. 동사는 **들어올린다** 이므로 이 화면의
 * 운동은 전부 자리가 바뀌는 것이다 — 칼이 줄 위를 미끄러지고, 줄이 바닥으로
 * 내려앉아 위를 열어 주고, 점이 제 기둥을 밀며 솟고, 곧은 선이 내려와 멈춘다.
 * 색만 바뀌는 것은 반평면 tint 하나뿐이고 그것은 운동이 아니라 판정이다.
 *
 * ── 세로 배치 (마운트 뒤 바뀌지 않는다 — S-view)
 *
 *   26        캡션
 *   66..188   칼 (1차원 세계에서 자르는 자리)
 *   152       줄            ← 들어올릴 때 258 로 내려앉는다
 *   198/218   묶음표와 그 안에 남은 이름표
 *   72..258   올린 뒤의 높이 축. 258 이 바닥, 72 가 가장 높이 오른 자리
 *
 * 위쪽이 처음에 비어 있는 것은 낭비가 아니라 사정이다. 아직 그 쪽이 없다.
 * 칼이 그 자리를 세로로 채우고 있다가 물러나면서 자리를 내준다.
 *
 * 가로는 줄 자체라 폭을 채운다. 칸 폭은 캔버스에서 역산하고 상수는 상한만 둔다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const H = 304;
const CAPTION_Y = 26;
const LINE_Y = 152;
/** 줄이 바닥으로 내려앉는 거리. 그만큼이 위쪽으로 열린다. */
const FLOOR_DY = 106;
const FLOOR_Y = LINE_Y + FLOOR_DY;
/** 가장 높이 오른 것이 앉는 자리. */
const TOP_Y = 72;
const TICK_DY = 24;
const BRACKET_DY = 46;
const BRACKET_LABEL_DY = 66;
const KNIFE_TOP = 66;
const KNIFE_DOWN = 36;
const AXIS_X = 30;
const AXIS_TOP = 64;
const AXIS_TICK_HALF = 4;
const DOT_R = 12;
const X_UNIT_MAX = 84;
const SIDE_MIN = 56;
const RIGHT_PAD = 14;

/** 높이 축에 새기는 표식. 수식 표기라 번역하지 않는다 (C10). */
const HEIGHT_AXIS_MARK = 'x²';
/** 음수 부호는 하이픈이 아니라 수학 기호로 새긴다. */
const MINUS = '−';

export type KernelLiftsPoint = { x: number; label: string };

/**
 * 선언에서 점을 좁혀 낸다.
 *
 * 좁히는 규칙은 한 벌만 둔다 — mount 와 projector 가 이것을 함께 쓴다 (C9).
 * 러너 밖에서 마운트하면 `initialData` 가 아예 없으므로 빈 배열로 떨어진다.
 */
export function readKernelLiftsPoints(raw: unknown): KernelLiftsPoint[] {
  const src = (raw as { points?: unknown } | undefined)?.points;
  if (!Array.isArray(src)) return [];
  const out: KernelLiftsPoint[] = [];
  for (const item of src) {
    const p = item as { x?: unknown; label?: unknown };
    if (typeof p?.x !== 'number' || typeof p?.label !== 'string') continue;
    out.push({ x: p.x, label: p.label });
  }
  return out.sort((a, b) => a.x - b.x);
}

export type KernelLiftsStage = ViewInstance & {
  setScene(points: KernelLiftsPoint[]): void;
  setCaption(text: string): void;
  showLine(): Promise<void>;
  tryCut(spec: {
    cut: number;
    leftLabels: string[];
    leftMixed: boolean;
    rightLabels: string[];
    rightMixed: boolean;
  }): Promise<void>;
  dropKnife(): Promise<void>;
  openHeight(ticks: number[]): Promise<void>;
  raise(xs: number[], height: number): Promise<void>;
  traceCurve(): Promise<void>;
  placeCut(height: number): Promise<void>;
  markSplit(belowLabel: string, aboveLabel: string): Promise<void>;
  settle(): Promise<void>;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeInOut = (p: number): number =>
  p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;

/** 표식으로 새기는 수 — 2.5 는 2.5 로, 9 는 9 로. */
function mark(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded).replace('-', MINUS);
}

/** 점들의 꼭대기를 지나는 매끄러운 길 (Catmull-Rom → 3차 베지에). */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** 길이의 어림 — `getTotalLength` 없이 대시 애니메이션의 눈금을 잡는다. */
function chordLength(pts: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len * 1.06;
}

/**
 * 토큰 색을 옅게 깐다. 색 리터럴이 아니라 순수 변환이라 view 에 두어도 된다
 * (S-view 의 예외 — 들어오는 hex 는 언제나 토큰에서 온다).
 */
function hexToRgba(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const kernelLiftsStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const rightEdge = W - RIGHT_PAD;

    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    /** 애니메이션 한 벌. destroy 되면 끝 상태로 튕겨 놓고 기다리던 것을 푼다 (S-piece). */
    function tween(
      durationMs: number,
      apply: (p: number) => void,
      ease: (p: number) => number = easeOut,
    ): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const step = (): void => {
          if (destroyed) {
            apply(1);
            finish();
            return;
          }
          const raw = durationMs <= 0 ? 1 : (Date.now() - started) / durationMs;
          const p = Math.min(1, Math.max(0, raw));
          apply(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            step();
          });
          frames.add(id);
        };
        step();
      });
    }

    // ── 화면의 층. 뒤에서 앞으로.
    const root = el('g', {});
    const gBands = el('g', {});
    const gAxis = el('g', { opacity: 0 });
    const gCurve = el('g', {});
    const gCutLine = el('g', {});
    const gKnife = el('g', {});
    const gWorld = el('g', { transform: 'translate(0, 0)' });
    const captionEl = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    root.append(gBands, gAxis, gCurve, gCutLine, gKnife, gWorld, captionEl);
    svg.appendChild(root);

    // ── 장면의 상태.
    type Node = {
      spec: KernelLiftsPoint;
      height: number;
      dot: SVGGElement;
      stem: SVGLineElement;
    };

    let nodes: Node[] = [];
    let labelColor = new Map<string, string>();
    let xUnit = X_UNIT_MAX;
    let originX = 0;
    let minX = 0;
    let yUnit = 0;
    let worldDy = 0;
    let knife: SVGLineElement | null = null;
    let cutLine: SVGLineElement | null = null;
    let cutMark: SVGTextElement | null = null;
    /** 지금 걸려 있는 묶음표 한 벌. 다음 자름 자리로 옮길 때 걷어낸다. */
    let sideMarks: SVGGElement | null = null;
    let active: SVGCircleElement[] = [];

    const px = (x: number): number => originX + (x - minX) * xUnit;
    /** 화면에서의 높이 h 의 자리. gWorld 바깥의 것들이 쓴다. */
    const py = (h: number): number => FLOOR_Y - h * yUnit;

    function clear(node: SVGElement): void {
      while (node.firstChild) node.removeChild(node.firstChild);
    }

    function setScene(points: KernelLiftsPoint[]): void {
      clear(gBands);
      clear(gAxis);
      clear(gCurve);
      clear(gCutLine);
      clear(gKnife);
      clear(gWorld);
      gAxis.setAttribute('opacity', '0');
      captionEl.textContent = '';
      knife = null;
      sideMarks = null;
      cutLine = null;
      cutMark = null;
      active = [];
      yUnit = 0;
      worldDy = 0;
      gWorld.setAttribute('transform', 'translate(0, 0)');
      nodes = [];
      if (points.length === 0) return;

      const xs = points.map((p) => p.x);
      minX = Math.min(...xs);
      const spanX = Math.max(...xs) - minX;
      xUnit =
        spanX > 0
          ? Math.min(X_UNIT_MAX, Math.floor((W - SIDE_MIN * 2) / spanX))
          : X_UNIT_MAX;
      originX = Math.round((W - xUnit * spanX) / 2);

      // 이름표는 두 갈래를 가르는 표시다 — categorical 시드에서 뽑는다 (S-view).
      const labels = [...new Set(points.map((p) => p.label))].sort();
      const tones = categorical(Math.max(2, labels.length), 'vivid');
      labelColor = new Map(labels.map((name, i) => [name, tones[i % tones.length]]));

      const lineY = LINE_Y;
      gWorld.appendChild(
        el('line', {
          x1: px(minX) - DOT_R - 14,
          y1: lineY,
          x2: px(minX + spanX) + DOT_R + 14,
          y2: lineY,
          stroke: c.border,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      );

      // 기둥 — 오른 만큼의 길이. 제 이름표 색을 옅게 물려받아 무엇이 올랐는지 남긴다.
      const stems: SVGLineElement[] = points.map((spec) => {
        const stem = el('line', {
          x1: px(spec.x),
          y1: lineY,
          x2: px(spec.x),
          y2: lineY,
          stroke: hexToRgba(labelColor.get(spec.label) ?? c.border, 0.4),
          'stroke-width': 4,
          'stroke-linecap': 'round',
        });
        gWorld.appendChild(stem);
        return stem;
      });

      for (const spec of points) {
        const tick = el('text', {
          x: px(spec.x),
          y: lineY + TICK_DY,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        tick.textContent = mark(spec.x);
        gWorld.appendChild(tick);
      }

      points.forEach((spec, i) => {
        const dot = el('g', {
          transform: `translate(${px(spec.x)}, ${lineY})`,
          opacity: 0,
        });
        dot.appendChild(
          el('circle', {
            cx: 0,
            cy: 0,
            r: DOT_R,
            fill: labelColor.get(spec.label) ?? c.itemDefault,
            stroke: c.stateInk,
            'stroke-width': 1,
          }),
        );
        const glyph = el('text', {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          fill: c.stateInk,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
        });
        glyph.textContent = spec.label;
        dot.appendChild(glyph);
        gWorld.appendChild(dot);
        nodes.push({ spec, height: 0, dot, stem: stems[i] });
      });
    }

    /** 점 하나의 자리를 gWorld 안 좌표로 다시 잡는다. */
    function placeNode(node: Node, height: number): void {
      const y = LINE_Y - height * yUnit;
      node.dot.setAttribute('transform', `translate(${px(node.spec.x)}, ${y})`);
      node.stem.setAttribute('y2', String(y));
    }

    function clearActive(): void {
      for (const ring of active) ring.remove();
      active = [];
    }

    const instance: KernelLiftsStage = {
      setScene,

      setCaption(text: string): void {
        captionEl.textContent = text;
      },

      showLine(): Promise<void> {
        const drop = 20;
        return tween(460, (p) => {
          nodes.forEach((node, i) => {
            const start = Math.min(0.5, i * 0.08);
            const q = Math.min(1, Math.max(0, (p - start) / 0.5));
            node.dot.setAttribute('opacity', String(q));
            node.dot.setAttribute(
              'transform',
              `translate(${px(node.spec.x)}, ${LINE_Y - drop * (1 - q)})`,
            );
          });
        });
      },

      async tryCut(spec): Promise<void> {
        const targetX = px(spec.cut);
        if (!knife) {
          knife = el('line', {
            x1: targetX,
            y1: KNIFE_TOP - 16,
            x2: targetX,
            y2: LINE_Y + KNIFE_DOWN - 16,
            stroke: c.text,
            'stroke-width': 2,
            'stroke-dasharray': '6 5',
            opacity: 0,
          });
          gKnife.appendChild(knife);
          const blade = knife;
          await tween(250, (p) => {
            blade.setAttribute('opacity', String(p));
            blade.setAttribute('y1', String(KNIFE_TOP - 16 * (1 - p)));
            blade.setAttribute('y2', String(LINE_Y + KNIFE_DOWN - 16 * (1 - p)));
          });
        } else {
          const blade = knife;
          const fromX = Number(blade.getAttribute('x1'));
          await tween(
            250,
            (p) => {
              const x = fromX + (targetX - fromX) * p;
              blade.setAttribute('x1', String(x));
              blade.setAttribute('x2', String(x));
            },
            easeInOut,
          );
        }

        // 묶음표 — 양쪽에 무엇이 남았는지. 섞인 쪽은 danger 로 말한다.
        const brackets = el('g', { opacity: 0 });
        const sides: Array<{ labels: string[]; mixed: boolean; from: number; to: number }> = [
          {
            labels: spec.leftLabels,
            mixed: spec.leftMixed,
            from: px(Math.min(...nodes.map((n) => n.spec.x))) - DOT_R,
            to: targetX - 10,
          },
          {
            labels: spec.rightLabels,
            mixed: spec.rightMixed,
            from: targetX + 10,
            to: px(Math.max(...nodes.map((n) => n.spec.x))) + DOT_R,
          },
        ];
        for (const side of sides) {
          if (side.labels.length === 0) continue;
          const tone = side.mixed ? c.danger : c.textMuted;
          const y = LINE_Y + BRACKET_DY;
          brackets.appendChild(
            el('path', {
              d: `M ${side.from} ${y - 7} L ${side.from} ${y} L ${side.to} ${y} L ${side.to} ${y - 7}`,
              fill: 'none',
              stroke: tone,
              'stroke-width': side.mixed ? 2 : 1,
            }),
          );
          const census = el('text', {
            x: (side.from + side.to) / 2,
            y: LINE_Y + BRACKET_LABEL_DY,
            'text-anchor': 'middle',
            fill: tone,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': side.mixed ? 600 : 400,
          });
          census.textContent = side.labels.join(' ');
          brackets.appendChild(census);
        }
        sideMarks?.remove();
        gKnife.appendChild(brackets);
        sideMarks = brackets;
        await tween(120, (p) => brackets.setAttribute('opacity', String(p)));
      },

      async dropKnife(): Promise<void> {
        const blade = knife;
        const marks = sideMarks;
        await tween(280, (p) => {
          const fade = String(1 - p);
          if (blade) {
            blade.setAttribute('opacity', fade);
            blade.setAttribute('y1', String(KNIFE_TOP - 22 * p));
            blade.setAttribute('y2', String(LINE_Y + KNIFE_DOWN - 22 * p));
          }
          marks?.setAttribute('opacity', fade);
        });
        clear(gKnife);
        knife = null;
        sideMarks = null;
      },

      async openHeight(ticks: number[]): Promise<void> {
        const top = ticks.length > 0 ? Math.max(...ticks) : 0;
        yUnit = top > 0 ? (FLOOR_Y - TOP_Y) / top : 0;

        // 줄이 바닥으로 내려앉는다. 그 자리가 곧 위쪽이 열린 자리다.
        await tween(460, (p) => {
          worldDy = FLOOR_DY * p;
          gWorld.setAttribute('transform', `translate(0, ${worldDy})`);
        });

        clear(gAxis);
        gAxis.appendChild(
          el('line', {
            x1: AXIS_X,
            y1: FLOOR_Y,
            x2: AXIS_X,
            y2: AXIS_TOP,
            stroke: c.border,
            'stroke-width': 2,
            'stroke-linecap': 'round',
          }),
        );
        for (const t of ticks) {
          gAxis.appendChild(
            el('line', {
              x1: AXIS_X - AXIS_TICK_HALF,
              y1: py(t),
              x2: AXIS_X + AXIS_TICK_HALF,
              y2: py(t),
              stroke: c.border,
              'stroke-width': 1.5,
            }),
          );
          const num = el('text', {
            x: AXIS_X - 9,
            y: py(t) + 4,
            'text-anchor': 'end',
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          });
          num.textContent = mark(t);
          gAxis.appendChild(num);
        }
        const axisMark = el('text', {
          x: AXIS_X,
          y: AXIS_TOP - 10,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        axisMark.textContent = HEIGHT_AXIS_MARK;
        gAxis.appendChild(axisMark);
        await tween(200, (p) => gAxis.setAttribute('opacity', String(p)));
      },

      async raise(xs: number[], height: number): Promise<void> {
        clearActive();
        const group = nodes.filter((n) => xs.includes(n.spec.x));
        for (const node of group) {
          const ring = el('circle', {
            cx: 0,
            cy: 0,
            r: DOT_R + 5,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 2.5,
            opacity: 0.9,
          });
          node.dot.insertBefore(ring, node.dot.firstChild);
          active.push(ring);
        }
        const from = group.map((n) => n.height);
        await tween(480, (p) => {
          group.forEach((node, i) => {
            placeNode(node, from[i] + (height - from[i]) * p);
          });
        });
        for (const node of group) node.height = height;
      },

      async traceCurve(): Promise<void> {
        clearActive();
        const tips = nodes.map((n) => ({ x: px(n.spec.x), y: py(n.height) }));
        const len = Math.max(1, chordLength(tips));
        const path = el('path', {
          d: smoothPath(tips),
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1.5,
          'stroke-linecap': 'round',
          'stroke-dasharray': `${len} ${len}`,
          'stroke-dashoffset': len,
        });
        clear(gCurve);
        gCurve.appendChild(path);
        await tween(540, (p) => {
          path.setAttribute('stroke-dashoffset', String(len * (1 - p)));
        });
      },

      async placeCut(height: number): Promise<void> {
        const targetY = py(height);
        cutLine = el('line', {
          x1: AXIS_X,
          y1: AXIS_TOP,
          x2: rightEdge,
          y2: AXIS_TOP,
          stroke: c.text,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        cutMark = el('text', {
          x: rightEdge,
          y: AXIS_TOP - 7,
          'text-anchor': 'end',
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        cutMark.textContent = mark(height);
        clear(gCutLine);
        gCutLine.append(cutLine, cutMark);
        const line = cutLine;
        const num = cutMark;
        await tween(540, (p) => {
          const y = AXIS_TOP + (targetY - AXIS_TOP) * p;
          line.setAttribute('y1', String(y));
          line.setAttribute('y2', String(y));
          num.setAttribute('y', String(y - 7));
        });
      },

      async markSplit(belowLabel: string, aboveLabel: string): Promise<void> {
        const y = cutLine ? Number(cutLine.getAttribute('y1')) : py(0);
        clear(gBands);
        const below = el('rect', {
          x: AXIS_X,
          y,
          width: rightEdge - AXIS_X,
          height: Math.max(0, FLOOR_Y + DOT_R + 6 - y),
          fill: hexToRgba(labelColor.get(belowLabel) ?? c.border, 0.14),
          opacity: 0,
        });
        const above = el('rect', {
          x: AXIS_X,
          y: AXIS_TOP - 8,
          width: rightEdge - AXIS_X,
          height: Math.max(0, y - (AXIS_TOP - 8)),
          fill: hexToRgba(labelColor.get(aboveLabel) ?? c.border, 0.14),
          opacity: 0,
        });
        gBands.append(below, above);
        await tween(380, (p) => {
          below.setAttribute('opacity', String(p));
          above.setAttribute('opacity', String(p));
        });
      },

      async settle(): Promise<void> {
        const line = cutLine;
        if (!line) return;
        await tween(
          400,
          (p) => {
            const swell = Math.sin(p * Math.PI);
            line.setAttribute('stroke-width', String(2 + swell * 2));
          },
          (p) => p,
        );
        line.setAttribute('stroke-width', '2');
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };

    setScene(readKernelLiftsPoints(params.initialData));
    return instance;
  },
};
