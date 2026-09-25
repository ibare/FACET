/**
 * piece-check · whole-check 가 함께 쓰는 정적 검사와 도구.
 *
 * 조각과 완제품은 짜임(scene ↔ projector)이 다르지만 알고리즘 · 문안 · 색 · 글꼴 · 타입 경계의
 * 규약은 같다. 두 검사기가 같은 정규식을 따로 들고 있으면 한쪽만 고쳐지므로 여기 한 벌로 둔다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 주석과 문자열을 걷어낸 소스 — 코드 모양만 보는 검사용. */
export function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, "''");
}

/** 주석만 걷어낸 소스 — 문자열 리터럴을 봐야 하는 검사용. */
export function noComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
}

export function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * for / while 루프를 찾는다. 머리는 괄호 깊이를 세어 자른다 — `[^)]*` 로 자르면
 * `for (const [a, b] of x.entries())` 같은 머리에서 매치가 끊겨 루프가 통째로 빠진다.
 * 바디가 `{ … }` 가 아닌 한 줄 루프는 건너뛴다.
 */
export function loopsOf(code) {
  const out = [];
  for (const m of code.matchAll(/\b(for|while)\s*\(/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    const headStart = i;
    for (; i < code.length && depth > 0; i += 1) {
      if (code[i] === '(') depth += 1;
      else if (code[i] === ')') depth -= 1;
    }
    const head = code.slice(headStart, i - 1);
    const rest = code.slice(i);
    const lead = /^\s*\{/.exec(rest);
    if (!lead) continue;
    const open = i + lead[0].length - 1;
    let d = 0;
    let end = open;
    for (; end < code.length; end += 1) {
      if (code[end] === '{') d += 1;
      else if (code[end] === '}' && --d === 0) break;
    }
    out.push({ head, body: code.slice(open + 1, end), text: code.slice(m.index, Math.min(end + 1, open + 60)) });
  }
  return out;
}

/** 알고리즘 — emit 의 type 리터럴 (C2) · await (C8) · 기다리는 루프의 진입 검사 (C8) · JSDoc. */
export function checkAlgorithm(algorithm, { err, warn }) {
  const algoCode = codeOnly(algorithm);
  // type 의 값이 문자열 리터럴 하나여야 한다. 삼항식·변수는 막는다.
  for (const m of algoCode.matchAll(/\.emit\(\s*\{[^}]*?\btype:\s*([^,}]+)/g)) {
    if (m[1].trim() !== "''") {
      err('C2', `emit 의 type 이 리터럴 하나가 아니다: type: ${m[1].trim().slice(0, 40)}`);
      break;
    }
  }
  // 좁힌 별칭(`rc.emit`)도 본다. 인자 없는 화살표(`() => ctx.emit(…)`)는 문 헬퍼에 넘기는 발신이라 허용한다.
  // `(name) => ctx.emit(…)` 처럼 인자를 받는 한 줄 헬퍼(phase 헬퍼)도 부르는 쪽이 await 하므로 허용한다.
  for (const m of algoCode.matchAll(/(^|[^\w.])(\w+)\.emit\(/g)) {
    const before = algoCode.slice(Math.max(0, m.index - 80), m.index + m[1].length);
    if (!/(await|return|\(\)\s*=>|=\s*(async\s+)?\([^()]*\)(\s*:\s*[\w<>]+)?\s*=>)\s*$/.test(before)) {
      err('C8', `await 없이 부른 ${m[2]}.emit 이 있다`);
      break;
    }
  }
  // sleep 의 불리언을 버리면 취소가 먹지 않는다 (C8).
  if (/(^|[;{}])\s*await\s+\w+\.sleep\(/m.test(algoCode)) {
    err('C8', 'await ctx.sleep(…) 의 결과를 버린다 — `if (!(await ctx.sleep(ms))) return` 처럼 취소를 함께 진다');
  }
  const head = algorithm.slice(0, Math.max(0, algorithm.indexOf('import ')));
  if (!/이벤트|event|emit/i.test(head)) {
    warn('C2', 'algorithm.ts 상단 JSDoc 에 이벤트 목록 + payload 스키마가 보이지 않는다');
  }
  // 루프 진입 검사 (C8). 기다림(await)이 있는 루프만 본다 — 순수 셈 루프에는 취소가 끼어들 틈이 없다.
  // 바디 첫 문장이 취소를 보거나 `if (!(await 문())) return` 꼴이어야 한다. 조건식이 취소를 보면 그것으로 된다.
  for (const loop of loopsOf(algoCode)) {
    if (!/\bawait\b/.test(loop.body)) continue;
    const firstStmt = loop.body.replace(/^\s*/, '').split(';')[0];
    const ok =
      /\b\w+\.cancelled\b/.test(loop.head) ||
      /\b\w+\.cancelled\b/.test(firstStmt) ||
      /^if\s*\(\s*!\s*\(\s*await\s+[\w.]+\(/.test(firstStmt);
    if (!ok) err('C8', `기다리는 루프의 바디 첫 문장이 취소를 보지 않는다: ${loop.text.replace(/\s+/g, ' ').slice(0, 70)}`);
  }
  if (/Math\.random\(/.test(algoCode)) err('S-facet', 'Math.random 을 쓴다 — 난수가 필요하면 식까지 적힌 생성기를 쓴다 (되짚기와 IR 대조가 갈린다)');
}

/**
 * payload 소비 (C9) — 이름 붙은 타입으로 통째 단언하거나, 원소 배열로 단언하지 않는다.
 * `as { a?: unknown }` · `as Record<…>` · `as unknown` 뒤 typeof 가드는 된다.
 */
export function checkPayload(file, src, { err }) {
  const code = codeOnly(src);
  if (/payload\s+as\s+(?!\{|Record<|unknown\b)[A-Z]\w*/.test(code)) {
    err('C9', `${file} 가 event.payload 를 이름 붙은 타입으로 단언한다 — typeof 가드로 좁힌다`);
  }
  // `(p.items as Item[])` · `payload.xs as number[]` — 원소 배열 단언. Array.isArray 뒤 원소 가드로 좁힌다.
  if (/\b(?:payload|p|pl)\.\w+\s+as\s+(?:readonly\s+)?(?:[A-Z]\w*|number|string|boolean)\[\]/.test(code)) {
    err('C9', `${file} 가 payload 의 배열 필드를 원소 타입 배열로 단언한다 — Array.isArray 뒤 원소마다 typeof 로 좁힌다 (2026-09-18 AI 배치에서 둘)`);
  }
}

/** 그림 파일 (stage · projector) — 번역기 · 문안 호출 리터럴 (C10) · 글꼴 리터럴 · container 비우기. */
export function checkDrawing(file, src, { err, warn }) {
  const code = codeOnly(src);
  const plain = noComments(src);
  if (/makeTranslator\(/.test(code) && !/(params|runtime\??)\.t\s*\?\?\s*makeTranslator/.test(src)) {
    err('C10', `${file} 가 makeTranslator 를 직접 부른다 — params.t ?? makeTranslator(params.locale) (projector 는 runtime?.t ?? makeTranslator()) 만 허용`);
  }
  // 문안 호출은 키도 en 원본도 호출부 리터럴이어야 한다 — 추출기와 en-original 검사가 리터럴만 읽는다.
  // 래퍼(`head(x, key, en)` 안의 `t(key, en)`)와 템플릿 키(`t(\`stage.${id}\`)`)가 여기 걸린다.
  for (const m of plain.matchAll(/(^|[^\w.])(t|tr)\(\s*([^)]{0,200})/g)) {
    const args = m[3];
    if (/^(['"])(?:\\.|(?!\1)[^\\])*\1\s*,\s*(['"]|`(?![^`]*\$\{))/.test(args)) continue;
    err('C10', `${file} — 문안 호출의 키나 en 원본이 리터럴이 아니다: ${m[2]}(${args.slice(0, 40)}`);
    break;
  }
  // 글꼴은 design-tokens 의 fonts 로 (S-view). 2026-09-18 AI 배치 감사에서 되풀이됐다.
  if (/['"]font-family['"]\s*,\s*['"`]|fontFamily\s*[:=]\s*['"`]|font-family\s*:\s*[A-Za-z'"]/.test(plain)) {
    err('S-view', `${file} 에 글꼴 리터럴이 있다 — fonts.* (design-tokens) 를 쓴다`);
  }
  // 글꼴 크기도 fontSizes 로 (S-view). 기존 facet 에 수 리터럴이 여럿 있어 경고로 둔다 — 새 facet 은 0 건을 목표로.
  // 글자 폭 셈용으로 따로 쥔 크기 상수(`const CODE_PX = 12`)도 같다 — 2026-09-25 배치에서 조각 셋이 이 꼴로 걸렸다.
  if (/['"]font-size['"]\s*[:,]\s*(['"`]?\d)|fontSize\s*[:=]\s*['"`]?\d|const\s+[A-Z_]*(?:FS|FONT\w*|_PX|FONT_SIZE)\s*=\s*\d/.test(plain)) {
    warn('S-view', `${file} 에 글꼴 크기 리터럴이 있다 — fontSizes.* (design-tokens) 를 쓴다 (2026-09-25 감사)`);
  }
  if (/container\.(textContent|innerHTML)\s*=/.test(code)) {
    warn('S-view', `${file} 가 container 를 비운다 — 캔버스가 떨어져 나간다. params.canvas 안쪽을 비운다 (제 껍데기를 두고 캔버스를 되붙이는 view 면 무시)`);
  }
}

/** facet 영역 파일 공통 — console (C6) · 색 리터럴 (S-facet) · any (C9). */
export function checkCommon(files, { err }) {
  for (const [f, s] of files) {
    if (!s) continue;
    if (/console\./.test(codeOnly(s))) err('C6', `${f} 가 console 을 쓴다`);
    if (/['"`]#[0-9a-fA-F]{3,8}['"`]|\brgba?\(\s*\d/.test(noComments(s))) err('S-facet', `${f} 에 색 리터럴이 있다 — design-tokens 경유`);
    if (/\bas any\b|:\s*any\b/.test(codeOnly(s))) err('C9', `${f} 에 any 가 있다`);
  }
}

/**
 * 코드 표기 (tasks/pseudo-notation.md) — 조각 화면의 프로그램 텍스트에 다른 언어의 흔적이 없는가.
 *
 * 코드 줄을 두는 필드 이름이 조각마다 달라(`text` · `code` …) facet.ts 의 문자열 리터럴 전부에서
 * **코드처럼 생긴 것**만 본다. 영어 문장의 "None" 같은 낱말은 코드 모양(`=` · `(`)이 함께 있을 때만 잡는다.
 * 특정 언어 · 런타임이 곧 주장인 조각(이벤트 루프 등)은 facet.ts JSDoc 에 `@notation native` 를 달아 뺀다.
 */
export function checkNotation(facet, { err }) {
  if (/@notation\s+native\b/.test(facet)) return;
  const RULES = [
    [/^\s*def\s+\w+\s*\(/, "def → function"],
    [/^\s*elif\b/, "elif → else if"],
    [/\bprint\s*\(/, "print(…) → show …"],
    [/^\s*raise\s+\w/, "raise → throw"],
    [/^\s*except\b/, "except → catch"],
    [/\blambda\b/, "lambda → x => …"],
    [/^\s*(if|else|elif|while|for|try|except|def|class)\b[^'"]*:\s*$/, "줄 끝 콜론을 뗀다"],
    [/(=|\(|return\s).*\b(True|False|None)\b/, "True/False/None → true/false/null"],
    [/\b(ValueError|RecursionError|TypeError|KeyError|IndexError)\b/, "언어 고유 오류 이름 → BadValue · StackOverflow 등"],
    [/\S\s*(&&|\|\|)\s*\S/, "&& · || → and · or"],
  ];
  const seen = new Set();
  for (const m of facet.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const text = m[2];
    for (const [re, fix] of RULES) {
      if (re.test(text) && !seen.has(fix)) {
        seen.add(fix);
        err('표기', `코드 글자에 다른 언어의 흔적: "${text.slice(0, 40)}" — ${fix} (tasks/pseudo-notation.md)`);
      }
    }
  }
}

/** 수 뒤 조사 — `{n} 이` 꼴. 자리 표시자 이름이 수를 뜻할 때만 본다 (S-piece 는 "수 뒤에" 다). */
export function checkParticles(facet, { warn }) {
  const NUMERIC = /^(n|k|m|i|j|count|num|total|size|len|length|index|idx|steps?|ms|bits|bytes|value|val|\w*(Count|Num|Total|Size|Len|Length|Index|Bits|Bytes|Ms|Pct|Percent))$/;
  for (const m of facet.matchAll(/\bko:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    for (const hit of m[2].matchAll(/\{(\w+)\}\s?(이|가|을|를|은|는|과|와|으로|로|에서|에게|의)(?=\s|[.,!?]|$)/g)) {
      if (NUMERIC.test(hit[1])) warn('S-piece', `수 뒤에 조사가 붙은 한국어 문안: ${m[2].slice(0, 60)}`);
    }
  }
}

/** 데모 설명 글 — 있는가, 자기 토큰을 부르는가 (S-facet · C4). */
export function checkDescription(id, { err }, join, basename) {
  if (!id) return;
  const md = join(repoRoot, 'apps/playground/src/descriptions', `${id.replace(/^facet:/, '')}.md`);
  const text = read(md);
  if (text === null) err('S-facet', `설명 글이 없다: apps/playground/src/descriptions/${basename(md)}`);
  else if (!text.includes(`{${id}}`)) err('C4', `설명 글이 자기 토큰 {${id}} 을 부르지 않는다`);
}

export function run(cmd, cmdArgs, env, timeoutMs) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024 * 1024,
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error?.code === 'ETIMEDOUT') return { ok: false, text: `${text}\n[시간 초과 ${timeoutMs}ms]` };
  return { ok: r.status === 0, text };
}

/** vitest 출력에서 실패와 요약만 남긴다. `keepPass` 에 맞는 통과 줄은 남긴다. */
export function vitestSummary(text, keepPass = /$^/) {
  return text
    .split('\n')
    .map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''))
    .filter((l) => /^\s*(✓|×|→)|\[piece-self-check\]|Tests\s+\d|시간 초과|Error:|^\s*(기대|실제|처음 갈리는)/.test(l))
    .filter((l) => !/^\s*✓/.test(l) || keepPass.test(l));
}
