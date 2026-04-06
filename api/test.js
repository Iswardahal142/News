// api/test.js — AI Test Endpoint
export default async function handler(req, res) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;

  let aiStatus = "❌ Failed";
  let aiError = "";
  let aiResponse = "";

  // AI Test
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://newsbyishwar.vercel.app",
        "X-Title": "Assam News Bot",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [{ role: "user", content: "Say ONLY this: AI is working!" }],
        max_tokens: 20,
      }),
    });

    const data = await response.json();
    aiResponse = data?.choices?.[0]?.message?.content?.trim() || JSON.stringify(data);
    aiStatus = "✅ Working";
  } catch (err) {
    aiError = err.message;
  }

  // Telegram pe result bhejo
  const message =
    `🧪 <b>AI Test Result</b>\n\n` +
    `Status: ${aiStatus}\n` +
    (aiResponse ? `Response: <code>${aiResponse}</code>\n` : "") +
    (aiError ? `Error: <code>${aiError}</code>\n` : "") +
    `\nModel: meta-llama/llama-3.1-8b-instruct:free`;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "HTML" }),
    });
  } catch (err) {}

  return res.status(200).json({ aiStatus, aiResponse, aiError });
}
