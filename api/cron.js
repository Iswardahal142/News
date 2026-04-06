// api/cron.js — AI-Powered Assam News Bot (Fixed)
const TelegramBot = require("node-telegram-bot-api");
const Parser = require("rss-parser");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const RSS_FEEDS = [
  { name: "📍 Biswanath", url: "https://news.google.com/rss/search?q=Biswanath+Assam&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "📍 Naduar", url: "https://news.google.com/rss/search?q=Naduar+Assam&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "🌏 Assam", url: "https://news.google.com/rss/search?q=Assam&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "🗞 Northeast Now", url: "https://nenow.in/feed" },
  { name: "🗞 Sentinel Assam", url: "https://www.sentinelassam.com/feed/" },
];

async function isSent(id) {
  try {
    const res = await fetch(`${UPSTASH_URL}/get/sent:${id}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const data = await res.json();
    return data.result !== null;
  } catch { return false; }
}

async function markSent(id) {
  try {
    await fetch(`${UPSTASH_URL}/set/sent:${id}/1/ex/604800`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}

async function summarizeWithAI(title, description) {
  try {
    const prompt = `News title: ${title}
Description: ${description || "N/A"}

Isko Hindi mein exactly 4 bullet points mein summarize karo.
Sirf bullet points likho, koi aur text nahi.
Format:
• point 1
• point 2
• point 3
• point 4`;

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
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("AI error:", err.message);
    return null;
  }
}

function escapeHtml(text = "") {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMessage(item, sourceName, aiSummary) {
  const title = escapeHtml(item.title || "");
  const link = item.link || "";
  const pubDate = item.pubDate
    ? new Date(item.pubDate).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
      })
    : "";

  let msg = `${sourceName} | ⏰ ${pubDate}\n\n<b>${title}</b>\n\n`;
  if (aiSummary) msg += `${escapeHtml(aiSummary)}\n\n`;
  msg += `🔗 <a href="${link}">Poora padho</a>`;
  return msg;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export default async function handler(req, res) {
  const bot = new TelegramBot(BOT_TOKEN);
  const parser = new Parser({ headers: { "User-Agent": "Mozilla/5.0" }, timeout: 10000 });
  let totalSent = 0;

  for (const feed of RSS_FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      const items = result.items.slice(0, 3);

      for (const item of items) {
        const rawId = item.guid || item.link || item.title || "";
        const id = Buffer.from(rawId).toString("base64").substring(0, 40);

        if (await isSent(id)) continue;

        const description = item.contentSnippet || item.content || item.description || "";
        const aiSummary = await summarizeWithAI(item.title, description);
        const message = formatMessage(item, feed.name, aiSummary);

        try {
          await bot.sendMessage(CHAT_ID, message, { parse_mode: "HTML", disable_web_page_preview: false });
          await markSent(id);
          totalSent++;
          await sleep(1500);
        } catch (err) { console.error("Telegram error:", err.message); }
      }
    } catch (err) { console.error(`Feed error [${feed.name}]:`, err.message); }
  }

  console.log(`✅ Total sent: ${totalSent}`);
  return res.status(200).json({ success: true, sent: totalSent });
}
