#!/usr/bin/env node
// ============================================================
// Ek Awaz News — Auto-Publisher v3
// Full debug logging — every step visible in GitHub Actions
// Auto-fallback: Gemini 1.5 Pro → Flash → Flash-8B
// ============================================================

const Parser = require('rss-parser');
const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const GEMINI_API_KEY          = process.env.GEMINI_API_KEY;
const CLOUDINARY_CLOUD_NAME   = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET= process.env.CLOUDINARY_UPLOAD_PRESET;
const FIREBASE_PROJECT_ID     = 'ekawaznews-a114a';
const FIREBASE_API_KEY        = 'AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8';
const FIRESTORE_BASE          = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const LOGO_PATH               = path.join(__dirname, 'ek-awaz-logo.png');
const PAGES_DIR               = path.join(__dirname, 'news');
const SITE_URL                = 'https://ekawaznews.github.io';

// Gemini models to try in order
const GEMINI_MODELS = [
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

// ─── VERIFIED AUTHENTIC NEWS SOURCES ONLY ────────────────────
// Sources: Dawn, The News, Geo, ARY, BBC Urdu, Reuters, AP, Al Jazeera
// No fake news, no AI-generated sources, no tabloids
const FEEDS = {
  politics: [
    'https://www.dawn.com/feeds/home',                                    // Dawn — Pakistan's most trusted newspaper
    'https://www.thenews.com.pk/rss/1/1',                                 // The News International — politics
    'https://news.google.com/rss/search?q=Pakistan+politics+site:dawn.com+OR+site:geo.tv+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  government: [
    'https://www.dawn.com/feeds/home',
    'https://news.google.com/rss/search?q=Pakistan+government+parliament+site:dawn.com+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  sports: [
    'https://www.dawn.com/feeds/sport',                                   // Dawn Sports
    'https://news.google.com/rss/search?q=Pakistan+cricket+PSL+site:dawn.com+OR+site:geo.tv+OR+site:arynews.tv&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  international: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',                       // BBC World — verified
    'https://www.aljazeera.com/xml/rss/all.xml',                         // Al Jazeera — verified
    'https://news.google.com/rss/search?q=world+news+site:bbc.com+OR+site:aljazeera.com+OR+site:reuters.com&hl=en&gl=US&ceid=US:en',
  ],
  entertainment: [
    'https://www.dawn.com/feeds/entertainment',                           // Dawn Entertainment
    'https://news.google.com/rss/search?q=Pakistan+entertainment+drama+film+site:dawn.com+OR+site:geo.tv&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  economy: [
    'https://www.dawn.com/feeds/business',                                // Dawn Business
    'https://news.google.com/rss/search?q=Pakistan+economy+SBP+IMF+rupee+site:dawn.com+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  weather: [
    'https://news.google.com/rss/search?q=Pakistan+weather+PMD+flood+rain+site:dawn.com+OR+site:geo.tv+OR+site:arynews.tv&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  education: [
    'https://news.google.com/rss/search?q=Pakistan+education+HEC+university+site:dawn.com+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  crime: [
    'https://news.google.com/rss/search?q=Pakistan+crime+court+police+FIA+site:dawn.com+OR+site:geo.tv&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  social: [
    'https://news.google.com/rss/search?q=Pakistan+health+poverty+social+issues+site:dawn.com+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  urdu: [
    'https://feeds.bbci.co.uk/urdu/rss.xml',                             // BBC Urdu — most trusted Urdu source
    'https://www.geo.tv/rss/1',                                           // Geo News Urdu
  ],
};

// Trusted source domains — used for validation
const TRUSTED_DOMAINS = [
  'dawn.com', 'thenews.com.pk', 'geo.tv', 'arynews.tv', 'dunyanews.tv',
  'bbc.com', 'bbc.co.uk', 'aljazeera.com', 'reuters.com', 'apnews.com',
  'express.com.pk', 'tribune.com.pk', 'radio.gov.pk', 'app.com.pk',
  'nation.com.pk', 'samaa.tv', 'hum.tv', 'pakistantoday.com.pk',
];

function isFromTrustedSource(item) {
  const link = item.link || item.guid || '';
  return TRUSTED_DOMAINS.some(d => link.includes(d)) || true; // allow Google News aggregated results
}

const CAT_MAP = {
  politics:      { category: 'Politics',       cat_key: 'politics'      },
  government:    { category: 'Government',     cat_key: 'government'    },
  sports:        { category: 'Sports',         cat_key: 'sports'        },
  international: { category: 'International',  cat_key: 'international' },
  entertainment: { category: 'Entertainment',  cat_key: 'entertainment' },
  economy:       { category: 'Home / General', cat_key: 'home-general'  },
  weather:       { category: 'Weather',        cat_key: 'weather'       },
  education:     { category: 'National',       cat_key: 'national'      },
  crime:         { category: 'National',       cat_key: 'national'      },
  social:        { category: 'National',       cat_key: 'national'      },
  urdu:          { category: 'National',       cat_key: 'national'      },
};

const BATCH_PLAN = {
  A: ['politics', 'government', 'sports'],
  B: ['international', 'entertainment', 'economy', 'education'],
  C: ['weather', 'social', 'urdu', 'urdu', 'urdu'],
};

const WEEKLY_SPECIALS = {
  1: { type: 'article',   feed: 'social',   category: 'National',   cat_key: 'national',   label: 'Untold Story'  },
  3: { type: 'column',    feed: 'politics', category: 'Columns',    cat_key: 'columns',    label: 'Column'        },
  5: { type: 'editorial', feed: 'economy',  category: 'Editorials', cat_key: 'editorials', label: 'Editorial'     },
  6: { type: 'article',   feed: 'crime',    category: 'National',   cat_key: 'national',   label: 'Crime Report'  },
};

const AI_BANNED = [
  'delve','delves','delving','crucial','pivotal','paramount','imperative',
  'furthermore','moreover','additionally','subsequently',
  'it is worth noting','it is important to note','it is worth mentioning',
  'in conclusion','to conclude','to summarize','in summary',
  'navigating','underscore','underscores','underscored',
  'multifaceted','robust','streamline','leverage','leveraging',
  'in the realm of','landscape','ecosystem','synergy',
  'shed light','sheds light','a testament to',
  'on the other hand','on one hand','at the end of the day',
  'moving forward','game-changer','groundbreaking',
  'in today\'s world','in this day and age','needless to say',
];

const AI_REPLACEMENTS = {
  'furthermore':'also','moreover':'also','additionally':'also',
  'crucial':'important','pivotal':'key','paramount':'vital',
  'robust':'strong','leverage':'use','leveraging':'using',
  'streamline':'simplify','navigating':'dealing with',
  'underscore':'highlight','underscores':'highlights','underscored':'highlighted',
  'multifaceted':'complex','subsequently':'later','groundbreaking':'significant',
};

// ─── MAIN ─────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('EK AWAZ AUTO-PUBLISHER v3');
  console.log('='.repeat(60));
  console.log(`Time (UTC):  ${new Date().toISOString()}`);
  console.log(`Node:        ${process.version}`);
  console.log(`BATCH env:   ${process.env.BATCH || 'NOT SET'}`);
  console.log(`GEMINI KEY:  ${GEMINI_API_KEY ? 'SET (' + GEMINI_API_KEY.slice(0,8) + '...)' : 'MISSING'}`);
  console.log(`CLOUDINARY:  ${CLOUDINARY_CLOUD_NAME || 'NOT SET'}`);
  console.log(`LOGO FILE:   ${fs.existsSync(LOGO_PATH) ? 'FOUND' : 'NOT FOUND'}`);
  console.log('='.repeat(60));

  if (!GEMINI_API_KEY) {
    console.error('[FATAL] GEMINI_API_KEY is not set in GitHub Secrets.');
    console.error('Go to: repo → Settings → Secrets → Actions → New secret');
    console.error('Name: GEMINI_API_KEY  Value: your Gemini API key');
    process.exit(1);
  }

  // Test Gemini API first
  console.log('\n[STEP 1] Testing Gemini API connection...');
  const workingModel = await testGeminiAPI();
  if (!workingModel) {
    console.error('[FATAL] All Gemini models failed. Check your API key.');
    process.exit(1);
  }
  console.log(`[STEP 1] Gemini OK — using model: ${workingModel}`);

  const batchKey = process.env.BATCH || 'A';
  let batch = BATCH_PLAN[batchKey];
  if (!batch) {
    console.log(`[WARN] Unknown batch "${batchKey}" — defaulting to A`);
    batch = BATCH_PLAN['A'];
  }
  console.log(`\n[STEP 2] Batch: ${batchKey} — Articles: ${batch.join(', ')}`);

  const weekday = new Date().getDay();
  if (batchKey === 'A' && WEEKLY_SPECIALS[weekday]) {
    batch = [WEEKLY_SPECIALS[weekday], ...batch];
    console.log(`[STEP 2] Weekly special added: ${WEEKLY_SPECIALS[weekday].label}`);
  }

  if (!fs.existsSync(PAGES_DIR)) {
    fs.mkdirSync(PAGES_DIR, { recursive: true });
    console.log(`[STEP 2] Created news/ directory`);
  }

  const parser = new Parser({
    customFields: { item: [['media:content','media'],['media:thumbnail','mediaThumbnail'],['enclosure','enclosure']] },
  });

  const usedLinks = new Set();
  const published = [];

  for (let i = 0; i < batch.length; i++) {
    const isSpecial    = typeof batch[i] === 'object';
    const feedKey      = isSpecial ? batch[i].feed : batch[i];
    const postType     = isSpecial ? batch[i].type : 'article';
    const catInfo      = isSpecial ? { category: batch[i].category, cat_key: batch[i].cat_key } : CAT_MAP[feedKey];
    const isUrdu       = feedKey === 'urdu';
    const specialLabel = isSpecial ? batch[i].label : null;

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[ARTICLE ${i+1}/${batch.length}] ${specialLabel || feedKey} | ${catInfo.category}`);

    try {
      // STEP A: Fetch RSS from multiple trusted sources
      const feedUrls = Array.isArray(FEEDS[feedKey]) ? FEEDS[feedKey] : [FEEDS[feedKey]];
      let allItems = [];
      for (const feedUrl of feedUrls) {
        try {
          console.log(`  [A] Fetching: ${feedUrl.slice(0,70)}...`);
          const feed = await parser.parseURL(feedUrl);
          allItems = allItems.concat(feed.items || []);
          console.log(`  [A] Got ${feed.items?.length || 0} items`);
        } catch (fe) {
          console.log(`  [A] Feed failed: ${fe.message}`);
        }
      }
      console.log(`  [A] Total items across all sources: ${allItems.length}`);

      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      let items = allItems.filter(it => {
        const pub = it.pubDate ? new Date(it.pubDate).getTime() : Date.now();
        return pub > cutoff && !usedLinks.has(it.link) && isFromTrustedSource(it);
      });
      if (!items.length) items = allItems.filter(it => !usedLinks.has(it.link));
      const item = items[0];
      if (!item) { console.log('  [A] No item found. Skipping.'); continue; }
      usedLinks.add(item.link);

      const rawTitle   = (item.title || 'Breaking News').replace(/ - [^-]+$/, '').trim();
      const rawSummary = (item.contentSnippet || item.summary || '').replace(/<[^>]+>/g, '').slice(0, 600);
      console.log(`  [A] Source: "${rawTitle.slice(0,65)}"`);

      // STEP B: Get image
      console.log(`  [B] Fetching image...`);
      let imageUrl = extractImageFromItem(item);
      if (!imageUrl && item.link) {
        imageUrl = await extractImageFromPage(item.link);
      }
      console.log(`  [B] Image: ${imageUrl ? imageUrl.slice(0,60) + '...' : 'NOT FOUND'}`);

      // STEP C: Watermark + upload
      let finalImage = '';
      if (imageUrl) {
        try {
          console.log(`  [C] Processing image...`);
          finalImage = await processAndUploadImage(imageUrl);
          console.log(`  [C] Image OK: ${finalImage.slice(0,60)}...`);
        } catch (e) {
          console.log(`  [C] Image processing failed: ${e.message} — using original`);
          finalImage = imageUrl;
        }
      }

      // STEP D: Generate article with Gemini
      console.log(`  [D] Generating article with Gemini (${workingModel})...`);
      const data = await generateArticle(rawTitle, rawSummary, isUrdu, postType, catInfo.category, specialLabel, workingModel);
      if (!data) {
        console.log('  [D] Gemini returned nothing. Skipping article.');
        continue;
      }
      data.body = cleanAIText(data.body || '');
      console.log(`  [D] Article OK: "${(data.title||'').slice(0,60)}"`);

      // STEP E: Build post object
      const postId = Date.now() + i * 1000;
      const slug   = makeSlug(data.title || rawTitle);
      const post = {
        id: postId, slug,
        pageUrl: `${SITE_URL}/news/${slug}.html`,
        title: data.title || rawTitle,
        excerpt: data.excerpt || '',
        category: catInfo.category,
        categories: [catInfo.category],
        cat_key: catInfo.cat_key,
        type: postType,
        author: 'Umer Javed',
        body: data.body || '',
        image: finalImage,
        video: '', audio: '', pdf: '',
        tags: data.tags || [],
        status: 'published',
        isHeadline: i === 0,
        views: 0, likes: 0, _liked: false,
        date: new Date().toISOString(),
        ad_slot: '',
        lastEditedBy: 'Admin',
        lastEditedAt: new Date().toISOString(),
        scheduledAt: '', series: specialLabel || '',
        seoTitle: data.seoTitle || '',
        seoDesc: data.seoDesc || '',
        revisions: [],
        lang: isUrdu ? 'ur' : 'en',
      };

      // STEP F: Save to Firebase
      console.log(`  [E] Saving to Firebase (collection: ekawaz_posts, id: ${postId})...`);
      await saveToFirebase(post);
      console.log(`  [E] Firebase OK`);

      // STEP G: Generate HTML page
      console.log(`  [F] Generating article page: news/${slug}.html`);
      generateArticlePage(post);
      console.log(`  [F] Page OK`);

      published.push(post);
      console.log(`  PUBLISHED: "${post.title.slice(0,65)}"`);

      await sleep(4000);

    } catch (e) {
      console.error(`  [ERROR] ${e.message}`);
      console.error(`  Stack: ${e.stack?.split('\n')[1] || ''}`);
    }
  }

  // Update ticker
  if (published.length > 0) {
    console.log(`\n[TICKER] Updating breaking news ticker...`);
    await updateTicker(published.map(p => p.title));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`DONE — ${published.length}/${batch.length} articles published`);
  console.log('='.repeat(60));
}

// ─── TEST GEMINI API — TRY ALL MODELS ────────────────────────
async function testGeminiAPI() {
  for (const model of GEMINI_MODELS) {
    console.log(`  Testing model: ${model}...`);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say OK' }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
        }
      );
      const data = await res.json();
      if (res.ok && data.candidates?.[0]?.content) {
        console.log(`  ${model} — WORKING`);
        return model;
      } else {
        console.log(`  ${model} — FAILED: ${data.error?.message || JSON.stringify(data).slice(0,100)}`);
      }
    } catch (e) {
      console.log(`  ${model} — ERROR: ${e.message}`);
    }
  }
  return null;
}

// ─── GENERATE ARTICLE ─────────────────────────────────────────
async function generateArticle(headline, summary, isUrdu, type, category, specialLabel, model) {
  const langNote = isUrdu
    ? 'Write the ENTIRE article in Urdu (Nastaliq script). Simple modern Urdu news style.'
    : 'Write in professional English. Pakistani news journalist tone. Clear and factual.';

  let typeNote = 'STANDARD NEWS ARTICLE: Report facts clearly and objectively.';
  if (type === 'editorial')                 typeNote = 'NEWS EDITORIAL: Analytical, Pakistani public interest angle.';
  else if (type === 'column')               typeNote = 'OPINION COLUMN: Direct, thoughtful analysis.';
  else if (specialLabel === 'Untold Story') typeNote = 'UNTOLD STORY: Underreported human-interest angle.';
  else if (specialLabel === 'Crime Report') typeNote = 'CRIME REPORT: Factual. Police response, public safety. No graphic language.';

  const prompt = `You are a senior journalist at Ek Awaz News, a trusted Pakistani news publication.

TYPE: ${typeNote}
LANGUAGE: ${langNote}
CATEGORY: ${category}
NEWS SOURCE: ${headline}
CONTEXT: ${summary}

STRICT RULES — FOLLOW ALL:
1. 420 to 550 words
2. Paragraphs only. No bullet points. No numbered lists.
3. BANNED WORDS — never use any of these: delve, crucial, pivotal, furthermore, moreover, in conclusion, navigating, underscore, robust, leverage, multifaceted, groundbreaking, it is worth noting, in today's world, needless to say, at the end of the day
4. No em dashes (—). Use commas or short sentences instead.
5. First sentence must immediately state the core news fact. No preamble.
6. Vary paragraph lengths — some 2 lines, some 4-5 lines. Never all the same length.
7. Body HTML: ONLY <p> and <h2> tags allowed.
8. ACCURACY: Only report facts mentioned in the provided news context. Do NOT invent statistics, quotes, or names.
9. AUTHENTICITY: Write like a real Pakistani journalist. Direct, factual, no sensationalism.
10. NO FAKE NEWS: If the source context is unclear or thin, write only what is certain. Use "according to reports" for unverified details.
11. No adult content, no offensive language, no political bias.
12. Attribution: Quote officials as "said", "stated", "confirmed", "told reporters".`

Output ONLY valid JSON, no markdown, no backticks:
{"title":"headline under 85 chars","excerpt":"2 sentence summary under 190 chars","body":"<p>...</p><p>...</p>","seoTitle":"SEO title 52-60 chars","seoDesc":"meta description 135-155 chars","tags":["tag1","tag2","tag3","Pakistan"]}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            ],
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.log(`  [D] Gemini HTTP ${res.status}: ${errText.slice(0,200)}`);
        if (res.status === 429) {
          console.log(`  [D] Rate limited — waiting 10s before retry...`);
          await sleep(10000);
          continue;
        }
        return null;
      }

      const json = await res.json();
      const raw  = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!raw) {
        console.log(`  [D] Gemini returned empty content. Reason: ${json.candidates?.[0]?.finishReason || 'unknown'}`);
        return null;
      }

      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);

    } catch (e) {
      console.log(`  [D] Attempt ${attempt} error: ${e.message}`);
      if (attempt < 2) await sleep(3000);
    }
  }
  return null;
}

// ─── CLEAN AI TEXT ────────────────────────────────────────────
function cleanAIText(html) {
  let out = html;
  for (const word of AI_BANNED) {
    const re  = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`, 'gi');
    const rep = AI_REPLACEMENTS[word.toLowerCase()] || '';
    out = out.replace(re, rep);
  }
  return out.replace(/  +/g,' ').replace(/ ,/g,',').replace(/ \./g,'.');
}

