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
 * ── 계약 (projector 가 부르는 메서드)
 *
 *   setData(values, targetIndex) · setCaption(text) · markTarget(i)
 *   attemptJump(from, to) · moveCursor(from, to, hops) · settle(index, hops)
 *   rewind()
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

type NodeParts = {
  group: SVGGElement;
  rect: SVGRectElement;
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

    const timers = new Set<number>();
    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          resolve();
        }, Math.max(0, ms));
        timers.add(id);
      });
    const nextFrame = (): Promise<void> =>
      new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

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
    canvas.appendChild(defs);

    const gLinks = svg('g');
    const gNodes = svg('g');
    const gMarks = svg('g');
    const gJump = svg('g');
    const gCursor = svg('g');
    canvas.append(gLinks, gNodes, gMarks, gJump, gCursor);

    // ── 읽는 줄 — 캡션, 옮김 횟수, 각주. 데이터와 무관해 한 번만 만든다.
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

    canvas.append(caption, counter);

    root.appendChild(canvas);
    container.appendChild(root);

    // ── 장면 상태
    let values: number[] = [];
    let targetIndex = 0;
    let nodes: NodeParts[] = [];
    let links: { trail: SVGPathElement; len: number }[] = [];
    let ring: SVGRectElement | null = null;
    let ringGroup: SVGGElement | null = null;
    let targetLabel: SVGTextElement | null = null;
    let jumpRay: SVGLineElement | null = null;
    let jumpTip: SVGGElement | null = null;
    let connector: SVGLineElement | null = null;

    const movesText = (n: number): string => tr('label.moves', 'moves {n}', { n });

    function bottomOf(i: number): number {
      return posOf(i).y + NODE_H / 2;
    }

    function build(): void {
      // 되감기는 애니메이션이 아니라 다시 세우는 일이다 — 남은 transition 을 끊는다.
      gCursor.style.transition = '';
      gLinks.textContent = '';
      gNodes.textContent = '';
      gMarks.textContent = '';
      gJump.textContent = '';
      gCursor.textContent = '';
      nodes = [];
      links = [];

      // 링크 — 밑칠(회색)과 지나온 자국(진한 색)을 겹쳐 둔다. 자국은 커서가
      // 지나가는 동안 dashoffset 으로 자라난다.
      for (let i = 0; i < values.length - 1; i += 1) {
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
        trail.style.strokeDashoffset = `${len}`;
        links.push({ trail, len });
      }

      // 노드 — 상자 + 값 + 인덱스. head 와 NULL 은 표식이라 그대로 새긴다.
      for (let i = 0; i < values.length; i += 1) {
        const { x, y } = posOf(i);
        const group = svg('g', { transform: scaleAt(x, y, 1) });
        const rect = svg('rect', {
          x: x - NODE_W / 2,
          y: y - NODE_H / 2,
          width: NODE_W,
          height: NODE_H,
          rx: 6,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        const value = svg('text', {
          x,
          y: y + 5,
          'text-anchor': 'middle',
          'font-size': fontSizes.md,
          fill: colors.text,
        });
        value.style.fontFamily = fonts.mono;
        value.textContent = String(values[i]);

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
        if (i === values.length - 1) {
          const tail = posOf(i);
          const stub = svg('line', {
            x1: tail.x + NODE_W / 2,
            y1: tail.y,
            x2: tail.x + NODE_W / 2 + 16,
            y2: tail.y,
            stroke: colors.textMuted,
            'stroke-width': 1.5,
            'marker-end': `url(#${uid}-arrow)`,
          });
          const nil = svg('text', {
            x: tail.x + NODE_W / 2 + 24,
            y: tail.y + 4,
            'text-anchor': 'start',
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          });
          nil.style.fontFamily = fonts.mono;
          nil.textContent = NULL_MARK;
          gNodes.append(stub, nil);
        }
      }

      // 찾을 것 — 점선 테와 딱지. markTarget 에서 자리를 잡으며 나타난다.
      const t = posOf(targetIndex);
      ringGroup = svg('g', { transform: scaleAt(t.x, t.y, 1.18) });
      ringGroup.style.opacity = '0';
      ring = svg('rect', {
        x: t.x - NODE_W / 2 - 6,
        y: t.y - NODE_H / 2 - 6,
        width: NODE_W + 12,
        height: NODE_H + 12,
        rx: 9,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 2,
        'stroke-dasharray': '5 4',
      });
      ringGroup.appendChild(ring);
      targetLabel = svg('text', {
        x: t.x,
        y: t.y - NODE_H / 2 - 22,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: colors.text,
        transform: 'translate(0, -6)',
      });
      targetLabel.style.fontFamily = fonts.body;
      targetLabel.style.opacity = '0';
      targetLabel.textContent = tr('label.target', 'want this one');
      gMarks.append(ringGroup, targetLabel);

      // 건너뛰기 시도 — 커서에서 뻗어 나가는 화살. 처음엔 길이 0.
      const from = posOf(0);
      jumpRay = svg('line', {
        x1: from.x + CHIP_W / 2 + 4,
        y1: RAIL_Y,
        x2: t.x,
        y2: RAIL_Y,
        stroke: colors.danger,
        'stroke-width': 2,
      });
      jumpRay.style.opacity = '0';
      jumpTip = svg('g', { transform: `translate(${from.x + CHIP_W / 2 + 4}, ${RAIL_Y})` });
      jumpTip.appendChild(
        svg('path', { d: 'M 0 0 L -9 -5 L -9 5 Z', fill: colors.danger }),
      );
      jumpTip.style.opacity = '0';
      gJump.append(jumpRay, jumpTip);

      // 커서 — rail 위를 옆으로 미끄러지는 칩. 좌표는 국소, 이동은 translate.
      gCursor.setAttribute('transform', `translate(${from.x}, 0)`);
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
      connector = svg('line', {
        x1: 0,
        y1: bottomOf(0),
        x2: 0,
        y2: NOSE_Y,
        stroke: colors.itemActive,
        'stroke-width': 1.5,
        'stroke-dasharray': '3 3',
      });
      gCursor.append(connector, chip, nose);

      counter.textContent = movesText(0);
      counter.setAttribute('fill', colors.textMuted);
      counter.setAttribute('font-weight', '400');
    }

    function markVisited(i: number): void {
      const node = nodes[i];
      if (!node) return;
      node.rect.setAttribute('stroke', colors.itemSorted);
      node.rect.setAttribute('stroke-width', '2');
    }

    // ── 아직 데이터가 오지 않아도 화면은 비어 있지 않다 (러너 밖 mount).
    const seed = (params.initialData ?? {}) as { values?: unknown; targetIndex?: unknown };
    if (Array.isArray(seed.values)) {
      values = seed.values.filter((v): v is number => typeof v === 'number');
      targetIndex = typeof seed.targetIndex === 'number' ? seed.targetIndex : 0;
      build();
    }

    return {
      destroy() {
        for (const id of timers) window.clearTimeout(id);
        timers.clear();
        if (root.parentElement) root.remove();
      },

      setData(nextValues: number[], nextTarget: number) {
        values = nextValues;
        targetIndex = nextTarget;
        build();
      },

      setCaption(text: string) {
        caption.textContent = text;
      },

      /** 찾을 것을 못박는다. 테가 조여들며 딱지가 내려앉는다. */
      async markTarget(index: number) {
        const node = nodes[index];
        if (!ringGroup || !targetLabel || !node) return;
        const p = posOf(index);
        await nextFrame();
        ringGroup.style.transition = `transform ${MARK_MS}ms ease-out, opacity ${MARK_MS}ms ease-out`;
        ringGroup.setAttribute('transform', scaleAt(p.x, p.y, 1));
        ringGroup.style.opacity = '1';
        targetLabel.style.transition = `transform ${MARK_MS}ms ease-out, opacity ${MARK_MS}ms ease-out`;
        targetLabel.setAttribute('transform', 'translate(0, 0)');
        targetLabel.style.opacity = '1';
        await wait(MARK_MS + 20);
      },

      /** 곧장 건너뛰어 본다. 화살이 뻗다가 자리를 못 찾고 되돌아온다. */
      async attemptJump(from: number, to: number) {
        if (!jumpRay || !jumpTip) return;
        const start = posOf(from).x + CHIP_W / 2 + 4;
        const end = posOf(to).x;
        const reach = start + (end - start) * JUMP_REACH;
        jumpRay.setAttribute('x1', String(start));
        jumpRay.setAttribute('x2', String(end));
        const span = Math.max(1, end - start);
        jumpRay.style.strokeDasharray = `${span}`;
        jumpRay.style.strokeDashoffset = `${span}`;
        jumpRay.style.opacity = '1';
        jumpTip.setAttribute('transform', `translate(${start}, ${RAIL_Y})`);
        await nextFrame();

        jumpRay.style.transition = `stroke-dashoffset ${JUMP_OUT_MS}ms ease-out`;
        jumpRay.style.strokeDashoffset = `${span * (1 - JUMP_REACH)}`;
        jumpTip.style.transition = `transform ${JUMP_OUT_MS}ms ease-out, opacity 80ms linear`;
        jumpTip.setAttribute('transform', `translate(${reach}, ${RAIL_Y})`);
        jumpTip.style.opacity = '1';
        await wait(JUMP_OUT_MS + JUMP_HOLD_MS);

        jumpRay.style.transition = `stroke-dashoffset ${JUMP_BACK_MS}ms ease-in`;
        jumpRay.style.strokeDashoffset = `${span}`;
        jumpTip.style.transition = `transform ${JUMP_BACK_MS}ms ease-in, opacity ${JUMP_BACK_MS}ms ease-in`;
        jumpTip.setAttribute('transform', `translate(${start}, ${RAIL_Y})`);
        jumpTip.style.opacity = '0';
        await wait(JUMP_BACK_MS);
        jumpRay.style.opacity = '0';
      },

      /** 링크 하나를 따라 옮겨 간다. 자국이 자라고 커서가 미끄러진다. */
      async moveCursor(from: number, to: number, hops: number) {
        if (connector) {
          connector.style.transition = 'opacity 90ms linear';
          connector.style.opacity = '0';
        }
        markVisited(from);
        const link = links[Math.min(from, to)];
        if (link) {
          link.trail.style.transition = `stroke-dashoffset ${MOVE_MS}ms cubic-bezier(0.35, 0.6, 0.3, 1)`;
          link.trail.style.strokeDashoffset = '0';
        }
        gCursor.style.transition = `transform ${MOVE_MS}ms cubic-bezier(0.35, 0.6, 0.3, 1)`;
        gCursor.setAttribute('transform', `translate(${posOf(to).x}, 0)`);
        await wait(MOVE_MS);

        counter.textContent = movesText(hops);

        // 도착한 노드와 커서를 점선으로 잇는다 — 지금 서 있는 자리.
        if (connector) {
          const len = Math.max(1, NOSE_Y - bottomOf(to));
          connector.style.transition = 'none';
          connector.setAttribute('y1', String(bottomOf(to)));
          connector.style.strokeDasharray = `${len}`;
          connector.style.strokeDashoffset = `${len}`;
          connector.style.opacity = '1';
          await nextFrame();
          connector.style.transition = `stroke-dashoffset ${LINK_MS}ms ease-out`;
          connector.style.strokeDashoffset = '0';
          await wait(LINK_MS);
          connector.style.strokeDasharray = '3 3';
          connector.style.strokeDashoffset = '0';
        }
      },

      /** 도착. 찾던 노드가 한 번 부풀었다 가라앉고 셈이 굳는다. */
      async settle(index: number, hops: number) {
        const node = nodes[index];
        counter.textContent = movesText(hops);
        counter.setAttribute('fill', colors.text);
        counter.setAttribute('font-weight', '600');
        if (ring) ring.setAttribute('stroke-dasharray', '0');
        if (!node) return;
        const p = posOf(index);
        node.rect.setAttribute('fill', colors.itemPivot);
        node.rect.setAttribute('stroke', colors.text);
        node.rect.setAttribute('stroke-width', '2');
        node.group.style.transition = `transform ${PULSE_MS}ms ease-out`;
        node.group.setAttribute('transform', scaleAt(p.x, p.y, 1.08));
        await wait(PULSE_MS);
        node.group.setAttribute('transform', scaleAt(p.x, p.y, 1));
        await wait(PULSE_MS);
      },

      /** 처음 상태로. 되짚어 보려는 사람을 위해 화면을 통째로 다시 세운다. */
      rewind() {
        build();
      },
    };
  },
};
