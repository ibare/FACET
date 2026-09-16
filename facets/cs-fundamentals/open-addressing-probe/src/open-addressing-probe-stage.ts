/**
 * open-addressing-probe-stage — 조각 전용 stage view.
 *
 * 화면의 동사는 "옆으로 밀려간다" 이므로, 이 view 의 모든 주 운동은 **위치
 * 이동**이다. 열쇠 조각(chip)이 제 자리 위에 내려앉고, 그 자리가 차 있으면
 * 한 칸씩 오른쪽으로 미끄러지며, 빈 자리를 만나면 표 안으로 떨어진다.
 * 색 전환은 "이 자리는 차 있다" 를 알리는 보조 신호로만 쓴다.
 *
 * 세로 구성 (위 → 아래)
 *   해시 줄        열쇠 · hashCode · 자리 계산 결과
 *   탐사 레인      칩이 걸어 다니는 띠. 지나온 길은 점선으로 남는다
 *   제 자리 표시   칩이 떠나도 제 자리가 어디였는지 가리키는 caret
 *   표             버킷 한 줄. 폭은 캔버스에서 역산한다 (S-piece)
 *   밀림 호        제 자리 → 앉은 자리 사이의 호. 밀려난 거리를 남긴다
 *   캡션           지금 무슨 일이 일어나는지 한 줄
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 밟은 걸음
 * 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고 되짚기가 앞으로 가기와
 * 같은 길로 온다. `reset()` · `setCaption()` · `arrive()` · `probe()` · `seat()` ·
 * `spill()` · `finish()` 일곱이 통째로 사라졌다.
 *
 * 함께 사라진 것이 셋 더 있다. 지금 걷는 열쇠가 어느 칸 위에 서 있는지를 쥐던
 * `let chip`, 밀림 호를 열쇠 이름으로 찾아 쓰던 `Map<string, {path, head}>`,
 * 그리고 짚어 본 칸을 잠깐 물들였다 되돌리던 색 되돌림. 셋 다 장면이 말한다.
 *
 * **짚어 본 자취는 남는 강조다.** 이 조각의 주장이 "몇 칸을 짚어 보고 어디에
 * 앉았나" 이므로, 짚어 보아 차 있던 칸의 표식과 지나온 점선은 정적 그리기에도
 * 들어간다. 지나가는 것은 그 순간의 **채움 물들임**뿐이고, 남는 것은 **테두리
 * 표식**이다 — 채움은 값의 형편(차 있다), 테두리는 견줌의 표식으로 갈라 둔다.
 *
 * 운동의 방향이 뒤집혀 있다. 정적 그리기가 정본이라 칩은 이미 닿을 자리에 서 있고
 * 값은 이미 칸에 앉아 있다. 흐르게 할 때만 **출발 그림으로 도로 물려 놓고** 시작하며,
 * 그 물림은 첫 프레임이 그려지기 전에 동기로 끝난다. 운동이 끝나면 장면을 통째로
 * 다시 세워, 흐른 화면과 곧바로 세운 화면이 속성 하나만큼도 갈리지 않게 한다.
 *
 * 화면의 글자 중 이 파일이 직접 쓰는 것은 데이터에서 온 열쇠 이름과 버킷 번호뿐이다.
 * 문장인 캡션과 해시 줄은 `facet.ts` 의 `messages` 에 있고 여기서는 키와 en 원본으로
 * `params.t` 를 부른다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  OpenAddressingProbeScene,
  ProbeCaption,
  ProbeSeat,
  ProbeStep,
  ProbeWalk,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

/** 칸 폭의 상한. 실제 폭은 캔버스에서 역산한다 — 남는 폭을 여백으로 버리지 않는다. */
const CELL_MAX_W = 72;
const SIDE_MIN = 24;
const CELL_H = 46;
const CELL_GAP = 2;
const CHIP_INSET = 5;
const CHIP_H = CELL_H - CHIP_INSET * 2;

const HASH_Y = 22;
const LANE_Y = 44;
const CARET_Y = LANE_Y + CHIP_H + 6;
const TABLE_Y = 104;
const INDEX_Y = TABLE_Y + CELL_H + 15;
const ARC_Y = INDEX_Y + 10;
const ARC_DEPTH = 13;
const CAPTION_Y = 212;
const STAGE_H = 228;

const FRAME_PAD = 7;
/** 다 들어갔다는 것을 말하는 테두리의 짙기. 끝에서 이 상수를 그대로 쓴다. */
const FRAME_OPACITY = 0.55;

