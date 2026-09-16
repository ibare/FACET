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
 * 세 사건이 화면에서 갈리는 것이 이 조각의 요지다.
 *   - 처음 적는다 → 패가 간선 호를 타고 **옆에서 날아와** 레일에 앉는다.
 *   - 이미 적힌 수가 내려간다 → 옛 수가 그 자리에 **지운 자국(취소선)** 으로
 *     남고, 패는 레일을 따라 **수직으로 내려간다.** 지나온 자국이 뒤에 남는다.
 *   - 더 짧지 않아 그대로 둔다 → 버린 후보가 적힌 수보다 **위에** 취소선을 단 채
 *     남고, 짚어 본 간선은 점선으로 물러난다. **둘 다 끝까지 지워지지 않는다.**
 *
 * 자국은 전부 아래를 향한다. 위로 난 자국이 하나도 없다는 것이 마지막 화면이
 * 하는 말이고, 그 곁에 남은 헛짚음이 "고치지 않기로 한 판정" 을 함께 말한다.
 *
 * ── 칠을 어떻게 갈랐나
 *
 * **채움은 값의 형편**이다 — 아직 모름(∞ 점선 배지) · 막 적힘 · 내려가는 중 ·
 * 적혀 있음 · 굳음. **테두리와 눈금은 짚음의 표식**이다 — 지금 견주는 중인가,
 * 그리고 짚어 보았으나 물러난 자리는 어디인가. 두 칠이 같은 속성을 다투지
 * 않으므로 어느 쪽도 다른 쪽을 지우지 않는다.
 *
 * ── 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`settle()` · `write()` · `probe()` …) 를 두지 않는다.
 * 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터 다시
 * 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의
 * 화면 전체**를 세운다 (S-scene).
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 방금 밟은 걸음 하나만 프레임으로
 * 흐르게 하고, 거짓이면 곧바로 끝 자리에 세운다 — 되짚기와 첫 그림이 그 길이다.
 * 운동이 끝나면 **그 장면을 통째로 다시 세운다.** 속성을 하나씩 거두면 반드시
 * 하나를 빠뜨리는데, 이 길은 그 목록 자체를 없앤다.
 *
 * 지연 발화를 막는 것은 `opts.animate` 검사와 **세대 빗장** 둘뿐이다.
 * `isInstant` · `onScrubStart` 는 러너가 장면 조각에서 부르지 않으므로 달지
 * 않는다 (S-scene MUST NOT).
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
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  arcTarget,
  captionOf,
  distOf,
  lastFall,
  lastTried,
  type RelaxCaption,
  type RelaxShorterPathScene,
} from './scene.js';

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

/** 후보 눈금. 막대는 열 가운데를 가로지르고 수와 취소선은 그 오른쪽에 선다. */
const TICK_HALF = 26;
const TICK_TEXT_DX = 33;
const STRIKE_FROM = 30;
const STRIKE_TO = 52;

/** 내려간 자취의 굵기와 짙기. 굳은 뒤에는 한 번 밝아졌다 조금 더 짙게 남는다. */
const TRACE_ALPHA = 0.45;
const TRACE_ALPHA_DONE = 0.6;
/** 물러난 간선과 성사된 간선의 짙기. 둘 다 살아 있는 호보다 물러나 있다. */
const ARC_ALPHA_TAKEN = 0.42;
const ARC_ALPHA_REFUSED = 0.4;

const MS_SETTLE = 140;
const MS_ARC = 170;
const MS_FLY = 260;
const MS_TICK = 100;
const MS_FALL = 380;
const MS_KEEP = 200;
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

