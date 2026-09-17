/**
 * traverse-from-head-stage — 이 조각 전용 시각화.
 *
 * ── 형태가 어디서 나왔나
 *
 * 동사는 **따라간다** 이다. 그래서 화면의 주된 운동은 커서의 **이동**이고,
 * 색이 바뀌는 것은 이미 지나온 자리를 기록하는 부수적인 일이다.
 *
 *   · 노드는 나란히 놓지 않고 세로로 어긋나게 흩뿌린다 — 주소가 흩어져 있다는
 *     사실을 배치 자체가 말한다. 순서를 아는 것은 링크뿐이다.
 *   · 커서는 노드 아래 한 줄(rail)을 따라 옆으로 미끄러진다. 이동이 실제
 *     좌표 이동이라 "한 칸씩" 이 눈에 보인다.
 *   · 도착하면 커서와 노드 사이에 점선 하나가 자라 올라 "지금 여기" 를 못박는다.
 *   · 건너뛰기 시도는 커서에서 화살이 뻗다가 **되돌아온다**. 사라지는 것이
 *     아니라 되돌아오는 것이라, 실패가 운동으로 읽힌다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`markTarget()` · `moveCursor()` · `settle()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다
 * (S-scene).
 *
 * `drawScene` 은 장면 요소를 **통째로 다시 짓는다.** 노드 다섯에 링크 넷이라
 * 가볍고, 그렇게 하면 앞 걸음의 운동이 남긴 전환·대시 같은 인라인 자취가 하나도
 * 남지 않는다. 운동이 끝난 뒤에도 같은 함수를 한 번 더 불러 — 흐르며 선 화면과
 * 곧바로 세운 화면이 속성 하나까지 같아진다.
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 방금 밟은 걸음 하나만 흐르게 하고,
 * 거짓이면 타이머도 걸지 않고 곧바로 끝 자리에 세운다 — 되짚기가 그 길로 온다.
 *
 * ## CSS transition 을 쓰지 않는다
 *
 * 옛 화면은 인라인 `style.transition` 을 걸어 두고 값을 바꾸는 짜임이었다 (열두 곳).
 * 되짚기는 `animate:false` 로 오는데 전환은 **그 뒤에도 화면을 저 혼자 흘러가게**
 * 하므로, 되짚어 세운 화면이 나중에 저절로 바뀐다 — "그 걸음의 화면" 이라는 말이
 * 서지 않는다 (S-scene MUST NOT). 전부 `tween` 보간으로 옮겼다. 프레임마다 값을
 * 직접 적으므로 세대가 바뀌면 그 자리에서 멎는다.
 *
 * 벽시계는 `setTimeout` 으로 잰다. rAF 를 쓰지 않으므로 프레임이 없는 자리에서도
 * 돈다. 옮기면서 사라진 것이 둘 더 있다 — 전환을 걸기 전에 출발 자리를 확정하던
 * `flush()`(강제 재기) 와, 앞 걸음의 전환이 새 값에 묻지 않게 껐다 켜던
 * `transition = 'none'` 이다. 값을 직접 적는 짜임에는 끌 전환이 없다.
 *
 * 색은 전부 design-tokens 경유다 (S-view). 상태 어휘 매핑:
 *   지나온 자리 = itemSorted · 커서 = itemActive · 찾을 것/찾음 = accent(itemPivot)
 *   못 하는 일 = danger.
 */

import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { TraverseCaption, TraverseFromHeadScene, TraverseStep } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** marker id 충돌 방지 — 한 글에 조각이 여럿 박힐 수 있다. */
let mountSeq = 0;

const W = PIECE_CANVAS_W;
const H = 268;

const NODE_W = 64;
const NODE_H = 42;

/**
 * 노드 중심 좌표. 고르게 늘어놓지 않는다 — 흩어진 세로 위치가 곧
 * "주소를 셀 수 없다" 는 전제의 그림이다. 선언된 다섯 노드 기준.
 */
const NODE_POS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 70, y: 104 },
  { x: 188, y: 146 },
  { x: 300, y: 96 },
  { x: 416, y: 138 },
  { x: 528, y: 110 },
];

/** 커서가 미끄러지는 가로줄. 노드 아래 어디에도 걸리지 않는 높이. */
const RAIL_Y = 206;
const CHIP_W = 36;
const CHIP_H = 20;
/** 커서 코끝 (노드를 가리키는 꼭짓점) 의 y. */
const NOSE_Y = RAIL_Y - CHIP_H / 2 - 8;

