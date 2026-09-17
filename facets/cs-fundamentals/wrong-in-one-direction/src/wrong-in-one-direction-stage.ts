/**
 * wrong-in-one-direction-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 그림의 뼈대 (질문의 동사에서 나왔다 — **막힌다**)
 *
 * 묻는 낱말이 왼쪽에서 복도로 들어와 문 셋을 차례로 지난다. 문의 여닫힘은 위쪽
 * 비트 배열의 그 자리에서 내려온다. 꺼진 자리를 만나면 셔터가 내려와 앞을 막고,
 * 낱말은 거기 **부딪혀 되튄다.** 끝까지 가 닿은 것만 오른쪽 출구로 빠져 "있다" 칸에
 * 떨어진다.
 *
 * 판정을 다루는 그림이라 색만 바뀌기 쉬운데, 그러면 순서대로 나타나는 다이어그램이
 * 된다 (S-piece). 그래서 이 판에서 움직이는 것은 넷이다 — 낱말의 이동, 셔터의
 * 오르내림, 짚은 칸의 들림, 그리고 답이 제 칸으로 떨어지는 것. 나타나는 것은 하나뿐
 * (✓/✗ 표식)이고 그것도 위에서 내려와 찍힌다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 문의 형편은 `Gate.height` 와 `label.textContent` 에, 복도의 낱말은 `let token` 에,
 * 앉은 답은 `const landed` 와 `const binFilled` 에, 짚어 본 칸은 `let litCells` 에,
 * 두 칸의 딱지가 어디서 출발하나는 `getAttribute('x')` 를 **되읽어** 있었다. 이제
 * `query` · `answers` · `owners` · `concluded` 가 말하므로 정적 그리기가 그것을
 * 통째로 세운다 (`scene.ts` 의 "다섯 자리").
 *
 * ── 화면에 뜨는 수는 한 출처에서 나온다
 *
 * 칸에 적힌 0/1 과 셔터의 오르내림이 `scene.bits` 한 글자에서 나오고, 문에 적히는
 * 자리 번호와 물드는 칸이 `query.slots` 하나에서 나온다. 캡션의 자리 번호는 마지막
 * 으로 짚은 자리이고, 답의 문안은 앉은 답이 말한다 — payload 에는 그 수가 아예
 * 없다 (`scene.ts` 의 "수는 한 출처에서만").
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 낱말은 이미 멎을 자리에 서 있고, 걸음은 **아직 못 온 만큼을
 * 뒤로 물려** 두었다가 놓아 준다. 출발 자리는 `query` 가 셈으로 말하므로 `prev` 를
 * 들추지 않는다 (S-scene). 걸음 하나가 **한 시계**로 돈다 — 마디마다 `await` 를 두면
 * 그 틈으로 되짚기가 끼어들 자리가 늘어난다. 운동이 끝나면 장면을 통째로 다시 세워
 * 보간이 남긴 끝자리를 노드째 지운다.
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는 값이라
 * 이 파일이 상수로 갖는다 (S-piece). 색은 전부 design-tokens 경유다 (S-view).
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
  bitOf,
  lastProbe,
  ownersFor,
  type WrongInOneDirectionScene,
  type WrongQuery,
} from './scene.js';

// ── 자리. 가로는 러너가 정하고(PIECE_CANVAS_W) 세로는 이 그림이 정한다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 304;

const SIDE_MIN = 26;
const CELL_MAX_W = 36;
const CELL_H = 30;
const CELL_LIFT = 4;

const ROSTER_BASE = 22;
const INDEX_BASE = 46;
const CELLS_TOP = 52;
const OWNER_CY = 94;

const LANE_TOP = 126;
const LANE_H = 52;
const GATE_W = 16;
const GATE_LABEL_BASE = 120;
/** 문이 복도를 나눠 서는 자리 — 복도 폭의 30% 에서 70% 사이에 고르게. */
const GATE_FROM = 0.3;
const GATE_TO = 0.7;
/** 셔터의 세 높이 — 아직 안 읽음 / 올라감 / 내려와 막음. */
const SHUTTER_UNREAD = 22;
const SHUTTER_OPEN = 6;
const SHUTTER_SHUT = LANE_H - 3;

