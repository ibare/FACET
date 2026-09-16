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
const JUMP_REACH = 0.62;
const MOVE_MS = 380;
const LINK_MS = 150;
const PULSE_MS = 170;

/** 찾을 것을 못박기 전, 점선 테가 아직 조여들지 않은 크기. */
const RING_OPEN_SCALE = 1.18;
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

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = window.setTimeout(() => {
          timers.delete(id);
          finish();
        }, Math.max(0, ms));
        timers.add(id);
      });

    /** 이 세대의 운동이 아직 화면에 손대도 되나. */
    const alive = (myGen: number): boolean => !destroyed && myGen === gen;

    /**
     * 지금 세운 자리를 브라우저가 한 번 재게 한다.
     *
     * 정적으로 세운 직후에 곧바로 전환을 걸면 두 값이 한 프레임 안에 겹쳐 들어가
     * 운동이 통째로 사라진다. 여기서 한 번 재게 해 출발 자리를 확정한다.
     * `opts.animate` 인 길에서만 부르므로 되짚기에는 끼지 않는다.
     */
    const flush = (): void => {
      canvas.getBoundingClientRect();
    };

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
        transform: s.marked ? 'translate(0, 0)' : 'translate(0, -6)',
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
    // 시작한다. 물리고 곧바로 전환을 거는 사이에는 타이머도 프레임도 없어 페인트가
    // 끼지 않는다 — 끝 자리가 번쩍이지 않는다.

    /** 찾을 것을 못박는다. 테가 조여들며 딱지가 내려앉는다. */
    async function runMark(s: TraverseFromHeadScene): Promise<void> {
      const p = parts;
      if (!p) return;
      const t = posOf(s.targetIndex);
      p.ringGroup.setAttribute('transform', scaleAt(t.x, t.y, RING_OPEN_SCALE));
      p.ringGroup.style.opacity = '0';
      p.targetLabel.setAttribute('transform', 'translate(0, -6)');
      p.targetLabel.style.opacity = '0';
      flush();

      const ease = `${MARK_MS}ms ease-out`;
      p.ringGroup.style.transition = `transform ${ease}, opacity ${ease}`;
      p.ringGroup.setAttribute('transform', scaleAt(t.x, t.y, 1));
      p.ringGroup.style.opacity = '1';
      p.targetLabel.style.transition = `transform ${ease}, opacity ${ease}`;
      p.targetLabel.setAttribute('transform', 'translate(0, 0)');
      p.targetLabel.style.opacity = '1';
      await wait(MARK_MS + 20);
    }

    /** 곧장 건너뛰어 본다. 화살이 뻗다가 자리를 못 찾고 되돌아온다. */
    async function runJump(
      step: Extract<TraverseStep, { kind: 'jump' }>,
      myGen: number,
    ): Promise<void> {
      const p = parts;
      if (!p) return;
      const start = rayStartX(step.from);
      const end = posOf(step.to).x;
      const reach = start + (end - start) * JUMP_REACH;
      const span = Math.max(1, end - start);

      p.jumpRay.setAttribute('x1', String(start));
      p.jumpRay.setAttribute('x2', String(end));
      p.jumpRay.style.strokeDasharray = `${span}`;
      p.jumpRay.style.strokeDashoffset = `${span}`;
      p.jumpRay.style.opacity = '1';
      p.jumpTip.setAttribute('transform', `translate(${start}, ${RAIL_Y})`);
      flush();

      p.jumpRay.style.transition = `stroke-dashoffset ${JUMP_OUT_MS}ms ease-out`;
      p.jumpRay.style.strokeDashoffset = `${span * (1 - JUMP_REACH)}`;
      p.jumpTip.style.transition = `transform ${JUMP_OUT_MS}ms ease-out, opacity 80ms linear`;
      p.jumpTip.setAttribute('transform', `translate(${reach}, ${RAIL_Y})`);
      p.jumpTip.style.opacity = '1';
      await wait(JUMP_OUT_MS + JUMP_HOLD_MS);
      if (!alive(myGen)) return;

      p.jumpRay.style.transition = `stroke-dashoffset ${JUMP_BACK_MS}ms ease-in`;
      p.jumpRay.style.strokeDashoffset = `${span}`;
      p.jumpTip.style.transition = `transform ${JUMP_BACK_MS}ms ease-in, opacity ${JUMP_BACK_MS}ms ease-in`;
      p.jumpTip.setAttribute('transform', `translate(${start}, ${RAIL_Y})`);
      p.jumpTip.style.opacity = '0';
      await wait(JUMP_BACK_MS);
    }

    /**
     * 링크 하나를 따라 옮겨 간다. 자국이 자라고 커서가 미끄러진다.
     *
     * 출발 자리는 `step.from` 이 싣고 있다 — `prev` 에서 꺼내면 "`prev` 는 고르는
     * 데만" 을 어긴다 (S-scene).
     */
    async function runMove(
      s: TraverseFromHeadScene,
      step: Extract<TraverseStep, { kind: 'move' }>,
      myGen: number,
    ): Promise<void> {
      const p = parts;
      if (!p) return;
      const from = step.from;
      const to = s.cursor;
      const link = p.links[Math.min(from, to)];

      // 아직 떠나기 전으로 되물린다 — 커서도, 자국도, 셈도.
      p.cursorGroup.setAttribute('transform', `translate(${posOf(from).x}, 0)`);
      p.connector.setAttribute('y1', String(bottomOf(from)));
      if (link) link.trail.style.strokeDashoffset = `${link.len}`;
      counter.textContent = movesText(Math.max(0, s.hops - 1));
      flush();

      // 점선이 걷히고, 자국이 자라고, 커서가 옆 노드로 미끄러진다.
      p.connector.style.transition = 'opacity 90ms linear';
      p.connector.style.opacity = '0';
      if (link) {
        link.trail.style.transition = `stroke-dashoffset ${MOVE_MS}ms cubic-bezier(0.35, 0.6, 0.3, 1)`;
        link.trail.style.strokeDashoffset = '0';
      }
      p.cursorGroup.style.transition = `transform ${MOVE_MS}ms cubic-bezier(0.35, 0.6, 0.3, 1)`;
      p.cursorGroup.setAttribute('transform', `translate(${posOf(to).x}, 0)`);
      await wait(MOVE_MS);
      if (!alive(myGen)) return;

      counter.textContent = movesText(s.hops);

      // 도착한 노드와 커서를 점선으로 잇는다 — 지금 서 있는 자리.
      const len = Math.max(1, NOSE_Y - bottomOf(to));
      p.connector.style.transition = 'none';
      p.connector.setAttribute('y1', String(bottomOf(to)));
      p.connector.style.strokeDasharray = `${len}`;
      p.connector.style.strokeDashoffset = `${len}`;
      p.connector.style.opacity = '1';
      flush();
      p.connector.style.transition = `stroke-dashoffset ${LINK_MS}ms ease-out`;
      p.connector.style.strokeDashoffset = '0';
      await wait(LINK_MS);
    }

    /** 도착. 찾던 노드가 한 번 부풀었다 가라앉는다. */
    async function runArrive(s: TraverseFromHeadScene, myGen: number): Promise<void> {
      const p = parts;
      if (!p) return;
      const node = p.nodes[s.targetIndex];
      if (!node) return;
      const q = posOf(s.targetIndex);
      flush();
      node.group.style.transition = `transform ${PULSE_MS}ms ease-out`;
      node.group.setAttribute('transform', scaleAt(q.x, q.y, PULSE_SCALE));
      await wait(PULSE_MS);
      if (!alive(myGen)) return;
      node.group.setAttribute('transform', scaleAt(q.x, q.y, 1));
      await wait(PULSE_MS);
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

      if (!opts.animate) return;

      // 방금 밟은 걸음 하나만 흐르게 한다. 걸음을 건너뛰어 온 길은 `animate` 가
      // 거짓이라 위에서 이미 돌아갔고, 출발 그림은 걸음 함수가 장면에서 스스로
      // 세우므로 `prev` 와 견줄 일이 없다.
      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'mark':
          await runMark(next);
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