const CAPTION_Y = 26;
const SIDE_PAD = 22;

const MARK_MS = 220;
const JUMP_OUT_MS = 260;
const JUMP_HOLD_MS = 150;
const JUMP_BACK_MS = 200;
/** 뻗음·머묾·되돌아옴을 한 시계에 담는다 — 한 뜻의 왕복이라 나누지 않는다. */
const JUMP_MS = JUMP_OUT_MS + JUMP_HOLD_MS + JUMP_BACK_MS;
/** 화살촉이 배어 나오는 짧은 동안. */
const JUMP_TIP_FADE_MS = 80;
const JUMP_REACH = 0.62;
const MOVE_MS = 380;
const LINK_MS = 150;
/** 떠날 때 앞 자리의 점선이 걷히는 동안. */
const CONNECTOR_FADE_MS = 90;
const PULSE_MS = 170;
/** 한 프레임. rAF 가 아니라 타이머로 잰다 — 프레임이 없는 자리에서도 돌아야 한다. */
const FRAME_MS = 16;

/** 찾을 것을 못박기 전, 점선 테가 아직 조여들지 않은 크기. */
const RING_OPEN_SCALE = 1.18;
/** 딱지가 내려앉기 전 떠 있는 높이. 정적 그리기와 운동이 같은 수를 본다. */
const LABEL_LIFT = 6;
/** 도착한 노드가 부풀었다 가라앉는 크기. */
const PULSE_SCALE = 1.08;

/** 표식 — 그림에 각인된 글자라 번역하지 않는다 (C10). */
const HEAD_MARK = 'head';
const NULL_MARK = 'NULL';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function posOf(i: number): { x: number; y: number } {
  return NODE_POS[i] ?? { x: SIDE_PAD + NODE_W / 2 + i * (NODE_W + 48), y: 104 };
}

function bottomOf(i: number): number {
  return posOf(i).y + NODE_H / 2;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeIn = (p: number): number => p ** 3;
/** 보간 끝자리를 자른다. 끝 프레임은 목표값을 그대로 쓰므로 여기를 지나지 않는다. */
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** 중심을 축으로 하는 확대/축소. 두 상태의 transform 구조가 같아야 보간된다. */
function scaleAt(x: number, y: number, s: number): string {
  return `translate(${x}, ${y}) scale(${s}) translate(${-x}, ${-y})`;
}

/** i 번 노드에서 i+1 번 노드로 가는 링크의 곡선. */
function linkPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const ax = a.x + NODE_W / 2;
  const bx = b.x - NODE_W / 2 - 9;
  const dx = Math.max(14, (bx - ax) * 0.42);
  return `M ${ax} ${a.y} C ${ax + dx} ${a.y}, ${bx - dx} ${b.y}, ${bx} ${b.y}`;
}

function lengthOf(path: SVGPathElement, fallback: number): number {
  if (typeof path.getTotalLength !== 'function') return fallback;
  const len = path.getTotalLength();
  return Number.isFinite(len) && len > 0 ? len : fallback;
}

/** 건너뛰기 화살이 커서에서 뻗어 나가는 자리. */
function rayStartX(index: number): number {
  return posOf(index).x + CHIP_W / 2 + 4;
}

/** 지금 세워 둔 장면 요소들. 걸음 함수가 이것을 잡고 흐르게 한다. */
type SceneParts = {
  nodes: { group: SVGGElement; rect: SVGRectElement }[];
  links: { trail: SVGPathElement; len: number }[];
  ringGroup: SVGGElement;
  targetLabel: SVGTextElement;
  jumpRay: SVGLineElement;
  jumpTip: SVGGElement;
  cursorGroup: SVGGElement;
  connector: SVGLineElement;
};

