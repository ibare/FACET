/**
 * bottleneck-sets-flow-stage — 관이 차오르는 그림.
 *
 * 굵기가 곧 관의 용량이다. 흘려보낸 양은 관 한가운데를 차지하는 심(core)으로
 * 그리고, 그 심이 두꺼워져 관 벽에 닿으면 꽉 찬 것이다. 그래서 "가장 좁은 곳이
 * 먼저 꽉 찬다" 가 색이 아니라 **두께**로 보인다.
 *
 * 좌표는 여기서 정한다 — 들어오는 곳은 왼쪽, 나가는 곳은 오른쪽, 나머지는 가운데
 * 열에 위아래로 편다.
 *
 * projector 가 부르는 메서드
 *   setNetwork(net)      관과 정점을 놓는다 (마운트 직후 한 번)
 *   reset()              흘린 것을 모두 되돌린다
 *   showPath(p)          찾은 길을 짚어 간다 (탐침이 지나간다)
 *   markNarrowest(p)     길 위 관마다 여유를 적고, 가장 좁은 곳에 조임쇠를 문다
 *   pushFlow(p)          그만큼 흘린다 — 심이 차오르고 꽉 찬 관은 막힌다
 *   showBlocked(p)       나갈 관마다 찔러 보고 되돌아온다
 *   showDone()           나가는 곳에서 테가 한 번 번진다
 *   setCaption(text)     캡션
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

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

const FRAME_MS = 16;
/** 길을 짚어 갈 때 관 하나를 지나는 시간. */
const TRACE_MS = 190;
/** 조임쇠가 무는 시간. */
const JAW_MS = 240;
/** 관 하나가 차오르는 시간. */
const FILL_MS = 260;
/** 막이 내려앉는 시간. */
const SEAL_MS = 200;
/** 막힌 관을 찔러 보는 시간 (왕복 한쪽). */
const POKE_MS = 150;
/** 다 찼음을 알리는 테가 번지는 시간. */
const TALLY_MS = 420;
/** 그 테가 정점 밖으로 번지는 거리. */
const RING_GROW = 16;

type NetworkPipe = { id: string; from: string; to: string; capacity: number };
export type StageNetwork = {
  nodes: string[];
  edges: NetworkPipe[];
  source: string;
  sink: string;
};

export type StagePath = { edges: string[] };
export type StageNarrowest = { edges: string[]; rooms: number[]; narrowest: string[] };
export type StagePush = { edges: string[]; flows: number[]; total: number; full: string[] };
export type StageBlocked = { edges: string[] };

type Point = { x: number; y: number };

type PipeView = {
  spec: NetworkPipe;
  /** 관이 시작하는 점 (정점 가장자리) 과 방향. */
  start: Point;
  ux: number;
  uy: number;
  len: number;
  thick: number;
  tube: SVGRectElement;
  core: SVGRectElement;
  seal: SVGRectElement;
  jawA: SVGPolygonElement;
  jawB: SVGPolygonElement;
  numLabel: SVGTextElement;
  noteLabel: SVGTextElement;
  flow: number;
};

function attr(node: SVGElement, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: SVGElement,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  attr(node, attrs);
  parent.appendChild(node);
  return node;
}

