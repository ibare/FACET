/**
 * bottleneck-sets-flow-stage — 관이 차오르는 그림.
 *
 * ── 왜 이 모양인가
 *
 * 굵기가 곧 관의 용량이다. 흘려보낸 양은 관 한가운데를 차지하는 심(core)으로
 * 그리고, 그 심이 두꺼워져 관 벽에 닿으면 꽉 찬 것이다. 그래서 "가장 좁은 곳이
 * 먼저 꽉 찬다" 가 색이 아니라 **두께**로 보인다.
 *
 * 좌표는 여기서 정한다 — 들어오는 곳은 왼쪽, 나가는 곳은 오른쪽, 나머지는 가운데
 * 열에 위아래로 편다. 장면은 구조만 말한다 (S-piece).
 *
 * ── 칠을 어떻게 갈랐나
 *
 * **채움은 값의 형편**이다 — 심의 두께가 얼마나 찼나를 말하고, 꽉 차면 심이 벽에
 * 닿으며 색이 굳고 관 끝에 막이 내려앉는다. **테두리와 조임쇠는 짚음의 표식**이다
 * — 이번 길에 들었나(관 테), 그리고 그 길의 병목이었나(조임쇠). 옮기기 전에는
 * 관 테 하나에 `그냥` · `꽉 참` · `이번 길` 세 뜻이 실려 이번 길에 든 관이 꽉
 * 찼다는 표시를 잃고 있었다. 이제 두 어휘가 서로를 지우지 않는다.
 *
 * **조임쇠는 지워지지 않는다.** 바퀴마다 병목이 어디였는지가 끝까지 남아야
 * "왜 더는 못 흘리나" 가 마지막 화면에 있다 — 옮기기 전에는 다음 길을 찾을 때
 * 통째로 지워져 마지막 한 바퀴의 것만 남았다.
 *
 * ── 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`showPath()` · `markNarrowest()` …) 를 두지 않는다. 그
 * 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터 다시 밟는
 * 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의 화면
 * 전체**를 세운다 (S-scene).
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 방금 밟은 걸음 하나만 프레임으로
 * 흐르게 하고, 거짓이면 곧바로 끝 자리에 세운다 — 되짚기와 첫 그림이 그 길이다.
 * 운동이 끝나면 **그 장면을 통째로 다시 세운다.** 속성을 하나씩 거두면 반드시
 * 하나를 빠뜨리는데, 이 길은 그 목록 자체를 없앤다.
 *
 * 탐침과 테는 **운동 중에만 짓는다.** 정지 화면에 두고 `opacity` 만 되돌리면
 * 자리(`cx`/`cy`/`r`)가 앞 걸음 값으로 남아 되짚기 판정에서 어긋난다.
 *
 * 지연 발화를 막는 것은 `opts.animate` 검사와 **세대 빗장** 둘뿐이다.
 * `isInstant` · `onScrubStart` 는 러너가 장면 조각에서 부르지 않는다 (S-scene).
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
  captionOf,
  currentRound,
  exitEdges,
  flowsOf,
  roomsOf,
  totalOf,
  type BottleneckSetsFlowScene,
  type FlowCaption,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 300;

/** 정점 원 반지름. */
const NODE_R = 26;
/** 좌우 최소 여백 — 들어오는 곳/나가는 곳은 이 여백을 두고 캔버스 폭을 채운다. */
const SIDE_MIN = 46;
/** 관 끝과 정점 사이 틈. 방향 촉이 이 틈에 앉는다. */
const END_GAP = 12;
/** 굵기 1 당 픽셀의 상한. 실제 값은 정점 크기에서 역산한다. */
const UNIT_MAX = 10;

/** 위쪽 여백과 아래 띠(캡션 + 도착 표시). 그림은 그 사이를 채운다. */
const TOP_PAD = 48;
const BOTTOM_BAND = 44;
const Y_MID = (TOP_PAD + (H - BOTTOM_BAND)) / 2;
/** 가운데 열이 위아래로 벌어지는 폭 — 아래 띠에 닿지 않는 데까지. */
const Y_SPREAD = H - BOTTOM_BAND - NODE_R - Y_MID;
const CAPTION_Y = H - 14;

