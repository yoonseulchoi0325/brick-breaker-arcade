/*
 * Firebase 콘솔에서 복사한 웹 앱 설정을 아래 firebaseConfig에 붙여 넣으세요.
 * Firebase 설정값은 웹 앱에 공개되어도 되는 식별값이지만, Firestore 보안 규칙은 반드시 README의 예시대로 설정해야 합니다.
 */
const firebaseConfig = {
  apiKey: "AIzaSyCOpkw-AgSMjNzROnQBWMrHvidYGbODbD0",
  authDomain: "brick-breaker-62049.firebaseapp.com",
  projectId: "brick-breaker-62049",
  storageBucket: "brick-breaker-62049.firebasestorage.app",
  messagingSenderId: "1001599145594",
  appId: "1:1001599145594:web:f81b26ec99cd437f994dc3"
};

const isConfigured = () => !Object.values(firebaseConfig).some(value => value.includes("YOUR_"));

// 빌드 도구 없이 Firebase 공식 브라우저 모듈을 불러와 랭킹에 필요한 최소 기능만 제공한다.
// 일반 script로도 읽을 수 있도록 window에 함수를 등록한다. (file:// 실행 시 ESM 로딩 문제 예방)
window.createRankingService = async function createRankingService() {
  if (!isConfigured()) return null;
  const [{ initializeApp }, { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js")
  ]);
  const db = getFirestore(initializeApp(firebaseConfig));
  const scores = collection(db, "scores");
  return {
    async save(name, score) {
      await addDoc(scores, { name, score, createdAt: serverTimestamp() });
    },
    async topTen() {
      const snapshot = await getDocs(query(scores, orderBy("score", "desc"), limit(10)));
      return snapshot.docs.map(doc => doc.data());
    }
  };
};
