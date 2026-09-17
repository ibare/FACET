/**
 * undo-by-back-edge-stage — 관과 되돌릴 폭.
 *
 * ## 왜 이 그림인가
 *
 * 관 하나의 굵기가 곧 용량이고, 그 안은 용량만큼의 차선으로 나뉜다. 찬 차선이
 * 흘린 양이고 빈 차선이 앞으로 더 흘릴 폭이다. 그래서 **관 하나가 잔여 그래프
 * 양쪽을 동시에 그린다** — 관 머리의 화살은 빈 폭만큼, 관 꼬리의 화살은 찬 폭만큼
 * 크다. 꼬리 화살은 처음엔 없다가 흘린 뒤에 생겨난다.
 *
 * 밀어냄은 자리의 움직임으로 그린다. 역방향으로 지나가는 덩이가 관 머리로 들어와
 * 앞서 찬 것을 꼬리 밖으로 밀어내고, 밀려 나온 것이 그 길로 이어 간다.
 *
 * ## 어휘를 넷으로 갈랐다
 *
 * 이 조각의 주장은 **되돌릴 수 있다**이다. 그런데 되돌린 양을 살아 있는 흐름과
 * 같은 모양으로 그리면 "아직 흐르고 있다" 로 읽혀 조각이 말하려는 것의 정반대가
 * 된다. 그래서 네 어휘가 서로 다른 자리·다른 모양을 쓴다.
 *
 * - **관 안의 채움 (primary)** — *값의 형편*. 지금 그 관에 흐르는 양.
 * - **관 양 끝의 화살** — *폭의 표식*. 머리(textMuted)는 앞으로 더 흘릴 폭,
 *   꼬리(accent)는 되돌릴 폭. 둘 다 흐름 하나에서 파생되므로 어긋날 수 없다.
 * - **관 바깥 꼬리 곁의 빈 네모 (accent)** — *되돌린 자국*. 이 관에서 밀려 나간
 *   양만큼 찍히고 재생이 끝날 때까지 지워지지 않는다. 관 **밖**에 있고 **비어**
 *   있어 찬 차선과 부딪히지 않는다.
 * - **관 테두리** — *지금 짚는 길(itemActive)* 과 *앞을 막은 목(danger)*.
 *
 * 눈금의 끊긴 가로줄(danger)은 **앞으로 난 화살만으로 막혔던 자리**다. 그것이
 * 남아 있어야 "넷에서 막히고 여섯까지 갔다" 가 완주 화면 하나에서 읽힌다 — 그
 * 순서가 이 조각의 논증이다.
 *
 * ## 어떻게 그리나
 *
 * 걸음마다 부르는 메서드(`showPath()` · `pushFlow()` …)를 두지 않는다. 그
 * 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터 다시 밟는
 * 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의 화면
 * 전체**를 세운다 (S-scene).
 *
 * **운동의 방향이 뒤집힌다.** 정적 그리기가 정본이라 관은 이미 흐르고 난 뒤의
 * 모습으로 서 있고, 걸음은 **아직 못 온 만큼을 뒤로 물려** 놓고 출발한다.
 * 운동이 끝나면 그 장면을 통째로 다시 세운다 — 속성을 하나씩 거두면 반드시 하나를
 * 빠뜨리는데 이 길은 그 목록 자체를 없앤다.
 *
 * **한 길을 따라 흐르는 것은 한 뜻이라 시계도 하나다.** 관마다 따로 돌리면 걸음의
 * 끝이 여러 갈래가 되고 `render` 의 Promise 가 무엇을 기다리는지 흐려진다.
 *
 * **CSS transition 을 쓰지 않는다.** 되짚기는 `animate:false` 로 오는데 transition
 * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다. 시계는 rAF 보간 하나뿐이다.
 * 지연 발화를 막는 것은 `opts.animate` 검사와 세대 빗장 둘뿐이고, `isInstant` ·
 * `onScrubStart` 는 러너가 장면 조각에서 부르지 않으므로 달지 않는다 (S-scene).
 */