export const traverseFromHeadStageView: CanvasView = {
  canvas: { height: H },
  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const uid = `tfh${++mountSeq}`;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 깨어난 운동이 다음 세대의 화면에 손대지 않게 하는 빗장이다 — 되짚기가
     * 화면을 새로 세운 뒤에도 앞 걸음의 기다림이 이어 돌기 때문이다. 장면 요소를
     * 통째로 다시 짓는 짜임이라 옛 운동이 쥔 것은 이미 떨어져 나간 노드지만,
     * 캡션·셈처럼 계속 쓰는 요소가 있어 빗장이 필요하다.
     */
    let gen = 0;

    /** 이 세대의 운동이 아직 화면에 손대도 되나. */
    const alive = (myGen: number): boolean => !destroyed && myGen === gen;

    /**
     * 보간 한 마디. 이 조각의 모든 운동이 여기를 지난다.
     *
     * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). 프레임마다 값을 직접
     * 적으므로, 세대가 바뀌거나 떨어져 나가면 **그 자리에서 멎는다** — 전환처럼
     * 떨어져 나간 화면을 저 혼자 끌고 가지 않는다.
     *
     * `p` 가 1 인 마디는 보간값이 아니라 **정적 그리기가 쓰는 목표값을 글자 그대로**
     * 적는다. `a + (b - a) * 1` 이 `b` 와 글자가 다를 수 있어, 그러지 않으면 흘려
     * 세운 화면과 곧바로 세운 화면이 갈린다.
     *
     * `resolve` 를 `waiters` 에 담아 두므로 `destroy` 가 타이머를 거두어도 기다리던
     * 약속이 함께 풀린다 — 콜백 안에만 두면 취소된 tick 이 아예 안 불려 `render` 의
     * `await` 가 영영 안 돌아온다 (S-piece).
     */
    function tween(ms: number, myGen: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(myGen)) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(myGen)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = window.setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    const root = document.createElement('div');
    root.className = 'facet-traverse-from-head';
    root.style.display = 'flex';
    root.style.justifyContent = 'center';
    root.style.width = '100%';
    root.style.fontFamily = fonts.body;

    // 러너가 슬롯에 붙여 준 캔버스를 root 안으로 옮긴다.
    const canvas = params.canvas;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // ── 화살촉. 지나온 링크는 다른 촉을 쓴다 (marker 는 색을 물려받지 못한다).
    const defs = svg('defs');
    const arrowHead = (id: string, fill: string): SVGMarkerElement => {
      const marker = svg('marker', {
        id,
        viewBox: '0 0 10 10',
        refX: 9,
        refY: 5,
        markerWidth: 6,
        markerHeight: 6,
        orient: 'auto-start-reverse',
      });
      marker.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill }));
      return marker;
    };
    defs.appendChild(arrowHead(`${uid}-arrow`, colors.textMuted));
    defs.appendChild(arrowHead(`${uid}-arrow-trail`, colors.itemSorted));

    /** 걸음마다 통째로 갈아 끼우는 자리. 장면 요소는 전부 이 안에 산다. */
    const gScene = svg('g');

    // ── 읽는 줄 — 캡션과 옮김 횟수. 자리가 고정이라 한 번만 만든다.
    const caption = svg('text', {
      x: SIDE_PAD,
      y: CAPTION_Y,
      'text-anchor': 'start',
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    caption.style.fontFamily = fonts.body;

    const counter = svg('text', {
      x: W - SIDE_PAD,
      y: CAPTION_Y,
      'text-anchor': 'end',
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    counter.style.fontFamily = fonts.mono;

    canvas.append(defs, gScene, caption, counter);
    root.appendChild(canvas);
    container.appendChild(root);

    /** 지금 세워 둔 장면 요소. `drawScene` 이 갈아 끼운다. */
    let parts: SceneParts | null = null;

    const movesText = (n: number): string => tr('label.moves', 'moves {n}', { n });

    /** 한 걸음의 말. 장면은 무엇을 말할지만 주고 문자는 여기서 만든다 (C10). */
    function captionTextOf(c: TraverseCaption): string {
      switch (c.kind) {
        case 'want':
          return tr('caption.want', 'We need the node at index {i}.', { i: c.index });
        case 'noJump':
          return tr('caption.noJump', 'No address to compute, so the jump has nowhere to land.');
        case 'follow':
          return tr('caption.follow', 'Follow one link. That is the only move there is.');
        case 'arrived':
          return tr('caption.arrived', 'Index {i} took {n} moves through {v} nodes.', {
            i: c.index,
            n: c.hops,
            v: c.nodeCount,
          });
      }
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 장면 요소를 통째로 다시 짓는다 — 앞 걸음의 운동이 남긴 전환·대시 같은
     * 자취가 하나도 남지 않으므로, 어느 걸음에서 오든 같은 화면이 된다.
     */
    function drawScene(s: TraverseFromHeadScene): void {
      gScene.textContent = '';
      const gLinks = svg('g');
      const gNodes = svg('g');
      const gMarks = svg('g');
      const gJump = svg('g');
      const cursorGroup = svg('g');
      gScene.append(gLinks, gNodes, gMarks, gJump, cursorGroup);

      const links: SceneParts['links'] = [];
      const nodes: SceneParts['nodes'] = [];

      // 링크 — 밑칠(회색)과 지나온 자국(진한 색)을 겹쳐 둔다. 떠나온 노드의
      // 자국은 이미 다 자라 있다. **남는 강조**라 정적으로도 그린다.
      for (let i = 0; i < s.values.length - 1; i += 1) {
        const d = linkPath(posOf(i), posOf(i + 1));
        const base = svg('path', {
          d,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1.5,
          'marker-end': `url(#${uid}-arrow)`,
        });
        const trail = svg('path', {
          d,
          fill: 'none',
          stroke: colors.itemSorted,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
          'marker-end': `url(#${uid}-arrow-trail)`,
        });
        gLinks.append(base, trail);
        const len = lengthOf(trail, 160);
        trail.style.strokeDasharray = `${len}`;
        trail.style.strokeDashoffset = s.visited.includes(i) ? '0' : `${len}`;
        links.push({ trail, len });
      }

      // 노드 — 상자 + 값 + 인덱스. head 와 NULL 은 표식이라 그대로 새긴다.
      for (let i = 0; i < s.values.length; i += 1) {
        const { x, y } = posOf(i);
        const found = s.arrived && i === s.targetIndex;
        const walked = s.visited.includes(i);
        const group = svg('g', { transform: scaleAt(x, y, 1) });
        const rect = svg('rect', {
          x: x - NODE_W / 2,
          y: y - NODE_H / 2,
          width: NODE_W,
          height: NODE_H,
          rx: 6,
          fill: found ? colors.itemPivot : colors.itemDefault,
          // 찾은 자리와 지나온 자리는 테두리로 갈린다. 둘 다 남는 강조다.
          stroke: found ? colors.text : walked ? colors.itemSorted : colors.border,
          'stroke-width': found || walked ? 2 : 1.5,
        });
        const value = svg('text', {
          x,
          y: y + 5,
          'text-anchor': 'middle',
          'font-size': fontSizes.md,
          fill: colors.text,
        });
        value.style.fontFamily = fonts.mono;
        value.textContent = String(s.values[i]);

        const index = svg('text', {
          x,
          y: y - NODE_H / 2 - 8,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        index.style.fontFamily = fonts.mono;
        index.textContent = String(i);

        group.append(rect, value, index);
        gNodes.appendChild(group);
        nodes.push({ group, rect });

        if (i === 0) {
          const head = svg('text', {
            x,
            y: y - NODE_H / 2 - 22,
            'text-anchor': 'middle',
            'font-size': fontSizes.xs,
            fill: colors.text,
            'font-weight': '600',
          });
          head.style.fontFamily = fonts.mono;
          head.textContent = HEAD_MARK;
          gNodes.appendChild(head);
        }
        if (i === s.values.length - 1) {
          const stub = svg('line', {
            x1: x + NODE_W / 2,
            y1: y,
            x2: x + NODE_W / 2 + 16,
            y2: y,
            stroke: colors.textMuted,
            'stroke-width': 1.5,
            'marker-end': `url(#${uid}-arrow)`,
          });
          const nil = svg('text', {
            x: x + NODE_W / 2 + 24,
            y: y + 4,
            'text-anchor': 'start',
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          });
          nil.style.fontFamily = fonts.mono;
          nil.textContent = NULL_MARK;
          gNodes.append(stub, nil);
        }
      }

      // 찾을 것 — 점선 테와 딱지. 못박기 전에는 테가 벌어진 채 보이지 않는다.
      const t = posOf(s.targetIndex);
      const ringGroup = svg('g', {
        transform: scaleAt(t.x, t.y, s.marked ? 1 : RING_OPEN_SCALE),
      });
      ringGroup.style.opacity = s.marked ? '1' : '0';
      const ring = svg('rect', {
        x: t.x - NODE_W / 2 - 6,
        y: t.y - NODE_H / 2 - 6,
        width: NODE_W + 12,
        height: NODE_H + 12,
        rx: 9,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 2,
        // 닿고 나면 실선으로 굳는다 — 찾는 중과 찾은 뒤가 갈린다.
        'stroke-dasharray': s.arrived ? '0' : '5 4',
      });
      ringGroup.appendChild(ring);
      const targetLabel = svg('text', {
        x: t.x,
        y: t.y - NODE_H / 2 - 22,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: colors.text,
        transform: s.marked ? 'translate(0, 0)' : `translate(0, ${-LABEL_LIFT})`,
      });
      targetLabel.style.fontFamily = fonts.body;
      targetLabel.style.opacity = s.marked ? '1' : '0';
      targetLabel.textContent = tr('label.target', 'want this one');
      gMarks.append(ringGroup, targetLabel);

      // 건너뛰기 시도 — 커서에서 뻗어 나가는 화살. 되돌아오므로 남는 것이 없다.
      const start = rayStartX(s.cursor);
      const jumpRay = svg('line', {
        x1: start,
        y1: RAIL_Y,
        x2: t.x,
        y2: RAIL_Y,
        stroke: colors.danger,
        'stroke-width': 2,
      });
      jumpRay.style.opacity = '0';
      const jumpTip = svg('g', { transform: `translate(${start}, ${RAIL_Y})` });
      jumpTip.appendChild(svg('path', { d: 'M 0 0 L -9 -5 L -9 5 Z', fill: colors.danger }));
      jumpTip.style.opacity = '0';
      gJump.append(jumpRay, jumpTip);

      // 커서 — rail 위를 옆으로 미끄러지는 칩. 좌표는 국소, 이동은 translate.
      const c = posOf(s.cursor);
      cursorGroup.setAttribute('transform', `translate(${c.x}, 0)`);
      const chip = svg('rect', {
        x: -CHIP_W / 2,
        y: RAIL_Y - CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        rx: 5,
        fill: colors.itemActive,
      });
      const nose = svg('path', {
        d: `M -6 ${RAIL_Y - CHIP_H / 2} L 6 ${RAIL_Y - CHIP_H / 2} L 0 ${NOSE_Y} Z`,
        fill: colors.itemActive,
      });
      // 커서와 그 자리의 노드를 잇는 점선. "지금 여기" 를 못박는다.
      const connector = svg('line', {
        x1: 0,
        y1: bottomOf(s.cursor),
        x2: 0,
        y2: NOSE_Y,
        stroke: colors.itemActive,
        'stroke-width': 1.5,
        'stroke-dasharray': '3 3',
      });
      cursorGroup.append(connector, chip, nose);

      // 읽는 줄. 닿고 나면 셈이 굳는다.
      caption.textContent = s.caption === null ? '' : captionTextOf(s.caption);
      counter.textContent = movesText(s.hops);
      counter.setAttribute('fill', s.arrived ? colors.text : colors.textMuted);
      counter.setAttribute('font-weight', s.arrived ? '600' : '400');

      parts = {
        nodes,
        links,
        ringGroup,
        targetLabel,
        jumpRay,
        jumpTip,
        cursorGroup,
        connector,
      };
    }

    // ── 걸음 함수 ───────────────────────────────────────────────────────────
    //
    // 넷 다 `opts.animate` 가 참인 길에서만 불린다. 정적 그리기가 이미 끝 자리를
    // 세워 두었으므로, 운동은 **아직 오지 않은 만큼을 출발 자리로 되물리는** 것에서
    // 시작한다. 되물리는 일도 첫 프레임이 하므로 물린 자리가 따로 페인트되지 않는다
    // — 끝 자리가 번쩍이지 않는다.
    //
    // 넷 다 `tween` 을 **한 번만** 부른다. 왕복하는 운동(화살·부풂)도 시계를 나누지
    // 않고 `p` 를 접어 쓴다. 그래야 어느 걸음에서 오든 멎은 화면이 같다.

    /** 찾을 것을 못박는다. 테가 조여들며 딱지가 내려앉는다. */
    function runMark(s: TraverseFromHeadScene, myGen: number): Promise<void> {
      const p = parts;
      if (!p) return Promise.resolve();
      const { ringGroup, targetLabel } = p;
      const t = posOf(s.targetIndex);
      return tween(MARK_MS, myGen, (q) => {
        if (q >= 1) {
          // 정적 그리기가 `marked` 에 세우는 것과 글자까지 같은 자리.
          ringGroup.setAttribute('transform', scaleAt(t.x, t.y, 1));
          ringGroup.style.opacity = '1';
          targetLabel.setAttribute('transform', 'translate(0, 0)');
          targetLabel.style.opacity = '1';
          return;
        }
        const e = easeOut(q);
        ringGroup.setAttribute(
          'transform',
          scaleAt(t.x, t.y, round3(RING_OPEN_SCALE + (1 - RING_OPEN_SCALE) * e)),
        );
        ringGroup.style.opacity = String(round3(e));
        targetLabel.setAttribute('transform', `translate(0, ${round1(-LABEL_LIFT * (1 - e))})`);
        targetLabel.style.opacity = String(round3(e));
      });
    }

    /**
     * 곧장 건너뛰어 본다. 화살이 뻗다가 자리를 못 찾고 되돌아온다.
     *
     * 뻗음·머묾·되돌아옴이 한 뜻의 왕복이라 시계가 하나다. 선의 자람은 대시를
     * 밀지 않고 **끝점 `x2` 를 직접 옮긴다** — 곧은 선이라 그것이 더 짧고, 길이를
     * 재 볼 일도 없다. 남는 것이 없는 운동이라 끝에서는 멎은 화면의 값을 글자
     * 그대로 되돌린다.
     */
    function runJump(
      step: Extract<TraverseStep, { kind: 'jump' }>,
      myGen: number,
    ): Promise<void> {
      const p = parts;
      if (!p) return Promise.resolve();
      const { jumpRay, jumpTip } = p;
      // 멎은 화면이 쥐고 있던 값. 왕복이 끝나면 여기로 돌아온다.
      const restX1 = jumpRay.getAttribute('x1') ?? '';
      const restX2 = jumpRay.getAttribute('x2') ?? '';
      const restTip = jumpTip.getAttribute('transform') ?? '';

      const from = rayStartX(step.from);
      const reach = (posOf(step.to).x - from) * JUMP_REACH;

      return tween(JUMP_MS, myGen, (q) => {
        if (q >= 1) {
          jumpRay.setAttribute('x1', restX1);
          jumpRay.setAttribute('x2', restX2);
          jumpRay.style.opacity = '0';
          jumpTip.setAttribute('transform', restTip);
          jumpTip.style.opacity = '0';
          return;
        }
        const t = q * JUMP_MS;
        const back = clamp01((t - JUMP_OUT_MS - JUMP_HOLD_MS) / JUMP_BACK_MS);
        // 뻗을 때는 밀려 나가고(ease-out), 돌아올 때는 당겨 들어온다(ease-in).
        const e = back > 0 ? 1 - easeIn(back) : easeOut(clamp01(t / JUMP_OUT_MS));
        const tip = round1(from + reach * e);
        jumpRay.setAttribute('x1', String(from));
        jumpRay.setAttribute('x2', String(tip));
        jumpRay.style.opacity = '1';
        jumpTip.setAttribute('transform', `translate(${tip}, ${RAIL_Y})`);
        jumpTip.style.opacity = String(
          round3(back > 0 ? 1 - back : clamp01(t / JUMP_TIP_FADE_MS)),
        );
      });
    }

    /**
     * 링크 하나를 따라 옮겨 간다. 자국이 자라고 커서가 미끄러진다.
     *
     * 출발 자리는 `step.from` 이 싣고 있다 — `prev` 에서 꺼내면 "`prev` 는 고르는
     * 데만" 을 어긴다 (S-scene).
     *
     * 미끄러짐과 그 뒤의 이음이 한 걸음의 두 마디라 시계가 하나다. 마디가 갈리는
     * 자리에서 셈(`counter`) 도 함께 굳는데, 프레임마다 그 값을 다시 적으므로 어느
     * 프레임에서 멎어도 화면이 앞뒤가 맞는다. 옛 화면은 여기서 전환을 껐다 켜야
     * 했다 (`transition = 'none'`) — 앞 마디의 흐릿해짐이 새 값에 묻지 않게 하려던
     * 손짚기였고, 값을 직접 적는 지금은 끌 전환이 없다.
     */
    function runMove(
      s: TraverseFromHeadScene,
      step: Extract<TraverseStep, { kind: 'move' }>,
      myGen: number,
    ): Promise<void> {
      const p = parts;
      if (!p) return Promise.resolve();
      const { connector, cursorGroup } = p;
      const from = step.from;
      const to = s.cursor;
      const link = p.links[Math.min(from, to)] ?? null;
      const fromX = posOf(from).x;
      const toX = posOf(to).x;
      const fromFoot = bottomOf(from);
      const toFoot = bottomOf(to);
      const reach = Math.max(1, NOSE_Y - toFoot);
      const total = MOVE_MS + LINK_MS;

      return tween(total, myGen, (q) => {
        if (q >= 1) {
          cursorGroup.setAttribute('transform', `translate(${toX}, 0)`);
          connector.setAttribute('y1', String(toFoot));
          // 운동이 얹은 인라인 값을 걷는다 — 점선은 속성이 쥔 '3 3' 로 돌아온다.
          connector.style.removeProperty('opacity');
          connector.style.removeProperty('stroke-dasharray');
          connector.style.removeProperty('stroke-dashoffset');
          if (link) link.trail.style.strokeDashoffset = '0';
          counter.textContent = movesText(s.hops);
          return;
        }
        const t = q * total;
        const slide = easeOut(clamp01(t / MOVE_MS));
        cursorGroup.setAttribute(
          'transform',
          `translate(${round1(fromX + (toX - fromX) * slide)}, 0)`,
        );
        if (link) link.trail.style.strokeDashoffset = String(round1(link.len * (1 - slide)));

        if (t < MOVE_MS) {
          // 첫 마디 — 앞 자리의 점선이 걷히고 셈은 아직 떠나기 전의 것이다.
          connector.setAttribute('y1', String(fromFoot));
          connector.style.opacity = String(round3(1 - clamp01(t / CONNECTOR_FADE_MS)));
          connector.style.removeProperty('stroke-dasharray');
          connector.style.removeProperty('stroke-dashoffset');
          counter.textContent = movesText(Math.max(0, s.hops - 1));
        } else {
          // 둘째 마디 — 도착한 노드와 커서를 잇는 점선이 아래에서 자라 오른다.
          const grow = easeOut(clamp01((t - MOVE_MS) / LINK_MS));
          connector.setAttribute('y1', String(toFoot));
          connector.style.opacity = '1';
          connector.style.strokeDasharray = String(reach);
          connector.style.strokeDashoffset = String(round1(reach * (1 - grow)));
          counter.textContent = movesText(s.hops);
        }
      });
    }

    /** 도착. 찾던 노드가 한 번 부풀었다 가라앉는다. 한 뜻의 왕복이라 시계가 하나다. */
    function runArrive(s: TraverseFromHeadScene, myGen: number): Promise<void> {
      const p = parts;
      if (!p) return Promise.resolve();
      const node = p.nodes[s.targetIndex];
      if (!node) return Promise.resolve();
      const group = node.group;
      const at = posOf(s.targetIndex);
      return tween(PULSE_MS * 2, myGen, (q) => {
        if (q >= 1) {
          group.setAttribute('transform', scaleAt(at.x, at.y, 1));
          return;
        }
        // `p` 를 0→1→0 으로 접는다. 어느 프레임에서 멎어도 부푼 만큼이 한 값이다.
        const fold = q <= 0.5 ? easeOut(q * 2) : 1 - easeOut((q - 0.5) * 2);
        group.setAttribute('transform', scaleAt(at.x, at.y, round3(1 + (PULSE_SCALE - 1) * fold)));
      });
    }

    async function render(
      next: TraverseFromHeadScene,
      /** 이 조각은 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: TraverseFromHeadScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const myGen = gen;
      drawScene(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      // 방금 밟은 걸음 하나만 흐르게 한다. 걸음을 건너뛰어 온 길은 `animate` 가
      // 거짓이라 위에서 이미 돌아갔고, 출발 그림은 걸음 함수가 장면에서 스스로
      // 세우므로 `prev` 와 견줄 일이 없다.
      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'mark':
          await runMark(next, myGen);
          break;
        case 'jump':
          await runJump(step, myGen);
          break;
        case 'move':
          await runMove(next, step, myGen);
          break;
        case 'arrive':
          await runArrive(next, myGen);
          break;
      }

      // 운동이 끝나면 그 장면을 통째로 다시 세운다 — 흐르며 선 화면과 곧바로 세운
      // 화면이 인라인 자취 하나까지 같아진다 (S-scene).
      if (!alive(myGen)) return;
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) window.clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        parts = null;
        if (root.parentElement) root.remove();
      },
    };
  },
};