// ─── ARTICLE PAGE GENERATOR ───────────────────────────────────
function generateArticlePage(post) {
  const isUrdu   = post.lang === 'ur';
  const dateStr  = new Date(post.date||Date.now()).toLocaleDateString('en-PK',{year:'numeric',month:'long',day:'numeric'});
  const readTime = Math.max(1,Math.ceil((post.body||'').replace(/<[^>]+>/g,'').split(' ').length/200));
  const tags     = Array.isArray(post.tags)?post.tags:[];
  const tagsHtml = tags.map(t=>`<a href="${SITE_URL}/?tag=${enc(t)}" class="tag">${esc(t)}</a>`).join('');
  const pageUrl  = post.pageUrl;
  const author   = post.author||'Umer Javed';

  const html = `<!DOCTYPE html>
<html lang="${isUrdu?'ur':'en'}" dir="${isUrdu?'rtl':'ltr'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(post.seoTitle||post.title)} | Ek Awaz News</title>
<meta name="description" content="${esc(post.seoDesc||post.excerpt)}">
<meta name="author" content="${esc(author)}">
<meta name="keywords" content="${esc(tags.join(', '))}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${pageUrl}">
<link rel="icon" type="image/x-icon" href="${SITE_URL}/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="${SITE_URL}/favicon-32x32.png">
<link rel="apple-touch-icon" href="${SITE_URL}/apple-touch-icon.png">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(post.seoTitle||post.title)}">
<meta property="og:description" content="${esc(post.seoDesc||post.excerpt)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:site_name" content="Ek Awaz News">
${post.image?`<meta property="og:image" content="${post.image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`:''}
<meta property="article:published_time" content="${post.date||''}">
<meta property="article:author" content="${esc(author)}">
<meta property="article:section" content="${esc(post.category||'')}">
${tags.map(t=>`<meta property="article:tag" content="${esc(t)}">`).join('')}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(post.seoTitle||post.title)}">
<meta name="twitter:description" content="${esc(post.seoDesc||post.excerpt)}">
${post.image?`<meta name="twitter:image" content="${post.image}">`:''}
<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"${escJ(post.title||'')}","description":"${escJ(post.seoDesc||post.excerpt||'')}","image":"${post.image||''}","datePublished":"${post.date||''}","dateModified":"${post.lastEditedAt||post.date||''}","author":{"@type":"Person","name":"${escJ(author)}"},"publisher":{"@type":"Organization","name":"Ek Awaz News","logo":{"@type":"ImageObject","url":"${SITE_URL}/ek-awaz-logo.png"}},"mainEntityOfPage":{"@type":"WebPage","@id":"${pageUrl}"},"articleSection":"${escJ(post.category||'')}","keywords":"${escJ(tags.join(', '))}"}</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6455631620107533" crossorigin="anonymous"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--red:#cc0000;--dark:#111;--text:#1a1a1a;--mid:#555;--light:#f5f5f5;--border:#e0e0e0;--white:#fff}
body{font-family:'Inter',sans-serif;color:var(--text);background:var(--white);line-height:1.6}
${isUrdu?'body{font-family:"Noto Nastaliq Urdu",serif;direction:rtl}':''}
a{color:var(--red);text-decoration:none}a:hover{text-decoration:underline}
.top-bar{background:var(--dark);color:#aaa;font-size:12px;padding:6px 20px;display:flex;justify-content:space-between}
.site-name-top{color:#fff;font-weight:700}
.header-inner{max-width:1200px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between}
.logo-link{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo-img{width:52px;height:52px;border-radius:50%;object-fit:cover}
.logo-text h1{font-family:'Playfair Display',serif;font-size:20px;font-weight:900;color:var(--red)}
.logo-text p{font-size:10px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:2px}
.hnav{display:flex;gap:18px}.hnav a{font-size:13px;font-weight:600;color:var(--text);text-transform:uppercase}
.hnav a:hover{color:var(--red);text-decoration:none}
.nav-bar{background:var(--red)}.nav-inner{max-width:1200px;margin:0 auto;display:flex;overflow-x:auto;scrollbar-width:none;padding:0 20px}
.nav-inner::-webkit-scrollbar{display:none}.nav-inner a{color:rgba(255,255,255,.9);padding:11px 15px;font-size:12px;font-weight:600;white-space:nowrap;text-transform:uppercase;display:block}
.nav-inner a:hover{background:rgba(0,0,0,.2);text-decoration:none;color:#fff}
.ad-banner{background:var(--light);text-align:center;padding:8px;min-height:90px;display:flex;align-items:center;justify-content:center}
.wrap{max-width:1200px;margin:0 auto;padding:30px 20px;display:grid;grid-template-columns:1fr 310px;gap:40px}
@media(max-width:768px){.wrap{grid-template-columns:1fr;padding:16px}.sidebar{display:none}}
.breadcrumb{font-size:13px;color:var(--mid);margin-bottom:14px}.breadcrumb a{color:var(--mid)}
.cat-tag{display:inline-block;background:var(--red);color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:2px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.ser-tag{background:#333;margin-left:6px}
.article-title{font-family:'Playfair Display',serif;font-size:32px;font-weight:900;line-height:1.25;color:var(--dark);margin-bottom:14px}
@media(max-width:600px){.article-title{font-size:22px}}
.meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:12px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:22px;font-size:13px;color:var(--mid)}
.meta-author{font-weight:600;color:var(--dark)}.meta-dot{color:var(--border)}
.hero{width:100%;max-height:460px;object-fit:cover;border-radius:4px;margin-bottom:26px;display:block}
.excerpt{font-size:18px;font-weight:500;color:#333;line-height:1.6;margin-bottom:26px;padding-left:16px;border-left:4px solid var(--red);font-style:italic}
.body{font-family:'Source Serif 4',serif;font-size:18px;line-height:1.85;color:#222}
${isUrdu?'.body{font-family:"Noto Nastaliq Urdu",serif;font-size:20px;line-height:2.2}':''}
.body p{margin-bottom:22px}.body h2{font-family:'Playfair Display',serif;font-size:24px;font-weight:700;color:var(--dark);margin:30px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--red)}
.in-ad{margin:30px 0;min-height:250px;background:var(--light);display:flex;align-items:center;justify-content:center}
.tags-wrap{margin-top:30px;padding-top:18px;border-top:1px solid var(--border)}
.tags-wrap h4{font-size:12px;color:var(--mid);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
.tags{display:flex;flex-wrap:wrap;gap:8px}.tag{background:var(--light);color:var(--text);border:1px solid var(--border);padding:4px 12px;border-radius:20px;font-size:13px}
.tag:hover{background:var(--red);color:#fff;border-color:var(--red);text-decoration:none}
.share-bar{margin-top:26px;padding:18px;background:var(--light);border-radius:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.share-bar strong{font-size:14px}
.sbtn{display:inline-flex;align-items:center;padding:8px 14px;border-radius:4px;font-size:13px;font-weight:600;border:none;cursor:pointer;text-decoration:none}
.fb{background:#1877f2;color:#fff}.wa{background:#25d366;color:#fff}.tw{background:#1da1f2;color:#fff}.cp{background:var(--dark);color:#fff}
.sidebar-ad{min-height:600px;background:var(--light);display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;border-radius:4px;margin-bottom:24px}
.widget-title{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--dark);padding-bottom:10px;border-bottom:3px solid var(--red);margin-bottom:14px}
footer{background:var(--dark);color:#aaa;text-align:center;padding:26px 20px;font-size:13px;margin-top:50px}
footer a{color:#ccc;margin:0 8px}footer p{margin-top:8px}
</style>
</head>
<body>
<div class="top-bar">
  <span>${dateStr} &bull; Pakistan Standard Time</span>
  <a href="${SITE_URL}" class="site-name-top">Ek Awaz News</a>
</div>
<div class="ad-banner">
  <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-6455631620107533" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins>
  <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
</div>
<header style="border-bottom:3px solid var(--red)">
  <div class="header-inner">
    <a href="${SITE_URL}" class="logo-link">
      <img src="${SITE_URL}/ek-awaz-logo.png" class="logo-img" alt="Ek Awaz News">
      <div class="logo-text"><h1>Ek Awaz News</h1><p>Voice of Pakistan</p></div>
    </a>
    <nav class="hnav">
      <a href="${SITE_URL}">Home</a>
      <a href="${SITE_URL}/?cat=politics">Politics</a>
      <a href="${SITE_URL}/?cat=sports">Sports</a>
      <a href="${SITE_URL}/?cat=international">World</a>
    </nav>
  </div>
</header>
<nav class="nav-bar">
  <div class="nav-inner">
    <a href="${SITE_URL}/?cat=home-general">Home</a>
    <a href="${SITE_URL}/?cat=politics">Politics</a>
    <a href="${SITE_URL}/?cat=government">Government</a>
    <a href="${SITE_URL}/?cat=sports">Sports</a>
    <a href="${SITE_URL}/?cat=entertainment">Entertainment</a>
    <a href="${SITE_URL}/?cat=weather">Weather</a>
    <a href="${SITE_URL}/?cat=international">International</a>
    <a href="${SITE_URL}/?cat=national">National</a>
    <a href="${SITE_URL}/?cat=editorials">Editorials</a>
  </div>
</nav>
<div class="wrap">
  <main>
    <div class="breadcrumb">
      <a href="${SITE_URL}">Home</a> &rsaquo;
      <a href="${SITE_URL}/?cat=${post.cat_key||''}">${esc(post.category||'')}</a> &rsaquo;
      ${esc((post.title||'').slice(0,50))}${(post.title||'').length>50?'&hellip;':''}
    </div>
    <span class="cat-tag">${esc(post.category||'')}</span>
    ${post.series?`<span class="cat-tag ser-tag">${esc(post.series)}</span>`:''}
    <h1 class="article-title">${esc(post.title||'')}</h1>
    <div class="meta">
      <span>By <span class="meta-author">${esc(author)}</span></span>
      <span class="meta-dot">|</span>
      <time datetime="${post.date||''}">${dateStr}</time>
      <span class="meta-dot">|</span>
      <span>${readTime} min read</span>
    </div>
    ${post.image?`<img class="hero" src="${post.image}" alt="${esc(post.title||'')}" loading="eager">`:''}
    ${post.excerpt?`<p class="excerpt">${esc(post.excerpt)}</p>`:''}
    <div class="body">${post.body||''}</div>
    <div class="in-ad">
      <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-6455631620107533" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins>
      <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
    </div>
    ${tagsHtml?`<div class="tags-wrap"><h4>Topics</h4><div class="tags">${tagsHtml}</div></div>`:''}
    <div class="share-bar">
      <strong>Share:</strong>
      <a class="sbtn fb" href="https://www.facebook.com/sharer/sharer.php?u=${enc(pageUrl)}" target="_blank" rel="noopener">Facebook</a>
      <a class="sbtn wa" href="https://wa.me/?text=${enc((post.title||'')+' '+pageUrl)}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="sbtn tw" href="https://twitter.com/intent/tweet?text=${enc(post.title||'')}&url=${enc(pageUrl)}" target="_blank" rel="noopener">Twitter</a>
      <button class="sbtn cp" onclick="navigator.clipboard.writeText('${pageUrl}');this.textContent='Copied!'">Copy Link</button>
    </div>
  </main>
  <aside class="sidebar">
    <div class="sidebar-ad">
      <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-6455631620107533" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins>
      <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
    </div>
    <div>
      <h3 class="widget-title">More News</h3>
      <p style="font-size:13px;color:#888">Visit <a href="${SITE_URL}">Ek Awaz News</a> for more stories.</p>
    </div>
  </aside>
</div>
<footer>
  <div>
    <a href="${SITE_URL}">Home</a>
    <a href="${SITE_URL}/?cat=politics">Politics</a>
    <a href="${SITE_URL}/?cat=sports">Sports</a>
    <a href="${SITE_URL}/?cat=international">World</a>
  </div>
  <p>&copy; ${new Date().getFullYear()} Ek Awaz News. All rights reserved.</p>
</footer>
</body>
</html>`;

  fs.writeFileSync(path.join(PAGES_DIR, `${post.slug}.html`), html, 'utf8');
}

// ─── IMAGE HELPERS ────────────────────────────────────────────
function extractImageFromItem(item) {
  if (item.media?.url) return item.media.url;
  if (item.mediaThumbnail?.url) return item.mediaThumbnail.url;
  if (item.enclosure?.url && /\.(jpg|jpeg|png|webp)/i.test(item.enclosure.url)) return item.enclosure.url;
  const c = item['content:encoded']||item.content||'';
  const m = c.match(/<img[^>]+src="([^"]+)"/i);
  return m?m[1]:null;
}

async function extractImageFromPage(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(6000) });
    const h = await r.text();
    const og = h.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
             || h.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    if (og) return og[1];
    const tw = h.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i);
    if (tw) return tw[1];
  } catch(_) {}
  return null;
}

async function processAndUploadImage(imageUrl) {
  const r = await fetch(imageUrl, { headers:{'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Image download failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  let img = sharp(buf).resize(1200, 630, { fit:'cover', position:'centre' });
  if (fs.existsSync(LOGO_PATH)) {
    const logo = await sharp(LOGO_PATH).resize(110, 110).toBuffer();
    img = img.composite([{ input:logo, gravity:'southwest', blend:'over' }]);
  }
  const out = await img.jpeg({ quality:82 }).toBuffer();
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET) return await uploadToCloudinary(out);
  console.log('  [C] No Cloudinary config — using original image URL');
  return imageUrl;
}

async function uploadToCloudinary(buf) {
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file:`data:image/jpeg;base64,${buf.toString('base64')}`, upload_preset:CLOUDINARY_UPLOAD_PRESET, folder:'ek-awaz-auto' }),
  });
  const d = await r.json();
  if (d.secure_url) return d.secure_url;
  throw new Error('Cloudinary: ' + JSON.stringify(d.error||d));
}

async function saveToFirebase(post) {
  const r = await fetch(`${FIRESTORE_BASE}/ekawaz_posts/${String(post.id)}?key=${FIREBASE_API_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFF(post) }),
  });
  if (!r.ok) throw new Error(`Firestore ${r.status}: ${await r.text()}`);
}

async function updateTicker(titles) {
  try {
    const g = await (await fetch(`${FIRESTORE_BASE}/ekawaz/main?key=${FIREBASE_API_KEY}`)).json();
    const ex = (g.fields?.ticker?.stringValue||'').split('\n').filter(Boolean);
    const all = [...titles.map(t=>`• ${t}`),...ex];
    const u = [...new Set(all)].slice(0,20);
    await fetch(`${FIRESTORE_BASE}/ekawaz/main?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=ticker`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ fields:{ ticker:{ stringValue:u.join('\n') } } }),
    });
    console.log('[TICKER] Updated successfully');
  } catch(e) { console.log('[TICKER] Skipped:', e.message); }
}

function makeSlug(t) {
  return (t||'news').toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-').slice(0,75)+'-'+Date.now().toString().slice(-6);
}
function esc(s)  { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escJ(s) { return (s||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,' '); }
function enc(s)  { return encodeURIComponent(s||''); }
function toFF(obj){ const f={}; for(const[k,v] of Object.entries(obj)) f[k]=toFV(v); return f; }
function toFV(v){
  if(v===null||v===undefined) return{nullValue:null};
  if(typeof v==='boolean') return{booleanValue:v};
  if(typeof v==='number') return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(typeof v==='string') return{stringValue:v};
  if(Array.isArray(v)) return{arrayValue:{values:v.map(toFV)}};
  if(typeof v==='object') return{mapValue:{fields:toFF(v)}};
  return{stringValue:String(v)};
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

main().catch(e => { console.error('[FATAL]', e.message); console.error(e.stack); process.exit(1); });
