# 🤖 AI-Powered Assam News Bot

Assam ki news — AI se summarized, Hindi mein, Telegram pe automatic!

## Kaisa Dikhega Message?

```
📍 Biswanath | ⏰ 2:30 PM, 6 Apr

Biswanath mein Flood Alert

• Brahmaputra ka water level badha
• 3 gaon affected, log safe zone mein
• NDRF team deploy ki gayi
• CM ne relief fund ka aadesh diya
• Kal tak situation normal hone ki ummeed

🔗 Poora padho
```

---

## Setup — 5 Minute

### Step 1 — GitHub Repo Banao
```
assam-news-bot-ai/
├── api/
│   └── cron.js
├── vercel.json
└── package.json
```

### Step 2 — Vercel pe Deploy Karo
1. vercel.com → New Project
2. GitHub repo connect karo
3. Deploy karo

### Step 3 — Environment Variables Daalo
Vercel Dashboard → Settings → Environment Variables:

| Key | Value |
|-----|-------|
| `TELEGRAM_BOT_TOKEN` | BotFather se liya token |
| `CHAT_ID` | `8735674446` |
| `OPENROUTER_API_KEY` | OpenRouter se naya key |
| `CRON_SECRET` | koi bhi — jaise `mynewsbot2024` |

### Step 4 — Redeploy
Variables daalne ke baad ek baar redeploy karo.

---

## ✅ Done!
- Har **15 minute** mein auto news
- AI **Hindi mein summarize** karega
- **Free model** use hoga — cost zero!
- Kuch karna nahi — sab automatic!

## ⚠️ Important
- Keys kabhi GitHub pe mat daalna
- Sirf Vercel Environment Variables mein daalo
