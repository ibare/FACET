/**
 * 선형 회귀 facet 설명 — 학습자에게 노출되는 본문.
 *
 * placeholder `{facet:linearRegression}` 은 host 가 stage 임베드 자리를
 * 차지하도록 치환. 본문 한국어 markdown.
 */

export const linearRegressionDescription = `## 선형 회귀

선형 회귀는 입력과 정답으로 이루어진 점 무리에 직선 한 줄을 끼우는 모델이다. 점과
직선 사이 수직 거리(잔차) 의 제곱들의 합을 가장 작게 만드는 직선을 정답으로 삼는다.

잔차의 제곱은 변의 길이가 잔차 절댓값인 정사각형의 면적과 같으므로, 손실은 곧 그
정사각형들의 면적의 합이다. 경사하강은 매 반복마다 (기울기, 절편) 을 손실의 기울기
반대 방향으로 한 걸음씩 옮겨, 직선이 점 무리의 중심을 가르는 자세로 미끄러져 가는
운동이다. 같은 운동이 데이터 평면에서는 직선의 회전·평행이동으로, 매개변수 평면
에서는 골짜기를 굴러 내려가는 점으로 1:1 동기되어 두 시점이 한 화면에 동시에 펼쳐
진다.

{facet:linearRegression}

### 결정적 순간

t = 0 에서 직선은 점 무리에서 비뚤어진 자세로 떠 있고 잔차 정사각형들이 큰 크기로
매달려 있다. 매 반복마다 잔차 정사각형들이 일제히 작아지면서 매개변수 평면의 점이
등고선 띠를 한 칸씩 안쪽으로 건너뛴다. 손실 곡선이 초반 급락 → 후반 평탄화의 전형
곡선을 그리고, |Δ손실| < ε 의 첫 스텝에 깃발이 꽂힌다 — "여기서 학습이 끝났다" 가
한 사건으로 발화한다.

### 다른 회귀와의 구별

- **다항 회귀** — 같은 점 무리에 1차 직선이 아니라 2차·3차 곡선을 끼운다. 가설이
  굽은 곡선이며, 매개변수 평면이 (w, b) 둘이 아니라 셋 이상 차원으로 늘어나 한 평면
  에 다 그릴 수 없다. 손실의 등고선이 동심 타원이 아니라 길쭉한 협곡 형상이 된다.
- **로지스틱 회귀** — 같은 점들에 직선이 아니라 시그모이드 곡선을 끼우는 분류 모델.
  출력 y 가 연속 스칼라가 아니라 0/1 두 진영이며, 손실은 교차 엔트로피라 잔차 정사
  각형 메타포가 성립하지 않는다.
- **단순 평균선** — 데이터의 y 평균만 구해 가로 직선 한 줄을 긋는 가장 단순한 예측.
  매개변수가 b 하나뿐이고 학습이 한 번에 끝나며 직선의 기울기가 항상 0 이다.

### 인터랙션

- **▶ 재생** — 200 ms 간격으로 한 스텝씩 자동 진행. 수렴 또는 발산 시점에 자동 정지.
- **⏸ 일시정지** — 자동 진행을 즉시 중지. 현재 (w, b) 보존.
- **⏭ 한 스텝** — 정확히 한 스텝의 운동을 한 번 발화시킨 후 정지.
- **↺ 리셋** — t = 0 의 초기 상태로 복귀.
- **학습률 슬라이더** — 느림 (η = 0.01) / 적정 (η = 0.05) / 발산 (η = 0.18) 세 구간
  에서 선택. 다음 스텝부터 적용.

### 참고

- [Setosa — Ordinary Least Squares Regression](https://setosa.io/ev/ordinary-least-squares-regression/)
- [ml-visualized — Linear Regression / Gradient Descent](https://ml-visualized.com/chapter1/linear_regression)
- [Google ML Crash Course — Linear regression](https://developers.google.com/machine-learning/crash-course/linear-regression/loss)
- [angeloyeo — 선형회귀 / 경사하강법](https://angeloyeo.github.io/2020/08/24/linear_regression.html)
`;