function ease(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** 간선 호 하나를 세워 둔 것. 그리는 쪽이 `drawStatic` 에서 매번 새로 만든다. */
type ArcNode = {
  group: SVGGElement;
  path: SVGPathElement;
  weight: SVGTextElement;
  p0: Pt;
  ctrl: Pt;
  p1: Pt;
  len: number;
};

/** 후보 눈금 하나. `strike` 는 버려진 후보에만 그어진다. */
type TickNode = {
  group: SVGGElement;
  strike: SVGLineElement | null;
};

/** 수 하나가 내려간 자국 — 지나온 줄과 그 위에 남는 옛 수. */
type FallNode = { streak: SVGLineElement; ghost: SVGGElement };

export const relaxShorterPathStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    // 러너가 붙여 준 캔버스를 떼지 않는다. 비울 것은 캔버스 안쪽뿐이다 (S-view).
    svg.textContent = '';

    let destroyed = false;
    const frames = new Set<number>();

    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await
     * ctx.emit` 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과 SVG 트리가
     * 통째로 붙들린다 (S-piece MUST).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 이 조각의 운동은 마디를 이어 달린다 — 처음 적는 걸음이 호를 뻗고 나서 패를
     * 날리고, 견주는 걸음이 호를 뻗고 나서 눈금을 세운다. 되짚기가 가운데 끼어들면
     * 앞 세대의 뒷마디가 깨어나 이미 새로 선 화면을 덮는다. 깨어난 운동은 자기
     * 세대를 확인하고 아니면 화면에 손대지 않는다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    function nextFrame(cb: () => void): number {
      return typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => cb())
        : (setTimeout(cb, 16) as unknown as number);
    }

    function dropFrame(id: number): void {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    }

    /**
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(durationMs: number, draw: (e: number) => void): Promise<void> {
      const my = gen;
      const paint = (e: number): void => {
        if (alive(my)) draw(e);
      };
      return new Promise<void>((resolve) => {
        if (destroyed || durationMs <= 0) {
          paint(1);
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / durationMs);
          paint(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          id = nextFrame(tick);
          frames.add(id);
        };
        paint(0);
        id = nextFrame(tick);
        frames.add(id);
      });
    }

    // ── 뼈대. mount 에서 한 번 세우고 안쪽만 갈아 끼운다 ──────────────────────
    const root = el('g');
    const gridLayer = el('g');
    const trailLayer = el('g');
    const arcLayer = el('g');
    const tokenLayer = el('g');
    root.appendChild(gridLayer);
    root.appendChild(trailLayer);
    root.appendChild(arcLayer);
    root.appendChild(tokenLayer);

    /**
     * 캡션은 재건 밖에 있다 — 자리가 고정이라 매번 다시 짓지 않는다. 그래서
     * 정적 그리기가 글자를 **매번 명시로** 쓴다 (프로토콜 4절 "재건 밖 요소").
     */
    const captionText = label('', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    root.appendChild(captionText);
    svg.appendChild(root);

    // ── 지금 세워 둔 그림. 전부 `drawStatic` 이 그 장면에서 다시 만든다 ───────
    let xOf = new Map<string, number>();
    let yAt = (value: number): number => RAIL_BOTTOM - value;
    let circleOf = new Map<string, SVGCircleElement>();
    let tokenOf = new Map<string, SVGGElement>();
    /** 이번 걸음이 뻗은 호. `write` · `probe` 가 이것을 흐르게 한다. */
    let liveArcNode: ArcNode | null = null;
    /** 답을 기다리는 후보 눈금. */
    let liveTickNode: TickNode | null = null;
    /** 방금 물러난 간선의 호와 그 취소선. `keep` 이 이것을 흐르게 한다. */
    let refusedNode: { arc: ArcNode; tick: TickNode } | null = null;
    /** 방금 내려간 자국. `descend` 가 이것을 흐르게 한다. */
    let fallNode: FallNode | null = null;
    /** 내려간 자국 전부. 마지막 걸음이 한 번에 짚는다. */
    let streakNodes: SVGLineElement[] = [];

    // ── 문안. 장면은 무엇을 말할지만 알고 문자는 여기서 만든다 (C10) ─────────
    function sentence(caption: RelaxCaption): string {
      switch (caption.kind) {
        case 'start':
          return tr(
            'caption.start',
            'Only the start is known — {source} is 0, the rest have nothing written.',
            { source: caption.source },
          );
        case 'settle':
          return tr(
            'caption.settle',
            '{vertex} holds the smallest number written so far ({dist}). Open the edges that leave it.',
            { vertex: caption.vertex, dist: caption.dist },
          );
        case 'write':
          return tr(
            'caption.write',
            'Nothing is written at {vertex} yet — the way through {from} puts {value} there.',
            { vertex: caption.vertex, from: caption.from, value: caption.value },
          );
        case 'probe':
          return tr('caption.probe', 'Going through {from} costs {candidate}. {to} has {current} written.', {
            from: caption.from,
            to: caption.to,
            candidate: caption.candidate,
            current: caption.current,
          });
        case 'descend':
          return tr(
            'caption.descend',
            '{toValue} is shorter than {fromValue} — erase what was written and write the lower number.',
            { vertex: caption.vertex, fromValue: caption.fromValue, toValue: caption.toValue },
          );
        case 'keep':
          return tr(
            'caption.keep',
            '{candidate} is not shorter than {current} — nothing is erased, the number stays where it is.',
            { candidate: caption.candidate, current: caption.current },
          );
        case 'done':
          return tr('caption.done', 'Every number that changed moved down. Not one of them ever went up.');
      }
    }

    // ── 부속 ─────────────────────────────────────────────────────────────────

    /** 수를 적은 패 하나. 자리는 부른 쪽이 정한다. */
    function makeToken(
      value: number,
      fill: string,
      stroke: string,
      strokeWidth: string,
      ink: string,
    ): SVGGElement {
      const group = el('g');
      group.appendChild(
        el('rect', {
          x: -TOKEN_W / 2,
          y: -TOKEN_H / 2,
          width: TOKEN_W,
          height: TOKEN_H,
          rx: 5,
          fill,
          stroke,
          'stroke-width': strokeWidth,
        }),
      );
      group.appendChild(
        label(String(value), {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': '600',
          fill: ink,
        }),
      );
      return group;
    }

    /** 아직 아무 수도 적히지 않은 열의 ∞ 배지. 자 바깥에 선다. */
    function makeBadge(x: number): SVGGElement {
      const group = el('g', { transform: `translate(${x} ${UNKNOWN_Y})` });
      group.appendChild(
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
      group.appendChild(
        label('∞', {
          x: 0,
          y: 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.textMuted,
        }),
      );
      return group;
    }

    /**
     * 무게만큼 위로 오르는 호. 시작은 편 정점의 패, 끝은 상대 열의 후보 높이다.
     * 호가 오르는 세로 길이가 곧 간선의 무게이며, 그 끝이 상대 열의 어느 높이에
     * 닿는지가 이 걸음의 물음이 된다.
     */
    function drawArc(
      parent: SVGGElement,
      p0: Pt,
      p1: Pt,
      weight: number,
      stroke: string,
      opacity: number,
      dashed: boolean,
    ): ArcNode {
      const ctrl: Pt = {
        x: (p0.x + p1.x) / 2,
        y: Math.max(RAIL_TOP - 8, Math.min(p0.y, p1.y) - 26),
      };
      const group = el('g', { opacity });
      const path = el('path', {
        d: `M ${p0.x} ${p0.y} Q ${ctrl.x} ${ctrl.y} ${p1.x} ${p1.y}`,
        fill: 'none',
        stroke,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      if (dashed) path.setAttribute('stroke-dasharray', '5 5');
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
      });
      group.appendChild(weightLabel);
      parent.appendChild(group);

      return { group, path, weight: weightLabel, p0, ctrl, p1, len: quadLength(p0, ctrl, p1) };
    }

    /** 후보 하나를 상대 열의 그 높이에 그어 둔다. 버려진 후보면 취소선이 함께 선다. */
    function drawTick(
      parent: SVGGElement,
      x: number,
      y: number,
      value: number,
      refused: boolean,
    ): TickNode {
      const stroke = refused ? c.textMuted : c.itemComparing;
      const group = el('g');
      const bar = el('line', {
        x1: x - TICK_HALF,
        y1: y,
        x2: x + TICK_HALF,
        y2: y,
        stroke,
        'stroke-width': 2.4,
        'stroke-linecap': 'round',
      });
      if (refused) bar.setAttribute('stroke-dasharray', '4 4');
      group.appendChild(bar);
      group.appendChild(
        label(String(value), {
          x: x + TICK_TEXT_DX,
          y: y + 4,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': '600',
          fill: stroke,
        }),
      );
      let strike: SVGLineElement | null = null;
      if (refused) {
        strike = el('line', {
          x1: x + STRIKE_FROM,
          y1: y,
          x2: x + STRIKE_TO,
          y2: y,
          stroke: c.textMuted,
          'stroke-width': 1.4,
        });
        group.appendChild(strike);
      }
      parent.appendChild(group);
      return { group, strike };
    }

    // ── 정적 그리기 — 그 장면이 말하는 것을 전부 세운다 ──────────────────────

    /**
     * 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다. 그리면서 이웃의 지금
     * 좌표를 읽으면 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4절).
     */
    function layout(scene: RelaxShorterPathScene): void {
      const count = Math.max(1, scene.vertices.length);
      const colW = Math.min(COL_MAX_W, Math.floor((W - COL_SIDE_MIN * 2) / count));
      const originX = Math.round((W - count * colW) / 2);
      xOf = new Map();
      scene.vertices.forEach((name, i) => xOf.set(name, originX + colW * i + colW / 2));
      const span = RAIL_BOTTOM - RAIL_TOP;
      yAt = (value: number): number =>
        RAIL_BOTTOM - Math.max(0, Math.min(1, value / scene.scaleMax)) * span;
    }

    function drawStatic(scene: RelaxShorterPathScene): void {
      layout(scene);
      gridLayer.textContent = '';
      trailLayer.textContent = '';
      arcLayer.textContent = '';
      tokenLayer.textContent = '';
      circleOf = new Map();
      tokenOf = new Map();
      liveArcNode = null;
      liveTickNode = null;
      refusedNode = null;
      fallNode = null;
      streakNodes = [];

      const settled = (name: string): boolean =>
        scene.finished || scene.settled.includes(name);
      const target = arcTarget(scene);
      const newest = lastFall(scene);

      // ── 자와 눈금
      gridLayer.appendChild(
        label(tr('label.axis', 'distance from {source}', { source: scene.source }), {
          x: 20,
          y: LEGEND_Y,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        }),
      );
      const step = Math.max(1, Math.round(scene.scaleMax / 3));
      for (let v = 0; v <= scene.scaleMax; v += step) {
        const y = yAt(v);
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

      // ── 레일과 정점. 동그라미의 칠이 "굳었나" 를 말한다.
      for (const name of scene.vertices) {
        const x = xOf.get(name) ?? 0;
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
        const done = settled(name);
        const circle = el('circle', {
          cx: x,
          cy: VERTEX_CY,
          r: VERTEX_R,
          fill: done ? c.itemSorted : c.bg,
          stroke: done ? c.itemSorted : c.text,
          'stroke-width': 1.6,
        });
        gridLayer.appendChild(circle);
        gridLayer.appendChild(
          label(name, {
            x,
            y: VERTEX_CY + 5,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': '600',
            fill: done ? c.textInverse : c.text,
          }),
        );
        circleOf.set(name, circle);
      }

      // ── 자취. 내려간 자국은 세로줄, 헛짚음은 가로 눈금 — 어휘를 갈라 둔다.
      const traceAlpha = scene.finished ? TRACE_ALPHA_DONE : TRACE_ALPHA;
      for (const fall of scene.falls) {
        const x = xOf.get(fall.vertex) ?? 0;
        const fromY = yAt(fall.was);
        const toY = yAt(fall.now);
        const streak = el('line', {
          x1: x,
          y1: fromY + 10,
          x2: x,
          y2: Math.max(fromY + 10, toY),
          stroke: c.itemSwapping,
          'stroke-width': 3,
          'stroke-linecap': 'round',
          opacity: traceAlpha,
        });
        trailLayer.appendChild(streak);
        streakNodes.push(streak);

        const ghost = el('g');
        ghost.appendChild(
          label(String(fall.was), {
            x,
            y: fromY + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          }),
        );
        ghost.appendChild(
          el('line', {
            x1: x - 15,
            y1: fromY,
            x2: x + 15,
            y2: fromY,
            stroke: c.textMuted,
            'stroke-width': 1.4,
          }),
        );
        trailLayer.appendChild(ghost);
        if (newest === fall) fallNode = { streak, ghost };
      }

      // ── 짚어 보았으나 더 짧지 않았던 간선. 끝까지 남는다.
      scene.tried.forEach((tried, i) => {
        const edge = scene.edges[tried.edge];
        const fromValue = distOf(scene, edge.from) ?? 0;
        const p0: Pt = { x: xOf.get(edge.from) ?? 0, y: yAt(fromValue) };
        const p1: Pt = { x: xOf.get(edge.to) ?? 0, y: yAt(tried.candidate) };
        const arc = drawArc(trailLayer, p0, p1, edge.weight, c.textMuted, ARC_ALPHA_REFUSED, true);
        const tick = drawTick(trailLayer, p1.x, p1.y, tried.candidate, true);
        if (i === scene.tried.length - 1) refusedNode = { arc, tick };
      });

      // ── 이번 라운드에 편 간선. 물러난 것은 위에서 이미 그렸다.
      for (const item of scene.arcs) {
        if (item.outcome === 'refused') continue;
        const edge = scene.edges[item.edge];
        const fromValue = distOf(scene, edge.from) ?? 0;
        const p0: Pt = { x: xOf.get(edge.from) ?? 0, y: yAt(fromValue) };
        const p1: Pt = { x: xOf.get(edge.to) ?? 0, y: yAt(item.candidate) };
        const open = item.outcome === 'open';
        liveArcNode = drawArc(
          arcLayer,
          p0,
          p1,
          edge.weight,
          open ? c.itemComparing : c.accent,
          open ? 1 : ARC_ALPHA_TAKEN,
          false,
        );
        liveTickNode = open ? drawTick(arcLayer, p1.x, p1.y, item.candidate, false) : liveTickNode;
      }

      // ── 패와 ∞ 배지. 채움이 값의 형편을, 테두리가 짚음을 말한다.
      scene.vertices.forEach((name, i) => {
        const x = xOf.get(name) ?? 0;
        const value = scene.dist[i];
        if (value === null) {
          tokenLayer.appendChild(makeBadge(x));
          return;
        }
        const fresh = scene.step === 'write' && target === name;
        const falling = scene.step === 'descend' && newest?.vertex === name;
        const probing = scene.step === 'probe' && target === name;
        const done = settled(name);
        const fill = fresh
          ? c.accent
          : falling
            ? c.itemSwapping
            : done
              ? c.itemSorted
              : c.bg;
        const ink = fresh || falling ? c.stateInk : done ? c.textInverse : c.text;
        const stroke = probing ? c.itemComparing : fill === c.bg ? c.text : fill;
        const group = makeToken(value, fill, stroke, probing ? '2.4' : '1.6', ink);
        group.setAttribute('transform', `translate(${x} ${yAt(value)}) scale(1)`);
        tokenLayer.appendChild(group);
        tokenOf.set(name, group);
      });

      captionText.textContent = sentence(captionOf(scene));
    }

    // ── 걸음의 운동. 정적 그리기가 이미 끝 자리에 세웠으므로 출발 자리로 물린다 ──

    /** 편 정점이 한 번 부풀었다 돌아온다 — "여기를 연다". */
    async function playSettle(scene: RelaxShorterPathScene): Promise<void> {
      const circle = circleOf.get(scene.open ?? '');
      if (!circle) return;
      await animate(MS_SETTLE, (e) => {
        circle.setAttribute('r', String(VERTEX_R * (1 + 0.22 * Math.sin(e * Math.PI))));
      });
    }

    /** 호가 뻗고, 그 위를 패가 날아와 레일에 앉는다 — "처음 적는다". */
    async function playWrite(scene: RelaxShorterPathScene, my: number): Promise<void> {
      const arc = liveArcNode;
      const name = arcTarget(scene);
      const token = name === null ? undefined : tokenOf.get(name);
      if (!arc || !token || name === null) return;

      // 패는 아직 오지 않았다. 호가 뻗는 동안 숨긴다.
      token.setAttribute('opacity', '0');
      arc.group.setAttribute('opacity', '1');
      arc.path.setAttribute('stroke-dasharray', String(arc.len));
      // 사라지는 것을 보이려 ∞ 배지를 잠시 세운다. 정적 그리기에는 이미 없다.
      const badge = makeBadge(xOf.get(name) ?? 0);
      tokenLayer.appendChild(badge);

      await animate(MS_ARC, (e) => {
        arc.path.setAttribute('stroke-dashoffset', String(arc.len * (1 - e)));
        arc.weight.setAttribute('opacity', String(e));
      });
      if (!alive(my)) return;

      token.setAttribute('opacity', '1');
      await animate(MS_FLY, (e) => {
        const at = quadAt(arc.p0, arc.ctrl, arc.p1, e);
        token.setAttribute('transform', `translate(${at.x} ${at.y}) scale(${0.7 + 0.3 * e})`);
        badge.setAttribute('opacity', String(1 - e));
        arc.group.setAttribute('opacity', String(1 - (1 - ARC_ALPHA_TAKEN) * e));
      });
    }

    /** 호가 뻗고 그 끝에 눈금이 선다 — "여기까지다, 견주어 보자". */
    async function playProbe(my: number): Promise<void> {
      const arc = liveArcNode;
      const tick = liveTickNode;
      if (!arc) return;
      arc.path.setAttribute('stroke-dasharray', String(arc.len));
      tick?.group.setAttribute('opacity', '0');
      await animate(MS_ARC, (e) => {
        arc.path.setAttribute('stroke-dashoffset', String(arc.len * (1 - e)));
        arc.weight.setAttribute('opacity', String(e));
      });
      if (!alive(my)) return;
      await animate(MS_TICK, (e) => tick?.group.setAttribute('opacity', String(e)));
    }

    /** 패가 레일을 따라 내려가며 자국을 남긴다 — 이 조각의 동사 그 자체. */
    async function playDescend(scene: RelaxShorterPathScene): Promise<void> {
      const fall = lastFall(scene);
      const node = fallNode;
      if (fall === null || !node) return;
      const token = tokenOf.get(fall.vertex);
      if (!token) return;
      const x = xOf.get(fall.vertex) ?? 0;
      const fromY = yAt(fall.was);
      const toY = yAt(fall.now);
      await animate(MS_FALL, (e) => {
        const y = fromY + (toY - fromY) * e;
        token.setAttribute('transform', `translate(${x} ${y}) scale(1)`);
        node.streak.setAttribute('y2', String(Math.max(fromY + 10, y)));
        node.ghost.setAttribute('opacity', String(Math.min(1, e * 2)));
      });
    }

    /**
     * 후보에 취소선이 그어지는 동안 패가 한 번 버티듯 눌렸다 편다 — "버린다,
     * 그러나 적어 둔 수는 그대로다". 두 몸짓이 한 뜻이라 시계를 하나만 돌린다.
     */
    async function playKeep(scene: RelaxShorterPathScene): Promise<void> {
      const tried = lastTried(scene);
      const node = refusedNode;
      if (tried === null || !node) return;
      const name = scene.edges[tried.edge].to;
      const token = tokenOf.get(name);
      const x = xOf.get(name) ?? 0;
      const y = yAt(distOf(scene, name) ?? 0);
      const strike = node.tick.strike;
      const sx = x + STRIKE_FROM;
      await animate(MS_KEEP, (e) => {
        token?.setAttribute(
          'transform',
          `translate(${x} ${y}) scale(1 ${1 - 0.07 * Math.sin(e * Math.PI)})`,
        );
        strike?.setAttribute('x2', String(sx + (STRIKE_TO - STRIKE_FROM) * e));
      });
    }

    /** 남은 자국이 한 번 밝아진다 — "전부 아래를 향한다". */
    async function playFinish(): Promise<void> {
      const streaks = streakNodes;
      if (streaks.length === 0) return;
      await animate(MS_FINISH, (e) => {
        const alpha = String(TRACE_ALPHA_DONE + 0.3 * Math.sin(e * Math.PI));
        for (const streak of streaks) streak.setAttribute('opacity', alpha);
      });
    }

    async function render(
      next: RelaxShorterPathScene,
      /** 이 조각은 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: RelaxShorterPathScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      drawStatic(next);
      if (!opts.animate) return;

      switch (next.step) {
        case 'settle':
          await playSettle(next);
          break;
        case 'write':
          await playWrite(next, my);
          break;
        case 'probe':
          await playProbe(my);
          break;
        case 'descend':
          await playDescend(next);
          break;
        case 'keep':
          await playKeep(next);
          break;
        case 'done':
          await playFinish();
          break;
        default:
          return;
      }

      if (!alive(my)) return;
      // 운동이 남긴 자취를 거두고 그 장면을 통째로 다시 세운다. 속성을 하나씩
      // 되돌리는 것보다 안전하고, 보간값의 끝자리가 문자열을 가르지도 않는다.
      // 그 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) dropFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