import {
  PIECE_CANVAS_W,
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionOf,
  forwardReachable,
  outCapacity,
  pathSteps,
  saturatedFrontier,
  totalAt,
  type UndoByBackEdgeScene,
  type UndoCaption,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 300;

/** 정점 반지름. */
const R = 22;
/** 관이 정점에서 떨어지는 거리 — 화살촉이 들어갈 자리. */
const NODE_GAP = 13;
/** 용량 한 단위의 관 두께. 관 굵기 = 용량 × 이 값. */
const LANE = 9;
/** 차선과 관 벽 사이. */
const LANE_INSET = 1.2;
/** 화살촉 길이. */
const HEAD_LEN = 10;
/** 움직이는 덩이의 길이. */
const SLUG = 20;
/** 되돌린 자국 한 칸의 크기와 간격. */
const MARK = 5;
const MARK_GAP = 2;

/** 그림이 놓이는 자리. 남는 폭을 여백으로 버리지 않도록 캔버스에서 역산한다. */
const SOURCE_X = 68;
const MIDDLE_X = 258;
const SINK_X = 456;
const AXIS_Y = 132;
const MID_TOP = 56;
const MID_BOTTOM = 208;
const GAUGE_X = 520;
const GAUGE_W = 62;
const GAUGE_BOTTOM = 212;
const GAUGE_TOP = 92;
const CAPTION_Y1 = 262;
const CAPTION_Y2 = 281;

/** 걸음 안의 지속시간. 총 재생 길이는 이 값들 + stepMs 로 정해진다. */
const COMET_MS = 170;
const PUSH_MS = 300;
const ARROW_MS = 220;
const GAUGE_MS = 260;
const BUMP_MS = 420;
/** 꽉 찬 관에 밀어 넣어 보는 덩이의 길이와, 들어가다 되튀는 거리. */
const BUMP_W = 12;
const BUMP_TRAVEL = 16;

/** 관 하나를 세워 둔 것. 전부 `drawStatic` 이 그 장면에서 매번 새로 만든다. */
type Pipe = {
  capacity: number;
  /** 관의 길이와 굵기. 관 안의 모든 것은 꼬리를 원점으로 하는 국소 좌표에서 그린다. */
  len: number;
  thick: number;
  group: SVGGElement;
  lanes: SVGRectElement[];
  head: SVGPolygonElement;
  back: SVGPolygonElement;
};

/** 정점 하나. 자리는 눈금으로 날아가는 운동이 출발점으로 쓴다. */
type Dot = { x: number; y: number; circle: SVGCircleElement; text: SVGTextElement };

type Spot = { x: number; y: number };

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

function el<K extends keyof SVGElementTagNameMap>(
  parent: SVGElement,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

export const undoByBackEdgeStageView: CanvasView = {
  canvas: { height: H },

  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    // viewBox 는 러너가 `canvas.height` 로 잡아 두었다. 여기서 다시 적지 않는다 (S-view).
    // 러너가 캔버스를 컨테이너에 먼저 붙이고 mount 를 부르므로 컨테이너를 비우지 않는다.
    void container;
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
     * 흘리는 걸음은 마디를 이어 달린다 — 길을 따라 흐르고, 화살촉이 자라고, 눈금
     * 칸이 날아간다. 되짚기가 가운데 끼어들면 앞 세대의 뒷마디가 깨어나 이미 새로
     * 선 화면을 덮는다. 깨어난 운동은 자기 세대를 확인하고 아니면 손대지 않는다.
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
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
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

    // ── 레이어 (뒤에서 앞으로). mount 에서 한 번 세우고 안쪽만 갈아 끼운다 ────
    const root = el(svg, 'g', {});
    const gEdges = el(root, 'g', {});
    const gGauge = el(root, 'g', {});
    const gNodes = el(root, 'g', {});
    const gLabels = el(root, 'g', {});
    const gCaption = el(root, 'g', {});

    // ── 지금 세워 둔 그림. 전부 `drawStatic` 이 그 장면에서 다시 만든다 ───────
    /** `scene.edges` 와 같은 차례. 자리를 못 잡은 관은 `null`. */
    let pipes: (Pipe | null)[] = [];
    let dots = new Map<string, Dot>();
    let blocks: SVGRectElement[] = [];
    let gaugeTotal: SVGTextElement | null = null;
    let slotPitch = 24;
    let slotH = 18;

    // ── 문안. 장면은 무엇을 말할지만 알고 문자는 여기서 만든다 (C10) ─────────
    function sentence(caption: UndoCaption): string {
      switch (caption.kind) {
        case 'pathForward':
          return t(
            'caption.pathForward',
            'A route along forward arrows. Its narrowest pipe passes {amount}.',
            { amount: caption.amount },
          );
        case 'pathReverse':
          return t('caption.pathReverse', 'A back arrow opens one more route — it passes {amount}.', {
            amount: caption.amount,
          });
        case 'pushFirst':
          return t(
            'caption.pushFirst',
            '{amount} gets through. Now each filled pipe can be pushed back by what it holds.',
            { amount: caption.amount },
          );
        case 'push':
          return t('caption.push', '{amount} more gets through — {total} in all.', {
            amount: caption.amount,
            total: caption.total,
          });
        case 'pushReverse':
          return t(
            'caption.pushReverse',
            'The new flow pushes the old one out of that pipe — {total} in all.',
            { total: caption.total },
          );
        case 'blocked':
          return t('caption.blocked', 'Forward arrows lead nowhere now. Stuck at {total}.', {
            total: caption.total,
          });
        case 'done':
          return t('caption.done', 'No route left, even along back arrows. {total} is the most.', {
            total: caption.total,
          });
        default:
          return '';
      }
    }

    const captionSize = Number.parseFloat(fontSizes.md);
    const estWidth = (s: string): number => {
      let w = 0;
      for (const ch of s) w += ch.codePointAt(0)! > 0x2e80 ? captionSize : captionSize * 0.55;
      return w;
    };

    /** 두 줄까지 접어 앉힌다. 캡션도 매번 새로 지어 앞 걸음의 글자가 남지 않는다. */
    function drawCaption(text: string): void {
      const lines: string[] = [];
      let cur = '';
      for (const word of text.split(' ')) {
        const next = cur.length > 0 ? `${cur} ${word}` : word;
        if (cur.length > 0 && estWidth(next) > W - 60) {
          lines.push(cur);
          cur = word;
        } else {
          cur = next;
        }
      }
      if (cur.length > 0) lines.push(cur);
      for (let i = 0; i < 2; i += 1) {
        const node = el(gCaption, 'text', {
          x: W / 2,
          y: i === 0 ? CAPTION_Y1 : CAPTION_Y2,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        node.textContent = lines[i] ?? '';
      }
    }

    // ── 자리. 그리기 전에 한 번에 셈한다 ────────────────────────────────────
    //
    // 그리면서 이웃의 자리를 재면 순회 순서가 곧 숨은 상태가 된다.
    function spotsOf(scene: UndoByBackEdgeScene): Map<string, Spot> {
      const middles = scene.nodes.filter((n) => n !== scene.source && n !== scene.sink);
      const out = new Map<string, Spot>();
      for (const id of scene.nodes) {
        if (id === scene.source) {
          out.set(id, { x: SOURCE_X, y: AXIS_Y });
        } else if (id === scene.sink) {
          out.set(id, { x: SINK_X, y: AXIS_Y });
        } else if (middles.length <= 1) {
          out.set(id, { x: MIDDLE_X, y: AXIS_Y });
        } else {
          const step = (MID_BOTTOM - MID_TOP) / (middles.length - 1);
          out.set(id, { x: MIDDLE_X, y: MID_TOP + middles.indexOf(id) * step });
        }
      }
      return out;
    }

    // ── 관 안을 칠하는 것들 ─────────────────────────────────────────────────
    const laneY = (pipe: Pipe, index: number): number =>
      -pipe.thick / 2 + index * LANE + LANE_INSET;

    /** 찬 차선을 칠한다. 빈 차선은 테두리로 남는다 — 차선 수가 곧 용량이라 세어져야 한다. */
    function paintLanes(pipe: Pipe, litCount: number): void {
      for (let i = 0; i < pipe.lanes.length; i += 1) {
        const lit = i < litCount;
        pipe.lanes[i].setAttribute('fill', lit ? c.primary : c.bg);
        pipe.lanes[i].setAttribute('stroke', lit ? 'none' : c.border);
      }
    }

    const headPoints = (len: number, half: number): string =>
      `${len + 1},${-half} ${len + 1 + HEAD_LEN},0 ${len + 1},${half}`;

    const backPoints = (half: number): string => `${-1},${-half} ${-1 - HEAD_LEN},0 ${-1},${half}`;

    /**
     * 화살촉 둘을 그 흐름에 맞춘다.
     *
     * 머리는 빈 폭, 꼬리는 찬 폭. 둘 다 흐름 하나에서 나오므로 어긋날 수 없다.
     * 두 속성(`points` · `opacity`)을 늘 명시로 써 앞 걸음의 값이 남지 않는다.
     */
    function setArrows(pipe: Pipe, flow: number): void {
      const headHalf = ((pipe.capacity - flow) * LANE) / 2;
      const backHalf = (flow * LANE) / 2;
      pipe.head.setAttribute('points', headPoints(pipe.len, Math.max(0.01, headHalf)));
      pipe.head.setAttribute('opacity', headHalf > 0.2 ? '1' : '0');
      pipe.back.setAttribute('points', backPoints(Math.max(0.01, backHalf)));
      pipe.back.setAttribute('opacity', backHalf > 0.2 ? '1' : '0');
    }

    // ── 화면 짓기 ───────────────────────────────────────────────────────────

    function drawStatic(scene: UndoByBackEdgeScene): void {
      gEdges.textContent = '';
      gGauge.textContent = '';
      gNodes.textContent = '';
      gLabels.textContent = '';
      gCaption.textContent = '';
      pipes = scene.edges.map(() => null);
      dots = new Map();
      blocks = [];
      gaugeTotal = null;

      const spots = spotsOf(scene);

      // 지금 짚는 길 · 불 켜진 정점 · 앞을 막은 목. 전부 장면에서 파생된다.
      const onPath = new Set<number>();
      const litNodes = new Set<string>();
      let walls = new Set<number>();
      if (scene.step === 'blocked' || scene.step === 'done') {
        const reach = forwardReachable(scene);
        for (const id of reach) litNodes.add(id);
        walls = new Set(saturatedFrontier(scene, reach));
      } else if (scene.path !== null) {
        for (const id of scene.path.nodes) litNodes.add(id);
        for (const step of pathSteps(scene.edges, scene.path)) onPath.add(step.edge);
      }

      // 들어오는 곳으로 들어가는 화살 — 그림 전체의 방향을 먼저 세운다.
      if (spots.has(scene.source)) {
        el(gEdges, 'line', {
          x1: 18,
          y1: AXIS_Y,
          x2: SOURCE_X - R - HEAD_LEN - 2,
          y2: AXIS_Y,
          stroke: c.textMuted,
          'stroke-width': 2,
        });
        el(gEdges, 'polygon', {
          points: `${SOURCE_X - R - HEAD_LEN - 2},${AXIS_Y - 6} ${SOURCE_X - R - 2},${AXIS_Y} ${SOURCE_X - R - HEAD_LEN - 2},${AXIS_Y + 6}`,
          fill: c.textMuted,
        });
      }

      for (let i = 0; i < scene.edges.length; i += 1) {
        const e = scene.edges[i];
        const a = spots.get(e.from);
        const b = spots.get(e.to);
        if (a === undefined || b === undefined) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0) continue;
        const ux = dx / dist;
        const uy = dy / dist;
        const trim = R + NODE_GAP;
        const len = Math.max(24, dist - trim * 2);
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const thick = e.capacity * LANE;
        const flow = scene.flow[i] ?? 0;
        const state = walls.has(i) ? 'blocked' : onPath.has(i) ? 'active' : 'idle';

        const group = el(gEdges, 'g', {
          transform: `translate(${a.x + ux * trim} ${a.y + uy * trim}) rotate(${deg})`,
        });
        el(group, 'rect', {
          x: 0,
          y: -thick / 2,
          width: len,
          height: thick,
          rx: 4,
          fill: c.bgSubtle,
          stroke: state === 'blocked' ? c.danger : state === 'active' ? c.itemActive : c.border,
          'stroke-width': state === 'idle' ? 1.4 : 2.6,
        });
        const lanes: SVGRectElement[] = [];
        for (let k = 0; k < e.capacity; k += 1) {
          lanes.push(
            el(group, 'rect', {
              x: 0,
              y: -thick / 2 + k * LANE + LANE_INSET,
              width: len,
              height: LANE - LANE_INSET * 2,
              fill: c.bg,
              stroke: c.border,
              'stroke-width': 0.8,
            }),
          );
        }
        const head = el(group, 'polygon', { points: '', fill: c.textMuted });
        const back = el(group, 'polygon', { points: '', fill: c.accent, opacity: 0 });
        const pipe: Pipe = { capacity: e.capacity, len, thick, group, lanes, head, back };
        paintLanes(pipe, flow);
        setArrows(pipe, flow);
        pipes[i] = pipe;

        // 글자는 회전하지 않는 틀에 둔다 — 세로 관에서 라벨까지 세워지면 못 읽는다.
        const nx = -uy;
        const ny = ux;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const away = (cx - MIDDLE_X) * nx + (cy - AXIS_Y) * ny >= 0 ? 1 : -1;
        const off = thick / 2 + 11;
        const text = el(gLabels, 'text', {
          x: cx + nx * off * away,
          y: cy + ny * off * away + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        text.textContent = `${flow}/${e.capacity}`;

        // 되돌린 자국 — 이 관에서 밀려 나간 양. 라벨 반대쪽 벽 바깥에 찍고
        // 지우지 않는다. 관 밖의 빈 네모라 찬 차선과 어휘가 갈린다.
        const undone = scene.undone[i] ?? 0;
        const room = Math.max(0, Math.floor((len - 6) / (MARK + MARK_GAP)));
        const marks = Math.min(undone, room);
        const markY = away >= 0 ? -thick / 2 - 4 - MARK : thick / 2 + 4;
        for (let k = 0; k < marks; k += 1) {
          el(group, 'rect', {
            x: 4 + k * (MARK + MARK_GAP),
            y: markY,
            width: MARK,
            height: MARK,
            rx: 1,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 1.2,
          });
        }
      }

      for (const id of scene.nodes) {
        const p = spots.get(id);
        if (p === undefined) continue;
        const on = litNodes.has(id);
        const circle = el(gNodes, 'circle', {
          cx: p.x,
          cy: p.y,
          r: R,
          fill: on ? c.itemActive : c.itemDefault,
          stroke: on ? c.itemActive : c.border,
          'stroke-width': 2,
        });
        const text = el(gNodes, 'text', {
          x: p.x,
          y: p.y + 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: on ? c.stateInk : c.text,
        });
        text.textContent = id;
        dots.set(id, { x: p.x, y: p.y, circle, text });
      }

      drawGauge(scene);
      drawCaption(sentence(captionOf(scene)));
    }

    /** 나가는 곳에 닿은 양. 칸 수는 들어오는 곳에서 나갈 수 있는 최대치다. */
    function drawGauge(scene: UndoByBackEdgeScene): void {
      if (!dots.has(scene.sink)) return;
      const count = Math.max(1, outCapacity(scene));
      // 칸 수가 늘면 간격을 줄여 담는다. 세로를 늘리지 않는다 (S-view).
      slotPitch = Math.min(24, (GAUGE_BOTTOM - GAUGE_TOP) / count);
      slotH = Math.max(6, slotPitch - 5);
      const total = totalAt(scene);

      el(gGauge, 'line', {
        x1: SINK_X + R + 2,
        y1: AXIS_Y,
        x2: GAUGE_X - 4,
        y2: AXIS_Y,
        stroke: c.border,
        'stroke-width': 1.4,
        'stroke-dasharray': '3 3',
      });

      for (let i = 0; i < count; i += 1) {
        el(gGauge, 'rect', {
          x: GAUGE_X,
          y: GAUGE_BOTTOM - slotH - i * slotPitch,
          width: GAUGE_W,
          height: slotH,
          rx: 3,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 1.2,
          'stroke-dasharray': '3 3',
        });
      }
      for (let i = 0; i < count; i += 1) {
        const filled = i < total;
        blocks.push(
          el(gGauge, 'rect', {
            x: GAUGE_X,
            y: GAUGE_BOTTOM - slotH - i * slotPitch,
            width: GAUGE_W,
            height: slotH,
            rx: 3,
            fill: c.primary,
            // 다 끝난 뒤에는 닿은 양이 최대치임이 확정된다 — 그 테두리가 남는다.
            stroke: scene.finished && filled ? c.accent : 'none',
            'stroke-width': 2,
            opacity: filled ? 1 : 0,
          }),
        );
      }

      // 앞으로 난 화살만으로 막혔던 자리. 지워지지 않아 "넷에서 막히고 여섯까지
      // 갔다" 가 완주 화면에 남는다.
      for (const level of scene.stuck) {
        if (level < 1 || level > count) continue;
        el(gGauge, 'line', {
          x1: GAUGE_X - 7,
          y1: GAUGE_BOTTOM - slotH - (level - 1) * slotPitch,
          x2: GAUGE_X + GAUGE_W + 7,
          y2: GAUGE_BOTTOM - slotH - (level - 1) * slotPitch,
          stroke: c.danger,
          'stroke-width': 1.6,
          'stroke-dasharray': '4 3',
        });
      }

      const gaugeLabel = el(gGauge, 'text', {
        x: GAUGE_X + GAUGE_W / 2,
        y: GAUGE_TOP - 8,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      gaugeLabel.textContent = t('label.received', 'reached {sink}', { sink: scene.sink });
      gaugeTotal = el(gGauge, 'text', {
        x: GAUGE_X + GAUGE_W / 2,
        y: GAUGE_BOTTOM + 22,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xl,
        'font-weight': 700,
        fill: c.text,
      });
      gaugeTotal.textContent = String(total);
    }

    // ── 걸음 하나를 흐르게 한다 ─────────────────────────────────────────────

    /** 길을 이루는 관들. 하나라도 못 찾으면 빈 목록 — 그러면 운동을 접는다. */
    function segmentsOf(
      scene: UndoByBackEdgeScene,
    ): { pipe: Pipe; reverse: boolean; edge: number }[] {
      if (scene.path === null) return [];
      const out: { pipe: Pipe; reverse: boolean; edge: number }[] = [];
      for (const step of pathSteps(scene.edges, scene.path)) {
        const pipe = pipes[step.edge];
        if (pipe === null || pipe === undefined || pipe.len <= 0) return [];
        out.push({ pipe, reverse: step.reverse, edge: step.edge });
      }
      return out;
    }

    /** 이어 붙인 길 위의 한 점 — 지금 몇 번째 관의 어디까지 왔나. */
    function walkAt(
      lens: number[],
      whole: number,
      e: number,
    ): { passed: number; at: number; lead: number } {
      const travelled = e * whole;
      let acc = 0;
      for (let j = 0; j < lens.length; j += 1) {
        if (travelled >= acc + lens[j]) {
          acc += lens[j];
          continue;
        }
        return { passed: j, at: j, lead: travelled - acc };
      }
      return { passed: lens.length, at: -1, lead: 0 };
    }

    function paintDot(id: string, on: boolean): void {
      const dot = dots.get(id);
      if (dot === undefined) return;
      dot.circle.setAttribute('fill', on ? c.itemActive : c.itemDefault);
      dot.circle.setAttribute('stroke', on ? c.itemActive : c.border);
      dot.text.setAttribute('fill', on ? c.stateInk : c.text);
    }

    /**
     * 찾은 길을 훑는다. 역방향 걸음은 관을 거슬러 훑어 방향이 드러난다.
     *
     * 한 길을 따라 흐르는 것은 한 뜻이라 시계도 하나다 — 관마다 따로 돌리지 않는다.
     */
    async function playPath(scene: UndoByBackEdgeScene): Promise<void> {
      const segs = segmentsOf(scene);
      const path = scene.path;
      if (path === null || segs.length === 0) return;
      const lens = segs.map((s) => s.pipe.len);
      const whole = lens.reduce((a, b) => a + b, 0);
      const comets = segs.map((s) =>
        el(s.pipe.group, 'rect', {
          x: 0,
          y: -2,
          width: Math.min(SLUG, s.pipe.len),
          height: 4,
          rx: 2,
          fill: c.accent,
          opacity: 0,
        }),
      );
      await animate(COMET_MS * segs.length, (e) => {
        const { passed, at, lead } = walkAt(lens, whole, e);
        for (let k = 0; k < path.nodes.length; k += 1) paintDot(path.nodes[k], k <= passed);
        for (let j = 0; j < comets.length; j += 1) {
          if (j !== at) {
            comets[j].setAttribute('opacity', '0');
            continue;
          }
          const pipe = segs[j].pipe;
          const width = Math.min(SLUG, pipe.len);
          const nose = segs[j].reverse ? pipe.len - lead : lead;
          const x = Math.max(0, Math.min(pipe.len - width, nose - width / 2));
          comets[j].setAttribute('x', String(x));
          comets[j].setAttribute('opacity', '1');
        }
      });
    }

    /**
     * 길을 따라 덩이를 보낸다. 앞으로 가는 관에서는 덩이가 지나간 만큼 차오르고,
     * 거슬러 가는 관에서는 앞서 찬 것이 덩이에 밀려 꼬리 밖으로 나간다.
     *
     * 세 마디를 이어 달린다 — 흐르고, 되돌릴 폭이 자라고, 눈금 칸이 날아가 앉는다.
     * 마디를 넘을 때마다 자기 세대인지 본다.
     */
    async function playPush(scene: UndoByBackEdgeScene, my: number): Promise<void> {
      const path = scene.path;
      const segs = segmentsOf(scene);
      if (path === null || segs.length === 0 || path.amount <= 0) return;

      // 흐르기 전의 관 모습. 앞 장면을 들추지 않고 장면이 쥔 폭에서 셈한다 (S-scene).
      const band = segs.map((s) => {
        const after = scene.flow[s.edge] ?? 0;
        const before = s.reverse ? after + path.amount : after - path.amount;
        return { ...s, after, before, from: s.reverse ? after : before };
      });
      const lens = band.map((s) => s.pipe.len);
      const whole = lens.reduce((a, b) => a + b, 0);
      const total = totalAt(scene);
      const wasTotal = Math.max(0, total - path.amount);

      const movers = band.map((s) =>
        el(s.pipe.group, 'rect', { x: 0, y: 0, width: 0, height: 0, fill: c.primary, opacity: 0 }),
      );
      const slugs = band.map((s) =>
        el(s.pipe.group, 'rect', {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rx: 2,
          fill: c.accent,
          opacity: 0,
        }),
      );

      // 아직 못 온 만큼을 뒤로 물린다 — 정적 그리기는 이미 흐르고 난 뒤를 세웠다.
      for (const s of band) {
        paintLanes(s.pipe, s.before);
        setArrows(s.pipe, s.before);
      }
      for (let i = wasTotal; i < total && i < blocks.length; i += 1) {
        blocks[i].setAttribute('opacity', '0');
      }
      if (gaugeTotal !== null) gaugeTotal.textContent = String(wasTotal);

      await animate(PUSH_MS * band.length, (e) => {
        const { passed, at, lead } = walkAt(lens, whole, e);
        for (let j = 0; j < band.length; j += 1) {
          const s = band[j];
          if (j !== at) {
            paintLanes(s.pipe, j < passed ? s.after : s.before);
            movers[j].setAttribute('opacity', '0');
            slugs[j].setAttribute('opacity', '0');
            continue;
          }
          // 움직이지 않는 차선은 미리 확정해 둔다 — 앞으로 갈 때는 흐르기 전 상태,
          // 거슬러 갈 때는 밀어내고 난 뒤 상태가 그대로 남는 몫이다.
          paintLanes(s.pipe, s.reverse ? s.after : s.before);
          const nose = s.reverse ? s.pipe.len - lead : lead;
          const y = String(laneY(s.pipe, s.from));
          const h = String(Math.max(2, path.amount * LANE - LANE_INSET * 2));
          movers[j].setAttribute('x', '0');
          movers[j].setAttribute('width', String(Math.max(0, Math.min(s.pipe.len, nose))));
          movers[j].setAttribute('y', y);
          movers[j].setAttribute('height', h);
          movers[j].setAttribute('opacity', nose > 0.5 ? '1' : '0');
          // 앞으로 갈 때는 덩이가 차오름의 앞머리를 끌고, 거슬러 갈 때는 뒤에서 민다.
          const slugX = s.reverse ? nose : Math.max(0, nose - SLUG);
          const slugW = s.reverse
            ? Math.min(SLUG, s.pipe.len - nose)
            : Math.min(SLUG, nose);
          slugs[j].setAttribute('x', String(slugX));
          slugs[j].setAttribute('width', String(Math.max(0, slugW)));
          slugs[j].setAttribute('y', y);
          slugs[j].setAttribute('height', h);
          slugs[j].setAttribute('opacity', slugW > 0.5 ? '1' : '0');
        }
      });
      if (!alive(my)) return;
      for (const s of band) paintLanes(s.pipe, s.after);
      for (const node of [...movers, ...slugs]) node.setAttribute('opacity', '0');

      // 흘린 뒤에야 되돌릴 폭이 생긴다 — 꼬리 화살이 찬 만큼 자라나고, 도로 비면 사라진다.
      await animate(ARROW_MS, (e) => {
        for (const s of band) setArrows(s.pipe, s.before + (s.after - s.before) * e);
      });
      if (!alive(my)) return;
      for (const s of band) setArrows(s.pipe, s.after);

      // 나가는 곳에 닿은 만큼 눈금 칸이 날아가 앉는다.
      const gained = Math.min(blocks.length, total) - Math.min(blocks.length, wasTotal);
      if (gained <= 0) return;
      const sink = dots.get(scene.sink);
      if (gaugeTotal !== null) gaugeTotal.textContent = String(total);
      const flying = blocks.slice(wasTotal, wasTotal + gained);
      for (const b of flying) b.setAttribute('opacity', '1');
      const fromX = (sink?.x ?? GAUGE_X) - GAUGE_W / 2;
      const fromY = (sink?.y ?? AXIS_Y) - slotH / 2;
      await animate(GAUGE_MS, (e) => {
        for (let i = 0; i < flying.length; i += 1) {
          const toY = GAUGE_BOTTOM - slotH - (wasTotal + i) * slotPitch;
          flying[i].setAttribute('x', String(fromX + (GAUGE_X - fromX) * e));
          flying[i].setAttribute('y', String(fromY + (toY - fromY) * e));
        }
      });
    }

    /** 꽉 찬 관에 밀어 넣어 보다 되튄다 — 앞을 막고 있는 것이 무엇인지 짚는다. */
    async function playBump(scene: UndoByBackEdgeScene): Promise<void> {
      const walls = saturatedFrontier(scene, forwardReachable(scene))
        .map((i) => pipes[i])
        .filter((pipe): pipe is Pipe => pipe !== null && pipe !== undefined);
      if (walls.length === 0) return;
      const rams = walls.map((pipe) =>
        el(pipe.group, 'rect', {
          x: 0,
          y: -pipe.thick / 2 + LANE_INSET,
          width: Math.min(BUMP_W, pipe.len),
          height: Math.max(4, pipe.thick - LANE_INSET * 2),
          rx: 2,
          fill: c.accent,
          opacity: 1,
        }),
      );
      await animate(BUMP_MS, (e) => {
        const bump = e < 0.5 ? e * 2 : (1 - e) * 2;
        for (const ram of rams) ram.setAttribute('x', String(bump * BUMP_TRAVEL));
      });
      for (const ram of rams) ram.setAttribute('opacity', '0');
    }

    async function render(
      next: UndoByBackEdgeScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: UndoByBackEdgeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      drawStatic(next);
      if (!opts.animate) return;

      switch (next.step) {
        case 'path':
          await playPath(next);
          break;
        case 'push':
          await playPush(next, my);
          break;
        case 'blocked':
        case 'done':
          await playBump(next);
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
        // 프레임을 거두면 tick 이 아예 안 불린다. 기다리던 약속은 여기서 푼다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