/** 라벨을 관 바깥으로 밀어내는 거리 (관 벽에서부터). */
const LABEL_LIFT = 13;
/**
 * 눈금 라벨은 관 뒤쪽, 메모 라벨은 앞쪽에 앉힌다. 조임쇠가 한가운데를 물므로
 * 그 자리를 비워 두는 것이고, 세로 관에서도 둘이 겹치지 않는다.
 */
const NUM_AT = 0.72;
const NOTE_AT = 0.22;

/** 조임쇠가 열려 있을 때와 물었을 때의 벌어짐. */
const JAW_OPEN = 15;
const JAW_BITE = 3;
/** 지나간 바퀴의 조임쇠는 물린 채 물러나 있는다. */
const JAW_PAST_ALPHA = 0.5;

/** 길을 짚어 갈 때 관 하나를 지나는 시간. */
const TRACE_MS = 190;
/** 조임쇠가 무는 시간. */
const JAW_MS = 240;
/** 관 하나가 차오르는 시간. */
const FILL_MS = 260;
/** 막이 내려앉는 시간. */
const SEAL_MS = 200;
/** 막힌 관을 찔러 보는 시간 (왕복 전체). */
const POKE_MS = 300;
/** 막힌 관을 얼마나 들어가 보나. */
const POKE_DEPTH = 0.32;
/** 다 찼음을 알리는 테가 번지는 시간. */
const TALLY_MS = 420;
/** 그 테가 정점 밖으로 번지는 거리. */
const RING_GROW = 16;

type Pt = { x: number; y: number };

/**
 * 관 하나의 자리. **DOM 을 쥐지 않는다** — 손잡이와 수치를 한 객체에 묶어 두던
 * 것이 옮기기 전 이 조각의 숨은 상태였다.
 */
type PipeGeom = {
  /** `scene.edges` 의 차례. */
  at: number;
  start: Pt;
  ux: number;
  uy: number;
  len: number;
  thick: number;
  deg: number;
  numAt: Pt;
  noteAt: Pt;
};

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

/** 조임쇠 한 짝의 자리. 관 한가운데를 위아래에서 문다. */
function jawTransform(geom: PipeGeom, gap: number, lower: boolean): string {
  const off = geom.thick / 2 + gap;
  return lower
    ? `translate(${geom.len / 2} ${off}) rotate(180)`
    : `translate(${geom.len / 2} ${-off})`;
}

/** 캡션 문안. 장면은 무엇을 말할지와 인자만 주고 문자는 여기서 만든다 (C10). */
function captionText(caption: FlowCaption | null, tr: Translate): string {
  if (caption === null) return '';
  switch (caption.kind) {
    case 'path':
      return tr('caption.pathFound', 'Found a route that still has room: {route}', {
        route: caption.nodes.join(' → '),
      });
    case 'narrowest':
      return tr(
        'caption.narrowest',
        'The narrowest pipe on this route has room for {amount} — that is all this route can take',
        { amount: caption.amount },
      );
    case 'pushed':
      return tr('caption.pushed', 'Sent {amount} through. {total} has arrived so far', {
        amount: caption.amount,
        total: caption.total,
      });
    case 'blocked':
      return tr(
        'caption.noMoreRoom',
        'Every pipe leaving the source is full — there is no route left',
      );
    case 'done':
      return tr('caption.done', '{total} in total — nothing more can get through', {
        total: caption.total,
      });
    default:
      return '';
  }
}

