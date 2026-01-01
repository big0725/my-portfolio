const apiKey = "AIzaSyDFX5ltfAsyWBi1Rfc2FZR7IQh4zAPtkrg";
const symbols = "AAPL";
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

async function testGemini() {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Get current real-time market price and 7-day price history for these tickers: ${symbols}. 
          Return ONLY a JSON object with this exact structure:
          { 
            "currentPrices": { "TICKER": 1234.56 }, 
            "history": [{ "date": "YYYY-MM-DD", "TICKER": 1234.56 }] 
          }
          Note: Values must be numbers, not strings with currency symbols.` }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });
    const resData = await response.json();
    console.log("Response status:", response.status);
    console.log("Full Response:", JSON.stringify(resData, null, 2));
    
    if (resData.candidates && resData.candidates[0].content.parts[0].text) {
        const content = JSON.parse(resData.candidates[0].content.parts[0].text);
        console.log("Parsed Content:", content);
    }
  } catch (e) {
    console.error("Test failed:", e);
  }
}

testGemini();
