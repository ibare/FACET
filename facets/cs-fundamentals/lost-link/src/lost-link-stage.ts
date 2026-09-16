/**
 * lost-link-stage — 연결 유실 조각의 전용 stage view.
 *
 * ── 형태가 어디서 왔는가
 *
 * 동사는 "떨어져 나간다" 다. 그래서 이 화면의 뼈대는 **가로줄 하나와 그 아래의
 * 빈 자리**다. 위쪽 줄은 head 에서 화살표를 따라 닿을 수 있는 곳이고, 점선
 * 아래는 메모리에는 남았지만 들어갈 길이 없는 곳이다. 노드는 사라지지 않는다 —
 * 줄에서 떨어져 아래로 기울며 내려앉을 뿐이다.
 *
 * 세 가지가 실제로 **움직인다**. 색 전환이 아니다.
 *   - 새 노드가 위에서 내려와 줄 위에 뜬다
 *   - 화살표 끝이 원래 겨누던 노드에서 다른 노드로 **건너간다**
 *   - 붙들어 주는 화살표를 잃은 무리가 왼쪽을 축으로 기울며 떨어진다
 *
 * ── 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`stageNode()` · `moveLink()` · `detach()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다
 * (S-scene).
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 장면이 실어 보낸 `mark` 하나만
 * 프레임으로 흐르게 하고, 거짓이면 곧바로 끝 자리에 세운다 — 되짚기와 첫 그림이
 * 그 길이다. `prev` 는 들추지 않는다. 출발 배치는 `mark.was` 가 싣고 있다.
 *
 * ── 닿을 수 없음은 장면이 말한다
 *
 * 옛 화면은 매 프레임 head 에서 화살표를 따라가 닿는 집합을 스스로 구했고, 그
 * 셈이 화살표의 **애니메이션 진행도**를 탔다. 이제 닿음은 `scene.reachable` 이
 * 말하고 정적으로 그릴 때도 그것으로 칠한다. 건너는 **중간**에만 그리는 쪽이
 * "아직 옛 목표를 겨눈다" 를 얹어 다시 셈한다.
 *
 * 화면 문자는 캡션과 띠 라벨 둘뿐이고 전부 `params.t` 로 만든다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type Palette,
  type CanvasView,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import {
  linkTargets,
  reachableFrom,
  type LostLinkCaption,
  type LostLinkPlacement,
  type LostLinkScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 좌표계. 폭은 조각 공통값이고 세로는 내용이 정한다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 336;

const NODE_W = 56;
const NODE_H = 36;
const SLOT_X0 = 84;
const SLOT_PITCH = 90;

/** 닿을 수 있는 줄. */
const LANE_Y = 116;
/** 아직 사슬에 들지 못한 새 노드가 뜨는 자리 — 줄 위. */
const STAGE_Y = 40;
/** 화면 밖 위쪽. 새 노드는 여기서 내려오고, 되돌릴 때 여기로 올라간다. */
const OFFSCREEN_Y = -60;
/** 닿을 수 있는 곳과 없는 곳의 경계. */
const BOUNDARY_Y = 190;
/** 떨어져 나간 무리가 내려앉는 자리. */
const FALLEN_Y = 224;
const FALL_DRIFT_X = 18;
const FALL_TILT_DEG = -6;

const HEAD_LABEL_X = 20;
const HEAD_ARROW_X = 58;
const CAPTION_Y = 286;
const CAPTION_LINE_H = 18;

const ARROW_HEAD = 7;
const ARROW_GAP = 5;

const DUR_STAGE = 520;
const DUR_LINK = 480;
const DUR_FALL = 720;
const DUR_SETTLE = 620;
const DUR_REWIND = 560;

/** 한 줄에 담을 글자 폭 예산. 한글은 두 칸, 라틴은 한 칸으로 센다. */
const CAPTION_BUDGET = 72;

type Point = { x: number; y: number };

