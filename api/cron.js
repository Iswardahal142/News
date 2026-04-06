// api/cron.js — AI-Powered Assam News Bot
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

const BREAKING_KEYWORDS = [
  "dead", "death", "killed", "dies", "blast", "explosion", "bomb",
  "accident", "crash", "fire", "flood", "earthquake", "attack",
  "murder", "riot", "arrested", "missing", "tragedy", "disaster",
  "injured", "critical", "emergency", "strike", "shutdown"
];

const CATEGORIES = [
  { tag: "🔴 Crime", keywords: ["murder", "killed", "arrested", "robbery", "theft", "rape", "assault", "crime", "police", "fir", "custody", "drug"] },
  { tag: "🏛 Politics", keywords: ["bjp", "congress", "minister", "election", "vote", "cm ", "chief minister", "mla", "mp ", "party", "government", "modi", "himanta"] },
  { tag: "🌦 Weather", keywords: ["flood", "rain", "storm", "cyclone", "earthquake", "landslide", "drought", "weather", "temperature"] },
  { tag: "⚽ Sports", keywords: ["football", "cricket", "match", "tournament", "player", "team", "goal", "win", "loss", "ipl", "league"] },
  { tag: "💼 Business", keywords: ["market", "economy", "startup", "investment", "trade", "company", "industry", "bank", "gdp", "price"] },
  { tag: "🎓 Education", keywords: ["school", "college", "university", "exam", "student", "teacher", "result", "admission"] },
  { tag: "🏥 Health", keywords: ["hospital", "disease", "covid", "dengue", "malaria", "health", "doctor", "medicine", "patient", "outbreak"] },
];

function detectBreaking(title) {
  return BREAKING_KEYWORDS.some(kw => title.toLowerCase().includes(kw));
}

function detectCategory(title) {
  const lower = title.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(kw => lower.includes(kw))) return cat.tag;
  }
  return "📰 General";
}

function getTopicKey(title) {
  const stopWords = new Set(["the", "a", "an", "in", "on", "at", "of", "to", "is", "are", "was", "were", "and", "or", "for", "with", "from", "by"]);
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 3)
    .sort()
    .join("_");
  return `topic:${words}`;
}

async function isTopicSeen(topicKey) {
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${topicKey}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const data = await res.json();
    return data.result !== null;
  } catch { return false; }
}

async function markTopicSeen(topicKey) {
  try {
    await fetch(`${UPSTASH_URL}/set/${topicKey}/1/ex/43200`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}

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

// ── Store full message data in Upstash for webhook ─────────────────────────
async function storeMessageData(msgId, payload) {
  try {
    await fetch(`${UPSTASH_URL}/set/msgdata:${msgId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: JSON.stringify(payload), ex: 86400 }),
    });
  } catch {}
}

// ── AI Summary — Assamese + Hindi in one call ──────────────────────────────
async function summarizeWithAI(title, description) {
  try {
    const prompt = `News title: ${title}
Description: ${description || "N/A"}

Do the following:
1. Write 3-4 bullet points in Assamese language summarizing this news.
2. Write 3-4 bullet points in Hindi language summarizing this news.

Rules:
- Only bullet points, no extra text or headings.
- No blank lines between bullets within a section.
- Separate the two sections with exactly this divider on its own line: ---HINDI---

Format:
• Assamese point 1
• Assamese point 2
• Assamese point 3
---HINDI---
• Hindi point 1
• Hindi point 2
• Hindi point 3`;

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
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    const parts = raw.split("---HINDI---");
    return {
      assamese: parts[0]?.trim() || null,
      hindi: parts[1]?.trim() || null,
    };
  } catch (err) {
    console.error("AI error:", err.message);
    return { assamese: null, hindi: null };
  }
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Main handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const bot = new TelegramBot(BOT_TOKEN);
  const parser = new Parser({
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 10000,
    customFields: {
      item: [['source', 'source', { keepArray: false }]]
    }
  });
  let totalSent = 0;

  for (const feed of RSS_FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      const items = result.items.slice(0, 3);

      for (const item of items) {
        const rawId = item.guid || item.link || item.title || "";
        const id = Buffer.from(rawId).toString("base64").substring(0, 40);

        if (await isSent(id)) continue;

        const topicKey = getTopicKey(item.title || "");
        if (await isTopicSeen(topicKey)) {
          console.log(`⏭ Duplicate topic skipped: ${item.title}`);
          continue;
        }

        const isBreaking = detectBreaking(item.title || "");
        const category = detectCategory(item.title || "");
        const description = item.contentSnippet || item.content || item.description || "";
        const aiSummary = await summarizeWithAI(item.title, description);
        const sourceName = item.source?.title || item['source.title'] || feed.name;

        const pubDate = item.pubDate
          ? new Date(item.pubDate).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
            })
          : "";
        const title = escapeHtml(item.title || "");
        const header = isBreaking
          ? `🚨 <b>BREAKING NEWS</b> 🚨\n${category} | ${feed.name}\n🕐 ${pubDate}`
          : `${category} | ${feed.name}\n🕐 ${pubDate}`;

        // Build Assamese message (shown first)
        let message = `${header}\n\n<b>${title}</b>`;
        if (aiSummary.assamese) {
          message += `\n\n🟡 <b>অসমীয়া</b>\n${formatBullets(aiSummary.assamese)}`;
        }

        try {
          // Step 1: Send with placeholder callback
          const sent = await bot.sendMessage(CHAT_ID, message, {
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: [[
                { text: "🔵 हिंदी में पढ़ें", callback_data: `hindi:0` },
                { text: `📰 ${sourceName}`, web_app: { url: item.link } }
              ]]
            }
          });

          const msgId = sent?.message_id;

          if (msgId) {
            // Step 2: Update button with real message_id
            await bot.editMessageReplyMarkup(
              {
                inline_keyboard: [[
                  { text: "🔵 हिंदी में पढ़ें", callback_data: `hindi:${msgId}` },
                  { text: `📰 ${sourceName}`, web_app: { url: item.link } }
                ]]
              },
              { chat_id: CHAT_ID, message_id: msgId }
            );

            // Step 3: Store data for webhook
            await storeMessageData(msgId, {
              header,
              title,
              assamese: aiSummary.assamese,
              hindi: aiSummary.hindi,
              sourceName,
              link: item.link,
            });
          }

          await markSent(id);
          await markTopicSeen(topicKey);
          totalSent++;
          await sleep(1500);
        } catch (err) { console.error("Telegram error:", err.message); }
      }
    } catch (err) { console.error(`Feed error [${feed.name}]:`, err.message); }
  }

  console.log(`✅ Total sent: ${totalSent}`);
  return res.status(200).json({ success: true, sent: totalSent });
}
