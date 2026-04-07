// api/webhook.js — Telegram Bot Admin Panel + Callback Handler
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID; // your personal chat ID

// ── Redis Helpers ──────────────────────────────────────────────────────────
async function redisGet(key) {
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${UPSTASH_URL}/set/${key}/${encoded}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}

async function redisDel(key) {
  try {
    await fetch(`${UPSTASH_URL}/del/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}

// ── User List Helpers ──────────────────────────────────────────────────────
async function getUsers() {
  const users = await redisGet("news:users");
  return users || [];
}

async function saveUser(chatId, name) {
  const users = await getUsers();
  const exists = users.find(u => u.chatId === chatId);
  if (exists) return false;
  users.push({ chatId, name, paused: false });
  await redisSet("news:users", users);
  return true;
}

async function togglePauseUser(chatId) {
  const users = await getUsers();
  const user = users.find(u => u.chatId === chatId);
  if (!user) return null;
  user.paused = !user.paused;
  await redisSet("news:users", users);
  return user.paused;
}

async function deleteUser(chatId) {
  const users = await getUsers();
  const updated = users.filter(u => u.chatId !== chatId);
  await redisSet("news:users", updated);
}

// ── Fetch Telegram user/group name ────────────────────────────────────────
async function fetchName(bot, chatId) {
  try {
    const chat = await bot.getChat(chatId);
    if (chat.type === "private") {
      return [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || chatId;
    } else {
      return chat.title || chatId;
    }
  } catch {
    return String(chatId);
  }
}

// ── Main Menu ──────────────────────────────────────────────────────────────
async function sendMainMenu(bot, chatId, messageId = null) {
  // Just delete the current message if any, keyboard is persistent
  if (messageId) {
    try { await bot.deleteMessage(chatId, messageId); } catch {}
  }
  await bot.sendMessage(chatId, "✅ Main menu", {
    reply_markup: { remove_keyboard: true },
  });
  const ownerNews = await redisGet("owner:news_enabled");
  const newsOn = ownerNews === null ? true : ownerNews;
  await sendReplyKeyboard(bot, chatId, newsOn);
}

// ── Users List ─────────────────────────────────────────────────────────────
async function sendUsersList(bot, chatId, messageId) {
  const users = await getUsers();

  if (users.length === 0) {
    await bot.editMessageText("👥 <b>Users List</b>\n\nAbhi koi user add nahi hai.", {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Back", callback_data: "main_menu" }],
          [{ text: "👌 Ok", callback_data: "delete_msg" }],
        ],
      },
    });
    return;
  }

  const buttons = users.map(u => [
    { text: `👤 ${u.name}`, callback_data: `user_${u.chatId}` },
  ]);
  buttons.push([{ text: "⬅️ Back", callback_data: "main_menu" }]);
  buttons.push([{ text: "👌 Ok", callback_data: "delete_msg" }]);

  await bot.editMessageText(`👥 <b>Users List</b>\n\nTotal: ${users.length}`, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

// ── Single User Detail ─────────────────────────────────────────────────────
async function sendUserDetail(bot, chatId, messageId, targetChatId) {
  const users = await getUsers();
  const user = users.find(u => u.chatId === targetChatId);
  if (!user) return;

  const pauseText = user.paused ? "▶️ Resume" : "⏸ Pause";
  const statusText = user.paused ? "⏸ Paused" : "✅ Active";

  await bot.editMessageText(
    `👤 <b>${user.name}</b>\n🆔 <code>${user.chatId}</code>\nStatus: ${statusText}`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: pauseText, callback_data: `pause_${user.chatId}` }, { text: "🗑 Delete", callback_data: `delete_user_${user.chatId}` }],
          [{ text: "⬅️ Back", callback_data: "view_users" }],
          [{ text: "👌 Ok", callback_data: "delete_msg" }],
        ],
      },
    }
  );
}


// ── Reply Keyboard ─────────────────────────────────────────────────────────
async function sendReplyKeyboard(bot, chatId, newsOn) {
  const toggleText = newsOn ? "📰 My News: ON ✅" : "📰 My News: OFF 🔕";
  await bot.sendMessage(chatId, "👋 <b>News Bot Admin Panel</b>", {
    parse_mode: "HTML",
    reply_markup: {
      keyboard: [
        [{ text: "➕ Add User" }, { text: "👥 Users" }],
        [{ text: toggleText }, { text: "📊 Stats" }],
      ],
      resize_keyboard: true,
      persistent: true,
    },
  });
}

// ── Main Handler ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  try {
    const bot = new TelegramBot(BOT_TOKEN);
    const body = req.body;

    // ── Message handler ──
    if (body.message) {
      const msg = body.message;
      const fromId = String(msg.chat.id);

      // Only owner can use
      if (fromId !== String(OWNER_CHAT_ID)) {
        return res.status(200).json({ ok: true });
      }

      const text = msg.text || "";

      // /start command
      if (text === "/start") {
        await redisDel("owner:state");
        const ownerNews = await redisGet("owner:news_enabled");
        const newsOn = ownerNews === null ? true : ownerNews;
        await sendReplyKeyboard(bot, fromId, newsOn);
        return res.status(200).json({ ok: true });
      }

      // Reply keyboard button handlers
      if (text === "➕ Add User") {
        await redisSet("owner:state", "waiting_chatid");
        const sentMsg = await bot.sendMessage(fromId, "➕ <b>Add User</b>\n\nJis user/group ko add karna hai uska <b>Chat ID</b> bhejo:", {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cancel_add" }]],
          },
        });
        await redisSet("owner:menu_msg_id", sentMsg.message_id);
        return res.status(200).json({ ok: true });
      }

      if (text === "👥 Users") {
        const users = await getUsers();
        if (users.length === 0) {
          await bot.sendMessage(fromId, "👥 <b>Users List</b>\n\nAbhi koi user add nahi hai.", { parse_mode: "HTML" });
        } else {
          const buttons = users.map(u => [{ text: `👤 ${u.name}`, callback_data: `user_${u.chatId}` }]);
          buttons.push([{ text: "👌 Ok", callback_data: "delete_msg" }]);
          await bot.sendMessage(fromId, `👥 <b>Users List</b>\n\nTotal: ${users.length}`, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: buttons },
          });
        }
        return res.status(200).json({ ok: true });
      }

      if (text === "📰 My News: ON ✅" || text === "📰 My News: OFF 🔕") {
        const current = await redisGet("owner:news_enabled");
        const currentVal = current === null ? true : current;
        const newVal = !currentVal;
        await redisSet("owner:news_enabled", newVal);
        await sendReplyKeyboard(bot, fromId, newVal);
        const status = newVal ? "✅ News ON kar diya!" : "🔕 News OFF kar diya!";
        await bot.sendMessage(fromId, status);
        return res.status(200).json({ ok: true });
      }

      if (text === "📊 Stats") {
        const users = await getUsers();
        const today = new Date().toISOString().split("T")[0];
        const todayCount = await redisGet(`stats:today:${today}`) || 0;
        const totalCount = await redisGet("stats:total") || 0;
        const ownerNews = await redisGet("owner:news_enabled");
        const newsOn = ownerNews === null ? true : ownerNews;
        const statsText =
          `📊 <b>Stats</b>

` +
          `👥 Total Users: <b>${users.length}</b>
` +
          `📰 Aaj bheje: <b>${todayCount}</b>
` +
          `📨 Total bheje: <b>${totalCount}</b>
` +
          `📡 My News: <b>${newsOn ? "ON ✅" : "OFF 🔕"}</b>`;
        await bot.sendMessage(fromId, statsText, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "👌 Ok", callback_data: "delete_msg" }]],
          },
        });
        return res.status(200).json({ ok: true });
      }

      // Waiting for chat ID input
      const state = await redisGet("owner:state");
      if (state === "waiting_chatid") {
        const inputId = text.trim();

        // Validate — must be numeric
        if (!/^-?\d+$/.test(inputId)) {
          await bot.sendMessage(fromId, "❌ Invalid Chat ID. Sirf numbers bhejo jaise <code>123456789</code>", {
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        // Fetch name from Telegram
        const name = await fetchName(bot, inputId);
        const added = await saveUser(inputId, name);
        await redisDel("owner:state");

        const menuMsgId = await redisGet("owner:menu_msg_id");

        if (added) {
          const successText = `✅ <b>${name}</b> successfully add ho gaya!\n🆔 <code>${inputId}</code>`;
          if (menuMsgId) {
            await bot.editMessageText(successText, {
              chat_id: fromId,
              message_id: menuMsgId,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "⬅️ Back to Menu", callback_data: "main_menu" }],
                  [{ text: "👌 Ok", callback_data: "delete_msg" }],
                ],
              },
            });
          } else {
            await bot.sendMessage(fromId, successText, { parse_mode: "HTML" });
          }
        } else {
          await bot.sendMessage(fromId, "⚠️ Yeh user pehle se add hai.", { parse_mode: "HTML" });
        }

        return res.status(200).json({ ok: true });
      }
    }

    // ── Callback query handler ──
    if (body.callback_query) {
      const query = body.callback_query;
      const chatId = String(query.message.chat.id);
      const messageId = query.message.message_id;
      const data = query.data;

      await bot.answerCallbackQuery(query.id);

      // Delete message (Ok button) — works for everyone (news messages)
      if (data === "delete_msg") {
        await bot.deleteMessage(chatId, messageId);
        return res.status(200).json({ ok: true });
      }

      // Like button — works for everyone
      const userId = String(query.from.id);
      if (data.startsWith("like_")) {
        console.log(`Like pressed: data=${data}, userId=${userId}, chatId=${chatId}`);
        const articleId = data.replace("like_", "");
        const likesKey = `likes:${articleId}`;
        const userLikeKey = `liked:${articleId}:${userId}`;

        const likedRes = await fetch(`${UPSTASH_URL}/get/${userLikeKey}`, {
          headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        });
        const likedData = await likedRes.json();
        const alreadyLiked = likedData.result !== null;

        let newCount;
        if (alreadyLiked) {
          await fetch(`${UPSTASH_URL}/del/${userLikeKey}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
          const decrRes = await fetch(`${UPSTASH_URL}/decr/${likesKey}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
          const decrData = await decrRes.json();
          newCount = Math.max(0, Number(decrData.result) || 0);
          await bot.answerCallbackQuery(query.id, { text: "Unlike kiya ✅" });
        } else {
          await fetch(`${UPSTASH_URL}/set/${userLikeKey}/1`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
          const incrRes = await fetch(`${UPSTASH_URL}/incr/${likesKey}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
          const incrData = await incrRes.json();
          newCount = Number(incrData.result) || 1;
          await bot.answerCallbackQuery(query.id, { text: "❤️ Like kiya!" });
        }

        try {
          const currentMarkup = query.message.reply_markup;
          const newMarkup = JSON.parse(JSON.stringify(currentMarkup));
          newMarkup.inline_keyboard = newMarkup.inline_keyboard.map(row =>
            row.map(btn => btn.callback_data === data ? { ...btn, text: `❤️ ${newCount}` } : btn)
          );
          await bot.editMessageReplyMarkup(newMarkup, { chat_id: chatId, message_id: messageId });
        } catch {}

        return res.status(200).json({ ok: true });
      }

      // Below this — only owner
      if (chatId !== String(OWNER_CHAT_ID)) {
        return res.status(200).json({ ok: true });
      }

      if (data === "main_menu") {
        await redisDel("owner:state");
        await sendMainMenu(bot, chatId, messageId);
        return res.status(200).json({ ok: true });
      }

      if (data === "add_user") {
        await redisSet("owner:state", "waiting_chatid");
        await redisSet("owner:menu_msg_id", messageId);
        await bot.editMessageText(
          "➕ <b>Add User</b>\n\nJis user/group ko add karna hai uska <b>Chat ID</b> bhejo:",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "❌ Cancel", callback_data: "main_menu" }],
              ],
            },
          }
        );
        return res.status(200).json({ ok: true });
      }

      if (data === "view_users") {
        await sendUsersList(bot, chatId, messageId);
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith("user_")) {
        const targetId = data.replace("user_", "");
        await sendUserDetail(bot, chatId, messageId, targetId);
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith("delete_user_")) {
        const targetId = data.replace("delete_user_", "");
        await deleteUser(targetId);
        await sendUsersList(bot, chatId, messageId);
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith("pause_")) {
        const targetId = data.replace("pause_", "");
        const isPaused = await togglePauseUser(targetId);
        await sendUserDetail(bot, chatId, messageId, targetId);
        return res.status(200).json({ ok: true });
      }

      if (data === "toggle_owner_news") {
        const current = await redisGet("owner:news_enabled");
        const currentVal = current === null ? true : current;
        await redisSet("owner:news_enabled", !currentVal);
        await sendMainMenu(bot, chatId, messageId);
        return res.status(200).json({ ok: true });
      }

      if (data === "cancel_add") {
        await redisDel("owner:state");
        await redisDel("owner:menu_msg_id");
        await bot.deleteMessage(chatId, messageId);
        return res.status(200).json({ ok: true });
      }
    }



    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(200).json({ ok: true });
  }
};