/**
 * 한 번 그릴 때의 화면 상태.
 *
 * 장면은 차례만 말하므로 자리는 여기서 셈해 담는다. 운동 중에는 프레임마다 새로
 * 만들어지고, 멎어 있을 때는 `restBoard` 가 장면에서 곧바로 만든다.
 */
type Board = {
  /** 노드의 왼쪽 위 모서리. 여기 없는 노드는 화면에 서지 않는다. */
  pos: Map<string, Point>;
  /** 줄에서 떨어져 나간 노드들. 기울고 흐려진다. */
  fallen: Set<string>;
  /** 떨어진 무리가 기운 각도. */
  tilt: number;
  /** 줄 위에 떠 있는 노드. 아무도 가리키지 않으면 점선으로 선다. */
  staged: string | null;
  /** 건너는 중인 화살표. 멎어 있으면 `null`. */
  crossing: { from: string; was: string | null; prog: number } | null;
};

function slotX(index: number): number {
  return SLOT_X0 + index * SLOT_PITCH;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

function easeInQuad(p: number): number {
  return p * p;
}

function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 글자 폭 어림 — 한글 한 자는 라틴 두 자 몫을 먹는다. */
function visualWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x1100 ? 2 : 1;
  return w;
}

/** 캡션이 캔버스를 넘지 않게 낱말 경계에서 두 줄까지 접는다. */
function wrapCaption(text: string): string[] {
  if (visualWidth(text) <= CAPTION_BUDGET) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (visualWidth(next) > CAPTION_BUDGET && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

/**
 * 배치를 자리로 옮긴다. 장면은 차례만 말하고 자리는 여기서 캔버스로 역산한다.
 *
 * 줄 안의 노드는 제 차례의 칸에, 떨어진 노드는 **떨어질 때 있던 칸** 아래로,
 * 줄 위에 뜬 노드는 자기가 들어갈 자리 위에 선다.
 */
function layout(place: LostLinkPlacement): Map<string, Point> {
  const pos = new Map<string, Point>();
  place.lane.forEach((id, i) => pos.set(id, { x: slotX(i), y: LANE_Y }));
  for (const f of place.fallen) pos.set(f.id, { x: slotX(f.laneIndex) + FALL_DRIFT_X, y: FALLEN_Y });
  if (place.staged) {
    const anchor = place.lane.indexOf(place.staged.afterId);
    pos.set(place.staged.id, { x: slotX(anchor + 1), y: STAGE_Y });
  }
  return pos;
}

function tiltOf(place: LostLinkPlacement): number {
  return place.fallen.length > 0 ? FALL_TILT_DEG : 0;
}

/** 멎어 있을 때의 화면 상태. 장면 하나로 곧바로 만들어진다. */
function restBoard(scene: LostLinkScene): Board {
  return {
    pos: layout(scene.place),
    fallen: new Set(scene.place.fallen.map((f) => f.id)),
    tilt: tiltOf(scene.place),
    staged: scene.place.staged?.id ?? null,
    crossing: null,
  };
}

/** 배치가 달라지는 걸음마다의 시간과 결. */
const PLACE_FLOW: Record<
  'staged' | 'detached' | 'settled' | 'rewound',
  { ms: number; ease: (p: number) => number }
> = {
  staged: { ms: DUR_STAGE, ease: easeOutCubic },
  detached: { ms: DUR_FALL, ease: easeInQuad },
  settled: { ms: DUR_SETTLE, ease: easeOutCubic },
  rewound: { ms: DUR_REWIND, ease: easeOutCubic },
};

export const lostLinkStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme ?? 'light');

    const svg = params.canvas;
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('role', 'img');
    svg.style.fontFamily = fonts.body;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장. `render` 가 불릴 때마다 오르고, 깨어난 걸음 함수는 자기 세대를
     * 확인한 뒤에만 그린다.
     *
     * 되짚기는 `opts.animate` 가 거짓으로 오므로 프레임을 아예 걸지 않는 것이
     * 첫 번째 빗장이고, 이것이 두 번째다 — 앞 걸음의 운동이 아직 살아 있는 채로
     * 다음 `render` 가 오면 그 운동은 다음 프레임에서 스스로 물러난다. 물러나지
     * 않으면 이미 새로 세운 화면 위에 옛 자리를 덮어쓴다.
     */
    let gen = 0;

    /** 되짚기 직전에 걸어 둔 것을 거둔다 (러너가 맡기면). */
    params.onScrubStart?.(() => {
      gen += 1;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    // ── 문안. 장면은 무엇을 말할지만 말하고 문자는 여기서 만든다 (C10).
    function captionText(c: LostLinkCaption): string {
      switch (c.kind) {
        case 'staged':
          return tr('caption.staged', 'New node {node}({value}) is ready. Nothing points to it yet.', {
            node: c.node,
            value: c.value,
          });
        case 'stagedAgain':
          return tr('caption.stagedAgain', '{node}({value}) is ready again.', {
            node: c.node,
            value: c.value,
          });
        case 'wrongMove':
          return tr('caption.wrongMove', 'Wrong order — move {from}.next to {to} first.', {
            from: c.from,
            to: c.to,
          });
        case 'detached':
          return tr(
            'caption.detached',
            'Nothing points to {first} any more, so {count} nodes drop out of reach.',
            { first: c.first, count: c.count },
          );
        case 'rewind':
          return tr('caption.rewind', 'Undo. Same insertion, other order.');
        case 'rightAdd':
          return tr(
            'caption.rightAdd',
            'Right order — attach {from}.next to {to} first. Now two arrows reach {to}.',
            { from: c.from, to: c.to },
          );
        case 'rightMove':
          return tr(
            'caption.rightMove',
            'Now move {from}.next to {to}. The tail is still held from the other side.',
            { from: c.from, to: c.to },
          );
        case 'settled':
          return tr('caption.settled', '{node} takes its place in the chain.', { node: c.node });
        case 'done':
          return tr('caption.done', 'No arrow into the tail was ever cut. Nothing fell off.');
      }
    }

    // ── 기하 ───────────────────────────────────────────────────────────
    /** 떨어져 나간 무리가 기우는 축 — 무리의 맨 왼쪽. 왼쪽에 걸린 채 뒤가 처지는 모양. */
    function fallPivot(board: Board): Point {
      let best: Point | null = null;
      for (const id of board.fallen) {
        const p = board.pos.get(id);
        if (!p) continue;
        if (best === null || p.x < best.x) best = { x: p.x, y: p.y + NODE_H / 2 };
      }
      return best ?? { x: 0, y: 0 };
    }

    /** 기울기까지 반영한 실제 중심. 화살표도 노드도 이 좌표만 본다. */
    function centerOf(id: string, board: Board, pivot: Point): Point {
      const p = board.pos.get(id) ?? { x: 0, y: 0 };
      const cx = p.x + NODE_W / 2;
      const cy = p.y + NODE_H / 2;
      if (!board.fallen.has(id) || board.tilt === 0) return { x: cx, y: cy };
      const rad = (board.tilt * Math.PI) / 180;
      const dx = cx - pivot.x;
      const dy = cy - pivot.y;
      return {
        x: pivot.x + dx * Math.cos(rad) - dy * Math.sin(rad),
        y: pivot.y + dx * Math.sin(rad) + dy * Math.cos(rad),
      };
    }

    /** 중심에서 목표 쪽으로 나간 광선이 상자 테두리와 만나는 점. */
    function edgePoint(center: Point, toward: Point): Point {
      const dx = toward.x - center.x;
      const dy = toward.y - center.y;
      if (dx === 0 && dy === 0) return center;
      const sx = dx === 0 ? Number.POSITIVE_INFINITY : NODE_W / 2 / Math.abs(dx);
      const sy = dy === 0 ? Number.POSITIVE_INFINITY : NODE_H / 2 / Math.abs(dy);
      const s = Math.min(sx, sy);
      return { x: center.x + dx * s, y: center.y + dy * s };
    }

    // ── 그리기 ─────────────────────────────────────────────────────────
    function drawArrow(from: Point, to: Point, stroke: string, width: number): SVGGElement {
      const g = svgEl('g', {});
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const tipX = to.x - ux * ARROW_GAP;
      const tipY = to.y - uy * ARROW_GAP;
      const baseX = tipX - ux * ARROW_HEAD;
      const baseY = tipY - uy * ARROW_HEAD;
      g.appendChild(
        svgEl('line', {
          x1: from.x,
          y1: from.y,
          x2: baseX,
          y2: baseY,
          stroke,
          'stroke-width': width,
          'stroke-linecap': 'round',
        }),
      );
      g.appendChild(
        svgEl('polygon', {
          points: [
            `${tipX},${tipY}`,
            `${baseX - uy * ARROW_HEAD * 0.42},${baseY + ux * ARROW_HEAD * 0.42}`,
            `${baseX + uy * ARROW_HEAD * 0.42},${baseY - ux * ARROW_HEAD * 0.42}`,
          ].join(' '),
          fill: stroke,
        }),
      );
      return g;
    }

    function drawNode(
      id: string,
      value: number,
      board: Board,
      pivot: Point,
      lost: boolean,
      pending: boolean,
    ): SVGGElement {
      const c = centerOf(id, board, pivot);
      const fallen = board.fallen.has(id);

      const stroke = lost ? colors.danger : pending ? colors.itemActive : colors.border;
      const fill = lost ? colors.bgSubtle : colors.itemDefault;
      const valueFill = fallen ? colors.textMuted : colors.text;

      const g = svgEl('g', {});
      if (fallen && board.tilt !== 0) g.setAttribute('transform', `rotate(${board.tilt} ${c.x} ${c.y})`);
      if (fallen) g.setAttribute('opacity', '0.82');

      const rect = svgEl('rect', {
        x: c.x - NODE_W / 2,
        y: c.y - NODE_H / 2,
        width: NODE_W,
        height: NODE_H,
        rx: 5,
        fill,
        stroke,
        'stroke-width': lost || pending ? 2 : 1.2,
      });
      if (pending) rect.setAttribute('stroke-dasharray', '5 3');
      g.appendChild(rect);

      const text = svgEl('text', {
        x: c.x,
        y: c.y + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: valueFill,
      });
      text.textContent = String(value);
      g.appendChild(text);

      const name = svgEl('text', {
        x: c.x,
        y: c.y - NODE_H / 2 - 7,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: lost ? colors.danger : colors.textMuted,
      });
      name.textContent = id;
      g.appendChild(name);
      return g;
    }

    /**
     * 그 장면의 화면 **전체**를 세운다. 앞 화면과 견주어 고치지 않으므로 되돌릴
     * 명령이 필요 없다 (S-scene).
     */
    function paint(scene: LostLinkScene, board: Board): void {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      const cross = board.crossing;
      // 건너는 중인 화살표는 다 건너가기 전까지 아직 옛 목표를 겨눈다. 없던
      // 화살표가 자라 나오는 중이면 자라는 첫 순간부터 새 목표를 겨눈 것으로 센다.
      const override =
        cross !== null && cross.prog < 1 && cross.was !== null
          ? { from: cross.from, to: cross.was }
          : undefined;
      const targets = linkTargets(scene.arrows, override);
      // 멎어 있으면 장면이 쥔 값을 그대로 쓴다 — 닿음은 장면이 말한다.
      const reach =
        cross === null ? new Set(scene.reachable) : new Set(reachableFrom(scene.head, targets));
      const referrers = new Set(targets.values());
      const pivot = fallPivot(board);

      // 경계 — 여기 위는 닿는 곳, 아래는 남아 있으나 들어갈 길이 없는 곳.
      svg.appendChild(
        svgEl('line', {
          x1: 16,
          y1: BOUNDARY_Y,
          x2: W - 16,
          y2: BOUNDARY_Y,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '6 6',
        }),
      );
      const above = svgEl('text', {
        x: W - 18,
        y: BOUNDARY_Y - 8,
        'text-anchor': 'end',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      above.textContent = tr('label.reachable', 'reachable from head');
      svg.appendChild(above);

      if (board.fallen.size > 0) {
        const below = svgEl('text', {
          x: W - 18,
          y: BOUNDARY_Y + 18,
          'text-anchor': 'end',
          'font-size': fontSizes.xs,
          fill: colors.danger,
        });
        below.textContent = tr('label.unreachable', 'still in memory, no way in');
        svg.appendChild(below);
      }

      // head — 사슬로 들어가는 유일한 입구.
      const headLabel = svgEl('text', {
        x: HEAD_LABEL_X,
        y: LANE_Y + NODE_H / 2 + 4,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      // `head` 는 번역하지 않는 표식이다 — 한국어 문서도 그대로 쓰는 말이라
      // 키를 만들지 않는다 (C10 의 표식 판정 2번).
      headLabel.textContent = 'head';
      svg.appendChild(headLabel);
      if (board.pos.has(scene.head) && !board.fallen.has(scene.head)) {
        const target = centerOf(scene.head, board, pivot);
        const start = { x: HEAD_ARROW_X, y: LANE_Y + NODE_H / 2 };
        svg.appendChild(drawArrow(start, edgePoint(target, start), colors.text, 1.6));
      }

      // 화살표. 건너는 중이면 끝점이 옛 목표에서 새 목표로 이동한다.
      for (const a of scene.arrows) {
        if (!board.pos.has(a.from) || !board.pos.has(a.to)) continue;
        const fromC = centerOf(a.from, board, pivot);
        const toC = centerOf(a.to, board, pivot);
        let end = edgePoint(toC, fromC);
        if (cross !== null && cross.from === a.from && cross.prog < 1) {
          // 건너는 중이면 옛 목표에서, 새로 나는 중이면 제 몸에서 끝점이 출발한다.
          const origin =
            cross.was !== null && board.pos.has(cross.was)
              ? edgePoint(centerOf(cross.was, board, pivot), fromC)
              : edgePoint(fromC, end);
          end = { x: lerp(origin.x, end.x, cross.prog), y: lerp(origin.y, end.y, cross.prog) };
        }
        const start = edgePoint(fromC, end);
        if (Math.hypot(end.x - start.x, end.y - start.y) < ARROW_GAP + ARROW_HEAD) continue;
        // 이번 걸음에 손댄 화살표는 다음 걸음까지 강조로 **남는다**. 머무는 강조라
        // 정적으로 그릴 때도 들어간다 (S-scene).
        const active = scene.mark?.kind === 'linked' && scene.mark.from === a.from;
        const dead = !reach.has(a.from);
        const stroke = active ? colors.itemActive : dead ? colors.textMuted : colors.text;
        svg.appendChild(drawArrow(start, end, stroke, active ? 2.4 : 1.6));
      }

      for (const n of scene.nodes) {
        if (!board.pos.has(n.id)) continue;
        const pending = board.staged === n.id && !referrers.has(n.id);
        const lost = !reach.has(n.id) && !pending;
        svg.appendChild(drawNode(n.id, n.value, board, pivot, lost, pending));
      }

      // 캡션.
      if (scene.caption !== null) {
        wrapCaption(captionText(scene.caption)).forEach((line, i) => {
          const text = svgEl('text', {
            x: W / 2,
            y: CAPTION_Y + i * CAPTION_LINE_H,
            'text-anchor': 'middle',
            'font-size': fontSizes.md,
            fill: colors.text,
          });
          text.textContent = line;
          svg.appendChild(text);
        });
      }
    }

    // ── 시간 ───────────────────────────────────────────────────────────
    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    /**
     * 걸음 하나를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(ms: number, draw: (p: number) => void): Promise<void> {
      const mine = gen;
      if (destroyed || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return Promise.resolve();
      }
      const t0 = now();
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const step = (): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const raw = Math.min(1, (now() - t0) / ms);
          draw(raw);
          if (raw >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(step);
          frames.add(id);
        };
        draw(0);
        id = requestAnimationFrame(step);
        frames.add(id);
      });
    }

    /**
     * 배치가 달라진 걸음. 출발 배치에서 도착 배치로 다 함께 미끄러진다.
     *
     * 출발 배치에만 있는 노드는 화면 밖으로 물러나고, 도착 배치에만 있는 노드는
     * 화면 밖에서 내려온다. 그래서 새 노드가 드는 걸음과 되감는 걸음이 같은 길로
     * 그려진다.
     */
    function glide(
      scene: LostLinkScene,
      was: LostLinkPlacement,
      stagedId: string | null,
      ms: number,
      ease: (p: number) => number,
    ): Promise<void> {
      const fromPos = layout(was);
      const toPos = layout(scene.place);
      const fallen = new Set(scene.place.fallen.map((f) => f.id));
      const tiltFrom = tiltOf(was);
      const tiltTo = tiltOf(scene.place);

      const moves: { id: string; a: Point; b: Point }[] = [];
      for (const n of scene.nodes) {
        const a = fromPos.get(n.id);
        const b = toPos.get(n.id);
        if (!a && !b) continue;
        moves.push({
          id: n.id,
          a: a ?? { x: (b as Point).x, y: OFFSCREEN_Y },
          b: b ?? { x: (a as Point).x, y: OFFSCREEN_Y },
        });
      }

      return animate(ms, (raw) => {
        const e = ease(raw);
        const pos = new Map<string, Point>();
        for (const m of moves) {
          pos.set(m.id, { x: lerp(m.a.x, m.b.x, e), y: lerp(m.a.y, m.b.y, e) });
        }
        paint(scene, { pos, fallen, tilt: lerp(tiltFrom, tiltTo, e), staged: stagedId, crossing: null });
      });
    }

    /** 장면이 실어 보낸 `mark` 하나만 흐르게 한다. */
    function flow(scene: LostLinkScene): Promise<void> {
      const mark = scene.mark;
      if (mark === null) return Promise.resolve();

      if (mark.kind === 'linked') {
        const rest = restBoard(scene);
        const ease = mark.how === 'moved' ? easeInOutCubic : easeOutCubic;
        return animate(DUR_LINK, (raw) => {
          paint(scene, {
            ...rest,
            crossing: { from: mark.from, was: mark.was, prog: ease(raw) },
          });
        });
      }

      // 되감는 동안 물러나는 노드는 **물러나기 전의** 모습으로 남아야 한다.
      // 그래서 줄 위에 떠 있던 노드가 누구였는지는 출발 배치에서 본다.
      const stagedId =
        mark.how === 'rewound'
          ? (mark.was.staged?.id ?? null)
          : (scene.place.staged?.id ?? null);
      const { ms, ease } = PLACE_FLOW[mark.how];
      return glide(scene, mark.was, stagedId, ms, ease);
    }

    async function render(
      next: LostLinkScene,
      /** 이 조각은 출발 배치를 `mark` 에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: LostLinkScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const mine = gen;

      paint(next, restBoard(next));
      if (!opts.animate || destroyed) return;

      await flow(next);
      // 운동이 끝나면 그 장면을 통째로 다시 세운다. 보간의 끝자리가 목표값과
      // 문자열로 어긋나는 일을 없애 준다 (`-0` 과 부동소수 끝자리).
      if (!destroyed && mine === gen) paint(next, restBoard(next));
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },
    };
  },
};
