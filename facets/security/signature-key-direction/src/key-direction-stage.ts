/**
 * key-direction-stage View — 키 방향의 역전 단일 캔버스.
 *
 * 두 흐름을 위아래로 나란히 둔다. 각 흐름은 왼쪽에서 오른쪽으로 네 마디다 —
 * 누가 손대는가 / 어느 키를 쓰는가 / 무엇이 되는가 / 받는 쪽이 그것을 어쩌는가.
 *
 * 두 행의 키 칸이 세로로 정렬되어 있어야 교차가 보인다. 그래서 열 좌표를 두
 * 행이 공유하고, 세 번째 걸음에서 X 자가 그 사이를 잇는다.
 *
 * 자물쇠와 열쇠는 RSA facet 과 같은 어휘를 쓴다 — 공개키는 자물쇠, 개인키는
 * 열쇠. 코드를 공유하지는 않지만 (facet 패키지끼리 import 금지) 어휘가 어긋나면
 * 두 화면을 이어 읽는 학습자가 다른 것으로 읽는다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`showEncryption()` · `markKeys()` · `markWho()`) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render` 하나가 장면을 받아 화면 **전체**를 세우고,
 * 방금 달라진 자리만 흐르게 한다 (S-scene).
 *
 * **CSS 전환(`transition`)을 쓰지 않는다 (S-scene MUST NOT).** 옛 stage 는 네 곳에서
 * 전환을 걸어 두고 값을 대입했다 — 되짚기는 `animate:false` 로 오는데 전환은 그
 * 뒤에도 화면을 저 혼자 흘러가게 한다. 네 곳을 전부 `tween` 보간으로 옮겼고,
 * 프레임은 rAF 가 아니라 `setTimeout` 이라 headless 에서도 실제로 돈다.
 *
 * ## 두 축을 가른다
 *
 * **테두리**는 값의 형편 — 키 칸의 선 색이 그 마디에서 어느 키를 쓰는가를 말한다.
 * **채움**은 짚음의 표식 — 사람 글자의 칠이 "그 한 사람" 이 여기 서 있다를 말한다.
 * 두 뜻이 서로 다른 요소에 앉아 있어 한 속성에 두 말이 실리지 않는다.
 *
 * ## 옮기며 고친 화면
 *
 * - **상시 캡션과 화면 각주를 걷어냈다.** `captionBase` 와 `note` 는 세워만 두고
 *   아무도 값을 넣지 않던 죽은 요소였고, S-piece 가 둘을 각각 MUST NOT 으로
 *   막는다 (개념을 설명하는 상시 캡션 · 전제를 밝히는 화면 각주). 전제는
 *   `description.ts` 가 밝힌다.
 * - **받는 쪽이 그것을 어쩌는지를 화면이 말하게 했다.** `label.reads` 와
 *   `label.verifies` 는 열 언어로 선언되어 있는데 projector 가 만들어 놓고 stage 가
 *   한 번도 그리지 않았다. 그 둘이 빠지면 두 행의 끝이 그냥 사람 이름일 뿐이라
 *   "주인이 **읽고**" 와 "누구나 **확인한다**" 가 화면에서 사라진다 — 이 조각이
 *   말해야 하는데 말하지 않던 자리다 (프로토콜 4 절 26).
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 공개키(자물쇠) — categorical(8, 'vivid')[3] 청록
 *   - 개인키(열쇠) — categorical(8, 'vivid')[6] 자주
 *   - 교차선과 "한 사람" 표식 — palette.accent
 *
 * 세로는 이 파일이 정하고 가로는 러너가 정한다 (S-piece). 색은 전부 design-tokens
 * 경유이며 hex 리터럴은 없다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { KeyDirectionFlow, KeyDirectionScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 내용이 정한다 — 캡션 한 줄과 흐름 두 줄. */
const H = 200;

// ── 열 (두 행이 공유한다 — 그래야 교차가 세로로 보인다) ─────────────────
const WHO_X = 92;
const KEY_X = 250;
const RESULT_X = 400;
const WHO2_X = 540;
const ROW_LABEL_X = 20;

// ── 행 ──────────────────────────────────────────────────────────────────
const ROW_Y = [92, 170] as const;

const CAPTION_Y = 22;

// ── 키 칸 ───────────────────────────────────────────────────────────────
const KEY_BOX_W = 116;
const KEY_BOX_H = 22;

// ── 교차선 (두 키 칸 사이) ──────────────────────────────────────────────
const CROSS_TOP = ROW_Y[0] + 10;
const CROSS_BOTTOM = ROW_Y[1] - 18;
/** X 자가 벌어지는 폭. 키 칸 안쪽에 머물러야 두 칸을 잇는 것으로 읽힌다. */
const CROSS_DX = 44;
/**
 * X 자를 이루는 두 선의 가로 양 끝.
 *
 * 그리는 쪽과 흐르게 하는 쪽이 **같은 상수**를 본다 — 선 자신에게 되물으면 그것이
 * 곧 DOM 되읽기다 (프로토콜 3-1 절 ④).
 */
