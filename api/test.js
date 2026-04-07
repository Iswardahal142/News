// api/test.js — AI Test Endpoint
export default async function handler(req, res) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;
  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

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
        model: "openai/gpt-5.4-nano",
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

  // Get all recipients from Redis
  let recipients = [];
  try {
    const redisRes = await fetch(`${UPSTASH_URL}/get/news:users`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const redisData = await redisRes.json();
    const users = redisData.result ? JSON.parse(redisData.result) : [];
    recipients = users.map(u => u.chatId);
    if (OWNER_CHAT_ID && !recipients.includes(OWNER_CHAT_ID)) {
      recipients.unshift(OWNER_CHAT_ID);
    }
  } catch {
    if (OWNER_CHAT_ID) recipients = [OWNER_CHAT_ID];
  }

  // Message
  const message =
    `🧪 <b>AI Test Result</b>\n\n` +
    `Status: ${aiStatus}\n` +
    (aiResponse ? `Response: <code>${aiResponse}</code>\n` : "") +
    (aiError ? `Error: <code>${aiError}</code>\n` : "") +
    `\nModel: openai/gpt-5.4-nano`;

  // Send to all recipients
  for (const chatId of recipients) {
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      });
    } catch (err) {}
  }

  return res.status(200).json({ aiStatus, aiResponse, aiError, recipients });
}