const TOKEN_H = 26;
const CAPTION_BASE = 202;

const BIN_GAP = 24;
const BIN_LABEL_BASE = 228;
const BIN_RULE_Y = 234;
const BIN_TOP = 240;
const CHIP_H = 24;
const CHIP_GAP = 6;
const BIN_ROWS = 2;
/** 두 칸의 딱지가 미끄러져 들어오는 거리. 출발 자리를 화면에서 되읽지 않는다. */
const NOTE_SLIDE = 14;

// ── 걸음의 마디 길이(ms). 걸음 하나가 이 마디들을 한 시계로 잇는다.
const ENTER_MS = 200;
const READ_OPEN_MS = 140;
const READ_SHUT_MS = 175;
const PASS_MS = 260;
const BUMP_MS = 230;
const RECOIL_MS = 110;
const EXIT_MS = 240;
const DROP_MS = 340;
const MARK_MS = 160;
const FLY_MS = 200;
const FLY_GAP = 120;
const NOTE_MS = 260;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

function ease(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 낱말을 담는 알약의 폭. mono 글자 폭에서 역산한다. */
function pillWidth(word: string, charW: number, pad: number): number {
  return Math.round(word.length * charW) + pad;
}

/** 복도를 걸어가는 알약의 폭. 걸음 함수와 정적 그리기가 같은 값을 써야 한다. */
function tokenWidth(word: string): number {
  return Math.max(56, pillWidth(word, 8.4, 26));
}

/** 정적 그리기가 셈한 자리. 장면에는 좌표가 없으므로 매번 여기서 낸다 (S-piece). */
type Geom = {
  n: number;
  k: number;
  cellW: number;
  x0: number;
  x1: number;
  gridW: number;
  cellCx: (slot: number) => number;
  gateCx: (i: number) => number;
  exitX: number;
  homeX: number;
  laneCy: number;
  binW: number;
  binLeft: (bin: number) => number;
  /**
   * 명부의 알약 배치. **한 곳에서만 셈한다** — 알약을 그리는 쪽과 켠 것의 이름표가
   * 날아오는 쪽이 각자 셈하면 둘이 갈릴 자리가 생긴다 (프로토콜 4 절).
   */
  roster: readonly RosterPill[];
  /** 명부 라벨의 오른쪽 끝. 가장 왼쪽 알약보다 더 왼쪽이다. */
  rosterLabelX: number;
};

/** 명부의 알약 하나. 왼쪽 끝과 폭, 그리고 가운데. */
type RosterPill = { word: string; left: number; width: number; cx: number };

type DrawnGate = { shutter: SVGRectElement };
type DrawnCell = { group: SVGGElement };
type DrawnToken = { group: SVGGElement; width: number; restX: number };
type DrawnChip = { group: SVGGElement; mark: SVGTextElement; x: number; y: number };
type DrawnOwner = { group: SVGGElement; slot: number; fromX: number; toX: number };
/** 두 칸의 딱지와 그것이 멎을 자리. 출발은 여기서 셈하고 화면을 되읽지 않는다. */
type DrawnNote = { node: SVGTextElement; endX: number };

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  gates: DrawnGate[];
  cells: DrawnCell[];
  token: DrawnToken | null;
  chips: DrawnChip[];
  notes: DrawnNote[];
  owners: DrawnOwner[];
};

/** 답 하나가 앉는 칸과 높이. 차례를 먼저 한 번에 셈하고 그 다음에 그린다. */
type ChipSeat = { bin: number; row: number };

/**
 * 앉은 답들의 자리를 한 번에 셈한다.
 *
 * 그리면서 "앞에 몇 개 있었나" 를 되묻지 않는다 — 그러면 순회 순서가 곧 숨은
 * 상태가 된다 (프로토콜 4 절).
 */