const CROSS_ENDS: readonly (readonly [number, number])[] = [
  [KEY_X - CROSS_DX, KEY_X + CROSS_DX],
  [KEY_X + CROSS_DX, KEY_X - CROSS_DX],
];

/** 마지막 마디의 동사가 앉는 높이. 화살표 바로 위다. */
const VERB_DY = -12;

// ── 운동 길이 (ms). stepMs 의 쉼 위에 얹힌다 (S-piece 의 걸음 벽시계).
/** 흐름 한 줄이 왼쪽에서 오른쪽으로 놓이는 시간. */
const ROW_MS = 420;
/** X 자가 그어지는 시간. */
const CROSS_MS = 360;
/** "그 한 사람" 의 자리가 물드는 시간. */
const WHO_MS = 320;
/** 보간 프레임 간격. rAF 가 아니라 타이머라 headless 에서도 실제로 돈다. */
const FRAME_MS = 16;

/** 마디 하나가 앞 마디에 겹치는 정도. 1 이면 겹침 없이 차례로 선다. */
const STAGGER = 0.35;

/** 흐름의 방향을 새긴 도형. 번역 대상이 아니다 (C10 판정 1). */
const ARROW = '──▶';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function parseHex(value: string): [number, number, number] | null {
  const raw = value.trim().replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (ch) => ch + ch) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 두 칠 사이를 건넌다.
 *
 * 끝에서는 보간값이 아니라 **목표 문자열을 글자 그대로** 돌려준다 — 부동소수
 * 끝자리가 흘려 세운 화면과 곧바로 세운 화면을 가르지 않게 (프로토콜 4 절 6).
 */
function mixColor(from: string, to: string, p: number): string {
  if (p >= 1) return to;
  const a = parseHex(from);
  const b = parseHex(to);
  if (a === null || b === null) return to;
  const at = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * p);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
}

/**
 * 흐름 한 줄이 선 화면 조각.
 *
 * 걸음 함수는 여기서만 요소를 꺼낸다 — 화면을 되읽지도, 지난 화면의 거울을 들고
 * 다니지도 않는다 (프로토콜 4 절 ④·28).
 */
type DrawnRow = {
  /** 왼쪽에서 오른쪽으로, 흐르는 차례대로. */
  readonly parts: readonly SVGElement[];
  /** 이 행에서 "그 한 사람" 이 서 있는 자리의 글자. */
  readonly mark: SVGTextElement;
};

type Drawn = {
  /** 세워진 흐름들. 차례는 `scene.flows` 와 같다. */
  readonly rows: readonly DrawnRow[];
  /** X 자를 이루는 두 선. 아직 안 그었으면 빈 열이다. */
  readonly cross: readonly SVGLineElement[];
};

/** 글자 하나를 세울 때 고르는 것. */
type TextOpts = {
  anchor?: string;
  fill?: string;
  size?: string;
  family?: string;
  weight?: string;
};

/** 흐름의 뜻이 행을 정한다. 목록의 차례가 아니다 (프로토콜 4 절 13). */
const ROW_OF: Record<KeyDirectionFlow, number> = { encryption: 0, signature: 1 };

