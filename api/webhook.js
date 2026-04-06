// api/webhook.js — Handles Telegram callback queries (language toggle)
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// ── Fetch stored message data from Upstash ─────────────────────────────────
async function getMessageData(msgId) {
  try {
    const res = await fetch(`${UPSTASH_URL}/get/msgdata:${msgId}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const data = await res.json();
    if (!data.result) return null;
    return JSON.parse(data.result);
  } catch { return null; }
}

function escapeHtml(text = "") {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatBullets(text) {
  if (!text) return "";
  return text.split("\n")
    .filter(l => l.trim())
    .map(line => line.replace(/^[•\-\*]\s*/, ""))
    .map(line => `▪️ ${escapeHtml(line)}`)
    .join("\n");
}

// ── Main handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const bot = new TelegramBot(BOT_TOKEN);
  const body = req.body;

  // ── Handle callback_query (button press) ──────────────────────────────
  if (body?.callback_query) {
    const query = body.callback_query;
    const callbackData = query?.data || "";
    const chatId = query?.message?.chat?.id;
    const msgId = query?.message?.message_id;

    // Acknowledge the callback immediately (removes loading spinner)
    await bot.answerCallbackQuery(query.id);

    // ── Hindi toggle ──────────────────────────────────────────────────
    if (callbackData.startsWith("hindi:")) {
      const storedMsgId = callbackData.split(":")[1];
      const stored = await getMessageData(storedMsgId);

      if (!stored) {
        await bot.answerCallbackQuery(query.id, { text: "❌ Data expired. Please wait for next news cycle." });
        return res.status(200).json({ ok: true });
      }

      // Build Hindi message
      let newMessage = `${stored.header}\n\n<b>${stored.title}</b>`;
      if (stored.hindi) {
        newMessage += `\n\n🔵 <b>हिंदी</b>\n${formatBullets(stored.hindi)}`;
      }

      try {
        await bot.editMessageText(newMessage, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [[
              { text: "🟡 অসমীয়াত পঢ়ক", callback_data: `assamese:${storedMsgId}` },
              { text: `📰 ${stored.sourceName}`, web_app: { url: stored.link } }
            ]]
          }
        });
      } catch (err) { console.error("Edit error (hindi):", err.message); }
    }

    // ── Assamese toggle (back button) ─────────────────────────────────
    if (callbackData.startsWith("assamese:")) {
      const storedMsgId = callbackData.split(":")[1];
      const stored = await getMessageData(storedMsgId);

      if (!stored) {
        await bot.answerCallbackQuery(query.id, { text: "❌ Data expired." });
        return res.status(200).json({ ok: true });
      }

      // Build Assamese message
      let newMessage = `${stored.header}\n\n<b>${stored.title}</b>`;
      if (stored.assamese) {
        newMessage += `\n\n🟡 <b>অসমীয়া</b>\n${formatBullets(stored.assamese)}`;
      }

      try {
        await bot.editMessageText(newMessage, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [[
              { text: "🔵 हिंदी में पढ़ें", callback_data: `hindi:${storedMsgId}` },
              { text: `📰 ${stored.sourceName}`, web_app: { url: stored.link } }
            ]]
          }
        });
      } catch (err) { console.error("Edit error (assamese):", err.message); }
    }
  }

  return res.status(200).json({ ok: true });
}
