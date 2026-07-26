# 벽돌깨기 아케이드

Canvas API와 바닐라 JavaScript로 만든 벽돌깨기 게임입니다. `index.html`을 브라우저로 열면 바로 플레이할 수 있습니다.

## 실행

1. `index.html`을 더블클릭합니다.
2. 난이도와 테마를 고릅니다.
3. Space 또는 게임 화면 클릭으로 시작합니다.

## 조작과 아이템

- `← →` 또는 `A / D`: 패들 이동
- `Space`: 공 발사·재시작
- `P` 또는 `ESC`: 일시정지
- 💊+는 패들을 늘리고, 💊−는 패들을 줄이므로 피하는 편이 좋습니다.
- ●●●은 멀티볼, 🐢은 공 감속, ♥는 목숨 1개 추가입니다.

## Firebase 글로벌 랭킹 설정 (Spark Plan)

Cloud Firestore를 사용합니다. 상위 10개만 읽고, 게임 종료 시 한 번만 기록하므로 Spark 무료 할당량 안에서 소규모 게임에 적합합니다.

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 **프로젝트 추가**를 누르고 Spark(무료) 플랜을 유지합니다. 결제 계정은 연결하지 않습니다.
2. 프로젝트 개요의 `</>` **웹 앱 추가**에서 앱 이름을 입력하고 등록합니다.
3. 제시되는 `firebaseConfig` 값을 `firebase-config.js`의 같은 이름 필드에 복사합니다. 이 프로젝트에는 설정을 적용해 두었습니다.
4. 왼쪽 **빌드 → Firestore Database → 데이터베이스 만들기**에서 기본 데이터베이스 1개를 만듭니다. 테스트 모드 대신 프로덕션 모드를 선택합니다.
5. **규칙** 탭에 다음 규칙을 붙여 넣고 게시합니다. 이름은 1~12자, 점수는 0~999999인 새 기록만 허용합니다.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /scores/{scoreId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly(['name', 'score', 'createdAt'])
                    && request.resource.data.name is string
                    && request.resource.data.name.size() >= 1
                    && request.resource.data.name.size() <= 12
                    && request.resource.data.score is int
                    && request.resource.data.score >= 0
                    && request.resource.data.score <= 999999;
      allow update, delete: if false;
    }
  }
}
```

`file://`로도 게임은 플레이되지만, Firebase 모듈은 브라우저 보안 정책에 따라 로컬 웹 서버 또는 GitHub Pages에서 더 안정적입니다.

## GitHub 백업과 Pages 배포

Git 설치 후 프로젝트 폴더에서 아래를 실행합니다. GitHub에서 빈 저장소를 먼저 만든 뒤 `YOUR_ID`와 저장소 이름을 바꿉니다.

```powershell
git init
git add .
git commit -m "feat: 벽돌깨기 아케이드와 랭킹 기능"
git branch -M main
git remote add origin https://github.com/YOUR_ID/YOUR_REPOSITORY.git
git push -u origin main
```

GitHub 저장소의 **Settings → Pages → Deploy from a branch → main / root → Save**를 선택하면 공개 주소가 생성됩니다.

Spark 플랜에는 Cloud Firestore 일일 무료 읽기 50,000회·쓰기 20,000회와 저장소 1GiB가 포함됩니다. 자세한 최신 기준은 [Firebase 요금 문서](https://firebase.google.com/docs/firestore/pricing)를 확인하세요.
