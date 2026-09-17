/**
 * shift-on-insert-stage — "가운데에 넣으면 뒤가 밀린다" 를 그리는 조각 전용 view.
 *
 * ── 왜 이 배치인가
 *
 * 동사가 "밀린다" 이므로 화면의 주된 사건은 **가로 이동** 이어야 한다. 그래서
 * 칸(주소)과 값(내용)을 분리해 그린다 —
 *
 *   · 칸은 고정된 여섯 개의 테두리다. 배열의 칸은 어디로도 가지 않는다.
 *   · 값은 칸 위에 얹힌 별개의 타일이고, 밀 때 **실제로 오른쪽으로 translate** 된다.
 *   · 값이 떠난 칸은 즉시 점선(빈 칸)이 된다. "자리가 비었다" 가 눈에 보여야
 *     "자리를 비운 다음에야 새 값이 들어온다" 가 성립한다.
 *
 * 새 값은 목표 칸 **위에** 떠서 기다린다. 들어가는 운동만 세로축(낙하)으로 두어
 * 미는 운동(가로)과 섞이지 않게 했다. 밀기가 끝나 칸이 비기 전에는 내려오지
 * 않으며, 처음에 한 번 부딪혀 튕겨 오르는 것으로 "지금은 못 들어간다" 를 말한다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 전체를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 필요 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * 칸의 줄(주소)은 mount 에서 한 번 세운다 — 칸 수는 처음부터 끝까지 그대로이고,
 * `initialData` 를 좁히는 자리가 mount 이기 때문이다 (S-piece). 그 위에 얹히는
 * 값·테두리·캡션은 걸음마다 장면에서 다시 만든다.
 *
 * ── CSS transition 을 쓰지 않는다
 *
 * 옛 stage 는 타일에 `style.transition` 을 걸고 곧바로 끝 자리를 주는 짜임이었다.
 * 되짚기는 `animate:false` 로 오는데 transition 은 그 뒤에도 화면을 저 혼자
 * 흘러가게 하므로 "그 걸음의 화면" 이라는 말이 성립하지 않는다 (S-scene MUST NOT).
 * 이제 `tween` 이 벽시계를 `setTimeout` 으로 재며 `translate` 의 x·y 를 **직접**
 * 보간한다 — rAF 를 쓰지 않는 것은 프레임이 없는 자리에서도 걸음이 돌아야 하기
 * 때문이고, 배율이 아니라 좌표를 보간하는 것은 `-0` 이나 끝자리 부스러기가
 * transform 문자열에 남지 않아야 되짚은 화면과 글자까지 같아지기 때문이다.
 *
 * `render` 는 정적 그리기를 **두 번** 부른다. 첫 번째가 그 걸음의 화면을 전부
 * 세우고, 운동이 끝난 뒤의 두 번째가 흐르며 남은 속성(움직이는 타일 색, 잠깐
 * 열어 둔 칸 테두리)을 통째로 지운다. 되돌릴 목록을 손으로 관리하지 않는다.
 *
 * 색은 design-tokens 만 쓴다 (S-view). 움직이는 값 = itemActive, 새로 넣는 값 =
 * accent, 빈 칸 = ghostOutline 점선, 받을 자리 = accent 점선.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type Palette,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { ShiftCaption, ShiftOnInsertScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 268;

const SLOT_W = 74;
const SLOT_GAP = 10;
const SLOT_H = 52;
const ROW_Y = 118;

const TILE_INSET = 5;
const TILE_W = SLOT_W - TILE_INSET * 2;
const TILE_H = SLOT_H - TILE_INSET * 2;
const TILE_Y = ROW_Y + TILE_INSET;

/** 새 값이 들어가기 전에 떠서 기다리는 높이. */
const HOVER_Y = 34;
/** 부딪혀 튕길 때 눌리는 깊이. */
const BUMP_DROP = 16;

const INDEX_LABEL_Y = ROW_Y + SLOT_H + 18;
const COUNTER_Y = 58;
const CAPTION_Y = 218;

