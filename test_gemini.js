const apiKey = "AIzaSyAF8EGHeS5pAitoMI4yFwG4Rb-5Vd_Dpkk";
// 사용 가능한 모델 리스트 확인
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function testGemini() {
  try {
    const response = await fetch(url);
    const resData = await response.json();
    console.log(JSON.stringify(resData.models.map(m => m.name), null, 2));
  } catch (e) {
    console.error("Test failed:", e);
  }
}

testGemini();
