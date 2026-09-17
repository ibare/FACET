/**
 * skip-a-layer stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 그림의 뼈대 (질문의 동사에서 나왔다 — **뛰고 내려선다**)
 *
 * 층마다 가로 한 줄을 두고, 같은 값은 층이 달라도 **같은 가로 자리**(column)에
 * 세운다. 그래서 위층의 한 걸음은 화면에서 실제로 멀고 아래층의 한 걸음은 짧다 —
 * "성글어서 멀리 간다" 가 거리로 보인다. 여행자는 층 위를 호를 그리며 뛰고,
 * 지나치면 되돌아와 한 층 아래로 내려선다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 걸어온 자취는 `const trail` 의 좌표 배열에, 견준 자리의 판정은 `rect` 의 칠에,
 * 여행자의 자리는 `let pinX`/`let pinLevel` 에, 유령 경로를 놓았는지는 `ghostG` 의
 * 자식 유무에 있었다. 이제 `stops` · `looks` · `finished` 가 말하므로 **정적
 * 그리기가 그것을 통째로 세운다** — 되짚어 그 걸음에 가도 자취선과 물든 칸이 그대로
 * 남는다.
 *
 * ── 화면에 뜨는 수는 모두 자취에서 나온다
 *
 * 캡션의 `{looks}` 는 `scene.looks.length` 이고 그 배열이 곧 물들이는 칸의 목록이다.
 * `{flat}` 은 유령 경로에 실제로 그어진 눈금의 개수다. payload 의 `looks` ·
 * `flatLooks` 는 장면이 이미 버렸으므로 여기 올 길이 없다 (`scene.ts` 의 "수는 한
 * 출처에서만").
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 자취선은 이미 끝 자리까지 그어져 있다. 걸음은 **마지막
 * 점을 아직 못 온 자리로 물려** 두었다가 놓아 준다. 출발 그림은 `step.from` 이
 * 말하고 `prev` 를 들추지 않는다 (S-scene). 운동이 끝나면 장면을 통째로 다시
 * 세워, 보간이 남긴 끝자리와 `opacity` 를 노드째 지운다.
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는 값이라
 * 이 파일이 상수로 갖는다 (S-piece). 색은 전부 design-tokens 경유다 (S-view).
 *
 * 화면의 글자 중 `head` 와 `L2` 는 도형에 새겨진 표식이라 번역하지 않는다 (C10).
 * 문장인 캡션은 `params.t` 로 만든다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  currentStop,
  flatColumnOf,
  lanesOf,
  topLevelOf,
  type SkipALayerScene,
  type SkipALayerStep,
  type SkipStop,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

/** 층 셋과 유령 경로와 캡션 한 줄이 들어가는 높이. 마운트 뒤로 바뀌지 않는다 (S-view). */
const CANVAS_H = 220;

const SIDE = 16;
const LANE_LABEL_W = 20;
const HEAD_W = 26;
const HEAD_GAP = 10;
/** 칸 폭의 **상한**만 둔다. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const NODE_MAX_W = 42;
const NODE_H = 24;
const LANE_GAP_MAX = 54;
const TOP = 32;
const GHOST_DROP = 26;
const CAPTION_H = 30;
/** 노드 윗변에서 핀 끝까지. */
const PIN_LIFT = 3;
const PIN_H = 18;

const LEAP_MS = 420;
const PROBE_MS = 300;
const HOLD_MS = 220;
const RECOIL_MS = 260;
const DROP_MS = 300;
const FOUND_MS = 420;
const GHOST_MS = 760;

/** 도형에 새겨진 표식 — 문안이 아니다 (C10). */
const HEAD_MARK = 'head';
const LEVEL_MARK = 'L';

/**
 * 칸의 형편.
 *
 * `path` · `over` · `found` 는 장면의 `looks` 가 말하는 **남는** 판정이고,
 * `look` · `reject` 는 걸음이 흐르는 동안만 스치는 칠이다 (S-scene 의 "머무는
 * 것과 지나가는 것").
 */
type NodeState = 'idle' | 'look' | 'path' | 'reject' | 'over' | 'found';

type Cell = { rect: SVGRectElement; text: SVGTextElement };

