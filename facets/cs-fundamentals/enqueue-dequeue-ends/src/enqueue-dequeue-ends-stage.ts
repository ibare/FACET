/**
 * enqueue-dequeue-ends stage view — 한 방향으로만 흐르는 줄.
 *
 * 화면은 정거장 하나로 이어진 가로 궤도다. 오른쪽 끝이 대기, 가운데가 줄(관), 왼쪽 끝이
 * 빠져나온 자리이며, 모든 움직임은 오른쪽에서 왼쪽으로만 일어난다. 정거장 간격이
 * 한 칸이라 "줄이 한 칸 나아간다" 가 곧 한 정거장 이동이다.
 *
 *   [ 나온 것 ]  ⟨OUT 문⟩  [ 줄 ]  ⟨IN 문⟩  [ 대기 ]
 *      0 1 2               3 4 5             6 7 8      ← 정거장 번호
 *
 * 값이 대기 자리를 떠나면 그 자리에 점선 자국이 남는다. 끝나면 오른쪽 자국 줄과 왼쪽
 * 실물 줄이 같은 차례로 읽히고, 그것이 이 조각의 결론이다.
 *
 * projector 가 부르는 메서드: init / showDoors / admit / advance / matchOrder / setCaption.
 * 화면 문안은 projector 가 해석해 `setCaption` 으로 건네므로 (C10) 이 view 는 문자
 * 리소스를 조회하지 않는다. `IN` / `OUT` 은 문틀에 새겨진 표식이라 상수다.
 */