/** 밀림 호의 평소 짙기와, 남의 충돌이 번진 것으로 짚혔을 때의 짙기. */
const ARC_OPACITY = 0.6;
const ARC_WIDTH = 1.5;
const ARC_CALLED_WIDTH = 2.5;

/** initialData 가 없는 자리에서 mount 될 때의 버킷 수. */
const FALLBACK_SIZE = 8;

/** 칩이 제 자리 위로 내려앉기 전에 떠 있는 높이. */
const ARRIVE_LIFT = 20;

const MS_ARRIVE = 180;
const MS_BLOCK_FLASH = 140;
const MS_SLIDE = 220;
const MS_DROP = 220;
const MS_SETTLE = 180;
const MS_SPILL = 240;

type Cell = { rect: SVGRectElement; label: SVGTextElement };
type Arc = { path: SVGPathElement; head: SVGPolygonElement };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export const openAddressingProbeStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<OpenAddressingProbeScene> {
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const canvas = params.canvas;
    canvas.setAttribute('viewBox', `0 0 ${W} ${STAGE_H}`);
    canvas.style.fontFamily = fonts.body;

    const root = el('g');
    canvas.appendChild(root);

    // 레이어 순서: 프레임 → 밀림 호 → 표 → caret → 탐사 자취 → 칩 → 글.
    // 앞의 여섯은 장면마다 통째로 다시 짓는다.
    const frameG = el('g');
    const arcsG = el('g');
    const tableG = el('g');
    const caretG = el('g');
    const trailG = el('g');
    const chipG = el('g');
    root.append(frameG, arcsG, tableG, caretG, trailG, chipG);

    // ── 고정 자리의 글 두 줄. 다시 짓지 않고 내용만 갈아 낀다. 재건 밖에 있으므로
    //    정적 경로가 **매번 명시로** 내용을 쓴다 (빈 줄도 명시로 쓴다).
    const hashLine = el('text', {
      x: W / 2,
      y: HASH_Y,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    root.append(hashLine, caption);

    // ── 걸어 둔 것과 세대. destroy 와 되짚기가 함께 쓴다.
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     * 이 조각의 걸음은 마디가 둘(물들임 → 미끄러짐)이라 `await` 를 여러 번 지나므로
     * 빗장이 필요하다 — 살아남은 앞 세대의 뒷마디가 새로 선 화면을 덮을 수 있다.
     */
    let gen = 0;

    function animate(ms: number, draw: (p: number) => void, live: () => boolean): Promise<void> {
      // 빗장이 화면 쓰기보다 앞에 온다. 뒤에 두면 깨어난 앞 세대가 첫 프레임 하나를
      // 새로 선 화면에 쓰고 나서야 물러난다.
      if (!live()) return Promise.resolve();
      draw(0);
      return new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          if (live()) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        let id = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          frames.delete(id);
          draw(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          frames.delete(id);
          // 내 세대가 아니면 화면에 손대지 않고 물러난다.
          if (destroyed || !live()) {
            done = true;
            waiters.delete(finish);
            resolve();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          if (raw >= 1) {
            finish();
            return;
          }
          draw(easeInOut(raw));
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    /** 흐르지 않고 시간만 지나가는 마디. 세대가 갈리면 곧바로 물러난다. */
    function hold(ms: number, live: () => boolean): Promise<void> {
      return animate(ms, () => {}, live);
    }

    // ── 기하. 칸 폭은 캔버스에서 역산하고 상수는 상한으로만 쓴다 (S-piece).
    let size = FALLBACK_SIZE;
    let cellW = CELL_MAX_W;
    let originX = 0;

    function layout(n: number): void {
      size = Math.max(1, n);
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / size));
      originX = Math.round((W - cellW * size) / 2);
    }

    const cellX = (i: number): number => originX + i * cellW;
    const cellCx = (i: number): number => cellX(i) + cellW / 2;
    const chipW = (): number => cellW - CELL_GAP - CHIP_INSET * 2;
    const chipX = (i: number): number => cellX(i) + CELL_GAP / 2 + CHIP_INSET;

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let cells: Cell[] = [];
    let arcs = new Map<string, Arc>();
    let chipNode: SVGGElement | null = null;
    let trailNode: SVGLineElement | null = null;
    let frameNode: SVGRectElement | null = null;

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      frameG.replaceChildren();
      arcsG.replaceChildren();
      tableG.replaceChildren();
      caretG.replaceChildren();
      trailG.replaceChildren();
      chipG.replaceChildren();
      cells = [];
      arcs = new Map<string, Arc>();
      chipNode = null;
      trailNode = null;
      frameNode = null;
      hashLine.textContent = '';
      caption.textContent = '';
    }

    // ── 표 ────────────────────────────────────────────────────────────────

    /**
     * 칸의 옷. 채움은 **값의 형편**(차 있나), 테두리는 **견줌의 표식**(짚어 보았나).
     * 둘을 갈라 두면 밀려가는 동안에도 읽기가 뒤집히지 않는다.
     */
    function dressCell(cell: Cell, filled: boolean, probed: boolean): void {
      cell.rect.setAttribute('fill', filled ? colors.bgSubtle : colors.bg);
      cell.rect.setAttribute('stroke', probed ? colors.itemComparing : filled ? colors.text : colors.border);
      cell.rect.setAttribute('stroke-width', probed ? '2.5' : '1.5');
    }

    function drawCells(scene: OpenAddressingProbeScene): void {
      const probed = new Set(scene.walk?.probed ?? []);
      for (let i = 0; i < size; i += 1) {
        const rect = el('rect', {
          x: cellX(i) + CELL_GAP / 2,
          y: TABLE_Y,
          width: cellW - CELL_GAP,
          height: CELL_H,
          rx: 7,
        });
        const label = el('text', {
          x: cellCx(i),
          y: TABLE_Y + CELL_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': '600',
          fill: colors.text,
        });
        const idx = el('text', {
          x: cellCx(i),
          y: INDEX_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        idx.textContent = String(i);
        tableG.append(rect, label, idx);

        const cell: Cell = { rect, label };
        cells.push(cell);
        const seated = scene.cells[i] ?? null;
        label.textContent = seated ?? '';
        dressCell(cell, seated !== null, probed.has(i));
      }
    }

    /** 흐르는 동안만 쓰는 칸 갈아 끼우기. 끝에서는 정적 그리기가 덮는다. */
    function setCell(i: number, key: string | null, probed: boolean): void {
      const cell = cells[i];
      if (!cell) return;
      cell.label.textContent = key ?? '';
      dressCell(cell, key !== null, probed);
    }

    // ── 제 자리 caret · 탐사 자취 · 칩 ────────────────────────────────────

    function drawCaret(walk: ProbeWalk | null): void {
      if (!walk) return;
      caretG.appendChild(
        el('polygon', {
          points: '0,0 14,0 7,9',
          transform: `translate(${cellCx(walk.home) - 7}, ${CARET_Y})`,
          fill: colors.auxCursor,
        }),
      );
    }

    /**
     * 지나온 길. 제 자리에서 지금 선 칸까지 그어진다.
     *
     * 짚어 본 칸이 하나도 없으면 길 자체가 없다 — 칸이 비어 곧바로 앉은 열쇠다.
     */
    function drawTrail(walk: ProbeWalk | null): void {
      if (!walk || walk.probed.length === 0) return;
      const line = el('line', {
        x1: cellCx(walk.home),
        x2: cellCx(walk.at),
        y1: LANE_Y + CHIP_H / 2,
        y2: LANE_Y + CHIP_H / 2,
        stroke: colors.ghostOutline,
        'stroke-width': 2,
        'stroke-dasharray': '4 5',
        'stroke-linecap': 'round',
      });
      trailG.appendChild(line);
      trailNode = line;
    }

    function makeChip(slot: number, key: string): SVGGElement {
      const g = el('g', { transform: `translate(${chipX(slot)}, ${LANE_Y})` });
      g.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: chipW(),
          height: CHIP_H,
          rx: 7,
          fill: colors.itemActive,
        }),
      );
      const label = el('text', {
        x: chipW() / 2,
        y: CHIP_H / 2 + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': '600',
        fill: colors.stateInk,
      });
      label.textContent = key;
      g.appendChild(label);
      chipG.appendChild(g);
      return g;
    }

    /** 걷는 중인 열쇠만 레인에 선다. 앉은 뒤에는 칸 안의 글자가 그 자리를 대신한다. */
    function drawChip(walk: ProbeWalk | null): void {
      if (!walk || walk.seated) return;
      chipNode = makeChip(walk.at, walk.key);
    }

    // ── 밀림 호 ───────────────────────────────────────────────────────────

    /**
     * 제 자리 → 앉은 자리. 밀려난 거리를 표 아래에 남긴다.
     *
     * 호의 존재와 두 끝점이 곧 이 조각의 결론이므로 장면의 `seats` 에서 매번 다시
     * 셈한다. 예전에는 이 수치가 `d` 속성의 문자열 안에만 있어 되짚으면 사라졌다.
     */
    function drawArc(seat: ProbeSeat, called: boolean): void {
      const x1 = cellCx(seat.home);
      const x2 = cellCx(seat.slot);
      const tone = called ? colors.itemComparing : colors.textMuted;
      const opacity = called ? 1 : ARC_OPACITY;
      const path = el('path', {
        d: `M ${x1} ${ARC_Y} Q ${(x1 + x2) / 2} ${ARC_Y + ARC_DEPTH * 2} ${x2} ${ARC_Y}`,
        fill: 'none',
        stroke: tone,
        'stroke-width': called ? ARC_CALLED_WIDTH : ARC_WIDTH,
        opacity,
      });
      const head = el('polygon', {
        points: `${x2 - 4},${ARC_Y + 6} ${x2 + 4},${ARC_Y + 6} ${x2},${ARC_Y - 1}`,
        fill: tone,
        opacity,
      });
      arcsG.append(path, head);
      arcs.set(seat.key, { path, head });
    }

    function drawArcs(scene: OpenAddressingProbeScene): void {
      for (const seat of scene.seats) {
        if (seat.slot === seat.home) continue;
        drawArc(seat, seat.key === scene.spilled);
      }
    }

    /** 전부 표 안에 들어갔다는 것을 마지막에 말하는 테두리. */
    function drawFrame(closed: boolean): void {
      if (!closed) return;
      const rect = el('rect', {
        x: originX - FRAME_PAD,
        y: TABLE_Y - FRAME_PAD,
        width: cellW * size + FRAME_PAD * 2,
        height: CELL_H + FRAME_PAD * 2,
        rx: 10,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.5,
        'stroke-dasharray': '6 5',
        opacity: FRAME_OPACITY,
      });
      frameG.appendChild(rect);
      frameNode = rect;
    }

    // ── 글 ────────────────────────────────────────────────────────────────

    function drawHashLine(scene: OpenAddressingProbeScene): void {
      const line = scene.hashLine;
      hashLine.textContent =
        line === null
          ? ''
          : t('label.hashLine', '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}', {
              key: line.key,
              hash: line.hash,
              // 제수도 몫도 같은 장면에서 온다. 제수를 mount 때 잰 값에서 가져오면
              // 화면에 뜬 등식이 스스로 참인지를 한 출처가 보증하지 못한다.
              size: scene.size,
              home: line.home,
            });
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: ProbeCaption | null): void {
      if (!cap) {
        caption.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'arrive':
          caption.textContent = t('caption.arrive', '{key} belongs in slot {home}.', {
            key: cap.key,
            home: cap.home,
          });
          return;
        case 'probe':
          caption.textContent = t(
            'caption.probe',
            'Slot {from} is taken by {holder} — look one slot over.',
            { from: cap.from, holder: cap.holder, to: cap.to },
          );
          return;
        case 'seat':
          caption.textContent = t('caption.seat', 'Slot {slot} is empty — {key} sits down here.', {
            slot: cap.slot,
            key: cap.key,
          });
          return;
        case 'spill':
          caption.textContent = t(
            'caption.spill',
            'Slot {home} belongs to {key}, but {blocker} had already been pushed into it — so {key} slid on to {slot}.',
            { home: cap.home, key: cap.key, blocker: cap.blocker, slot: cap.slot },
          );
          return;
        case 'done':
          caption.textContent = t(
            'caption.done',
            'No chains anywhere — every key found a seat inside the table itself.',
          );
          return;
      }
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function drawStatic(scene: OpenAddressingProbeScene): void {
      layout(scene.size);
      drawFrame(scene.closed);
      drawArcs(scene);
      drawCells(scene);
      drawCaret(scene.walk);
      drawTrail(scene.walk);
      drawChip(scene.walk);
      drawHashLine(scene);
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 그림으로 도로 물려 놓고 시작한다.

    /** 열쇠가 제 자리 위로 내려앉는다. */
    async function flowArrive(step: { slot: number }, live: () => boolean): Promise<void> {
      const g = chipNode;
      if (!g) return;
      const x = chipX(step.slot);
      await animate(
        MS_ARRIVE,
        (p) => {
          g.setAttribute('transform', `translate(${x}, ${LANE_Y - ARRIVE_LIFT * (1 - p)})`);
          g.setAttribute('opacity', String(p));
        },
        live,
      );
    }

    /**
     * 짚어 본 칸이 물들고, 칩과 자취가 한 칸 옆으로 함께 밀려간다.
     *
     * 물들임은 지나가는 것이라 끝에서 거두어지고, 짚었다는 표식(테두리)은 정적
     * 그리기가 다시 세워 남는다. 출발 자리는 `step.from` 이 싣고 오므로 `prev` 를
     * 들추지 않는다 (S-scene).
     */
    async function flowSlide(
      step: { from: number; to: number },
      live: () => boolean,
    ): Promise<void> {
      const blocked = cells[step.from];
      if (blocked) blocked.rect.setAttribute('fill', colors.itemComparing);
      await hold(MS_BLOCK_FLASH, live);
      if (!live()) return;

      const g = chipNode;
      const trail = trailNode;
      const x0 = chipX(step.from);
      const x1 = chipX(step.to);
      const t0 = cellCx(step.from);
      const t1 = cellCx(step.to);
      await animate(
        MS_SLIDE,
        (p) => {
          g?.setAttribute('transform', `translate(${x0 + (x1 - x0) * p}, ${LANE_Y})`);
          trail?.setAttribute('x2', String(t0 + (t1 - t0) * p));
        },
        live,
      );
    }

    /**
     * 빈 자리를 만나 표 안으로 떨어진다.
     *
     * 정적 그림은 값이 이미 칸에 앉고 밀림 호가 이미 그어진 뒤다 — 칸을 비우고 호를
     * 감춰 출발 그림으로 물린 다음, 레인에서 떨어뜨린다.
     */
    async function flowSeat(
      step: { key: string; slot: number },
      live: () => boolean,
    ): Promise<void> {
      setCell(step.slot, null, false);
      const arc = arcs.get(step.key);
      arc?.path.setAttribute('opacity', '0');
      arc?.head.setAttribute('opacity', '0');

      const g = makeChip(step.slot, step.key);
      const x = chipX(step.slot);
      const y1 = TABLE_Y + CHIP_INSET;
      await animate(
        MS_DROP,
        (p) => {
          g.setAttribute('transform', `translate(${x}, ${LANE_Y + (y1 - LANE_Y) * p})`);
        },
        live,
      );
      g.remove();
    }

    /** 남의 충돌이 번진 자리를 짚는다. 수수하던 호가 물들며 도드라진다. */
    async function flowSpill(step: { key: string }, live: () => boolean): Promise<void> {
      const arc = arcs.get(step.key);
      if (!arc) return;
      await animate(
        MS_SPILL,
        (p) => {
          const width = ARC_WIDTH + (ARC_CALLED_WIDTH - ARC_WIDTH) * p;
          const opacity = ARC_OPACITY + (1 - ARC_OPACITY) * p;
          arc.path.setAttribute('stroke-width', String(width));
          arc.path.setAttribute('opacity', String(opacity));
          arc.head.setAttribute('opacity', String(opacity));
        },
        live,
      );
    }

    /** 전부 표 안에 들어갔다 — 테두리가 떠오른다. */
    async function flowFinish(live: () => boolean): Promise<void> {
      const rect = frameNode;
      if (!rect) return;
      await animate(
        MS_SETTLE,
        (p) => {
          rect.setAttribute('opacity', String(FRAME_OPACITY * p));
        },
        live,
      );
    }

    function flowOf(step: ProbeStep, live: () => boolean): Promise<void> {
      switch (step.kind) {
        case 'arrive':
          return flowArrive(step, live);
        case 'slide':
          return flowSlide(step, live);
        case 'seat':
          return flowSeat(step, live);
        case 'spill':
          return flowSpill(step, live);
        case 'finish':
          return flowFinish(live);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 그림에 필요한 계기값을 `step` 이 싣고
     * 오므로 고를 것이 `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: OpenAddressingProbeScene,
      _prev: OpenAddressingProbeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const step = next.step;
      if (step === null) return;

      await flowOf(step, live);
      if (!live()) return;

      // 흐르며 남은 물들임·임시 칩·보간된 좌표 문자열이 통째로 사라진다. 그 사이에
      // 타이머도 프레임도 없어 깜빡이지 않는다 (S-scene).
      rewind();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