/** 한 칸 미는 데 걸리는 시간. */
const MOVE_MS = 360;
/** 받을 자리를 먼저 보여 주는 시간 — 비었음을 확인하고 나서 옮긴다. */
const OPEN_MS = 150;
/** 새 값이 칸으로 떨어지는 시간. */
const DROP_MS = 320;
/** 못 들어가고 튕기는 시간 (한 방향). */
const BUMP_MS = 170;
/** 보간 한 프레임. rAF 가 아니라 벽시계로 잰다. */
const FRAME_MS = 16;

type SlotState = 'filled' | 'empty' | 'blocked' | 'open' | 'settled';
type TileKind = 'resting' | 'moving' | 'incoming';

type Tile = {
  g: SVGGElement;
  box: SVGRectElement;
  label: SVGTextElement;
};

/** 칸 줄을 세우는 데 필요한 것. 값이 아니라 그릇의 모양이다. */
type Geometry = { capacity: number; targetIndex: number };

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 부딪히러 갈 때 — 점점 빨라진다. */
function easeIn(p: number): number {
  return p * p;
}

/** 튕겨 돌아올 때 — 점점 느려진다. */
function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

/** 옆으로 미는 운동. cubic-bezier(.4,0,.2,1) 자리를 대신한다. */
function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 내려앉으며 한 번 지나쳤다 돌아온다. cubic-bezier(.34,1.3,.64,1) 자리. */
function easeBackOut(p: number): number {
  const c1 = 1.2;
  const u = p - 1;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
}

/**
 * `initialData` 를 좁히는 자리는 여기다 — 장면이 비어 있어도 반드시 불리는 유일한
 * 경로이므로 (S-piece).
 */
function readGeometry(initialData: Record<string, unknown> | undefined): Geometry {
  const raw = initialData ?? {};
  const values = Array.isArray(raw.values) ? raw.values : [];
  const capacity = Math.max(1, values.length, Math.trunc(num(raw.capacity)));
  return { capacity, targetIndex: Math.trunc(num(raw.targetIndex)) };
}