export const bottleneckSetsFlowStageView: CanvasView = {
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
     * 이 조각의 운동은 마디를 이어 달린다 — 흘리는 걸음이 관을 채우고 나서 막을
     * 내려앉힌다. 되짚기가 가운데 끼어들면 앞 세대의 뒷마디가 깨어나 이미 새로 선
     * 화면을 덮는다. 정적 그리기가 손잡이를 **재할당**하므로, 깨어난 운동이 쥔
     * 옛 손잡이가 아니라 새 손잡이를 타고 살아 있는 화면에 쓰는 길도 있다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    const ease = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);

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
    const pipeLayer = el('g');
    const nodeLayer = el('g');
    const labelLayer = el('g');
    const motionLayer = el('g');
    const chromeLayer = el('g');
    root.appendChild(pipeLayer);
    root.appendChild(nodeLayer);
    root.appendChild(labelLayer);
    root.appendChild(motionLayer);
    root.appendChild(chromeLayer);
    svg.appendChild(root);

    // ── 지금 세워 둔 그림. 전부 `drawStatic` 이 그 장면에서 다시 만든다 ───────
    let geoms: PipeGeom[] = [];
    let spots = new Map<string, Pt>();
    let coreOf = new Map<number, SVGRectElement>();
    let tubeOf = new Map<number, SVGRectElement>();
    let sealOf = new Map<number, SVGRectElement>();
    let jawsOf = new Map<number, { up: SVGPolygonElement; down: SVGPolygonElement }>();

    // ── 자리 셈. 먼저 한 번에 셈하고 그 다음에 그린다 ────────────────────────

    /**
     * 정점과 관의 자리를 **한 번에** 정한다. 그리면서 이웃의 지금 좌표를 읽으면
     * 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).
     */
    function layout(scene: BottleneckSetsFlowScene): void {
      spots = new Map<string, Pt>();
      geoms = [];

      const xIn = SIDE_MIN + NODE_R;
      const xOut = W - SIDE_MIN - NODE_R;
      const xMid = W / 2;
      spots.set(scene.source, { x: xIn, y: Y_MID });
      spots.set(scene.sink, { x: xOut, y: Y_MID });
      const middles = scene.nodes.filter((id) => id !== scene.source && id !== scene.sink);
      middles.forEach((id, i) => {
        const y =
          middles.length < 2 ? Y_MID : Y_MID - Y_SPREAD + (i * (Y_SPREAD * 2)) / (middles.length - 1);
        spots.set(id, { x: xMid, y });
      });

      // 굵기 1 당 픽셀 — 가장 굵은 관이 정점보다 두꺼워지지 않게 역산한다.
      const widest = scene.edges.reduce((m, pipe) => Math.max(m, pipe.capacity), 1);
      const unit = Math.max(4, Math.min(UNIT_MAX, Math.floor((NODE_R * 1.15) / widest)));
      const centre = { x: xMid, y: Y_MID };

      scene.edges.forEach((spec, at) => {
        const a = spots.get(spec.from);
        const b = spots.get(spec.to);
        if (a === undefined || b === undefined) return;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const span = Math.hypot(dx, dy);
        if (span <= 0) return;
        const ux = dx / span;
        const uy = dy / span;
        const start = { x: a.x + ux * (NODE_R + END_GAP), y: a.y + uy * (NODE_R + END_GAP) };
        const len = span - 2 * (NODE_R + END_GAP);
        const thick = spec.capacity * unit;

        // 라벨은 그림 바깥쪽 — 가운데에서 멀어지는 법선을 고른다.
        const mid = { x: start.x + ux * len * 0.5, y: start.y + uy * len * 0.5 };
        let nx = -uy;
        let ny = ux;
        const away = nx * (mid.x - centre.x) + ny * (mid.y - centre.y);
        if (away < -1e-6 || (Math.abs(away) <= 1e-6 && nx < 0)) {
          nx = -nx;
          ny = -ny;
        }
        const lift = thick / 2 + LABEL_LIFT;

        geoms.push({
          at,
          start,
          ux,
          uy,
          len,
          thick,
          deg: (Math.atan2(dy, dx) * 180) / Math.PI,
          numAt: { x: start.x + ux * len * NUM_AT + nx * lift, y: start.y + uy * len * NUM_AT + ny * lift },
          noteAt: {
            x: start.x + ux * len * NOTE_AT + nx * lift,
            y: start.y + uy * len * NOTE_AT + ny * lift,
          },
        });
      });
    }

    function geomAt(at: number): PipeGeom | undefined {
      return geoms.find((g) => g.at === at);
    }

    /** 관 위의 한 점. `t` 는 0(시작)~1(끝). */
    function pointOn(geom: PipeGeom, t: number): Pt {
      return { x: geom.start.x + geom.ux * geom.len * t, y: geom.start.y + geom.uy * geom.len * t };
    }

    /** 탐침은 관보다 굵어지지 않는다 — 가장 가는 관에서도 안에 담겨 보여야 한다. */
    function probeR(geom: PipeGeom): number {
      return Math.max(3.5, Math.min(6, geom.thick / 2));
    }

    function makeProbe(fill: string): SVGCircleElement {
      const node = el('circle', { cx: 0, cy: 0, r: 6, fill });
      motionLayer.appendChild(node);
      return node;
    }

    function placeProbe(node: SVGCircleElement, geom: PipeGeom, t: number): void {
      const p = pointOn(geom, t);
      node.setAttribute('cx', String(p.x));
      node.setAttribute('cy', String(p.y));
      node.setAttribute('r', String(probeR(geom)));
    }

    /** 심의 두께를 그 관에 흐르는 양으로 정한다. 채움 = 값의 형편. */
    function setCore(node: SVGRectElement, geom: PipeGeom, value: number, capacity: number): void {
      const h = Math.max(0, Math.min(1, value / capacity)) * geom.thick;
      node.setAttribute('y', String(-h / 2));
      node.setAttribute('height', String(h));
      node.setAttribute('rx', String(Math.min(3, h / 2)));
    }

    function setSealShown(node: SVGRectElement, shown: number): void {
      node.setAttribute('opacity', String(shown));
      node.setAttribute('transform', `scale(1 ${0.2 + 0.8 * shown})`);
    }

    // ── 정적 그리기 — 그 장면이 말하는 것을 전부 세운다 ──────────────────────

    function drawStatic(scene: BottleneckSetsFlowScene): void {
      layout(scene);
      pipeLayer.textContent = '';
      nodeLayer.textContent = '';
      labelLayer.textContent = '';
      motionLayer.textContent = '';
      chromeLayer.textContent = '';
      coreOf = new Map();
      tubeOf = new Map();
      sealOf = new Map();
      jawsOf = new Map();

      const flows = flowsOf(scene);
      const rooms = roomsOf(scene);
      const round = currentRound(scene);
      const onRoute = new Set<number>(round?.route ?? []);
      const nowTight = new Set<number>(round?.narrowest ?? []);
      /** 지나간 바퀴의 병목. **지워지지 않는다** — 그것이 이 조각의 주장이다. */
      const pastTight = new Set<number>();
      scene.rounds.forEach((r, i) => {
        if (i === scene.rounds.length - 1) return;
        for (const at of r.narrowest) pastTight.add(at);
      });

      for (const geom of geoms) {
        const spec = scene.edges[geom.at];
        const flow = flows[geom.at];
        const room = rooms[geom.at];
        const full = room === 0;

        const group = el('g', {
          transform: `translate(${geom.start.x} ${geom.start.y}) rotate(${geom.deg})`,
        });

        // 테두리 = 짚음의 표식. 이번 길에 들었나만 말한다.
        const tube = el('rect', {
          x: 0,
          y: -geom.thick / 2,
          width: geom.len,
          height: geom.thick,
          rx: 4,
          fill: c.bgSubtle,
          stroke: onRoute.has(geom.at) ? c.itemComparing : c.border,
          'stroke-width': onRoute.has(geom.at) ? 2.6 : 1.4,
        });
        group.appendChild(tube);
        tubeOf.set(geom.at, tube);

        // 채움 = 값의 형편. 얼마나 찼나, 그리고 다 찼나.
        const core = el('rect', {
          x: 0,
          y: 0,
          width: geom.len,
          height: 0,
          rx: 0,
          fill: full ? c.itemSorted : c.accent,
        });
        setCore(core, geom, flow, spec.capacity);
        group.appendChild(core);
        coreOf.set(geom.at, core);

        // 흐름의 방향. 관 끝과 정점 사이 틈에 앉는 작은 촉.
        group.appendChild(
          el('polygon', {
            points: '0,-4.5 7,0 0,4.5',
            transform: `translate(${geom.len + 2} 0)`,
            fill: c.textMuted,
          }),
        );

        // 꽉 찬 관은 끝이 막힌다. 아직 없는 것은 숨기지 말고 짓지 않는다.
        if (full) {
          const seal = el('rect', {
            x: geom.len - 5,
            y: -(geom.thick / 2 + 4),
            width: 5,
            height: geom.thick + 8,
            rx: 1.5,
            fill: c.itemSorted,
            opacity: 1,
            transform: 'scale(1 1)',
          });
          group.appendChild(seal);
          sealOf.set(geom.at, seal);
        }

        // 조임쇠 — 그 바퀴의 병목. 지나간 바퀴의 것도 물린 채 남는다.
        if (nowTight.has(geom.at) || pastTight.has(geom.at)) {
          const past = pastTight.has(geom.at);
          const shape = {
            points: '-7,-9 7,-9 0,0',
            fill: past ? c.textMuted : c.itemSwapping,
            opacity: past ? JAW_PAST_ALPHA : 1,
          };
          const up = el('polygon', { ...shape, transform: jawTransform(geom, JAW_BITE, false) });
          const down = el('polygon', { ...shape, transform: jawTransform(geom, JAW_BITE, true) });
          group.appendChild(up);
          group.appendChild(down);
          if (!past) jawsOf.set(geom.at, { up, down });
        }

        pipeLayer.appendChild(group);

        // 눈금 — 지금 흐르는 양과 용량. 늘 선다.
        labelLayer.appendChild(
          label(`${flow}/${spec.capacity}`, {
            x: geom.numAt.x,
            y: geom.numAt.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: full ? c.text : c.textMuted,
            'font-weight': flow > 0 ? 700 : 400,
          }),
        );

        // 메모 — 꽉 찼다, 또는 이번 길에서 재 본 여유.
        let note = '';
        let noteFill = c.textMuted;
        let noteWeight = 400;
        if (full) {
          note = tr('label.full', 'full');
          noteFill = c.itemSorted;
          noteWeight = 700;
        } else if (onRoute.has(geom.at) && round !== null && round.narrowest.length > 0) {
          note = tr('label.room', 'room {n}', { n: room });
          if (nowTight.has(geom.at)) {
            noteFill = c.itemSwapping;
            noteWeight = 700;
          }
        }
        if (note !== '') {
          labelLayer.appendChild(
            label(note, {
              x: geom.noteAt.x,
              y: geom.noteAt.y,
              'text-anchor': 'middle',
              'dominant-baseline': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.sm,
              fill: noteFill,
              'font-weight': noteWeight,
            }),
          );
        }
      }

      for (const id of scene.nodes) {
        const at = spots.get(id);
        if (at === undefined) continue;
        const ends = id === scene.source || id === scene.sink;
        nodeLayer.appendChild(
          el('circle', {
            cx: at.x,
            cy: at.y,
            r: NODE_R,
            fill: c.bg,
            stroke: ends ? c.text : c.border,
            'stroke-width': ends ? 2.2 : 1.6,
          }),
        );
        nodeLayer.appendChild(
          label(id, {
            x: at.x,
            y: at.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.lg,
            'font-weight': 700,
            fill: c.text,
          }),
        );
      }

      // 캡션과 도착 표시. 재건 안에 두어 속성이 앞 걸음 값으로 남지 않게 한다.
      const sinkAt = spots.get(scene.sink);
      chromeLayer.appendChild(
        label(tr('label.arrived', 'arrived {n}', { n: totalOf(scene) }), {
          x: sinkAt?.x ?? W / 2,
          y: (sinkAt?.y ?? Y_MID) + NODE_R + 18,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: scene.finished ? c.text : c.textMuted,
          'font-weight': scene.finished ? 700 : 400,
        }),
      );
      chromeLayer.appendChild(
        label(captionText(captionOf(scene), tr), {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        }),
      );
    }

    // ── 걸음의 운동. 전부 한 목록 · 한 시계다 ────────────────────────────────

    /** 탐침이 길을 따라 지나가고 관 테가 그 뒤로 켜진다. */
    async function playPath(scene: BottleneckSetsFlowScene): Promise<void> {
      const round = currentRound(scene);
      if (round === null || round.route.length === 0) return;
      const route = round.route;
      const probe = makeProbe(c.itemComparing);
      const n = route.length;
      await animate(TRACE_MS * n, (e) => {
        const seg = Math.min(n - 1, Math.floor(e * n));
        const t = Math.min(1, e * n - seg);
        route.forEach((at, i) => {
          const tube = tubeOf.get(at);
          if (tube === undefined) return;
          // 정적 그리기가 이미 테를 세워 두었으므로 아직 안 지난 것을 뒤로 물린다.
          const lit = i < seg || (i === seg && t > 0);
          tube.setAttribute('stroke', lit ? c.itemComparing : c.border);
          tube.setAttribute('stroke-width', lit ? '2.6' : '1.4');
        });
        const geom = geomAt(route[seg]);
        if (geom !== undefined) placeProbe(probe, geom, t);
      });
      probe.remove();
    }

    /** 조임쇠가 열린 채 내려와 관을 문다. */
    async function playNarrowest(scene: BottleneckSetsFlowScene): Promise<void> {
      const round = currentRound(scene);
      if (round === null || round.narrowest.length === 0) return;
      const tight = round.narrowest;
      await animate(JAW_MS, (e) => {
        const gap = JAW_OPEN + (JAW_BITE - JAW_OPEN) * e;
        for (const at of tight) {
          const geom = geomAt(at);
          const jaws = jawsOf.get(at);
          if (geom === undefined || jaws === undefined) continue;
          jaws.up.setAttribute('transform', jawTransform(geom, gap, false));
          jaws.down.setAttribute('transform', jawTransform(geom, gap, true));
        }
      });
    }

    /**
     * 물이 길을 따라 흐른다 — **한 목록 한 시계**다. 관마다 따로 돌리면 "경로를
     * 따라 흐른다" 는 한 뜻이 시계 여럿으로 갈린다.
     */
    async function playPush(scene: BottleneckSetsFlowScene, my: number): Promise<void> {
      const round = currentRound(scene);
      if (round === null || round.amount === null || round.route.length === 0) return;
      const route = round.route;
      const amount = round.amount;
      const after = flowsOf(scene);
      // 출발 높이는 `prev` 가 아니라 장면이 말한다 — 이번 바퀴가 실은 양을 뺀다.
      const before = after.map((value, i) => (route.includes(i) ? value - amount : value));

      const probe = makeProbe(c.accent);
      const n = route.length;
      await animate(FILL_MS * n, (e) => {
        const seg = Math.min(n - 1, Math.floor(e * n));
        const t = Math.min(1, e * n - seg);
        route.forEach((at, i) => {
          const geom = geomAt(at);
          const core = coreOf.get(at);
          if (geom === undefined || core === undefined) return;
          const k = i < seg ? 1 : i === seg ? t : 0;
          setCore(core, geom, before[at] + amount * k, scene.edges[at].capacity);
        });
        const geom = geomAt(route[seg]);
        if (geom !== undefined) placeProbe(probe, geom, t);
      });
      probe.remove();
      if (!alive(my)) return;

      // 막이 내려앉는다 — 이번에 꽉 찬 관만.
      const sealed = route.filter(
        (at) =>
          after[at] >= scene.edges[at].capacity && before[at] < scene.edges[at].capacity,
      );
      if (sealed.length === 0) return;
      await animate(SEAL_MS, (e) => {
        for (const at of sealed) {
          const seal = sealOf.get(at);
          if (seal !== undefined) setSealShown(seal, e);
        }
      });
    }

    /** 나갈 관을 **한꺼번에** 찔러 보고 되돌아온다 — "전부 막혔다" 는 한 뜻이다. */
    async function playBlocked(scene: BottleneckSetsFlowScene): Promise<void> {
      const exits = exitEdges(scene)
        .map((at) => geomAt(at))
        .filter((geom): geom is PipeGeom => geom !== undefined);
      if (exits.length === 0) return;
      const probes = exits.map(() => makeProbe(c.itemSwapping));
      await animate(POKE_MS, (e) => {
        const depth = Math.sin(e * Math.PI) * POKE_DEPTH;
        exits.forEach((geom, i) => placeProbe(probes[i], geom, depth));
      });
      for (const probe of probes) probe.remove();
    }

    /** 다 찼다 — 나가는 곳에서 테가 한 번 번진다. */
    async function playDone(scene: BottleneckSetsFlowScene): Promise<void> {
      const at = spots.get(scene.sink);
      if (at === undefined) return;
      const ring = el('circle', {
        cx: at.x,
        cy: at.y,
        r: NODE_R,
        fill: 'none',
        stroke: c.accent,
        'stroke-width': 3,
        opacity: 1,
      });
      motionLayer.appendChild(ring);
      await animate(TALLY_MS, (e) => {
        ring.setAttribute('r', String(NODE_R + RING_GROW * e));
        ring.setAttribute('opacity', String(1 - e));
      });
      ring.remove();
    }

    async function render(
      next: BottleneckSetsFlowScene,
      /** 이 조각은 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: BottleneckSetsFlowScene | null,
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
        case 'narrowest':
          await playNarrowest(next);
          break;
        case 'push':
          await playPush(next, my);
          break;
        case 'blocked':
          await playBlocked(next);
          break;
        case 'done':
          await playDone(next);
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