import {
  CATEGORICAL_QUEUE_BLOCK,
  CATEGORICAL_QUEUE_IN,
  CATEGORICAL_QUEUE_OUT,
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  radii,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 문틀에 새겨진 표식 — 번역 대상이 아니다 (C10 "표식이냐 문안이냐" 1번). */
const DOOR_IN = 'IN';
const DOOR_OUT = 'OUT';

const W = PIECE_CANVAS_W;
const STAGE_H = 158;

// 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece "그 폭을 채운다").
const SIDE_MIN = 18;
const PITCH_MAX = 68;
const CELL_MAX_W = 56;
const CELL_GAP = 8;

const DOOR_W = 13;
const CELL_H = 44;
const TRACK_Y = 44;
const PIPE_PAD = 12;
const RAIL_Y = TRACK_Y + CELL_H + 22;
const CAPTION_Y = RAIL_Y + 30;
const DOOR_LABEL_Y = TRACK_Y - PIPE_PAD - 8;

// 한 정거장을 건너는 데 드는 시간. 여러 정거장을 지나면 그만큼 더 걸린다 — 속도가
// 일정해야 "흘러간다" 로 보이고, 걸음마다 같은 시간이면 멀리 가는 값이 튀어 보인다.
const MOVE_MS = 260;
const STATION_MS = 90;
const PULSE_MS = 260;
const STYLE_TICK_MS = 20;

type Track = {
  /** 대기 · 줄 · 나온 자리 각각의 칸 수. */
  capacity: number;
  /** 정거장 사이 간격. */
  pitch: number;
  cellW: number;
  originX: number;
};

function computeTrack(capacity: number): Track {
  const stations = capacity * 3;
  const pitch = Math.min(
    PITCH_MAX,
    Math.floor((W - SIDE_MIN * 2 - DOOR_W * 2) / stations),
  );
  const cellW = Math.min(CELL_MAX_W, pitch - CELL_GAP);
  const contentW = stations * pitch + DOOR_W * 2;
  return { capacity, pitch, cellW, originX: Math.round((W - contentW) / 2) };
}

/** 정거장 i 의 왼쪽 좌표. 문 두 개가 지나간 만큼 뒤 구역이 밀린다. */
function stationX(t: Track, i: number): number {
  const passedDoors = i < t.capacity ? 0 : i < t.capacity * 2 ? DOOR_W : DOOR_W * 2;
  return t.originX + passedDoors + i * t.pitch + (t.pitch - t.cellW) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

type Piece = { g: SVGGElement; body: SVGRectElement; station: number };

export const enqueueDequeueEndsStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container, params): ViewInstance {
    const palette = getColors(params.theme);
    const svg = params.canvas;
    // 큐형 view 가 합의한 시드 — 줄에 선 값 / 들어오는 문 / 나가는 문 (S-view 결정 3).
    const queueHues = categorical(6, 'vivid');
    const blockColor = queueHues[CATEGORICAL_QUEUE_BLOCK];
    const inColor = queueHues[CATEGORICAL_QUEUE_IN];
    const outColor = queueHues[CATEGORICAL_QUEUE_OUT];
    const cellRadius = Number.parseFloat(radii.md);

    const root = el('g', {});
    svg.appendChild(root);
    const chrome = el('g', {});
    const ghostLayer = el('g', {});
    const pieceLayer = el('g', {});
    const pulseLayer = el('g', {});
    root.append(chrome, ghostLayer, pieceLayer, pulseLayer);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: palette.text,
    });
    root.appendChild(caption);

    let track = computeTrack(1);
    const pieces: Piece[] = [];
    const ghosts: SVGRectElement[] = [];
    const pulses: SVGRectElement[] = [];

    // 진행 중인 기다림. destroy 때 즉시 풀어 주지 않으면 projector 의 await 가 영영 남는다.
    const waiting = new Set<() => void>();
    const after = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        const settle = (): void => {
          clearTimeout(timer);
          waiting.delete(settle);
          resolve();
        };
        const timer = setTimeout(settle, ms);
        waiting.add(settle);
      });

    const place = (node: SVGGElement | SVGRectElement, station: number): void => {
      node.style.transform = `translate(${stationX(track, station)}px, ${TRACK_Y}px)`;
    };

    const clearChildren = (node: SVGGElement): void => {
      while (node.firstChild) node.removeChild(node.firstChild);
    };

    const glide = (piece: Piece, station: number): number => {
      const ms = MOVE_MS + STATION_MS * Math.max(0, Math.abs(station - piece.station) - 1);
      piece.g.style.transitionDuration = `${ms}ms`;
      piece.station = station;
      place(piece.g, station);
      return ms;
    };

    const makePiece = (value: number, station: number): Piece => {
      const g = el('g', {});
      g.style.transitionProperty = 'transform';
      g.style.transitionTimingFunction = 'ease-in-out';
      g.style.transitionDuration = `${MOVE_MS}ms`;
      const body = el('rect', {
        width: track.cellW,
        height: CELL_H,
        rx: cellRadius,
        fill: palette.bg,
        stroke: blockColor,
        'stroke-width': 2,
      });
      const label = el('text', {
        x: track.cellW / 2,
        y: CELL_H / 2 + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: palette.text,
      });
      label.textContent = String(value);
      g.append(body, label);
      return { g, body, station };
    };

    /** 값이 떠난 대기 자리에 남는 자국. 들어간 차례를 화면에 붙들어 둔다. */
    const makeGhost = (): SVGRectElement =>
      el('rect', {
        width: track.cellW,
        height: CELL_H,
        rx: cellRadius,
        fill: 'none',
        stroke: palette.ghostOutline,
        'stroke-width': 1.5,
        'stroke-dasharray': '5 4',
      });

    const buildChrome = (): void => {
      clearChildren(chrome);
      clearChildren(pulseLayer);
      pulses.length = 0;

      const pipeX = stationX(track, track.capacity) - (track.pitch - track.cellW) / 2 - DOOR_W;
      const pipeW = track.capacity * track.pitch + DOOR_W * 2;
      const pipeY = TRACK_Y - PIPE_PAD;
      const pipeH = CELL_H + PIPE_PAD * 2;

      chrome.appendChild(
        el('rect', {
          x: pipeX,
          y: pipeY,
          width: pipeW,
          height: pipeH,
          rx: cellRadius,
          fill: palette.bgSubtle,
          stroke: palette.border,
          'stroke-width': 1,
        }),
      );

      // 문은 위아래 문설주 두 개로 그린다 — 가운데가 뚫려 있어야 값이 지나가는 것이 보인다.
      const door = (x: number, color: string, mark: string): void => {
        chrome.appendChild(
          el('rect', { x, y: pipeY, width: DOOR_W, height: PIPE_PAD, fill: color }),
        );
        chrome.appendChild(
          el('rect', {
            x,
            y: TRACK_Y + CELL_H,
            width: DOOR_W,
            height: PIPE_PAD,
            fill: color,
          }),
        );
        const mk = el('text', {
          x: x + DOOR_W / 2,
          y: DOOR_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'letter-spacing': 1,
          fill: color,
        });
        mk.textContent = mark;
        chrome.appendChild(mk);

        const pulse = el('rect', {
          x: x - 3,
          y: pipeY - 3,
          width: DOOR_W + 6,
          height: pipeH + 6,
          rx: cellRadius,
          fill: 'none',
          stroke: palette.accent,
          'stroke-width': 2.5,
        });
        pulse.style.opacity = '0';
        pulse.style.transition = `opacity ${PULSE_MS}ms ease-in-out`;
        pulseLayer.appendChild(pulse);
        pulses.push(pulse);
      };

      door(pipeX, outColor, DOOR_OUT);
      door(pipeX + pipeW - DOOR_W, inColor, DOOR_IN);

      // 흐름은 오른쪽에서 왼쪽 한 방향뿐이라는 것을 궤도 아래 화살이 말한다.
      const railLeft = SIDE_MIN;
      const railRight = W - SIDE_MIN;
      chrome.appendChild(
        el('line', {
          x1: railLeft + 10,
          y1: RAIL_Y,
          x2: railRight,
          y2: RAIL_Y,
          stroke: palette.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 5',
        }),
      );
      chrome.appendChild(
        el('polygon', {
          points: `${railLeft},${RAIL_Y} ${railLeft + 11},${RAIL_Y - 5} ${railLeft + 11},${RAIL_Y + 5}`,
          fill: palette.textMuted,
        }),
      );
    };

    const instance: ViewInstance = {
      /** 값 개수로 궤도를 세우고 처음 상태로 되돌린다. */
      init(p: { values: number[] }): void {
        if (p.values.length < 1) return;
        track = computeTrack(p.values.length);
        buildChrome();
        clearChildren(ghostLayer);
        clearChildren(pieceLayer);
        pieces.length = 0;
        ghosts.length = 0;
        caption.textContent = '';

        // 대기 줄 — 문에 가까운 쪽이 먼저 들어갈 값이다. 넣는 차례대로 왼쪽부터 선다.
        for (let i = 0; i < p.values.length; i += 1) {
          const station = track.capacity * 2 + i;
          const piece = makePiece(p.values[i], station);
          place(piece.g, station);
          pieceLayer.appendChild(piece.g);
          pieces.push(piece);
        }
      },

      /** 두 문을 한 번 짚는다 — 서로 반대편에 있다는 것이 이 조각의 전제다. */
      async showDoors(): Promise<void> {
        for (const pulse of pulses) pulse.style.opacity = '1';
        await after(PULSE_MS + STYLE_TICK_MS);
        for (const pulse of pulses) pulse.style.opacity = '0';
        await after(PULSE_MS);
      },

      /** order 번째 값이 뒤쪽 문으로 들어와 줄의 제자리까지 흘러간다. */
      async admit(p: { order: number; toStation: number }): Promise<void> {
        const piece = pieces[p.order];
        if (!piece) return;
        const ghost = makeGhost();
        place(ghost, piece.station);
        ghostLayer.appendChild(ghost);
        ghosts.push(ghost);
        await after(STYLE_TICK_MS);
        await after(glide(piece, p.toStation));
      },

      /** 줄 전체가 한 칸 앞으로. 맨 앞은 그 한 칸에 앞쪽 문을 넘는다. */
      async advance(p: { toStations: number[] }): Promise<void> {
        const moved = Math.min(p.toStations.length, pieces.length);
        let longest = 0;
        for (let i = 0; i < moved; i += 1) {
          longest = Math.max(longest, glide(pieces[i], p.toStations[i]));
        }
        await after(longest);
      },

      /**
       * 자국 줄과 실물 줄을 나란히 강조한다 — 두 줄이 같은 차례라는 것이 결론이다.
       * 알고리즘 상태가 아니라 논증의 마무리라 emphasis (accent) 를 쓴다 (S-view 결정 트리).
       */
      matchOrder(): void {
        for (const ghost of ghosts) ghost.setAttribute('stroke', palette.accent);
        for (const piece of pieces) piece.body.setAttribute('stroke', palette.accent);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      destroy(): void {
        // 기다리던 promise 를 먼저 풀어 준다 — 남겨 두면 projector 의 await 가 영영 매달린다.
        for (const settle of [...waiting]) settle();
        waiting.clear();
        if (root.parentNode) root.remove();
      },
    };

    return instance;
  },
};
