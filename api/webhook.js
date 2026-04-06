// api/webhook.js — Telegram Callback Handler
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true });
  }

  try {
    const bot = new TelegramBot(BOT_TOKEN);
    const body = req.body;

    // Handle Ok button click (callback_query)
    if (body.callback_query) {
      const query = body.callback_query;
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;
      const data = query.data;

      if (data === "delete_msg") {
        // Delete the message
        await bot.deleteMessage(chatId, messageId);

        // Answer callback to remove loading state on button
        await bot.answerCallbackQuery(query.id);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(200).json({ ok: true }); // always 200 to Telegram
  }
};

