const apiKey = "AIzaSyDFX5ltfAsyWBi1Rfc2FZR7IQh4zAPtkrg";
const symbols = "BTC, ETH";
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

async function testGemini() {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Get current price for: ${symbols}. Return JSON: { "currentPrices": { "BTC": 50000, "ETH": 3000 } }` }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });
    const resData = await response.json();
    console.log(JSON.stringify(resData, null, 2));
  } catch (e) {
    console.error("Test failed:", e);
  }
}

testGemini();