export const shiftOnInsertStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    params.canvas.textContent = '';
    const colors: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const svg = params.canvas;
    const geometry = readGeometry(params.initialData as Record<string, unknown> | undefined);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 깨어난 운동이 다음 세대의 화면에 손대지 않게 하는 빗장이다. 운동이 **칸
     * 테두리**를 걸음 중간에 고쳐 쓰는 짜임이라 (받을 자리를 잠깐 `open` 으로
     * 보였다가 되돌린다), 앞 걸음의 운동이 살아 있으면 칸이 옛 뜻으로 덮인다.
     * 타일은 걸음마다 새로 만들지만 칸은 mount 에서 한 번 세워 계속 쓰는 것이라
     * 더욱 그렇다.
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너는 장면 조각에서 그
     * 둘을 부르지 않는다 (S-scene). 실효 있는 것은 `opts.animate` 검사와 이 세대
     * 빗장 둘뿐이라 그 둘만 둔다.
     */
    let gen = 0;

    /** 이 세대의 운동이 아직 화면에 손대도 되나. */
    const alive = (mine: number): boolean => mine === gen && !destroyed;

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
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 자리 셈. 칸 수가 폭을 정하고 남는 폭은 좌우로 고르게 나눈다 (S-piece).
    const rowW = geometry.capacity * SLOT_W + (geometry.capacity - 1) * SLOT_GAP;
    const originX = Math.round((W - rowW) / 2);
    const slotX = (i: number): number => originX + i * (SLOT_W + SLOT_GAP);
    const tileX = (i: number): number => slotX(i) + TILE_INSET;

    const text = (
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
    ): SVGTextElement => {
      const el = document.createElementNS(SVG_NS, 'text');
      el.setAttribute('x', String(x));
      el.setAttribute('y', String(y));
      el.setAttribute('text-anchor', anchor);
      el.setAttribute('font-size', size);
      el.setAttribute('fill', fill);
      return el;
    };

    /** 칸(주소) 테두리. mount 에서 한 번 세우고 걸음마다 뜻만 갈아 칠한다. */
    const slotEls: SVGRectElement[] = [];

    const paintSlot = (i: number, state: SlotState): void => {
      const r = slotEls[i];
      if (!r) return;
      switch (state) {
        case 'filled':
          r.setAttribute('fill', colors.bgSubtle);
          r.setAttribute('stroke', colors.border);
          r.setAttribute('stroke-width', '1.5');
          r.removeAttribute('stroke-dasharray');
          break;
        case 'empty':
          r.setAttribute('fill', colors.bg);
          r.setAttribute('stroke', colors.ghostOutline);
          r.setAttribute('stroke-width', '1.5');
          r.setAttribute('stroke-dasharray', '5 4');
          break;
        case 'blocked':
          // 넣고 싶은 자리인데 값이 들어 있다.
          r.setAttribute('fill', colors.bgSubtle);
          r.setAttribute('stroke', colors.accent);
          r.setAttribute('stroke-width', '2.5');
          r.removeAttribute('stroke-dasharray');
          break;
        case 'open':
          // 지금 받을 수 있는 빈 자리.
          r.setAttribute('fill', colors.bg);
          r.setAttribute('stroke', colors.accent);
          r.setAttribute('stroke-width', '2.5');
          r.setAttribute('stroke-dasharray', '5 4');
          break;
        case 'settled':
          r.setAttribute('fill', colors.bgSubtle);
          r.setAttribute('stroke', colors.text);
          r.setAttribute('stroke-width', '1.5');
          r.removeAttribute('stroke-dasharray');
          break;
      }
    };

    const paintTile = (tile: Tile, kind: TileKind): void => {
      switch (kind) {
        case 'resting':
          tile.box.setAttribute('fill', colors.itemDefault);
          tile.box.setAttribute('stroke', colors.border);
          tile.label.setAttribute('fill', colors.text);
          break;
        case 'moving':
          tile.box.setAttribute('fill', colors.itemActive);
          tile.box.setAttribute('stroke', colors.itemActive);
          // 색 있는 타일 위 글자는 테마와 무관하게 어두워야 읽힌다.
          tile.label.setAttribute('fill', colors.stateInk);
          break;
        case 'incoming':
          tile.box.setAttribute('fill', colors.accent);
          tile.box.setAttribute('stroke', colors.accent);
          tile.label.setAttribute('fill', colors.stateInk);
          break;
      }
    };

    /**
     * 타일을 그 자리에 세운다.
     *
     * 정적 그리기와 보간이 같은 함수를 쓴다 — 끝에서 목표 좌표를 **그대로** 넘기면
     * 흐르고 난 transform 문자열이 곧바로 세운 것과 글자까지 같아진다 (S-scene).
     */
    const placeTile = (tile: Tile, x: number, y: number): void => {
      tile.g.style.transform = `translate(${x}px, ${y}px)`;
    };

    const makeTile = (value: number, x: number, y: number, kind: TileKind): Tile => {
      const g = document.createElementNS(SVG_NS, 'g');

      const box = document.createElementNS(SVG_NS, 'rect');
      box.setAttribute('width', String(TILE_W));
      box.setAttribute('height', String(TILE_H));
      box.setAttribute('rx', '4');
      box.setAttribute('stroke-width', '1.5');
      g.appendChild(box);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(TILE_W / 2));
      label.setAttribute('y', String(TILE_H / 2 + 6));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', fontSizes.lg);
      label.setAttribute('font-family', fonts.mono);
      label.setAttribute('font-weight', '600');
      // 값 표기는 표식이다 (C10 결정 트리 3) — 키를 만들지 않는다.
      label.textContent = String(value);
      g.appendChild(label);

      const tile: Tile = { g, box, label };
      placeTile(tile, x, y);
      paintTile(tile, kind);
      return tile;
    };

    // ── 한 번만 세우는 뼈대 ──────────────────────────────────────────────────
    //
    // 칸(주소)은 처음부터 끝까지 그대로다. 걸음마다 다시 만드는 것은 그 위에 얹히는
    // 값과 테두리와 문장뿐이다.

    const slotLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(slotLayer);
    for (let i = 0; i < geometry.capacity; i += 1) {
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', String(slotX(i)));
      r.setAttribute('y', String(ROW_Y));
      r.setAttribute('width', String(SLOT_W));
      r.setAttribute('height', String(SLOT_H));
      r.setAttribute('rx', '6');
      slotLayer.appendChild(r);
      slotEls.push(r);

      // 인덱스 숫자는 표식이다.
      const idx = text(slotX(i) + SLOT_W / 2, INDEX_LABEL_Y, fontSizes.sm, colors.textMuted, 'middle');
      idx.setAttribute('font-family', fonts.mono);
      idx.textContent = String(i);
      slotLayer.appendChild(idx);
    }

    // 새 값이 내려올 길 — 목표 칸 바로 위의 점선과 화살촉.
    const arrow = document.createElementNS(SVG_NS, 'g');
    {
      const cx = slotX(geometry.targetIndex) + SLOT_W / 2;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(cx));
      line.setAttribute('y1', String(HOVER_Y + TILE_H + 8));
      line.setAttribute('x2', String(cx));
      line.setAttribute('y2', String(ROW_Y - 14));
      line.setAttribute('stroke', colors.accent);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '4 4');
      arrow.appendChild(line);
      const head = document.createElementNS(SVG_NS, 'polygon');
      head.setAttribute(
        'points',
        `${cx - 6},${ROW_Y - 14} ${cx + 6},${ROW_Y - 14} ${cx},${ROW_Y - 4}`,
      );
      head.setAttribute('fill', colors.accent);
      arrow.appendChild(head);
    }
    svg.appendChild(arrow);

    /** 값 타일이 사는 켜. 걸음마다 통째로 비우고 다시 세운다. */
    const tileLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(tileLayer);

    const counterEl = text(originX, COUNTER_Y, fontSizes.sm, colors.textMuted, 'start');
    counterEl.setAttribute('font-family', fonts.mono);
    svg.appendChild(counterEl);

    const captionEl = text(W / 2, CAPTION_Y, fontSizes.md, colors.text, 'middle');
    svg.appendChild(captionEl);

    /** 칸 번호 → 그 칸에 지금 서 있는 타일. 장면에서 다시 셈하는 것이라 상태가 아니다. */
    let tiles: (Tile | null)[] = [];
    /** 아직 칸에 앉지 않은 새 값. 앉은 뒤에는 `tiles` 에 있다. */
    let incomingTile: Tile | null = null;

    // ── 장면 그리기 ─────────────────────────────────────────────────────────

    /**
     * 칸 하나가 지금 무슨 뜻인가.
     *
     * 값이 들었는지만으로는 목표 칸을 그릴 수 없다 — 값이 막 떠난 빈 칸과 "이제
     * 들어와도 된다" 는 빈 칸이 다른 그림이라, 장면의 `phase` 가 그것을 가른다.
     */
    const slotStateOf = (s: ShiftOnInsertScene, i: number): SlotState => {
      const filled = s.cells[i] != null;
      if (s.phase === 'done') return filled ? 'settled' : 'empty';
      if (i === s.targetIndex && s.phase !== 'ready') {
        if (filled) return s.phase === 'placed' ? 'filled' : 'blocked';
        return s.phase === 'cleared' ? 'open' : 'empty';
      }
      return filled ? 'filled' : 'empty';
    };

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    const drawCaption = (cap: ShiftCaption | null): void => {
      if (!cap) {
        captionEl.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'plan':
          captionEl.textContent = tr(
            'caption.plan',
            'New value {incoming} — slot {at} is already taken by {occupied}.',
            { at: cap.at, occupied: cap.occupied, incoming: cap.incoming },
          );
          return;
        case 'shift':
          captionEl.textContent = tr(
            'caption.shift',
            '{value} at slot {from} → slot {to}. Moving back to front overwrites nothing.',
            { value: cap.value, from: cap.from, to: cap.to },
          );
          return;
        case 'cleared':
          captionEl.textContent = tr(
            'caption.cleared',
            'Slot {at} is empty. Only now can the new value move in.',
            { at: cap.at },
          );
          return;
        case 'placed':
          captionEl.textContent = tr('caption.placed', '{value} takes slot {at}.', {
            value: cap.value,
            at: cap.at,
          });
          return;
        case 'done':
          captionEl.textContent = tr(
            'caption.done',
            'One insert cost {moves} moves. The closer to the front, the more get pushed.',
            { moves: cap.moves },
          );
          return;
      }
    };

    /**
     * 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece).
     *
     * 늘 비우고 시작하므로 되돌릴 명령이 필요 없다 (S-scene). 운동이 끝난 뒤
     * 한 번 더 부르면 흐르며 남은 것이 통째로 사라진다.
     */
    const drawStatic = (s: ShiftOnInsertScene): void => {
      tileLayer.textContent = '';
      tiles = new Array<Tile | null>(slotEls.length).fill(null);
      incomingTile = null;

      // 새 값이 이미 칸에 앉았나. 앉았으면 위에 떠 있는 것도 내려올 길도 없다.
      const placed = s.phase === 'placed' || s.phase === 'done';

      for (let i = 0; i < slotEls.length; i += 1) {
        paintSlot(i, slotStateOf(s, i));
        const value = s.cells[i];
        if (value == null) continue;
        // 새로 넣은 값은 앉은 뒤에도 accent 로 남는다 — 어느 것이 새 값인지가
        // 이 조각의 결론이다.
        const kind: TileKind = placed && i === s.targetIndex ? 'incoming' : 'resting';
        const tile = makeTile(value, tileX(i), TILE_Y, kind);
        tileLayer.appendChild(tile.g);
        tiles[i] = tile;
      }

      if (placed) {
        arrow.setAttribute('opacity', '0');
      } else {
        // 지운다 — `1` 로 되돌리지 않는다. 곧바로 세운 화면에는 이 속성이 아예
        // 없어, 남겨 두면 같은 걸음인데 화면이 갈린다 (S-scene).
        arrow.removeAttribute('opacity');
        incomingTile = makeTile(s.incoming, tileX(s.targetIndex), HOVER_Y, 'incoming');
        tileLayer.appendChild(incomingTile.g);
      }

      counterEl.textContent = tr('label.moveCount', 'moved: {n}', { n: s.moves });
      drawCaption(s.caption);
    };

    // ── 걸음 함수 ───────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 아직 못 온 만큼을
    // 뒤로 물리고 시계를 돌리는 꼴이 된다. 출발 그림은 `prev` 를 들추지 않고
    // 장면에서 셈한다 (S-scene). 흐르며 덮어쓴 색과 테두리는 되돌리지 않는다 —
    // `render` 가 마지막에 정적 그리기를 한 번 더 부르는 것이 그 자리다.

    /** 문제 — 넣고 싶은 자리가 이미 차 있다. 새 값이 부딪혔다가 튕겨 오른다. */
    function flowBump(at: number, mine: number): Promise<void> {
      const tile = incomingTile;
      if (!tile) return Promise.resolve();
      const x = tileX(at);
      const total = BUMP_MS * 2;
      return tween(total, mine, (p) => {
        if (p >= 1) {
          // 끝에서는 보간값이 아니라 목표 좌표를 그대로 쓴다.
          placeTile(tile, x, HOVER_Y);
          return;
        }
        const now = p * total;
        const drop =
          now < BUMP_MS
            ? BUMP_DROP * easeIn(now / BUMP_MS)
            : BUMP_DROP * (1 - easeOut((now - BUMP_MS) / BUMP_MS));
        placeTile(tile, x, HOVER_Y + drop);
      });
    }

    /**
     * 장치 — 뒤에서부터 한 칸씩. 받을 자리를 먼저 보이고 나서 옮긴다.
     *
     * 운동의 방향이 뒤집힌다. 정적 그리기가 타일을 이미 **도착 칸**에 세워 두었으므로
     * 떠나온 칸으로 되돌려 놓고 시작한다. 그 사이에 타이머도 프레임도 없어 페인트가
     * 끼지 않는다 — 끝 자리가 번쩍이지 않는다.
     *
     * 자리를 보이는 뜸과 옮기는 운동을 `Promise` 둘로 가르지 않는다. 한 뜻의 운동은
     * 시계가 하나여야 하므로 한 `tween` 안에서 마디만 나눈다.
     */
    function flowShift(
      p: { from: number; to: number; fromIsTarget: boolean },
      mine: number,
    ): Promise<void> {
      const tile = tiles[p.to];
      if (!tile) return Promise.resolve();

      const fromX = tileX(p.from);
      const toX = tileX(p.to);

      placeTile(tile, fromX, TILE_Y);
      paintTile(tile, 'moving');
      // 떠나기 전의 두 칸 — 출발 칸은 아직 차 있고, 도착 칸은 받을 준비를 한다.
      paintSlot(p.from, p.fromIsTarget ? 'blocked' : 'filled');
      paintSlot(p.to, 'open');

      const total = OPEN_MS + MOVE_MS;
      let left = false;
      return tween(total, mine, (q) => {
        const m = clamp01((q * total - OPEN_MS) / MOVE_MS);
        placeTile(tile, m >= 1 ? toX : fromX + (toX - fromX) * easeInOut(m), TILE_Y);
        if (m >= 1 && !left) {
          left = true;
          // 떠난 자리는 즉시 빈 칸이 된다 — "자리를 비운다" 가 눈에 보여야 한다.
          paintSlot(p.from, 'empty');
        }
      });
    }

    /** 비워 둔 칸으로 새 값이 내려앉는다. 떠 있던 자리로 되돌려 놓고 시작한다. */
    function flowDrop(at: number, mine: number): Promise<void> {
      const tile = tiles[at];
      if (!tile) return Promise.resolve();

      const x = tileX(at);
      placeTile(tile, x, HOVER_Y);
      paintSlot(at, 'open');

      return tween(DROP_MS, mine, (p) => {
        if (p >= 1) {
          placeTile(tile, x, TILE_Y);
          return;
        }
        placeTile(tile, x, HOVER_Y + (TILE_Y - HOVER_Y) * easeBackOut(p));
      });
    }

    async function render(
      next: ShiftOnInsertScene,
      /** 이 조각은 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: ShiftOnInsertScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      // 방금 밟은 걸음 하나만 흐르게 한다. 걸음을 건너뛰어 와도 걸음 함수가 자기
      // 출발 그림을 장면에서 스스로 세우므로 `prev` 와 견줄 일이 없다.
      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'bump':
          await flowBump(next.targetIndex, mine);
          break;
        case 'shift':
          await flowShift(
            { from: step.from, to: step.to, fromIsTarget: step.from === next.targetIndex },
            mine,
          );
          break;
        case 'drop':
          await flowDrop(step.index, mine);
          break;
      }

      if (!alive(mine)) return;
      // 흐르며 남은 속성 — 움직이는 타일 색, 잠깐 열어 둔 칸 테두리, 보간의 끝자리
      // 부스러기 — 가 통째로 사라진다. 되돌릴 목록을 손으로 관리하지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 콜백은 아예 불리지
        // 않으므로 기다리던 것을 직접 깨워야 `render` 의 `await` 가 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (svg.parentElement) svg.remove();
      },
    };
  },
};