export const keyDirectionStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<KeyDirectionScene> {
    const palette = getColors(params.theme);
    const cat = categorical(8, 'vivid');
    const LOCK = cat[3] ?? palette.primary;
    const KEY = cat[6] ?? palette.accent;
    const HOT = palette.accent;
    const INK = palette.text;

    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const svg = params.canvas;
    const root = el('g');
    svg.appendChild(root);

    // ── 뒷일 정리 채널 (S-piece) ─────────────────────────────────────────
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 걸음 함수가 `await` 를 지나므로 `destroy` 가 그 가운데 올 길이 열려 있다.
     * 프레임마다 자기 번호가 아직 유효한지 보고 아니면 화면에 손대지 않는다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
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

    // ── 글자 ─────────────────────────────────────────────────────────────

    function text(x: number, y: number, opts: TextOpts = {}): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? INK,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        ...(opts.weight ? { 'font-weight': opts.weight } : {}),
      });
    }

    /** 문안을 얹은 글자 하나. */
    function label(value: string, x: number, y: number, opts: TextOpts = {}): SVGTextElement {
      const node = text(x, y, opts);
      node.textContent = value;
      return node;
    }

    // ── 배치 ─────────────────────────────────────────────────────────────

    function rewind(): void {
      root.textContent = '';
    }

    /**
     * 흐름 한 줄.
     *
     * 왼쪽에서 오른쪽으로 — 누가 손대는가 / 어느 키를 쓰는가 / 무엇이 되는가 /
     * 받는 쪽이 그것을 어쩌는가. 돌려주는 `parts` 의 차례가 곧 흐르는 차례다.
     */
    function drawRow(scene: KeyDirectionScene, flow: KeyDirectionFlow): DrawnRow {
      const encrypting = flow === 'encryption';
      const y = ROW_Y[ROW_OF[flow]];
      const anyone = t('label.anyone', 'anyone');
      const owner = t('label.ownerOnly', 'the owner');

      const rowName = encrypting
        ? t('label.encryption', 'encrypting')
        : t('label.signature', 'signing');
      const keyName = encrypting
        ? t('label.publicKey', '🔒 public key')
        : t('label.privateKey', '🔑 private key');
      const keyTone = encrypting ? LOCK : KEY;
      const resultName = encrypting
        ? t('label.sealed', 'sealed message')
        : t('label.signed', 'signature');
      // 받는 쪽이 그것을 어쩌는가. 이 동사가 있어야 두 행의 끝이 사람 이름에
      // 그치지 않는다 — 주인이 읽고, 누구나 확인한다.
      const verb = encrypting ? t('label.reads', 'reads') : t('label.verifies', 'verifies');

      // "그 한 사람" 은 암호화에서는 끝에, 서명에서는 앞에 선다. 그 뒤바뀜이
      // 이 조각의 결론이라 어느 끝을 물들일지는 행의 뜻이 정한다.
      const marked = scene.whoMarked ? HOT : INK;
      const startTone = encrypting ? INK : marked;
      const endTone = encrypting ? marked : INK;

      const rowLabel = label(rowName, ROW_LABEL_X, y, {
        anchor: 'start',
        fill: palette.textMuted,
        size: fontSizes.xs,
      });
      const whoStart = label(encrypting ? anyone : owner, WHO_X, y, { fill: startTone });
      const arrow1 = label(ARROW, (WHO_X + KEY_X) / 2, y, { fill: palette.textMuted });
      const keyBox = el('rect', {
        x: KEY_X - KEY_BOX_W / 2,
        y: y - KEY_BOX_H + 7,
        width: KEY_BOX_W,
        height: KEY_BOX_H,
        rx: 4,
        fill: 'none',
        stroke: keyTone,
        'stroke-width': 1.6,
      });
      const keyLabel = label(keyName, KEY_X, y, {
        fill: keyTone,
        size: fontSizes.xs,
        weight: '600',
      });
      const arrow2 = label(ARROW, (KEY_X + RESULT_X) / 2 + 22, y, { fill: palette.textMuted });
      const result = label(resultName, RESULT_X, y, {
        family: fonts.mono,
        size: fontSizes.xs,
      });
      const arrow3X = (RESULT_X + WHO2_X) / 2;
      const verbLabel = label(verb, arrow3X, y + VERB_DY, {
        fill: palette.textMuted,
        size: fontSizes.xs,
      });
      const arrow3 = label(ARROW, arrow3X, y, { fill: palette.textMuted });
      const whoEnd = label(encrypting ? owner : anyone, WHO2_X, y, { fill: endTone });

      root.append(
        rowLabel,
        whoStart,
        arrow1,
        keyBox,
        keyLabel,
        arrow2,
        result,
        verbLabel,
        arrow3,
        whoEnd,
      );

      return {
        parts: [
          rowLabel,
          whoStart,
          arrow1,
          keyBox,
          keyLabel,
          arrow2,
          result,
          verbLabel,
          arrow3,
          whoEnd,
        ],
        mark: encrypting ? whoEnd : whoStart,
      };
    }

    /**
     * 두 키 칸을 잇는 X 자. 교차 자체가 이 조각의 주장이다.
     *
     * 아직 긋지 않았으면 **숨기지 않고 짓지 않는다** (프로토콜 4 절 17).
     */
    function drawCross(scene: KeyDirectionScene): SVGLineElement[] {
      if (!scene.keysCrossed) return [];
      return CROSS_ENDS.map(([x1, x2]) => {
        const line = el('line', {
          x1,
          y1: CROSS_TOP,
          x2,
          y2: CROSS_BOTTOM,
          stroke: HOT,
          'stroke-width': 1.2,
          'stroke-dasharray': '3 3',
        });
        root.appendChild(line);
        return line;
      });
    }

    function captionText(kind: KeyDirectionScene['caption']): string {
      if (kind === null) return '';
      switch (kind.kind) {
        case 'encryption':
          return t('caption.encryption', 'Anyone can seal it; only the owner can open it.');
        case 'signature':
          return t('caption.signature', 'Only the owner can sign it; anyone can check it.');
        case 'crossed':
          return t('caption.crossed', 'The two keys have swapped places.');
        case 'who':
          return t(
            'caption.who',
            'And so has the one person — at the end when encrypting, at the start when signing.',
          );
      }
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * `step` 을 읽지 않는다 — 읽으면 흘려 세우는 경로와 곧바로 세우는 경로가 같은
     * `step` 을 보게 되어 어긋남을 재는 축이 이빨을 잃는다 (공통 지시문 8 절).
     */
    function drawStatic(scene: KeyDirectionScene): Drawn {
      rewind();
      const rows = scene.flows.map((flow) => drawRow(scene, flow));
      const cross = drawCross(scene);
      root.appendChild(
        label(captionText(scene.caption), W / 2, CAPTION_Y, {
          fill: HOT,
          weight: '600',
        }),
      );
      return { rows, cross };
    }

    /** 방금 놓인 흐름의 줄을 찾는다. 아직 안 그려졌으면 `null`. */
    function rowOf(scene: KeyDirectionScene, drawn: Drawn, flow: KeyDirectionFlow): DrawnRow | null {
      const i = scene.flows.indexOf(flow);
      return i < 0 ? null : (drawn.rows[i] ?? null);
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 출발 그림으로
    // 되돌려 놓고 시작한다. 출발 그림은 `prev` 를 들추지 않고 이 파일의 상수에서
    // 셈으로 얻는다 (S-scene).

    function fade(node: SVGElement, p: number): void {
      if (p >= 1) {
        node.removeAttribute('opacity');
        return;
      }
      node.setAttribute('opacity', String(p));
    }

    /**
     * 흐름 한 줄이 **왼쪽에서 오른쪽으로** 놓인다.
     *
     * 마디가 차례로 서므로 눈이 흐름의 방향을 따라간다 — 이 조각이 말하는 것이
     * 바로 그 방향이라 동사가 화면의 뜻과 같다. 한 시계로 흘린다.
     */
    function flowRow(row: DrawnRow, mine: number): Promise<void> {
      const n = row.parts.length;
      const span = 1 / (1 + (n - 1) * STAGGER);
      const at = (i: number, p: number): number =>
        clamp01((p - i * STAGGER * span) / span);
      const draw = (p: number): void => {
        row.parts.forEach((part, i) => fade(part, p >= 1 ? 1 : easeOut(at(i, p))));
      };
      draw(0);
      return tween(ROW_MS, mine, draw);
    }

    /**
     * X 자가 두 키 칸 사이에 그어진다.
     *
     * 두 선이 한 뜻이라 시계를 나누지 않는다. 끝에서는 보간값이 아니라 상수를
     * 그대로 세운다 (프로토콜 4 절 6).
     */
    function flowCross(lines: readonly SVGLineElement[], mine: number): Promise<void> {
      const draw = (p: number): void => {
        lines.forEach((line, i) => {
          const ends = CROSS_ENDS[i];
          if (ends === undefined) return;
          const [x1, x2] = ends;
          if (p >= 1) {
            line.setAttribute('x2', String(x2));
            line.setAttribute('y2', String(CROSS_BOTTOM));
            return;
          }
          const e = easeOut(p);
          line.setAttribute('x2', String(x1 + (x2 - x1) * e));
          line.setAttribute('y2', String(CROSS_TOP + (CROSS_BOTTOM - CROSS_TOP) * e));
        });
      };
      draw(0);
      return tween(CROSS_MS, mine, draw);
    }

    /**
     * "그 한 사람" 이 선 자리가 두 행에서 함께 물든다.
     *
     * 암호화는 끝, 서명은 앞 — 서로 반대쪽이 한 시계로 물들어야 뒤바뀜이 한
     * 화면에서 읽힌다. 시계를 둘로 나누지 않는다.
     */
    function flowWho(marks: readonly SVGTextElement[], mine: number): Promise<void> {
      const draw = (p: number): void => {
        const ink = mixColor(INK, HOT, p);
        for (const mark of marks) mark.setAttribute('fill', ink);
      };
      draw(0);
      return tween(WHO_MS, mine, draw);
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: KeyDirectionScene,
      _prev: KeyDirectionScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'flow': {
          const row = rowOf(next, drawn, step.flow);
          if (row !== null) await flowRow(row, mine);
          break;
        }
        case 'keys':
          if (drawn.cross.length > 0) await flowCross(drawn.cross, mine);
          break;
        case 'who':
          if (drawn.rows.length > 0) {
            await flowWho(
              drawn.rows.map((row) => row.mark),
              mine,
            );
          }
          break;
      }

      if (!alive(mine)) return;
      // 운동이 남긴 속성과 보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
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
        // 않으므로 기다리던 것을 직접 깨워야 `await ctx.emit` 이 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