/** 정적 그리기가 셈한 자리. 장면에는 좌표가 없으므로 매번 여기서 낸다 (S-piece). */
type Geom = {
  count: number;
  topLevel: number;
  lanes: number[][];
  nodeW: number;
  headX: number;
  trackRight: number;
  colX: (column: number) => number;
  laneY: (level: number) => number;
  /** 그 층에서 핀 끝이 닿는 세로. */
  tipY: (level: number) => number;
  ghostY: number;
};

/** 유령 경로의 손잡이. 자라나는 길과 그 눈금들. */
type DrawnGhost = {
  line: SVGLineElement;
  ticks: Array<{ node: SVGLineElement; x: number }>;
  x0: number;
  x1: number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  cells: Map<string, Cell>;
  trailPath: SVGPathElement;
  /** 자취선의 꼭짓점들. 마지막 점을 걸음이 물렸다 놓는다. */
  points: Array<[number, number]>;
  pin: SVGGElement | null;
  ghost: DrawnGhost | null;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const keyOf = (level: number, column: number): string => `${level}:${column}`;

/**
 * 유령 경로가 밟는 자리들.
 *
 * **캡션의 `{flat}` 과 화면의 눈금이 이 한 함수에서 나온다.** 층이 하나뿐이었다면
 * 처음부터 여기까지 하나씩 보았을 것이고, 그 개수가 곧 견줄 수다.
 */
function ghostColumns(scene: SkipALayerScene): number[] {
  const stop = flatColumnOf(scene.values, scene.target);
  const out: number[] = [];
  for (let i = 0; i <= stop && i < scene.values.length; i += 1) out.push(i);
  return out;
}

export const skipALayerStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SkipALayerScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gTowers = el('g', {});
    const gLinks = el('g', {});
    const gGhost = el('g', {});
    const gNodes = el('g', {});
    const gTrail = el('g', {});
    const gPin = el('g', {});
    const gCaption = el('g', {});
    svg.append(gTowers, gLinks, gGhost, gNodes, gTrail, gPin, gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 되짚기가 끼어들면 남은 프레임이
     * **이미 새로 선 화면**을 덮을 수 있으므로, 마디마다 자기 번호가 아직 유효한지
     * 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    function geomOf(scene: SkipALayerScene): Geom {
      const count = scene.values.length;
      const lanes = lanesOf(scene.heights);
      const topLevel = topLevelOf(scene.heights);
      const laneCount = Math.max(1, lanes.length);

      const trackLeft = SIDE + LANE_LABEL_W + HEAD_W + HEAD_GAP;
      const trackRight = PIECE_CANVAS_W - SIDE;
      const colStep = count > 0 ? (trackRight - trackLeft) / count : 0;
      const nodeW = Math.min(NODE_MAX_W, Math.max(16, colStep - 6));
      const headX = SIDE + LANE_LABEL_W + HEAD_W / 2;
      // 층이 늘면 높이를 늘리는 것이 아니라 층 간격을 줄여 담는다 (S-view).
      const laneGap =
        laneCount > 1
          ? Math.min(
              LANE_GAP_MAX,
              (CANVAS_H - CAPTION_H - GHOST_DROP - TOP - NODE_H / 2) / (laneCount - 1),
            )
          : LANE_GAP_MAX;

      const colX = (column: number): number => trackLeft + colStep * (column + 0.5);
      const laneY = (level: number): number => TOP + NODE_H / 2 + (topLevel - level) * laneGap;
      const tipY = (level: number): number => laneY(level) - NODE_H / 2 - PIN_LIFT;

      return {
        count,
        topLevel,
        lanes,
        nodeW,
        headX,
        trackRight,
        colX,
        laneY,
        tipY,
        ghostY: laneY(0) + NODE_H / 2 + 14,
      };
    }

    const stopX = (geom: Geom, stop: SkipStop): number =>
      stop.column === null ? geom.headX : geom.colX(stop.column);

    // ── 칠 ────────────────────────────────────────────────────────────────

    /** 노드의 상태 색. 타일이 테마를 따라 뒤집으면 잉크도 뒤집는다 (design-tokens). */
    const skin: Record<NodeState, { fill: string; stroke: string; ink: string; width: number }> = {
      idle: { fill: colors.itemDefault, stroke: colors.border, ink: colors.text, width: 1 },
      look: {
        fill: colors.itemComparing,
        stroke: colors.itemComparing,
        ink: colors.stateInk,
        width: 1,
      },
      path: { fill: colors.itemSorted, stroke: colors.itemSorted, ink: colors.textInverse, width: 1 },
      reject: { fill: colors.danger, stroke: colors.danger, ink: colors.stateInk, width: 1 },
      over: { fill: colors.itemDefault, stroke: colors.danger, ink: colors.danger, width: 1.6 },
      found: { fill: colors.itemPivot, stroke: colors.itemPivot, ink: colors.stateInk, width: 1 },
    };

    function paint(cell: Cell, state: NodeState): void {
      const s = skin[state];
      cell.rect.setAttribute('fill', s.fill);
      cell.rect.setAttribute('stroke', s.stroke);
      cell.rect.setAttribute('stroke-width', String(s.width));
      cell.text.setAttribute('fill', s.ink);
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 것.
     *
     * 값은 자리 번호로 되찾고, 수는 자취에서 센다 — 캡션이 제 수를 따로 들고
     * 있으면 화면의 칸·눈금과 갈릴 자리가 생긴다.
     */
    function captionFor(scene: SkipALayerScene): string {
      const cap = scene.caption;
      if (cap === null) return '';
      const valueAt = (column: number): number => scene.values[column] ?? 0;

      switch (cap.kind) {
        case 'start':
          return t('caption.start', 'Looking for {target}. Start on the highest level.', {
            target: scene.target,
          });
        case 'leap':
          return t('caption.leap', '{v} is below {target} — leap over to it.', {
            v: valueAt(cap.column),
            target: scene.target,
          });
        case 'overshoot':
          return t('caption.overshoot', '{v} is past {target} — overshot, so step down one level.', {
            v: valueAt(cap.column),
            target: scene.target,
          });
        case 'laneEnd':
          return t('caption.laneEnd', 'Nothing more on this level — step down one.');
        case 'found':
          return t('caption.found', 'Found {v} on level {level}.', {
            v: valueAt(cap.column),
            level: cap.level,
          });
        case 'done':
          // 본 횟수는 견준 자리의 수, 견줄 상대는 유령 경로의 눈금 수다.
          return t(
            'caption.done',
            '{looks} looks. On a single-level list it would have taken {flat}.',
            { looks: scene.looks.length, flat: ghostColumns(scene).length },
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of [gTowers, gLinks, gGhost, gNodes, gTrail, gPin, gCaption]) g.textContent = '';
    }

    function pathOf(points: Array<[number, number]>): string {
      if (points.length === 0) return '';
      const [head, ...rest] = points;
      return [`M ${head[0]} ${head[1]}`, ...rest.map(([x, y]) => `L ${x} ${y}`)].join(' ');
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: SkipALayerScene): Drawn {
      rewind();

      const geom = geomOf(scene);
      const { count, topLevel, lanes, nodeW, headX, trackRight, colX, laneY, tipY } = geom;

      // ── head 기둥. 모든 층에 걸쳐 서 있다.
      const headTop = laneY(topLevel) - NODE_H / 2;
      const headBottom = laneY(0) + NODE_H / 2;
      const headMid = (headTop + headBottom) / 2;
      gLinks.appendChild(
        el('rect', {
          x: headX - HEAD_W / 2,
          y: headTop,
          width: HEAD_W,
          height: Math.max(NODE_H, headBottom - headTop),
          rx: 6,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      const headLabel = el('text', {
        x: headX,
        y: headMid,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        transform: `rotate(-90, ${headX}, ${headMid})`,
      });
      headLabel.textContent = HEAD_MARK;
      gLinks.appendChild(headLabel);

      // ── 탑: 한 값이 어느 층까지 서는가.
      for (let i = 0; i < count; i += 1) {
        const height = scene.heights[i] ?? 1;
        gTowers.appendChild(
          el('line', {
            x1: colX(i),
            y1: laneY(0),
            x2: colX(i),
            y2: laneY(height - 1),
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
      }

      // ── 층마다의 줄과 값. 위층은 성글어 줄이 길다.
      const cells = new Map<string, Cell>();
      for (let level = 0; level <= topLevel && level < lanes.length; level += 1) {
        const y = laneY(level);
        const lane = lanes[level];

        const label = el('text', {
          x: SIDE,
          y,
          'text-anchor': 'start',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        label.textContent = `${LEVEL_MARK}${level}`;
        gLinks.appendChild(label);

        let prevX = headX + HEAD_W / 2;
        for (const i of lane) {
          gLinks.appendChild(
            el('line', {
              x1: prevX,
              y1: y,
              x2: colX(i) - nodeW / 2,
              y2: y,
              stroke: colors.border,
              'stroke-width': 1.5,
            }),
          );
          prevX = colX(i) + nodeW / 2;
        }
        // 줄의 끝동강 — 이 층에 더는 없다는 표시.
        gLinks.appendChild(
          el('line', {
            x1: prevX,
            y1: y,
            x2: Math.min(prevX + 10, trackRight),
            y2: y,
            stroke: colors.border,
            'stroke-width': 1.5,
          }),
        );

        for (const i of lane) {
          const rect = el('rect', {
            x: colX(i) - nodeW / 2,
            y: y - NODE_H / 2,
            width: nodeW,
            height: NODE_H,
            rx: 5,
            fill: colors.itemDefault,
            stroke: colors.border,
            'stroke-width': 1,
          });
          const text = el('text', {
            x: colX(i),
            y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          });
          text.textContent = String(scene.values[i] ?? '');
          gNodes.appendChild(rect);
          gNodes.appendChild(text);
          cells.set(keyOf(level, i), { rect, text });
        }
      }

      /*
       * 견준 자리를 물들인다. **남는 판정이라 정적 그리기에 넣는다** — 빠뜨리면
       * 되짚었을 때 "몇 칸을 보았나" 가 화면에서 사라진다 (S-scene).
       *
       * 순서대로 덮어쓰므로 같은 칸을 두 번 견주면 나중 판정이 이긴다.
       */
      for (const look of scene.looks) {
        const cell = cells.get(keyOf(look.level, look.column));
        if (cell) paint(cell, look.verdict);
      }

      // ── 유령 경로. 층 0 을 처음부터 훑었다면 밟았을 길이 길게 눕는다.
      let ghost: DrawnGhost | null = null;
      if (scene.finished && count > 0) {
        const columns = ghostColumns(scene);
        const x0 = headX + HEAD_W / 2;
        const x1 = colX(columns[columns.length - 1] ?? 0);
        const line = el('line', {
          x1: x0,
          y1: geom.ghostY,
          x2: x1,
          y2: geom.ghostY,
          stroke: colors.ghostOutline,
          'stroke-width': 1.6,
          'stroke-dasharray': '5 4',
        });
        gGhost.appendChild(line);

        const ticks: Array<{ node: SVGLineElement; x: number }> = [];
        for (const i of columns) {
          const node = el('line', {
            x1: colX(i),
            y1: geom.ghostY - 4,
            x2: colX(i),
            y2: geom.ghostY + 4,
            stroke: colors.ghostOutline,
            'stroke-width': 1.6,
          });
          gGhost.appendChild(node);
          ticks.push({ node, x: colX(i) });
        }
        ghost = { line, ticks, x0, x1 };
      }

      // ── 자취선. 여행자가 실제로 지난 길이 그대로 쌓인다.
      const points: Array<[number, number]> = scene.stops.map((stop) => [
        stopX(geom, stop),
        tipY(stop.level),
      ]);
      const trailPath = el('path', {
        d: pathOf(points),
        fill: 'none',
        stroke: colors.primary,
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      gTrail.appendChild(trailPath);

      // ── 여행자. 찾는 값을 들고 다닌다. 아직 안 섰으면 그리지 않는다.
      let pin: SVGGElement | null = null;
      if (scene.stops.length > 0) {
        const here = currentStop(scene);
        const pinW = Math.max(26, 14 + String(scene.target).length * 8);
        pin = el('g', {
          transform: `translate(${stopX(geom, here)}, ${tipY(here.level)})`,
        });
        pin.appendChild(
          el('rect', {
            x: -pinW / 2,
            y: -(PIN_H + 6),
            width: pinW,
            height: PIN_H,
            rx: 4,
            fill: colors.primary,
          }),
        );
        pin.appendChild(el('path', { d: 'M -5 -6 L 5 -6 L 0 0 Z', fill: colors.primary }));
        const pinText = el('text', {
          x: 0,
          y: -(6 + PIN_H / 2),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textInverse,
        });
        pinText.textContent = String(scene.target);
        pin.appendChild(pinText);
        gPin.appendChild(pin);
      }

      // ── 캡션. 지금 무슨 일이 일어나는지만 말한다 (S-piece).
      const caption = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: CANVAS_H - 10,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      caption.textContent = captionFor(scene);
      gCaption.appendChild(caption);

      return { geom, cells, trailPath, points, pin, ghost };
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 `step.from` 이 말한다.

    function setPin(drawn: Drawn, x: number, y: number): void {
      drawn.pin?.setAttribute('transform', `translate(${x}, ${y})`);
    }

    /** 자취선의 마지막 점을 (x, y) 로 갈아 끼운다. 앞의 점들은 그대로다. */
    function trailTo(drawn: Drawn, x: number, y: number): void {
      const points: Array<[number, number]> = [...drawn.points.slice(0, -1), [x, y]];
      drawn.trailPath.setAttribute('d', pathOf(points));
    }

    /** 거리가 멀수록 높은 호. 위층의 한 걸음이 멀다는 것이 호의 크기로 보인다. */
    const arcOf = (dx: number): number => Math.min(30, 10 + Math.abs(dx) * 0.06);

    function cellOf(drawn: Drawn, level: number, column: number): Cell | undefined {
      return drawn.cells.get(keyOf(level, column));
    }

    /** 한 층을 가로지르는 뜀. 도착 칸이 견주는 칠에서 최종 판정으로 넘어간다. */
    function flowHop(
      drawn: Drawn,
      from: SkipStop,
      to: SkipStop,
      ms: number,
      settled: NodeState,
      mine: number,
    ): Promise<void> {
      const { geom } = drawn;
      const x0 = stopX(geom, from);
      const x1 = stopX(geom, to);
      const y = geom.tipY(to.level);
      const arc = arcOf(x1 - x0);
      const cell = to.column === null ? undefined : cellOf(drawn, to.level, to.column);
      return tween(ms, mine, (p) => {
        if (cell) paint(cell, p >= 1 ? settled : 'look');
        const x = x0 + (x1 - x0) * ease(p);
        setPin(drawn, x, y - Math.sin(Math.PI * p) * arc);
        trailTo(drawn, x, y);
      });
    }

    /** 한 층 내려섬. 자리는 그대로이고 자취선이 아래로 뻗는다. */
    function flowDrop(drawn: Drawn, step: { from: SkipStop; to: SkipStop }, mine: number): Promise<void> {
      const { geom } = drawn;
      const x = stopX(geom, step.from);
      const y0 = geom.tipY(step.from.level);
      const y1 = geom.tipY(step.to.level);
      return tween(DROP_MS, mine, (p) => {
        const y = y0 + (y1 - y0) * ease(p);
        setPin(drawn, x, y);
        trailTo(drawn, x, y);
      });
    }

    /**
     * 지나침 — 뛰어 보고, 튕겨 돌아와, 한 층 내려선다.
     *
     * 네 마디를 **한 시계**로 돌린다. 마디마다 `await` 를 두면 그 틈으로 되짚기가
     * 끼어들 자리가 늘고, 뒷마디가 깨어나 새로 선 화면을 덮는다 (S-scene).
     * 자취선은 내려서기 전까지 출발 자리에 묶여 있다 — 짚어 본 걸음은 길이 아니다.
     */
    function flowOvershoot(
      drawn: Drawn,
      step: { from: SkipStop; over: number; to: SkipStop },
      mine: number,
    ): Promise<void> {
      const { geom } = drawn;
      const level = step.from.level;
      const anchorX = stopX(geom, step.from);
      const overX = geom.colX(step.over);
      const yUp = geom.tipY(level);
      const yDown = geom.tipY(step.to.level);
      const arc = arcOf(overX - anchorX);
      const cell = cellOf(drawn, level, step.over);

      const endProbe = PROBE_MS;
      const endHold = endProbe + HOLD_MS;
      const endRecoil = endHold + RECOIL_MS;
      const total = endRecoil + DROP_MS;

      return tween(total, mine, (p) => {
        const ms = p * total;
        if (ms < endProbe) {
          const q = clamp01(ms / PROBE_MS);
          if (cell) paint(cell, 'look');
          setPin(drawn, anchorX + (overX - anchorX) * ease(q), yUp - Math.sin(Math.PI * q) * arc);
          trailTo(drawn, anchorX, yUp);
          return;
        }
        if (ms < endHold) {
          if (cell) paint(cell, 'reject');
          setPin(drawn, overX, yUp);
          trailTo(drawn, anchorX, yUp);
          return;
        }
        if (ms < endRecoil) {
          const q = clamp01((ms - endHold) / RECOIL_MS);
          if (cell) paint(cell, 'reject');
          setPin(drawn, overX + (anchorX - overX) * ease(q), yUp - Math.sin(Math.PI * q) * arc);
          trailTo(drawn, anchorX, yUp);
          return;
        }
        const q = clamp01((ms - endRecoil) / DROP_MS);
        if (cell) paint(cell, 'over');
        const y = yUp + (yDown - yUp) * ease(q);
        setPin(drawn, anchorX, y);
        trailTo(drawn, anchorX, y);
      });
    }

    /** 찾았다 — 뛰어 닿고 테가 한 번 부풀었다 사라진다. */
    async function flowFound(
      drawn: Drawn,
      step: { from: SkipStop; to: SkipStop },
      mine: number,
    ): Promise<void> {
      const { geom } = drawn;
      const column = step.to.column;
      if (column === null) return;

      const x0 = stopX(geom, step.from);
      const x1 = geom.colX(column);
      const y = geom.tipY(step.to.level);
      const arc = arcOf(x1 - x0);
      const cell = cellOf(drawn, step.to.level, column);

      const ring = el('rect', {
        x: geom.colX(column) - geom.nodeW / 2,
        y: geom.laneY(step.to.level) - NODE_H / 2,
        width: geom.nodeW,
        height: NODE_H,
        rx: 5,
        fill: 'none',
        stroke: colors.itemPivot,
        'stroke-width': 2,
        opacity: 0,
      });
      gNodes.appendChild(ring);

      const total = LEAP_MS + FOUND_MS;
      await tween(total, mine, (p) => {
        const ms = p * total;
        const hop = clamp01(ms / LEAP_MS);
        if (cell) paint(cell, hop >= 1 ? 'found' : 'look');
        const x = x0 + (x1 - x0) * ease(hop);
        setPin(drawn, x, y - Math.sin(Math.PI * hop) * arc);
        trailTo(drawn, x, y);

        const grow = clamp01((ms - LEAP_MS) / FOUND_MS);
        const pad = 12 * grow;
        ring.setAttribute('x', String(geom.colX(column) - geom.nodeW / 2 - pad));
        ring.setAttribute('y', String(geom.laneY(step.to.level) - NODE_H / 2 - pad));
        ring.setAttribute('width', String(geom.nodeW + pad * 2));
        ring.setAttribute('height', String(NODE_H + pad * 2));
        ring.setAttribute('opacity', String(1 - grow));
      });
      ring.remove();
    }

    /**
     * 유령 경로가 자란다.
     *
     * 자라나는 길이 그대로 대조다 — 위층의 짧은 자취 아래에 길게 눕는다. 눈금은
     * 정적 그리기가 이미 세워 두었으므로 여기서는 아직 안 지난 것을 숨겼다 드러낸다.
     */
    function flowGhost(drawn: Drawn, mine: number): Promise<void> {
      const ghost = drawn.ghost;
      if (ghost === null) return Promise.resolve();
      return tween(GHOST_MS, mine, (p) => {
        const x = ghost.x0 + (ghost.x1 - ghost.x0) * p;
        ghost.line.setAttribute('x2', String(x));
        for (const tick of ghost.ticks) tick.node.setAttribute('opacity', tick.x <= x ? '1' : '0');
      });
    }

    function flowFor(step: SkipALayerStep, drawn: Drawn, mine: number): Promise<void> {
      switch (step.kind) {
        case 'begin':
          // 여행자가 그냥 선다. 흐를 것이 없다.
          return Promise.resolve();
        case 'leap':
          return flowHop(drawn, step.from, step.to, LEAP_MS, 'path', mine);
        case 'overshoot':
          return flowOvershoot(drawn, step, mine);
        case 'descend':
          return flowDrop(drawn, step, mine);
        case 'found':
          return flowFound(drawn, step, mine);
        case 'reveal':
          return flowGhost(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: SkipALayerScene,
      _prev: SkipALayerScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 opacity 가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
