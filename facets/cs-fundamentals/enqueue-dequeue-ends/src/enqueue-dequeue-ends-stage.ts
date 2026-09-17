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
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`showDoors()` · `admit()` · `advance()` · `matchOrder()`) 를
 * 두지 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의
 * 화면 전체**를 세운다 (S-scene).
 *
 * 정거장 번호는 여기서 셈한다. 장면은 대기 · 줄 · 나온 것 셋의 **차례**만 말하고,
 * 그 차례에서 자리가 나온다 — 줄의 i 번째는 `c + i`, 나온 것의 j 번째는
 * `c - 나온수 + j`, 대기 중인 것은 처음 자리 `2c + order` 그대로다 (`c` = 값 개수).
 * 궤도의 폭과 간격은 캔버스에서 역산한다 (S-piece).
 *
 * `drawStatic` 은 궤도·자국·값을 **통째로 다시 짓는다.** 값 셋에 자국 셋이라 가볍고,
 * 그렇게 하면 앞 걸음의 운동이 남긴 transform 같은 인라인 자취가 하나도 남지 않는다.
 * 운동이 끝난 뒤에도 같은 함수를 한 번 더 불러 — 흐르며 선 화면과 곧바로 세운 화면이
 * 속성 하나까지 같아진다.
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 방금 밟은 걸음 하나만 흐르게 하고,
 * 거짓이면 타이머도 걸지 않고 곧바로 끝 자리에 세운다 — 되짚기가 그 길로 온다.
 *
 * ## CSS transition 을 쓰지 않는다
 *
 * 옛 화면은 인라인 CSS 전환을 걸어 두고 끝 자리를 주는 꼴이었다. 되짚기는 `animate:false`
 * 로 오는데 전환은 그 뒤에도 화면을 저 혼자 흘러가게 하므로, 되짚어 세운 화면이 나중에
 * 저절로 바뀌었다 — "그 걸음의 화면" 이라는 말이 서지 않는다 (S-scene MUST NOT).
 * 지금은 `tween` 한 마디가 시계를 직접 재며 속성을 보간한다. 벽시계는 `setTimeout` 으로
 * 재고 rAF 를 쓰지 않는다 — 걸음이 프레임 없는 자리에서도 돌아야 하기 때문이다.
 *
 * 화면 문안은 `params.t` 로 만든다 — 문자 리소스는 `facet.ts` 의 `messages` 에 있다
 * (C10). `IN` / `OUT` 은 문틀에 새겨진 표식이라 상수다.
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
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';
import type { CanvasView, SceneRenderer, ViewInstance } from '@ffacet/core/runtime';
import type {
  EnqueueDequeueEndsScene,
  QueueCaption,
  QueueRider,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 문틀에 새겨진 표식 — 번역 대상이 아니다 (C10 "표식이냐 문안이냐" 1번). */
const DOOR_IN = 'IN';
const DOOR_OUT = 'OUT';

/** 차례를 잇는 기호 — 문안이 아니라 표기다 (C10 판정 3번). */
const ORDER_SEP = ' → ';

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
/** 보간 한 프레임. */
const FRAME_MS = 16;

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
/** 옛 `ease-in-out` 을 그대로 옮긴 것 — 떠날 때와 설 때가 함께 느려진다. */
const easeInOut = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

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
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 지금 세워 둔 값 하나와 그것이 선 정거장. 걸음 함수가 이것을 잡고 흐르게 한다. */
type Piece = { g: SVGGElement; station: number };

/**
 * 장면이 말하는 차례를 정거장 번호로 편다.
 *
 * 줄의 앞(`lane[0]`)이 앞쪽 문 바로 안이고, 뒤(`lane` 의 끝)가 뒤쪽 문 쪽이다. 나온
 * 것들은 앞쪽 문 밖에 나온 차례대로 서고, 하나가 더 나올 때마다 다 함께 한 칸 왼쪽으로
 * 밀린다 — 그래서 `c - 나온수 + j` 다.
 */
function stationsOf(s: EnqueueDequeueEndsScene): Map<number, number> {
  const c = s.seed.length;
  const at = new Map<number, number>();
  s.gone.forEach((rider, j) => at.set(rider.order, c - s.gone.length + j));
  s.lane.forEach((rider, i) => at.set(rider.order, c + i));
  for (const rider of s.waiting) at.set(rider.order, c * 2 + rider.order);
  return at;
}

export const enqueueDequeueEndsStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container, params): ViewInstance & SceneRenderer<EnqueueDequeueEndsScene> {
    const palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    // 큐형 view 가 합의한 시드 — 줄에 선 값 / 들어오는 문 / 나가는 문 (S-view 결정 3).
    const queueHues = categorical(6, 'vivid');
    const blockColor = queueHues[CATEGORICAL_QUEUE_BLOCK];
    const inColor = queueHues[CATEGORICAL_QUEUE_IN];
    const outColor = queueHues[CATEGORICAL_QUEUE_OUT];
    const cellRadius = Number.parseFloat(radii.md);

    const root = el('g');
    svg.appendChild(root);
    const chrome = el('g');
    const ghostLayer = el('g');
    const pieceLayer = el('g');
    const pulseLayer = el('g');
    root.append(chrome, ghostLayer, pieceLayer, pulseLayer);

    // 캡션은 자리가 고정이라 한 번만 만든다. 재건 밖에 있는 요소라 옛 세대의 운동이
    // 여기에 손대지 못하게 세대 빗장이 필요하다 (아래 `alive`).
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
    /** 지금 세워 둔 값들 — 들어온 차례(order) 로 찾는다. `drawStatic` 이 갈아 끼운다. */
    let pieces = new Map<number, Piece>();
    let pulses: SVGRectElement[] = [];

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 깨어난 운동이 다음 세대의 화면에 손대지 않게 하는 빗장이다. `isInstant` 나
     * `onScrubStart` 는 빗장이 아니다 — 러너는 장면 조각에서 그 둘을 부르지 않는다
     * (S-scene). 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장 둘뿐이다.
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). `resolve` 를 `waiters` 에
     * 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던 약속이 함께 풀린다 —
     * 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이 영영 안 풀린다 (S-piece).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
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
          if (!alive(mine)) {
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

    const place = (node: SVGGElement | SVGRectElement, station: number): void => {
      node.style.transform = `translate(${stationX(track, station)}px, ${TRACK_Y}px)`;
    };

    /**
     * 정거장 사이의 한 지점에 세운다.
     *
     * 문 두 개가 구역을 밀어 놓으므로 정거장 번호는 자리에 고르게 대응하지 않는다.
     * 그래서 번호가 아니라 **자리(px)** 를 직접 보간한다. 끝 자리는 이 함수가 아니라
     * `place` 가 세운다 — 보간 끝값과 정적 그리기의 글자가 어긋나지 않게.
     */
    const placeAt = (node: SVGGElement, x: number): void => {
      node.style.transform = `translate(${x.toFixed(2)}px, ${TRACK_Y}px)`;
    };

    const clearChildren = (node: SVGGElement): void => {
      while (node.firstChild) node.removeChild(node.firstChild);
    };

    /** 한 정거장당 같은 속도. 멀리 가는 값이 튀어 보이지 않게 거리에 비례시킨다. */
    const glideMs = (distance: number): number =>
      MOVE_MS + STATION_MS * Math.max(0, Math.abs(distance) - 1);

    const makePiece = (rider: QueueRider, station: number, matched: boolean): Piece => {
      const g = el('g');
      const body = el('rect', {
        width: track.cellW,
        height: CELL_H,
        rx: cellRadius,
        fill: palette.bg,
        // 결론을 못박은 뒤에는 **남는** 강조라 정적 그리기에도 들어간다. 알고리즘
        // 상태가 아니라 논증의 마무리라 emphasis (accent) 를 쓴다 (S-view 결정 트리).
        stroke: matched ? palette.accent : blockColor,
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
      label.textContent = String(rider.value);
      g.append(body, label);
      place(g, station);
      return { g, station };
    };

    /** 값이 떠난 대기 자리에 남는 자국. 들어간 차례를 화면에 붙들어 둔다. */
    const makeGhost = (station: number, matched: boolean): SVGRectElement => {
      const ghost = el('rect', {
        width: track.cellW,
        height: CELL_H,
        rx: cellRadius,
        fill: 'none',
        stroke: matched ? palette.accent : palette.ghostOutline,
        'stroke-width': 1.5,
        'stroke-dasharray': '5 4',
      });
      place(ghost, station);
      return ghost;
    };

    const buildChrome = (): void => {
      clearChildren(chrome);
      clearChildren(pulseLayer);
      pulses = [];

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

        // 문 짚기는 반짝였다 **돌아오는** 강조라 정적으로는 늘 꺼진 채로 선다.
        const pulse = el('rect', {
          x: x - 3,
          y: pipeY - 3,
          width: DOOR_W + 6,
          height: pipeH + 6,
          rx: cellRadius,
          fill: 'none',
          stroke: palette.accent,
          'stroke-width': 2.5,
          opacity: 0,
        });
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

    /** 한 걸음의 말. 장면은 무엇을 말할지만 주고 문자는 여기서 만든다 (C10). */
    function captionTextOf(c: QueueCaption): string {
      switch (c.kind) {
        case 'doors':
          return tr('caption.doors', 'Two doors, one at each end.');
        case 'in':
          return tr('caption.in', 'In through the back door — {value}', { value: c.value });
        case 'out':
          return tr('caption.out', 'Out through the front door — {value}', {
            value: c.value,
          });
        case 'sameOrder':
          return tr('caption.sameOrder', 'In {inOrder} — out {outOrder}. The order held.', {
            inOrder: c.inOrder.join(ORDER_SEP),
            outOrder: c.outOrder.join(ORDER_SEP),
          });
      }
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 궤도부터 값까지 통째로 다시 짓는다 — 앞 걸음의 운동이 남긴 전환·transform 같은
     * 인라인 자취가 하나도 남지 않으므로, 어느 걸음에서 오든 같은 화면이 된다.
     */
    function drawStatic(s: EnqueueDequeueEndsScene): void {
      track = computeTrack(Math.max(1, s.seed.length));
      buildChrome();
      clearChildren(ghostLayer);
      clearChildren(pieceLayer);
      pieces = new Map<number, Piece>();

      const at = stationsOf(s);

      // 자국 — 이미 뒤쪽 문을 지난 값이 떠나온 대기 자리. 들어간 차례가 오른쪽에 남는다.
      const stillWaiting = new Set(s.waiting.map((rider) => rider.order));
      for (let order = 0; order < s.seed.length; order += 1) {
        if (stillWaiting.has(order)) continue;
        ghostLayer.appendChild(makeGhost(s.seed.length * 2 + order, s.matched));
      }

      // 값 — 나온 것 · 줄에 선 것 · 대기 중인 것 모두 자기 정거장에 선다.
      const riders: readonly QueueRider[] = [...s.gone, ...s.lane, ...s.waiting];
      for (const rider of riders) {
        const station = at.get(rider.order);
        if (station === undefined) continue;
        const piece = makePiece(rider, station, s.matched);
        pieceLayer.appendChild(piece.g);
        pieces.set(rider.order, piece);
      }

      caption.textContent = s.caption ? captionTextOf(s.caption) : '';
    }

    /**
     * 두 문을 한 번 짚는다 — 서로 반대편에 있다는 것이 이 조각의 전제다.
     *
     * 밝아졌다 돌아오는 한 뜻의 운동이라 시계도 하나다. 반쯤에서 접는 삼각으로 셈하고,
     * 끝에서는 보간값이 아니라 정적 그리기가 세우는 `'0'` 을 글자 그대로 쓴다.
     */
    function runDoors(mine: number): Promise<void> {
      const shown = pulses;
      if (shown.length === 0) return Promise.resolve();
      return tween(PULSE_MS * 2, mine, (p) => {
        if (p >= 1) {
          for (const pulse of shown) pulse.setAttribute('opacity', '0');
          return;
        }
        const lit = easeInOut(p < 0.5 ? p * 2 : (1 - p) * 2).toFixed(3);
        for (const pulse of shown) pulse.setAttribute('opacity', lit);
      });
    }

    /**
     * `order` 번째 값이 뒤쪽 문으로 들어와 줄의 제자리까지 흘러간다.
     *
     * 출발 그림은 그 값의 **대기 자리**라 장면에서 곧바로 셈한다 — `prev` 를 들추지
     * 않는다 (S-scene). 정적 그리기가 이미 끝 자리에 세워 두었으므로, 아직 못 온
     * 만큼을 뒤로 물려 놓고 시작한다.
     */
    function runAdmit(
      s: EnqueueDequeueEndsScene,
      order: number,
      mine: number,
    ): Promise<void> {
      const piece = pieces.get(order);
      if (!piece) return Promise.resolve();
      const from = s.seed.length * 2 + order;
      const x0 = stationX(track, from);
      const x1 = stationX(track, piece.station);
      return tween(glideMs(from - piece.station), mine, (p) => {
        if (p >= 1) {
          place(piece.g, piece.station);
          return;
        }
        placeAt(piece.g, x0 + (x1 - x0) * easeInOut(p));
      });
    }

    /**
     * 줄에 선 것 전부가 한 칸 앞으로. 맨 앞은 그 한 칸에 앞쪽 문을 넘는다.
     *
     * 나아간 것들은 모두 정확히 한 정거장 뒤에서 왔다 — 서로를 앞지르지 못하므로
     * 차례가 그대로 밀린다. 그 한 줄이 이 조각의 주장이다.
     *
     * 아직 뒤쪽 문을 지나지 않은 것은 움직이지 않는다. 대기 자리는 나가는 걸음과
     * 무관하므로, 그린 것 전부를 밀면 서 있어야 할 값이 함께 흔들린다.
     */
    function runRelease(s: EnqueueDequeueEndsScene, mine: number): Promise<void> {
      const legs: { piece: Piece; x0: number; x1: number }[] = [];
      for (const rider of [...s.gone, ...s.lane]) {
        const piece = pieces.get(rider.order);
        if (!piece) continue;
        // 정적 그리기가 이미 끝 자리에 세워 두었으므로 한 칸 뒤로 물려 놓고 출발한다.
        legs.push({
          piece,
          x0: stationX(track, piece.station + 1),
          x1: stationX(track, piece.station),
        });
      }
      if (legs.length === 0) return Promise.resolve();
      // 줄 전체가 **함께** 한 칸 밀린다는 것이 이 걸음의 주장이라 어긋남을 두지 않는다.
      return tween(glideMs(1), mine, (p) => {
        if (p >= 1) {
          for (const leg of legs) place(leg.piece.g, leg.piece.station);
          return;
        }
        const e = easeInOut(p);
        for (const leg of legs) placeAt(leg.piece.g, leg.x0 + (leg.x1 - leg.x0) * e);
      });
    }

    /**
     * 장면을 그린다.
     *
     * 늘 그 장면의 화면 전체를 세운 뒤, 방금 밟은 걸음 하나만 흐르게 한다. 출발 그림은
     * 걸음 함수가 장면에서 스스로 셈하므로 `prev` 를 들출 일이 없다 (`_prev`).
     */
    async function render(
      next: EnqueueDequeueEndsScene,
      _prev: EnqueueDequeueEndsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const mine = gen;
      drawStatic(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'doors':
          await runDoors(mine);
          break;
        case 'admit':
          await runAdmit(next, step.order, mine);
          break;
        case 'release':
          await runRelease(next, mine);
          break;
      }

      // 운동이 끝나면 그 장면을 통째로 다시 세운다 — 흐르며 선 화면과 곧바로 세운
      // 화면이 인라인 자취 하나까지 같아진다 (S-scene).
      if (!alive(mine)) return;
      drawStatic(next);
    }

    const instance: ViewInstance & SceneRenderer<EnqueueDequeueEndsScene> = {
      render,

      destroy(): void {
        destroyed = true;
        // 세대를 올려 두면 깨어난 운동이 화면에 손대지 못한다.
        gen += 1;
        for (const id of timers) window.clearTimeout(id);
        timers.clear();
        // 기다리던 promise 를 먼저 풀어 준다 — 남겨 두면 러너의 await 가 영영 매달린다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        pieces.clear();
        pulses = [];
        if (root.parentNode) root.remove();
      },
    };

    return instance;
  },
};