export const bottleneckSetsFlowStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const root = make('g', {}, svg);
    const pipeLayer = make('g', {}, root);
    const nodeLayer = make('g', {}, root);
    const labelLayer = make('g', {}, root);
    const probeLayer = make('g', {}, root);

    const probe = make(
      'circle',
      { cx: 0, cy: 0, r: 6, fill: c.itemComparing, opacity: 0 },
      probeLayer,
    );

    // 다 찼을 때 나가는 곳에서 한 번 번지는 테. 자리는 setNetwork 가 잡는다.
    const ring = make(
      'circle',
      { cx: 0, cy: 0, r: NODE_R, fill: 'none', stroke: c.accent, 'stroke-width': 3, opacity: 0 },
      probeLayer,
    );

    const caption = make(
      'text',
      {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      },
      root,
    );

    const tally = make(
      'text',
      {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      },
      root,
    );

    const pipes = new Map<string, PipeView>();
    const spot = new Map<string, Point>();
    let total = 0;

    // ── 시간 흐름. destroy() 이후로는 한 프레임도 더 예약하지 않는다 (S-view).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임·타이머를 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지
     * 않으므로 `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면
     * `await ctx.emit` 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과
     * projector 와 SVG 트리가 통째로 붙들린다 (S-view).
     */
    const waiters = new Set<() => void>();

    const ease = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);

    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          apply(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 그리기 보조

    function pointOn(pipe: PipeView, t: number, lift: number): Point {
      const nx = -pipe.uy;
      const ny = pipe.ux;
      return {
        x: pipe.start.x + pipe.ux * pipe.len * t + nx * lift,
        y: pipe.start.y + pipe.uy * pipe.len * t + ny * lift,
      };
    }

    function setCore(pipe: PipeView, value: number): void {
      const h = Math.max(0, Math.min(1, value / pipe.spec.capacity)) * pipe.thick;
      attr(pipe.core, { y: -h / 2, height: h, rx: Math.min(3, h / 2) });
    }

    function tubeTone(pipe: PipeView): void {
      const filled = pipe.flow >= pipe.spec.capacity;
      attr(pipe.tube, {
        stroke: filled ? c.itemSorted : c.border,
        'stroke-width': filled ? 2.2 : 1.4,
      });
    }

    function markOnRoute(pipe: PipeView): void {
      attr(pipe.tube, { stroke: c.itemComparing, 'stroke-width': 2.6 });
    }

    function setNote(pipe: PipeView, text: string, fill: string, weight: number): void {
      pipe.noteLabel.textContent = text;
      attr(pipe.noteLabel, { fill, 'font-weight': weight });
    }

    function setNum(pipe: PipeView): void {
      pipe.numLabel.textContent = `${pipe.flow}/${pipe.spec.capacity}`;
      attr(pipe.numLabel, {
        fill: pipe.flow >= pipe.spec.capacity ? c.text : c.textMuted,
        'font-weight': pipe.flow > 0 ? 700 : 400,
      });
    }

    function setJaws(pipe: PipeView, gap: number, shown: boolean): void {
      const half = pipe.thick / 2;
      attr(pipe.jawA, {
        transform: `translate(${pipe.len / 2} ${-(half + gap)})`,
        opacity: shown ? 1 : 0,
      });
      attr(pipe.jawB, {
        transform: `translate(${pipe.len / 2} ${half + gap}) rotate(180)`,
        opacity: shown ? 1 : 0,
      });
    }

    function setSeal(pipe: PipeView, shown: number): void {
      attr(pipe.seal, { opacity: shown, transform: `scale(1 ${0.2 + 0.8 * shown})` });
    }

    function moveProbe(pipe: PipeView, t: number): void {
      const p = pointOn(pipe, t, 0);
      // 탐침은 관보다 굵어지지 않는다 — 가장 가는 관에서도 안에 담겨 보여야 한다.
      attr(probe, { cx: p.x, cy: p.y, r: Math.max(3.5, Math.min(6, pipe.thick / 2)), opacity: 1 });
    }

    function setTally(): void {
      tally.textContent = tr('label.arrived', 'arrived {n}', { n: total });
    }

    /**
     * 한 바퀴가 끝날 때 지운다. 다만 **꽉 참 표시는 남긴다** — 다음 길이 그 관을
     * 왜 피해 가는지가 화면에 남아 있어야 한다.
     */
    function clearRoundMarks(): void {
      for (const pipe of pipes.values()) {
        if (pipe.flow >= pipe.spec.capacity) {
          setNote(pipe, tr('label.full', 'full'), c.itemSorted, 700);
        } else {
          setNote(pipe, '', c.textMuted, 400);
        }
        setJaws(pipe, JAW_OPEN, false);
        tubeTone(pipe);
      }
    }

    // ── projector 가 부르는 것들

    function setNetwork(net: StageNetwork): void {
      while (pipeLayer.firstChild) pipeLayer.removeChild(pipeLayer.firstChild);
      while (nodeLayer.firstChild) nodeLayer.removeChild(nodeLayer.firstChild);
      while (labelLayer.firstChild) labelLayer.removeChild(labelLayer.firstChild);
      pipes.clear();
      spot.clear();
      total = 0;

      // 들어오는 곳은 왼쪽 끝, 나가는 곳은 오른쪽 끝. 나머지는 가운데 열.
      const xIn = SIDE_MIN + NODE_R;
      const xOut = W - SIDE_MIN - NODE_R;
      const xMid = W / 2;
      spot.set(net.source, { x: xIn, y: Y_MID });
      spot.set(net.sink, { x: xOut, y: Y_MID });
      const middles = net.nodes.filter((id) => id !== net.source && id !== net.sink);
      middles.forEach((id, i) => {
        const y =
          middles.length < 2 ? Y_MID : Y_MID - Y_SPREAD + (i * (Y_SPREAD * 2)) / (middles.length - 1);
        spot.set(id, { x: xMid, y });
      });

      // 굵기 1 당 픽셀 — 가장 굵은 관이 정점보다 두꺼워지지 않게 역산한다.
      const widest = net.edges.reduce((m, e) => Math.max(m, e.capacity), 1);
      const unit = Math.max(4, Math.min(UNIT_MAX, Math.floor((NODE_R * 1.15) / widest)));

      const centre = { x: xMid, y: Y_MID };

      for (const spec of net.edges) {
        const a = spot.get(spec.from);
        const b = spot.get(spec.to);
        if (a === undefined || b === undefined) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const span = Math.hypot(dx, dy);
        const ux = dx / span;
        const uy = dy / span;
        const start = { x: a.x + ux * (NODE_R + END_GAP), y: a.y + uy * (NODE_R + END_GAP) };
        const len = span - 2 * (NODE_R + END_GAP);
        const thick = spec.capacity * unit;
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI;

        const group = make(
          'g',
          { transform: `translate(${start.x} ${start.y}) rotate(${deg})` },
          pipeLayer,
        );
        const tube = make(
          'rect',
          {
            x: 0,
            y: -thick / 2,
            width: len,
            height: thick,
            rx: 4,
            fill: c.bgSubtle,
            stroke: c.border,
            'stroke-width': 1.4,
          },
          group,
        );
        const core = make(
          'rect',
          { x: 0, y: 0, width: len, height: 0, rx: 0, fill: c.accent },
          group,
        );
        // 흐름의 방향. 관 끝과 정점 사이 틈에 앉는 작은 촉.
        make(
          'polygon',
          {
            points: `0,-4.5 7,0 0,4.5`,
            transform: `translate(${len + 2} 0)`,
            fill: c.textMuted,
          },
          group,
        );
        const seal = make(
          'rect',
          {
            x: len - 5,
            y: -(thick / 2 + 4),
            width: 5,
            height: thick + 8,
            rx: 1.5,
            fill: c.itemSorted,
            opacity: 0,
          },
          group,
        );
        const jaw = `-7,-9 7,-9 0,0`;
        const jawA = make('polygon', { points: jaw, fill: c.itemSwapping, opacity: 0 }, group);
        const jawB = make('polygon', { points: jaw, fill: c.itemSwapping, opacity: 0 }, group);

        const numLabel = make(
          'text',
          {
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          labelLayer,
        );
        const noteLabel = make(
          'text',
          {
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          },
          labelLayer,
        );

        const pipe: PipeView = {
          spec,
          start,
          ux,
          uy,
          len,
          thick,
          tube,
          core,
          seal,
          jawA,
          jawB,
          numLabel,
          noteLabel,
          flow: 0,
        };

        // 라벨은 그림 바깥쪽 — 가운데에서 멀어지는 법선을 고른다.
        const mid = pointOn(pipe, 0.5, 0);
        let nx = -uy;
        let ny = ux;
        const away = nx * (mid.x - centre.x) + ny * (mid.y - centre.y);
        if (away < -1e-6 || (Math.abs(away) <= 1e-6 && nx < 0)) {
          nx = -nx;
          ny = -ny;
        }
        const lift = thick / 2 + LABEL_LIFT;
        const numAt = {
          x: start.x + ux * len * NUM_AT + nx * lift,
          y: start.y + uy * len * NUM_AT + ny * lift,
        };
        const noteAt = {
          x: start.x + ux * len * NOTE_AT + nx * lift,
          y: start.y + uy * len * NOTE_AT + ny * lift,
        };
        attr(numLabel, { x: numAt.x, y: numAt.y });
        attr(noteLabel, { x: noteAt.x, y: noteAt.y });

        setJaws(pipe, JAW_OPEN, false);
        setNum(pipe);
        pipes.set(spec.id, pipe);
      }

      for (const id of net.nodes) {
        const at = spot.get(id);
        if (at === undefined) continue;
        const ends = id === net.source || id === net.sink;
        make(
          'circle',
          {
            cx: at.x,
            cy: at.y,
            r: NODE_R,
            fill: c.bg,
            stroke: ends ? c.text : c.border,
            'stroke-width': ends ? 2.2 : 1.6,
          },
          nodeLayer,
        );
        const label = make(
          'text',
          {
            x: at.x,
            y: at.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.lg,
            'font-weight': 700,
            fill: c.text,
          },
          nodeLayer,
        );
        label.textContent = id;
      }

      const sinkAt = spot.get(net.sink);
      attr(tally, { x: sinkAt?.x ?? W / 2, y: (sinkAt?.y ?? Y_MID) + NODE_R + 18 });
      attr(ring, { cx: sinkAt?.x ?? W / 2, cy: sinkAt?.y ?? Y_MID, opacity: 0 });
      setTally();
      caption.textContent = '';
    }

    function reset(): void {
      total = 0;
      for (const pipe of pipes.values()) {
        pipe.flow = 0;
        setCore(pipe, 0);
        setSeal(pipe, 0);
        setNum(pipe);
      }
      clearRoundMarks();
      attr(probe, { opacity: 0 });
      attr(ring, { opacity: 0, r: NODE_R });
      attr(tally, { fill: c.textMuted, 'font-weight': 400 });
      setTally();
      caption.textContent = '';
    }

    async function showPath(p: StagePath): Promise<void> {
      clearRoundMarks();
      attr(probe, { fill: c.itemComparing });
      for (const id of p.edges) {
        const pipe = pipes.get(id);
        if (pipe === undefined) continue;
        markOnRoute(pipe);
        await tween(TRACE_MS, (t) => moveProbe(pipe, t));
      }
      attr(probe, { opacity: 0 });
    }

    async function markNarrowest(p: StageNarrowest): Promise<void> {
      const tight = new Set(p.narrowest);
      p.edges.forEach((id, i) => {
        const pipe = pipes.get(id);
        if (pipe === undefined) return;
        const room = p.rooms[i];
        const isTight = tight.has(id);
        setNote(
          pipe,
          tr('label.room', 'room {n}', { n: room }),
          isTight ? c.itemSwapping : c.textMuted,
          isTight ? 700 : 400,
        );
        if (isTight) setJaws(pipe, JAW_OPEN, true);
      });
      await tween(JAW_MS, (t) => {
        const gap = JAW_OPEN + (JAW_BITE - JAW_OPEN) * t;
        for (const id of p.narrowest) {
          const pipe = pipes.get(id);
          if (pipe !== undefined) setJaws(pipe, gap, true);
        }
      });
    }

    async function pushFlow(p: StagePush): Promise<void> {
      attr(probe, { fill: c.accent });
      for (let i = 0; i < p.edges.length; i += 1) {
        const pipe = pipes.get(p.edges[i]);
        if (pipe === undefined) continue;
        const before = pipe.flow;
        const after = p.flows[i];
        await tween(FILL_MS, (t) => {
          setCore(pipe, before + (after - before) * t);
          moveProbe(pipe, t);
        });
        pipe.flow = after;
        setNum(pipe);
      }
      attr(probe, { opacity: 0 });
      total = p.total;
      setTally();

      const sealed = p.full
        .map((id) => pipes.get(id))
        .filter((pipe): pipe is PipeView => pipe !== undefined);
      for (const pipe of sealed) {
        setNote(pipe, tr('label.full', 'full'), c.itemSorted, 700);
        tubeTone(pipe);
      }
      if (sealed.length > 0) {
        await tween(SEAL_MS, (t) => {
          for (const pipe of sealed) setSeal(pipe, t);
        });
      }
    }

    async function showBlocked(p: StageBlocked): Promise<void> {
      attr(probe, { fill: c.itemSwapping });
      for (const id of p.edges) {
        const pipe = pipes.get(id);
        if (pipe === undefined) continue;
        await tween(POKE_MS, (t) => moveProbe(pipe, t * 0.32));
        await tween(POKE_MS, (t) => moveProbe(pipe, 0.32 * (1 - t)));
      }
      attr(probe, { opacity: 0 });
    }

    async function showDone(): Promise<void> {
      attr(tally, { fill: c.text, 'font-weight': 700 });
      await tween(TALLY_MS, (t) => {
        attr(ring, { r: NODE_R + RING_GROW * t, opacity: 1 - t });
      });
      attr(ring, { opacity: 0 });
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    return {
      setNetwork,
      reset,
      showPath,
      markNarrowest,
      pushFlow,
      showBlocked,
      showDone,
      setCaption,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
