// api/webhook.js — Telegram Bot Webhook Handler
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;

  const body = req.body;
  const message = body?.message;
  const callbackQuery = body?.callback_query;

  // Helper — message bhejne ke liye
  async function sendMessage(chatId, text, extra = {}) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", ...extra }),
    });
  }

  // Helper — callback query answer karne ke liye
  async function answerCallback(callbackQueryId, text = "") {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  }

  // /start command
  if (message?.text === "/start") {
    const chatId = message.chat.id;
    await sendMessage(
      chatId,
      `🙏 <b>Assam News Bot mein swagat hai!</b>\n\nRoj Assam, Biswanath aur Naduar ki latest news paao.\n\nNiche button dabao news lene ke liye 👇`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📰 Get News", callback_data: "get_news" }],
          ],
        },
      }
    );
  }

  // Get News button press
  if (callbackQuery?.data === "get_news") {
    const chatId = callbackQuery.message.chat.id;
    await answerCallback(callbackQuery.id, "⏳ News fetch ho rahi hai...");

    // Cron endpoint call karo
    try {
      await fetch(`${process.env.VERCEL_URL || "https://newsbyishwar.vercel.app"}/api/cron`);
      await sendMessage(
        chatId,
        `✅ News fetch ho rahi hai! Thodi der mein aa jaayegi.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📰 Get News", callback_data: "get_news" }],
            ],
          },
        }
      );
    } catch (err) {
      await sendMessage(chatId, "❌ Kuch error aaya, dobara try karo!");
    }
  }

  return res.status(200).json({ ok: true });
}