function seatsOf(scene: WrongInOneDirectionScene): ChipSeat[] {
  const filled = [0, 0];
  return scene.answers.map((a) => {
    const bin = a.present ? 0 : 1;
    const row = Math.min(filled[bin], BIN_ROWS - 1);
    filled[bin] += 1;
    return { bin, row };
  });
}

/**
 * 복도에서 낱말이 멎어 있는 가로 자리.
 *
 * 정적 그리기와 답이 떨어지는 걸음이 **같은 함수**를 지난다 — 둘이 갈리면 답이
 * 엉뚱한 데서 출발한다.
 */
function corridorX(geom: Geom, query: WrongQuery, half: number): number {
  const count = query.probes.length;
  if (count === 0) return geom.homeX;
  const probe = query.probes[count - 1];
  const gx = geom.gateCx(Math.min(count - 1, geom.k - 1));
  return probe.open ? gx + GATE_W / 2 + half + 10 : gx - GATE_W / 2 - half - 8;
}

export const wrongInOneDirectionStageView: CanvasView = {
  canvas: { height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<WrongInOneDirectionScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 층. 뒤에 붙인 것이 위로 온다. 걸음마다 통째로 다시 세운다.
    const gRoster = el('g', {});
    const gGrid = el('g', {});
    const gDropper = el('g', {});
    const gOwner = el('g', {});
    const gLane = el('g', {});
    const gToken = el('g', {});
    const gBin = el('g', {});
    const gCaption = el('g', {});
    svg.append(gRoster, gGrid, gDropper, gOwner, gLane, gToken, gBin, gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 되짚기가 끼어들면 남은 프레임과
     * 운동 뒤의 재건이 **이미 새로 선 화면**을 덮을 수 있으므로, 마디마다 자기 번호가
     * 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면
     * 조각에서 그것을 부르지 않는다 (S-scene).
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

    function geomOf(scene: WrongInOneDirectionScene): Geom {
      const n = Math.max(1, scene.slotCount);
      const k = Math.max(1, scene.hashCount);
      // 요소 크기는 상한만 두고 남는 폭을 좌우 여백으로 버리지 않는다 (S-piece).
      const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n));
      const gridW = cellW * n;
      const x0 = Math.round((W - gridW) / 2);
      const x1 = x0 + gridW;

      // 명부의 알약은 오른쪽 끝에 붙여 쌓고 라벨이 그 왼쪽으로 뻗는다 — 언어마다
      // 라벨 길이가 달라도 알약과 부딪히지 않게.
      const roster: RosterPill[] = [];
      let cursor = x1;
      for (let i = scene.inserted.length - 1; i >= 0; i -= 1) {
        const word = scene.inserted[i];
        const width = pillWidth(word, 7.2, 18);
        const left = cursor - width;
        roster.unshift({ word, left, width, cx: left + width / 2 });
        cursor = left - 6;
      }

      const binW = Math.floor((gridW - BIN_GAP) / 2);
      return {
        n,
        k,
        cellW,
        x0,
        x1,
        gridW,
        cellCx: (slot: number): number => x0 + slot * cellW + cellW / 2,
        gateCx: (i: number): number =>
          Math.round(
            k === 1
              ? x0 + gridW * 0.5
              : x0 + gridW * (GATE_FROM + ((GATE_TO - GATE_FROM) * i) / (k - 1)),
          ),
        exitX: Math.round(x0 + gridW * 0.93),
        homeX: Math.round(x0 + gridW * 0.085),
        laneCy: LANE_TOP + LANE_H / 2,
        binW,
        binLeft: (bin: number): number => x0 + bin * (binW + BIN_GAP),
        roster,
        rosterLabelX: cursor - 4,
      };
    }

    function place(group: SVGGElement, x: number, y: number): void {
      group.setAttribute('transform', `translate(${x} ${y})`);
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 것.
     *
     * 자리 번호는 마지막으로 짚은 자리에서, 낱말과 답은 마지막 답에서, 켠 것들의
     * 이름은 `owners` 와 같은 함수에서 나온다. 캡션이 제 수를 따로 들고 있으면
     * 화면의 칸·이름표와 갈릴 자리가 생긴다.
     */
    function captionFor(scene: WrongInOneDirectionScene): string {
      const cap = scene.caption;
      if (cap === null) return '';

      switch (cap.kind) {
        case 'pass':
          return t('caption.pass', 'Slot {slot} is on. It passes.', {
            slot: lastProbe(scene.query)?.slot ?? 0,
          });
        case 'block':
          return t('caption.block', 'Slot {slot} is off. It stops here.', {
            slot: lastProbe(scene.query)?.slot ?? 0,
          });
        case 'verdict': {
          const a = scene.answers[scene.answers.length - 1];
          if (a === undefined) return '';
          if (!a.present) {
            return t('caption.no', 'It met an off slot, so "absent". This answer cannot be wrong.');
          }
          return a.truth
            ? t(
                'caption.yesTrue',
                'All three on, so "present" — and it really was put in: {word}.',
                { word: a.word },
              )
            : t(
                'caption.yesFalse',
                'All three on, so "present". But it was never put in: {word}.',
                { word: a.word },
              );
        }
        case 'owners': {
          const slots = scene.query?.slots ?? [];
          return t('caption.owners', 'Others had switched those three on: {owners}.', {
            owners: ownersFor(scene, slots)
              .map((o) => o.owner)
              .join(' · '),
          });
        }
        case 'conclusion':
          return t('caption.conclusion', '"Absent" is always right. "Present" is not.');
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of [gRoster, gGrid, gDropper, gOwner, gLane, gToken, gBin, gCaption]) {
        g.textContent = '';
      }
    }

    function dropperPath(cx: number, gx: number): string {
      const top = CELLS_TOP + CELL_H;
      const end = GATE_LABEL_BASE - 14;
      return `M ${cx} ${top} C ${cx} ${top + 16} ${gx} ${end - 12} ${gx} ${end}`;
    }

    /** 복도를 걷는 알약 하나. 답이 나면 같은 모양이 칸에 앉는다. */
    function makePill(
      word: string,
      width: number,
      fill: string,
      stroke: string,
      height: number,
    ): SVGGElement {
      const group = el('g', {});
      group.appendChild(
        el('rect', {
          x: -width / 2,
          y: -height / 2,
          width,
          height,
          rx: 6,
          fill,
          stroke,
          'stroke-width': 1.6,
        }),
      );
      const label = el('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      label.textContent = word;
      group.appendChild(label);
      return group;
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: WrongInOneDirectionScene): Drawn {
      rewind();
      const geom = geomOf(scene);
      const { n, k, cellW, x0, x1, cellCx, gateCx, binW, binLeft } = geom;

      // ── 넣은 것. 비트열은 이 셋이 만든 것이다. 자리는 geom 이 이미 셈해 두었다.
      for (const pill of geom.roster) {
        gRoster.appendChild(
          el('rect', {
            x: pill.left,
            y: ROSTER_BASE - 13,
            width: pill.width,
            height: 18,
            rx: 9,
            fill: c.bgSubtle,
            stroke: c.border,
          }),
        );
        const label = el('text', {
          x: pill.cx,
          y: ROSTER_BASE,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        label.textContent = pill.word;
        gRoster.appendChild(label);
      }
      const rosterLabel = el('text', {
        x: geom.rosterLabelX,
        y: ROSTER_BASE,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      rosterLabel.textContent = t('label.inserted', 'Put in');
      gRoster.appendChild(rosterLabel);

      /*
       * ── 비트 배열. 짚어 본 칸은 들린 채로 물들어 **남는다** — 한 낱말이 몇 칸을
       *    짚어 보았나가 그 낱말의 답을 뒷받침하므로 정적 그리기가 세운다 (S-scene).
       */
      const query = scene.query;
      const read = new Map<number, boolean>();
      if (query !== null) {
        for (const probe of query.probes) read.set(probe.slot, probe.open);
      }

      const cells: DrawnCell[] = [];
      for (let slot = 0; slot < n; slot += 1) {
        const on = bitOf(scene, slot);
        const index = el('text', {
          x: cellCx(slot),
          y: INDEX_BASE,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        index.textContent = String(slot);
        gGrid.appendChild(index);

        // 칸은 들리므로 무리로 감싸고, 번호는 따라 들리지 않게 바깥에 둔다.
        const lifted = read.has(slot);
        const group = el('g', lifted ? { transform: `translate(0 ${-CELL_LIFT})` } : {});
        group.appendChild(
          el('rect', {
            x: x0 + slot * cellW + 1,
            y: CELLS_TOP,
            width: cellW - 2,
            height: CELL_H,
            rx: 4,
            fill: on ? c.text : c.bg,
            stroke: lifted ? c.itemActive : on ? c.text : c.border,
            'stroke-width': lifted ? 2.4 : 1.2,
          }),
        );
        const digit = el('text', {
          x: cellCx(slot),
          y: CELLS_TOP + CELL_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: on ? c.textInverse : c.textMuted,
        });
        digit.textContent = on ? '1' : '0';
        group.appendChild(digit);
        gGrid.appendChild(group);
        cells.push({ group });
      }

      // ── 켠 것이 누구였나. 밝혀진 뒤로는 남는다 — 이 조각의 논증이다.
      const owners: DrawnOwner[] = [];
      for (const attribution of scene.owners) {
        const w = pillWidth(attribution.owner, 6.6, 14);
        const group = el('g', {});
        group.appendChild(
          el('rect', {
            x: -w / 2,
            y: -8,
            width: w,
            height: 16,
            rx: 8,
            fill: c.bgSubtle,
            stroke: c.itemActive,
          }),
        );
        const label = el('text', {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.text,
        });
        label.textContent = attribution.owner;
        group.appendChild(label);
        const toX = cellCx(attribution.slot);
        place(group, toX, OWNER_CY);
        gOwner.appendChild(group);
        owners.push({
          group,
          slot: attribution.slot,
          fromX: geom.roster.find((pill) => pill.word === attribution.owner)?.cx ?? toX,
          toX,
        });
      }

      // ── 복도.
      gLane.appendChild(
        el('line', {
          x1: x0,
          y1: LANE_TOP + LANE_H,
          x2: x1,
          y2: LANE_TOP + LANE_H,
          stroke: c.border,
          'stroke-width': 1.4,
        }),
      );
      gLane.appendChild(
        el('line', {
          x1: x0,
          y1: LANE_TOP,
          x2: x1,
          y2: LANE_TOP,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '2 4',
        }),
      );
      gLane.appendChild(
        el('path', {
          d: `M ${geom.exitX - 9} ${LANE_TOP + 5} L ${geom.exitX} ${LANE_TOP + 5} L ${geom.exitX} ${LANE_TOP + LANE_H - 5} L ${geom.exitX - 9} ${LANE_TOP + LANE_H - 5}`,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1.6,
        }),
      );

      // ── 문 셋 + 각 문이 어느 칸을 읽는지 잇는 줄.
      const gates: DrawnGate[] = [];
      for (let i = 0; i < k; i += 1) {
        const gx = gateCx(i);
        const slot = query?.slots[i];
        const probe = query === null ? undefined : query.probes[i];
        const wasRead = probe !== undefined;
        const open = probe?.open === true;

        if (slot !== undefined) {
          gDropper.appendChild(
            el('path', {
              d: dropperPath(cellCx(slot), gx),
              fill: 'none',
              stroke: wasRead ? c.itemActive : c.border,
              'stroke-width': wasRead ? 1.8 : 1.2,
              ...(wasRead ? {} : { 'stroke-dasharray': '3 3' }),
            }),
          );
        }

        gLane.appendChild(
          el('rect', {
            x: gx - GATE_W / 2,
            y: LANE_TOP,
            width: GATE_W,
            height: LANE_H,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1.2,
          }),
        );
        const shutter = el('rect', {
          x: gx - GATE_W / 2 + 1.5,
          y: LANE_TOP + 1.5,
          width: GATE_W - 3,
          height: wasRead ? (open ? SHUTTER_OPEN : SHUTTER_SHUT) : SHUTTER_UNREAD,
          rx: 2,
          fill: wasRead ? (open ? c.textMuted : c.text) : c.bgSubtle,
          stroke: wasRead ? (open ? c.textMuted : c.text) : c.border,
          'stroke-width': 1,
        });
        gLane.appendChild(shutter);

        const label = el('text', {
          x: gx,
          y: GATE_LABEL_BASE,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: wasRead ? c.itemActive : c.textMuted,
        });
        label.textContent = slot === undefined ? '' : String(slot);
        gLane.appendChild(label);

        gates.push({ shutter });
      }

      // ── 복도에 들어와 있는 낱말. 답이 나면 칸으로 옮겨 앉으므로 여기서 사라진다.
      let token: DrawnToken | null = null;
      if (query !== null && !query.answered) {
        const width = tokenWidth(query.word);
        const group = makePill(query.word, width, c.bg, c.text, TOKEN_H);
        const restX = corridorX(geom, query, width / 2);
        place(group, restX, geom.laneCy);
        gToken.appendChild(group);
        token = { group, width, restX };
      }

      // ── 답이 쌓이는 두 칸.
      const binHeads = [t('label.answerYes', '"Present"'), t('label.answerNo', '"Absent"')];
      const binNotes = [t('label.canBeWrong', 'can be wrong'), t('label.neverWrong', 'never wrong')];
      const notes: DrawnNote[] = [];
      for (let bin = 0; bin < 2; bin += 1) {
        const bx = binLeft(bin);
        const head = el('text', {
          x: bx + 2,
          y: BIN_LABEL_BASE,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
        head.textContent = binHeads[bin];
        gBin.appendChild(head);
        gBin.appendChild(
          el('line', { x1: bx, y1: BIN_RULE_Y, x2: bx + binW, y2: BIN_RULE_Y, stroke: c.border }),
        );
        // 딱지는 결론을 말한 뒤에만 선다. 숨겨 두고 opacity 로 여닫지 않는다 —
        // 안 지은 것과 지어 놓고 숨긴 것이 되짚기 판정에서 갈린다 (S-scene).
        if (scene.concluded) {
          const endX = bx + binW - 2;
          const note = el('text', {
            x: endX,
            y: BIN_LABEL_BASE,
            'text-anchor': 'end',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: bin === 0 ? c.danger : c.success,
          });
          note.textContent = binNotes[bin];
          gBin.appendChild(note);
          notes.push({ node: note, endX });
        }
      }

      /*
       * ── 앉은 답들. 걸어온 낱말이 그대로 기록이 된다.
       *
       *    자리를 먼저 한 번에 셈하고 그 다음에 그린다 — 그리면서 "앞에 몇 개
       *    있었나" 를 되묻지 않는다 (프로토콜 4 절).
       */
      const seats = seatsOf(scene);
      const chips: DrawnChip[] = [];
      for (let i = 0; i < scene.answers.length; i += 1) {
        const answer = scene.answers[i];
        const seat = seats[i];
        const right = answer.present === answer.truth;
        const width = tokenWidth(answer.word);
        const group = makePill(
          answer.word,
          width,
          c.bgSubtle,
          right ? c.border : c.danger,
          TOKEN_H,
        );
        const mark = el('text', {
          x: width / 2 + 14,
          y: 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: right ? c.success : c.danger,
        });
        mark.textContent = right ? '✓' : '✗';
        group.appendChild(mark);
        const x = binLeft(seat.bin) + binW / 2 - 12;
        const y = BIN_TOP + CHIP_H / 2 + seat.row * (CHIP_H + CHIP_GAP);
        place(group, x, y);
        gBin.appendChild(group);
        chips.push({ group, mark, x, y });
      }

      // ── 캡션. 지금 무슨 일이 일어나는지만 말한다 (S-piece).
      const caption = el('text', {
        x: W / 2,
        y: CAPTION_BASE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      caption.textContent = captionFor(scene);
      gCaption.appendChild(caption);

      return { geom, gates, cells, token, chips, notes, owners };
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 걸음 하나가 한 시계로 돈다.

    /**
     * 자리 하나를 짚는다 — 들어옴 · 읽음 · 지남/막힘 셋을 한 시계로 잇는다.
     *
     * 문이 열리면 그대로 지나고, 닫히면 **셔터에 부딪혔다 되튄다.** 동사가 "막힌다"
     * 이므로 부딪혀 멎는 꼴이 맞다 — 색만 바뀌면 다이어그램이 된다 (S-piece).
     */
    function flowProbe(
      drawn: Drawn,
      scene: WrongInOneDirectionScene,
      mine: number,
    ): Promise<void> {
      const query = scene.query;
      const token = drawn.token;
      if (query === null || token === null) return Promise.resolve();

      const at = query.probes.length - 1;
      const probe: (typeof query.probes)[number] | undefined = query.probes[at];
      const gate = drawn.gates[Math.min(at, drawn.gates.length - 1)];
      if (probe === undefined || gate === undefined) return Promise.resolve();
      const cell = drawn.cells[probe.slot];
      if (cell === undefined) return Promise.resolve();

      const geom = drawn.geom;
      const half = token.width / 2;
      const enterMs = at === 0 ? ENTER_MS : 0;
      const readMs = probe.open ? READ_OPEN_MS : READ_SHUT_MS;
      const total = enterMs + readMs + (probe.open ? PASS_MS : BUMP_MS + RECOIL_MS);

      const offX = geom.x0 - token.width;
      // 앞 문을 지나 멎어 있던 자리. 이 걸음의 출발이라 `prev` 를 들출 까닭이 없다.
      const startX =
        at === 0 ? geom.homeX : geom.gateCx(at - 1) + GATE_W / 2 + half + 10;
      const restX = token.restX;
      // 닫힌 문에 부딪히는 자리 — 멎을 자리보다 조금 더 밀고 들어간다.
      const bumpX = restX + 10;
      const shutTo = probe.open ? SHUTTER_OPEN : SHUTTER_SHUT;

      return tween(total, mine, (p) => {
        const ms = p * total;

        // ① 새 낱말이 복도로 들어온다.
        if (ms < enterMs) {
          const e = ease(clamp01(ms / enterMs));
          gate.shutter.setAttribute('height', String(SHUTTER_UNREAD));
          cell.group.removeAttribute('transform');
          place(token.group, lerp(offX, geom.homeX, e), geom.laneCy);
          return;
        }

        // ② 칸을 읽는다 — 그 칸이 들리고 셔터가 오르거나 내린다.
        if (ms < enterMs + readMs) {
          const e = ease(clamp01((ms - enterMs) / readMs));
          gate.shutter.setAttribute('height', String(lerp(SHUTTER_UNREAD, shutTo, e)));
          cell.group.setAttribute('transform', `translate(0 ${-CELL_LIFT * e})`);
          place(token.group, startX, geom.laneCy);
          return;
        }

        // ③ 지나거나 막힌다. 끝에서는 보간값 대신 목표값을 그대로 쓴다.
        gate.shutter.setAttribute('height', String(shutTo));
        cell.group.setAttribute('transform', `translate(0 ${-CELL_LIFT})`);
        const after = ms - enterMs - readMs;
        if (probe.open) {
          place(token.group, lerp(startX, restX, ease(clamp01(after / PASS_MS))), geom.laneCy);
          return;
        }
        if (after < BUMP_MS) {
          place(token.group, lerp(startX, bumpX, ease(clamp01(after / BUMP_MS))), geom.laneCy);
          return;
        }
        place(
          token.group,
          lerp(bumpX, restX, ease(clamp01((after - BUMP_MS) / RECOIL_MS))),
          geom.laneCy,
        );
      });
    }

    /**
     * 답이 제 칸으로 떨어진다.
     *
     * "있다" 는 오른쪽 출구를 빠져나간 뒤 떨어지고, "없다" 는 막힌 자리에서 곧장
     * 떨어진다 — 걸어온 길이 그대로 답이 된다. 표식은 마지막에 위에서 내려와 찍힌다.
     */
    function flowVerdict(
      drawn: Drawn,
      scene: WrongInOneDirectionScene,
      mine: number,
    ): Promise<void> {
      const chip = drawn.chips[drawn.chips.length - 1];
      const answer = scene.answers[scene.answers.length - 1];
      const query = scene.query;
      if (chip === undefined || answer === undefined || query === null) return Promise.resolve();

      const geom = drawn.geom;
      const half = tokenWidth(answer.word) / 2;
      // 복도에서 멎어 있던 자리. 정적 그리기와 같은 함수를 지난다.
      const fromX = corridorX(geom, query, half);
      const exitX = geom.exitX - half - 12;
      const passMs = answer.present ? EXIT_MS : 0;
      const total = passMs + DROP_MS + MARK_MS;

      return tween(total, mine, (p) => {
        const ms = p * total;

        // ① "있다" 는 출구까지 복도를 더 걷는다.
        if (ms < passMs) {
          const e = ease(clamp01(ms / passMs));
          chip.mark.setAttribute('opacity', '0');
          place(chip.group, lerp(fromX, exitX, e), geom.laneCy);
          return;
        }
        // ② 제 칸으로 떨어진다.
        const startX = answer.present ? exitX : fromX;
        if (ms < passMs + DROP_MS) {
          const e = ease(clamp01((ms - passMs) / DROP_MS));
          chip.mark.setAttribute('opacity', '0');
          place(chip.group, lerp(startX, chip.x, e), lerp(geom.laneCy, chip.y, e));
          return;
        }
        // ③ 표식이 위에서 내려와 찍힌다.
        place(chip.group, chip.x, chip.y);
        const e = ease(clamp01((ms - passMs - DROP_MS) / MARK_MS));
        chip.mark.setAttribute('opacity', String(e));
        chip.mark.setAttribute('y', String(lerp(-3, 5, e)));
      });
    }

    /**
     * 켠 것이 누구였는지 — 명부에서 낱말이 날아와 칸 아래에 붙는다.
     *
     * 셋이 **한 뜻으로 묶인 운동**이라 시계를 나누지 않는다. 한 시계 안에서 마디를
     * 밀어 차례로 날게 한다 (프로토콜 4 절).
     */
    function flowOwners(
      drawn: Drawn,
      scene: WrongInOneDirectionScene,
      mine: number,
    ): Promise<void> {
      const slots = new Set(scene.query?.slots ?? []);
      const flying = drawn.owners.filter((o) => slots.has(o.slot));
      if (flying.length === 0) return Promise.resolve();
      const total = FLY_MS + FLY_GAP * (flying.length - 1);

      return tween(total, mine, (p) => {
        const ms = p * total;
        for (let i = 0; i < flying.length; i += 1) {
          const tag = flying[i];
          const e = ease(clamp01((ms - FLY_GAP * i) / FLY_MS));
          place(tag.group, lerp(tag.fromX, tag.toX, e), lerp(ROSTER_BASE - 4, OWNER_CY, e));
        }
      });
    }

    /**
     * 두 칸이 서로 무엇인지 말한다 — 오른쪽에서 미끄러져 들어온다.
     *
     * 출발 자리를 화면에서 되읽지 않는다. 옛 코드는 `Number(tag.getAttribute('x'))`
     * 로 되읽어, 되짚기가 이 운동을 가운데서 끊으면 다음 출발이 어긋났다.
     */
    function flowNotes(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.notes.length === 0) return Promise.resolve();
      return tween(NOTE_MS, mine, (p) => {
        const e = ease(p);
        for (const note of drawn.notes) {
          note.node.setAttribute('opacity', String(e));
          note.node.setAttribute('x', String(lerp(note.endX + NOTE_SLIDE, note.endX, e)));
        }
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: WrongInOneDirectionScene,
      _prev: WrongInOneDirectionScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'probe':
          await flowProbe(drawn, next, mine);
          break;
        case 'verdict':
          await flowVerdict(drawn, next, mine);
          break;
        case 'attribute':
          await flowOwners(drawn, next, mine);
          break;
        case 'conclude':
          await flowNotes(drawn, mine);
          break;
      }
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
