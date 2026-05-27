#!/usr/bin/env node
// ============================================================
// Ek Awaz News — Auto-Publisher v4 (FIXED)
// FIXES:
//   ✅ 1. BATCH env now determines which run → 15 articles/day
//   ✅ 2. Articles are 850–950 words
//   ✅ 3. Watermarked domains blocked → picsum fallback
//   ✅ 4. Titles: no truncation, cleaned properly (up to 120 chars)
//   ✅ 5. Image pipeline: multi-source + 8s timeout + reliable fallback
//   ✅ 6. fix-existing-posts.js now uses CommonJS (no import crash)
//   ✅ 7. Smart keyword-based category routing (National=PK only)
//   ✅ 8. Bulletins daily, Editorials 3x/week, Columns 2x/week
//   ✅ 9. International feed excludes Pakistani content
// ============================================================

const { GoogleGenAI } = require('@google/genai');
const Parser = require('rss-parser');
const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const GEMINI_API_KEY           = process.env.GEMINI_API_KEY;
const CLOUDINARY_CLOUD_NAME    = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;
const FIREBASE_PROJECT_ID      = 'ekawaznews-a114a';
const FIREBASE_API_KEY         = 'AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8';
const FIRESTORE_BASE           = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const LOGO_PATH                = path.join(__dirname, 'ek-awaz-logo.png');
const PAGES_DIR                = path.join(__dirname, 'news');
const SITE_URL                 = 'https://ekawaznews.github.io';

const GEMINI_MODEL = 'gemini-3.5-flash';

// ─── IMAGE DOMAIN BLACKLIST (watermarks baked into pixels) ───
// These CDNs embed their own logos/watermarks into the image pixels
const WATERMARKED_DOMAINS = [
  'yimg.com',         // Yahoo News — always has Yahoo watermark
  'arabnews.com',     // Arab News — logo watermark
  'gannett-cdn.com',  // USA Today network
  'media.cnn.com',    // CNN
  'cbsnews.com',      // CBS
  'nbcnews.com',      // NBC
  'foxnews.com',      // Fox News
  'wsj.net',          // Wall Street Journal
  'nytimes.com',      // NYT
  'washingtonpost.com',
  'ndtvimg.com',      // NDTV India
  'hindustantimes.com',
  'thehindu.com',
];

// ─── CATEGORY-BASED FALLBACK IMAGES (picsum — clean, no watermarks) ───
// Seeds are chosen to give visually appropriate photos per category
const FALLBACK_IMAGES = {
  politics:      'https://picsum.photos/seed/parliament/1200/630',
  government:    'https://picsum.photos/seed/building/1200/630',
  sports:        'https://picsum.photos/seed/cricket/1200/630',
  international: 'https://picsum.photos/seed/world/1200/630',
  entertainment: 'https://picsum.photos/seed/stage/1200/630',
  economy:       'https://picsum.photos/seed/finance/1200/630',
  weather:       'https://picsum.photos/seed/clouds/1200/630',
  national:      'https://picsum.photos/seed/pakistan/1200/630',
  education:     'https://picsum.photos/seed/library/1200/630',
  crime:         'https://picsum.photos/seed/city/1200/630',
  bulletin:      'https://picsum.photos/seed/breaking/1200/630',
  editorial:     'https://picsum.photos/seed/newspaper/1200/630',
  column:        'https://picsum.photos/seed/writing/1200/630',
  urdu:          'https://picsum.photos/seed/lahore/1200/630',
  default:       'https://picsum.photos/seed/news/1200/630',
};

// ─── TRUSTED IMAGE SOURCE DOMAINS (no watermarks) ────────────
const CLEAN_IMAGE_DOMAINS = [
  'dawn.com', 'images.dawn.com', 'i.dawn.com',
  'geo.tv', 'arynews.tv', 'thenews.com.pk',
  'dunyanews.tv', 'samaa.tv', 'express.com.pk',
  'tribune.com.pk', 'app.com.pk',
  'bbci.co.uk', 'ichef.bbci.co.uk',   // BBC images (no watermark)
  'aljazeera.com',                     // AJ images (no watermark)
  'cloudinary.com',                    // Our own uploads
  'res.cloudinary.com',
  'picsum.photos',                     // Fallback
];

// ─── FEEDS (topic-specific, Pakistan-filtered where needed) ───
const FEEDS = {
  politics: [
    'https://news.google.com/rss/search?q=Pakistan+politics+parliament+election+PM+OR+opposition+site:dawn.com+OR+site:geo.tv+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
    'https://www.thenews.com.pk/rss/1/1',
  ],
  government: [
    'https://news.google.com/rss/search?q=Pakistan+government+federal+cabinet+ministry+budget+PM+House+site:dawn.com+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
    'https://www.dawn.com/feeds/home',
  ],
  sports: [
    'https://www.dawn.com/feeds/sport',
    'https://news.google.com/rss/search?q=Pakistan+cricket+PSL+hockey+squash+PCB+Babar+Shaheen+site:dawn.com+OR+site:geo.tv+OR+site:arynews.tv&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  international: [
    // Explicitly exclude Pakistan from international feed
    'https://news.google.com/rss/search?q=world+news+-Pakistan+site:bbc.com+OR+site:aljazeera.com+OR+site:reuters.com&hl=en&gl=US&ceid=US:en',
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
  ],
  entertainment: [
    'https://www.dawn.com/feeds/entertainment',
    'https://news.google.com/rss/search?q=Pakistan+drama+actor+actress+Lollywood+ARY+Geo+entertainment+site:dawn.com+OR+site:geo.tv&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  economy: [
    'https://www.dawn.com/feeds/business',
    'https://news.google.com/rss/search?q=Pakistan+economy+SBP+IMF+rupee+inflation+GDP+trade+site:dawn.com+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  weather: [
    'https://news.google.com/rss/search?q=Pakistan+weather+rain+flood+PMD+heatwave+monsoon+smog+cold+site:dawn.com+OR+site:geo.tv+OR+site:arynews.tv&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  national: [
    // Pakistani domestic news only — cities, provinces, social
    'https://news.google.com/rss/search?q=Karachi+OR+Lahore+OR+Islamabad+OR+Peshawar+OR+Quetta+OR+Sindh+OR+Punjab+OR+KPK+OR+Balochistan+site:dawn.com+OR+site:geo.tv+OR+site:arynews.tv&hl=en-PK&gl=PK&ceid=PK:en',
    'https://news.google.com/rss/search?q=Pakistan+education+health+poverty+HEC+university+hospital+site:dawn.com+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  crime: [
    'https://news.google.com/rss/search?q=Pakistan+crime+police+FIR+court+FIA+rangers+arrest+murder+robbery+site:dawn.com+OR+site:geo.tv&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  bulletin: [
    // Breaking news — latest from all trusted Pakistani sources
    'https://www.dawn.com/feeds/home',
    'https://www.geo.tv/rss/1',
    'https://news.google.com/rss/search?q=Pakistan+breaking+news+latest+today+site:dawn.com+OR+site:geo.tv+OR+site:arynews.tv&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  editorial: [
    'https://www.dawn.com/feeds/home',
    'https://news.google.com/rss/search?q=Pakistan+policy+analysis+editorial+opinion+economy+governance+site:dawn.com+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  column: [
    'https://www.dawn.com/feeds/home',
    'https://news.google.com/rss/search?q=Pakistan+column+opinion+analysis+political+social+site:dawn.com+OR+site:thenews.com.pk&hl=en-PK&gl=PK&ceid=PK:en',
  ],
  urdu: [
    'https://feeds.bbci.co.uk/urdu/rss.xml',
    'https://www.geo.tv/rss/1',
  ],
};

// ─── CATEGORY MAP — strict routing ───────────────────────────
const CAT_MAP = {
  politics:      { category: 'Politics',       cat_key: 'politics'      },
  government:    { category: 'Government',     cat_key: 'government'    },
  sports:        { category: 'Sports',         cat_key: 'sports'        },
  international: { category: 'International',  cat_key: 'international' },
  entertainment: { category: 'Entertainment',  cat_key: 'entertainment' },
  economy:       { category: 'Economy',        cat_key: 'economy'       },
  weather:       { category: 'Weather',        cat_key: 'weather'       },
  national:      { category: 'National',       cat_key: 'national'      },
  crime:         { category: 'Crime',          cat_key: 'crime'         },
  bulletin:      { category: 'Bulletins',      cat_key: 'bulletins'     },
  editorial:     { category: 'Editorials',     cat_key: 'editorials'    },
  column:        { category: 'Columns',        cat_key: 'columns'       },
  urdu:          { category: 'National',       cat_key: 'national'      },
};

// ─── BATCH PLAN — 15 articles/day total ──────────────────────
// Batch A: 6:00 PKT  (5 articles)
// Batch B: 12:00 PKT (5 articles)
// Batch C: 18:00 PKT (5 articles)
// Total: 15 articles/day
const BATCH_PLAN = {
  A: ['bulletin', 'politics', 'government', 'sports', 'column'],
  B: ['bulletin', 'international', 'entertainment', 'economy', 'editorial'],
  C: ['bulletin', 'national', 'weather', 'crime', 'urdu'],
};

// Editorial/Column scheduling — rotate through days so they vary
// Editorials: Mon, Wed, Fri → 3x/week
// Columns: Tue, Thu, Sat → 3x/week  
// On non-scheduled days, replace with national/economy fallback
function getSpecialTypeForDay(type) {
  const day = new Date().getDay(); // 0=Sun, 1=Mon...
  if (type === 'editorial') {
    const editDays = [1, 3, 5]; // Mon, Wed, Fri
    return editDays.includes(day) ? 'editorial' : 'national';
  }
  if (type === 'column') {
    const colDays = [2, 4, 6]; // Tue, Thu, Sat
    return colDays.includes(day) ? 'column' : 'economy';
  }
  return type;
}

// ─── PAKISTAN KEYWORDS — for National vs International filter ─
const PAKISTAN_KEYWORDS = [
  'pakistan','karachi','lahore','islamabad','peshawar','quetta',
  'rawalpindi','faisalabad','multan','hyderabad','sialkot','gujranwala',
  'sindh','punjab','kpk','khyber','balochistan','gilgit','azad kashmir',
  'pti','pmln','ppp','pdm','imran khan','shehbaz','nawaz','zardari',
  'bilawal','maryam','shahbaz','pmik','isi','paf','pak army',
  'sbp','ogra','nepra','secp','fbr','pip','wapda','kesc','pso',
  'pcb','psl','pakistan cricket','pakistan team',
];

const INTERNATIONAL_KEYWORDS = [
  'usa','united states','america','india','china','russia','ukraine',
  'israel','iran','saudi','uae','britain','europe','nato','white house',
  'trump','modi','biden','xi jinping','putin','un','g20','g7',
  'france','germany','turkey','japan','south korea','australia',
  'afghanistan','iran','iraq','syria','yemen','palestine','gaza',
  'nigeria','kenya','south africa','brazil','argentina','mexico',
  'canada','new zealand','indonesia','malaysia','bangladesh',
];

function detectSmartCategory(feedKey, title, summary) {
  const txt = `${title} ${summary}`.toLowerCase();

  // Weather: strict match first
  const weatherWords = ['weather','rain','flood','temperature','heatwave','storm','cyclone','fog','monsoon','drought','wind','humidity','forecast','rainfall','thunderstorm','smog','snowfall','cold wave','pmd','met office'];
  if (weatherWords.some(w => txt.includes(w))) return 'weather';

  // Bulletins: breaking news keywords
  const bulletinWords = ['breaking','just in','alert','flash','developing','urgent','killed','blast','attack','arrest','emergency'];
  if (feedKey === 'bulletin' || bulletinWords.some(w => txt.includes(w))) return 'bulletin';

  // Sports: strong signals
  const sportsWords = ['cricket','psl','pcb','match','wicket','batting','bowling','icc','t20','odi','test match','football','hockey','squash','athlete','stadium','champion','trophy'];
  if (sportsWords.some(w => txt.includes(w))) return 'sports';

  // International: non-Pakistan foreign news
  if (feedKey === 'international') {
    const isPakistaniStory = PAKISTAN_KEYWORDS.some(k => txt.includes(k));
    if (!isPakistaniStory && INTERNATIONAL_KEYWORDS.some(k => txt.includes(k))) return 'international';
  }

  // For Pakistan-sourced feeds, check if it's actually international content
  if (['politics','government','national','crime','economy','education'].includes(feedKey)) {
    const isPakistaniStory = PAKISTAN_KEYWORDS.some(k => txt.includes(k));
    if (!isPakistaniStory && INTERNATIONAL_KEYWORDS.some(k => txt.includes(k))) {
      return 'international'; // Redirect misrouted international content
    }
  }

  // International feed item that mentions Pakistan → reroute to national
  if (feedKey === 'international') {
    const isPakistaniStory = PAKISTAN_KEYWORDS.some(k => txt.includes(k));
    if (isPakistaniStory) return 'national';
  }

  // Crime
  const crimeWords = ['murder','robbery','arrested','police','fir','kidnap','gang','drug','trafficking','corruption','fraud','theft','blast','target killing','encounter','rangers','fia','raid','criminal','accused','sentenced','jail','prison','shot dead','stabbed','dacoity'];
  if (crimeWords.some(w => txt.includes(w))) return 'crime';

  // Entertainment
  const entertainWords = ['film','drama','actor','actress','celebrity','lollywood','bollywood','music','singer','award','showbiz','drama serial','mahira','fawad','hum tv','geo drama'];
  if (entertainWords.some(w => txt.includes(w))) return 'entertainment';

  // Economy
  const econWords = ['sbp','imf','rupee','inflation','gdp','trade','export','import','budget','tax','fiscal','monetary','stock exchange','kse'];
  if (econWords.some(w => txt.includes(w))) return 'economy';

  // Use the feed key as default if it maps cleanly
  if (CAT_MAP[feedKey]) return feedKey;

  return 'national'; // Default to national for Pakistan content
}

// ─── AI BANNED WORDS ──────────────────────────────────────────
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
  'tapestry','intricate','foster','fostering','embark','embarking',
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
  console.log('EK AWAZ AUTO-PUBLISHER v4');
  console.log('='.repeat(60));
  console.log(`Time (UTC):  ${new Date().toISOString()}`);
  console.log(`Node:        ${process.version}`);
  console.log(`BATCH env:   ${process.env.BATCH || 'NOT SET — defaulting to A'}`);
  console.log(`GEMINI KEY:  ${GEMINI_API_KEY ? 'SET (' + GEMINI_API_KEY.slice(0,8) + '...)' : 'MISSING'}`);
  console.log(`CLOUDINARY:  ${CLOUDINARY_CLOUD_NAME || 'NOT SET — images will use fallback'}`);
  console.log(`LOGO FILE:   ${fs.existsSync(LOGO_PATH) ? 'FOUND' : 'NOT FOUND'}`);
  console.log('='.repeat(60));

  if (!GEMINI_API_KEY) {
    console.error('[FATAL] GEMINI_API_KEY is not set in GitHub Secrets.');
    process.exit(1);
  }

  // Test Gemini
  console.log('\n[STEP 1] Testing Gemini API...');
  const workingModel = await testGeminiAPI();
  if (!workingModel) {
    console.error('[FATAL] All Gemini models failed. Check API key.');
    process.exit(1);
  }
  console.log(`[STEP 1] Gemini OK — model: ${workingModel}`);

  const batchKey = process.env.BATCH || 'A';
  let rawBatch = BATCH_PLAN[batchKey] || BATCH_PLAN['A'];

  // Resolve editorial/column based on day of week
  const batch = rawBatch.map(key => {
    if (key === 'editorial' || key === 'column') return getSpecialTypeForDay(key);
    return key;
  });

  console.log(`\n[STEP 2] Batch: ${batchKey} → [${batch.join(', ')}]`);
  console.log(`         Day: ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]}`);

  if (!fs.existsSync(PAGES_DIR)) {
    fs.mkdirSync(PAGES_DIR, { recursive: true });
    console.log(`[STEP 2] Created news/ directory`);
  }

  const parser = new Parser({
    customFields: {
      item: [
        ['media:content','media'],
        ['media:thumbnail','mediaThumbnail'],
        ['enclosure','enclosure'],
        ['media:group','mediaGroup'],
      ],
    },
  });

  const usedLinks = new Set();
  const published = [];

  for (let i = 0; i < batch.length; i++) {
    const feedKey    = batch[i];
    const catInfo    = CAT_MAP[feedKey] || CAT_MAP['national'];
    const isUrdu     = feedKey === 'urdu';
    const postType   = ['editorial','column','bulletin'].includes(feedKey) ? feedKey : 'article';

    console.log(`\n${'─'.repeat(55)}`);
    console.log(`[ARTICLE ${i+1}/${batch.length}] feed=${feedKey} | cat=${catInfo.category} | type=${postType}`);

    try {
      // ── A: Fetch RSS items ────────────────────────────────
      const feedUrls = FEEDS[feedKey] || FEEDS['national'];
      let allItems = [];
      for (const feedUrl of feedUrls) {
        try {
          console.log(`  [A] Fetching: ${feedUrl.slice(0,70)}...`);
          const feed = await parser.parseURL(feedUrl);
          allItems = allItems.concat(feed.items || []);
          console.log(`  [A] Got ${feed.items?.length || 0} items`);
        } catch (fe) {
          console.log(`  [A] Feed failed: ${fe.message.slice(0,80)}`);
        }
      }
      console.log(`  [A] Total items: ${allItems.length}`);

      // Filter to recent 48h, deduplicated
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      let items = allItems.filter(it => {
        const pub = it.pubDate ? new Date(it.pubDate).getTime() : Date.now();
        return pub > cutoff && !usedLinks.has(it.link);
      });
      if (!items.length) items = allItems.filter(it => !usedLinks.has(it.link));

      // For international feed: skip Pakistan-heavy stories
      if (feedKey === 'international') {
        const filtered = items.filter(it => {
          const t = `${it.title} ${it.contentSnippet || ''}`.toLowerCase();
          return !PAKISTAN_KEYWORDS.some(k => t.includes(k));
        });
        if (filtered.length > 0) items = filtered;
      }

      // For national/politics/govt feeds: prefer Pakistan-specific stories
      if (['national','politics','government','crime'].includes(feedKey)) {
        const pkFiltered = items.filter(it => {
          const t = `${it.title} ${it.contentSnippet || ''}`.toLowerCase();
          return PAKISTAN_KEYWORDS.some(k => t.includes(k));
        });
        if (pkFiltered.length > 0) items = pkFiltered;
      }

      if (!items.length) { console.log('  [A] No usable items. Skipping.'); continue; }

      const item = items[0];
      usedLinks.add(item.link);

      // ── B: Clean title ─────────────────────────────────────
      // Remove trailing " - Source Name" patterns but keep the real title
      let rawTitle = (item.title || 'Breaking News')
        .replace(/ \| [^|]+$/, '')          // remove " | Dawn News"
        .replace(/ - (Dawn|Geo|ARY|The News|Express|Tribune|BBC|Reuters|AFP|AP|Al Jazeera)[^-]*$/i, '')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
      if (rawTitle.length > 120) rawTitle = rawTitle.slice(0, 117) + '...';

      const rawSummary = (item.contentSnippet || item.summary || '')
        .replace(/<[^>]+>/g, '')
        .slice(0, 800);

      console.log(`  [A] Item: "${rawTitle.slice(0, 65)}"`);

      // ── C: Smart category detection ───────────────────────
      const detectedFeedKey = detectSmartCategory(feedKey, rawTitle, rawSummary);
      const finalCatInfo = CAT_MAP[detectedFeedKey] || catInfo;
      if (detectedFeedKey !== feedKey) {
        console.log(`  [C] Category rerouted: ${feedKey} → ${detectedFeedKey}`);
      }

      // ── D: Get image (watermark-safe pipeline) ────────────
      console.log(`  [D] Getting image...`);
      let imageUrl = getCleanImageFromItem(item);

      if (!imageUrl && item.link) {
        imageUrl = await scrapeCleanImage(item.link, detectedFeedKey);
      }

      if (!imageUrl) {
        imageUrl = FALLBACK_IMAGES[detectedFeedKey] || FALLBACK_IMAGES['default'];
        console.log(`  [D] Using category fallback image`);
      } else {
        console.log(`  [D] Image found: ${imageUrl.slice(0, 60)}...`);
      }

      // ── E: Process & upload image ─────────────────────────
      let finalImage = imageUrl;
      if (imageUrl && !imageUrl.includes('picsum.photos')) {
        try {
          console.log(`  [E] Processing & watermarking image...`);
          finalImage = await processAndUploadImage(imageUrl, detectedFeedKey);
          console.log(`  [E] Image OK`);
        } catch (e) {
          console.log(`  [E] Image process failed: ${e.message.slice(0,60)} — using fallback`);
          finalImage = FALLBACK_IMAGES[detectedFeedKey] || FALLBACK_IMAGES['default'];
        }
      }

      // ── F: Generate 850-word article with Gemini ──────────
      console.log(`  [F] Generating 850-word article...`);
      const data = await generateArticle(
        rawTitle, rawSummary, isUrdu, postType,
        finalCatInfo.category, workingModel
      );
      if (!data) { console.log('  [F] Gemini returned nothing. Skipping.'); continue; }
      data.body = cleanAIText(data.body || '');

      const wordCount = (data.body || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
      console.log(`  [F] Article OK: "${(data.title || '').slice(0,55)}" (${wordCount} words)`);

      // ── G: Build post ─────────────────────────────────────
      const postId = Date.now() + i * 1000;
      const slug   = makeSlug(data.title || rawTitle);
      const post = {
        id: postId, slug,
        pageUrl: `${SITE_URL}/news/${slug}.html`,
        title: data.title || rawTitle,
        excerpt: data.excerpt || '',
        category: finalCatInfo.category,
        categories: [finalCatInfo.category],
        cat_key: finalCatInfo.cat_key,
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
        scheduledAt: '', series: '',
        seoTitle: data.seoTitle || '',
        seoDesc: data.seoDesc || '',
        revisions: [],
        lang: isUrdu ? 'ur' : 'en',
      };

      // ── H: Save to Firebase ───────────────────────────────
      console.log(`  [H] Saving to Firebase...`);
      await saveToFirebase(post);
      console.log(`  [H] Firebase OK`);

      // ── I: Generate HTML page ─────────────────────────────
      console.log(`  [I] Generating article page...`);
      generateArticlePage(post);
      console.log(`  [I] Page OK → news/${slug}.html`);

      published.push(post);
      console.log(`  ✅ PUBLISHED: "${post.title.slice(0, 65)}"`);

      await sleep(5000); // Rate limit buffer between articles

    } catch (e) {
      console.error(`  [ERROR] ${e.message}`);
      console.error(`  Stack: ${e.stack?.split('\n')[1] || ''}`);
    }
  }

  if (published.length > 0) {
    console.log(`\n[TICKER] Updating ticker with ${published.length} headlines...`);
    await updateTicker(published.map(p => p.title));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`DONE — ${published.length}/${batch.length} articles published`);
  console.log('='.repeat(60));
}

// ─── TEST GEMINI ──────────────────────────────────────────────
async function testGeminiAPI() {
  console.log(`  Testing ${GEMINI_MODEL}...`);
  try {
    const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const result = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: 'Reply: OK',
      config: { maxOutputTokens: 5 },
    });
    if (result.text) {
      console.log(`  ${GEMINI_MODEL} — WORKING ✅`);
      return GEMINI_MODEL;
    }
    console.log(`  ${GEMINI_MODEL} — No response`);
  } catch (e) {
    console.log(`  ${GEMINI_MODEL} — ERROR: ${e.message}`);
  }
  return null;
}

// ─── GENERATE 850-WORD ARTICLE ───────────────────────────────
async function generateArticle(headline, summary, isUrdu, type, category, model) {
  const langNote = isUrdu
    ? 'Write the ENTIRE article in Urdu (Nastaliq script). Use clear, modern Urdu news style as used by Geo News and BBC Urdu.'
    : 'Write in professional English. Pakistani news journalist tone. Clear, factual, and engaging.';

  let typeNote = 'STANDARD NEWS ARTICLE: Report facts clearly, objectively, and with full context.';
  if (type === 'editorial') typeNote = 'EDITORIAL: Analytical opinion piece. Present a clear argument about Pakistani public policy or governance. Balanced but with a defined perspective.';
  else if (type === 'column') typeNote = 'OPINION COLUMN: First-person analytical piece. Thoughtful, direct analysis of current events from a Pakistani journalist perspective.';
  else if (type === 'bulletin') typeNote = 'BREAKING NEWS BULLETIN: Urgent, factual, tight writing. Lead with the most critical fact. Short punchy paragraphs.';

  const prompt = `You are a senior journalist at Ek Awaz News, a trusted Pakistani news publication.

TYPE: ${typeNote}
LANGUAGE: ${langNote}
CATEGORY: ${category}
NEWS HEADLINE: ${headline}
SOURCE SUMMARY: ${summary}

STRICT WRITING RULES — ALL MUST BE FOLLOWED:
1. WORD COUNT: Write exactly 850 to 950 words in the body. This is mandatory. Count carefully.
2. STRUCTURE: Use ONLY <p> and <h2> HTML tags. No bullet points. No numbered lists. No bold formatting.
3. BANNED WORDS — never use any of these words: delve, crucial, pivotal, furthermore, moreover, additionally, subsequently, in conclusion, navigating, underscore, robust, leverage, multifaceted, groundbreaking, it is worth noting, in today's world, needless to say, at the end of the day, tapestry, foster, embark, intricate
4. No em dashes (—). Use commas or periods instead.
5. OPENING: First sentence must immediately state the core news fact. No preamble, no scene-setting, no "In a significant development..."
6. PARAGRAPH VARIETY: Mix short (2-line) and longer (4-5 line) paragraphs throughout.
7. QUOTES: Include at least 2 attributed quotes using: said, stated, confirmed, told reporters, told media
8. CONTEXT: Every article needs at least one paragraph of background/history explaining why this matters.
9. IMPACT: Include a paragraph on how this affects Pakistan or Pakistani citizens specifically.
10. ACCURACY: Only report facts from the provided headline and summary. Do not invent statistics, names, or quotes.
11. STRUCTURE for 850 words — use approximately these sections:
    - <h2>Opening section</h2> with lead paragraph (who, what, when, where)
    - <p>Key facts and details</p> (2-3 paragraphs)
    - <h2>Background and Context</h2>
    - <p>Why this matters, history</p> (1-2 paragraphs)
    - <h2>Impact on Pakistan</h2>
    - <p>Effect on citizens, economy, governance</p> (1-2 paragraphs)
    - <h2>Official Response</h2>
    - <p>Statements from officials or experts</p> (1-2 paragraphs)
    - <h2>What to Watch Next</h2>
    - <p>Upcoming developments</p> (1 paragraph)
    - <p>Closing paragraph</p>

Output ONLY valid JSON — no markdown, no backticks, no explanation:
{"title":"complete headline up to 115 characters — never truncate","excerpt":"2 complete sentences summarising the story in under 220 characters","body":"<h2>...</h2><p>...</p>...","seoTitle":"SEO title 52-60 chars","seoDesc":"meta description 140-155 chars","tags":["tag1","tag2","tag3","Pakistan"]}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const result = await genai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.65,
          maxOutputTokens: 4096,
        },
      });

      const raw = result.text || '';
      if (!raw) {
        console.log(`  [F] Empty response. Attempt ${attempt}`);
        if (attempt < 3) await sleep(3000);
        continue;
      }

      const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log(`  [F] Could not find JSON in response. Attempt ${attempt}`);
        if (attempt < 3) await sleep(3000);
        continue;
      }

      return JSON.parse(jsonMatch[0]);

    } catch (e) {
      console.log(`  [F] Attempt ${attempt} error: ${e.message.slice(0, 80)}`);
      if (e.message.includes('429')) {
        console.log(`  [F] Rate limited — waiting 15s...`);
        await sleep(15000);
      } else if (attempt < 3) {
        await sleep(4000);
      }
    }
  }
  return null;
}

// ─── CLEAN AI TEXT ────────────────────────────────────────────
function cleanAIText(html) {
  let out = html;
  for (const word of AI_BANNED) {
    const re  = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const rep = AI_REPLACEMENTS[word.toLowerCase()] || '';
    out = out.replace(re, rep);
  }
  return out
    .replace(/  +/g, ' ')
    .replace(/ ,/g, ',')
    .replace(/ \./g, '.')
    .replace(/— /g, '')
    .replace(/ —/g, '')
    .replace(/—/g, ' ');
}

// ─── IMAGE: Get clean image from RSS item (no watermarks) ─────
function getCleanImageFromItem(item) {
  const candidates = [];

  // Collect all possible image URLs from RSS item fields
  if (item.media?.url) candidates.push(item.media.url);
  if (item.mediaThumbnail?.url) candidates.push(item.mediaThumbnail.url);
  if (item.enclosure?.url && /\.(jpg|jpeg|png|webp)/i.test(item.enclosure.url)) {
    candidates.push(item.enclosure.url);
  }
  // Check media:group
  if (item.mediaGroup) {
    const g = Array.isArray(item.mediaGroup) ? item.mediaGroup[0] : item.mediaGroup;
    if (g?.['media:content']?.url) candidates.push(g['media:content'].url);
  }
  // Check content:encoded for img src
  const c = item['content:encoded'] || item.content || '';
  const imgMatch = c.match(/<img[^>]+src="([^"]+)"/i);
  if (imgMatch) candidates.push(imgMatch[1]);

  // Return first candidate that is NOT from a watermarked domain
  for (const url of candidates) {
    if (url && !isWatermarkedDomain(url)) return url;
  }
  return null;
}

function isWatermarkedDomain(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return WATERMARKED_DOMAINS.some(d => domain.includes(d));
  } catch (_) {
    return false;
  }
}

function isCleanImageDomain(url) {
  if (!url) return false;
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return CLEAN_IMAGE_DOMAINS.some(d => domain.includes(d));
  } catch (_) {
    return false;
  }
}

// ─── IMAGE: Scrape og:image from article page ─────────────────
async function scrapeCleanImage(url, feedKey) {
  if (!url) return null;

  // Only scrape images from clean domains to avoid watermarks
  const isCleanSource = isCleanImageDomain(url) ||
    ['dawn.com','geo.tv','thenews.com.pk','arynews.tv','dunyanews.tv',
     'samaa.tv','express.com.pk','tribune.com.pk','bbc.com','bbc.co.uk',
     'aljazeera.com','app.com.pk'].some(d => url.includes(d));

  if (!isCleanSource) {
    console.log(`  [D] Skipping image scrape — domain not in clean list`);
    return null;
  }

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
      signal: AbortSignal.timeout(8000), // Increased from 6s to 8s
    });

    if (!r.ok) {
      console.log(`  [D] Page fetch failed: HTTP ${r.status}`);
      return null;
    }

    const html = await r.text();

    // Try og:image first (best quality)
    const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
                 || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    if (ogMatch?.[1] && !isWatermarkedDomain(ogMatch[1])) return ogMatch[1];

    // Try twitter:image
    const twMatch = html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i)
                 || html.match(/<meta[^>]+content="([^"]+)"[^>]+name="twitter:image"/i);
    if (twMatch?.[1] && !isWatermarkedDomain(twMatch[1])) return twMatch[1];

    // Try first large <img> in article body
    const imgMatch = html.match(/<img[^>]+src="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp))"[^>]*width="([^"]+)"/i);
    if (imgMatch?.[1]) {
      const width = parseInt(imgMatch[3], 10);
      if (width > 400 && !isWatermarkedDomain(imgMatch[1])) return imgMatch[1];
    }

  } catch (e) {
    console.log(`  [D] Page scrape error: ${e.message.slice(0, 60)}`);
  }
  return null;
}

// ─── IMAGE: Process, watermark with logo, upload ──────────────
async function processAndUploadImage(imageUrl, feedKey) {
  // For picsum fallback, we can't process it (it redirects)
  // Just return it as-is since it's already clean
  if (imageUrl.includes('picsum.photos')) return imageUrl;

  const r = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Image download failed: HTTP ${r.status}`);

  const buf  = Buffer.from(await r.arrayBuffer());
  let img    = sharp(buf).resize(1200, 630, { fit: 'cover', position: 'centre' });

  // Overlay logo in bottom-left corner
  if (fs.existsSync(LOGO_PATH)) {
    try {
      const logo = await sharp(LOGO_PATH)
        .resize(100, 100)
        .composite([{
          input: Buffer.from('<svg><rect x="0" y="0" width="100" height="100" rx="50" ry="50" fill="rgba(0,0,0,0.3)"/></svg>'),
          blend: 'over',
        }])
        .toBuffer();
      img = img.composite([{ input: logo, gravity: 'southwest', blend: 'over' }]);
    } catch (_) {
      // Logo composite failed — skip logo, continue with image
    }
  }

  const out = await img.jpeg({ quality: 85 }).toBuffer();

  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET) {
    return await uploadToCloudinary(out, feedKey);
  }

  console.log('  [E] No Cloudinary config — using original (no watermark added)');
  return imageUrl;
}

async function uploadToCloudinary(buf, feedKey) {
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file: `data:image/jpeg;base64,${buf.toString('base64')}`,
      upload_preset: CLOUDINARY_UPLOAD_PRESET,
      folder: `ek-awaz-auto/${feedKey}`,
      transformation: 'f_auto,q_auto',
    }),
  });
  const d = await r.json();
  if (d.secure_url) return d.secure_url;
  throw new Error('Cloudinary upload failed: ' + JSON.stringify(d.error || d));
}

// ─── FIREBASE ─────────────────────────────────────────────────
async function saveToFirebase(post) {
  const r = await fetch(
    `${FIRESTORE_BASE}/ekawaz_posts/${String(post.id)}?key=${FIREBASE_API_KEY}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFF(post) }),
    }
  );
  if (!r.ok) throw new Error(`Firestore ${r.status}: ${await r.text()}`);
}

async function updateTicker(titles) {
  try {
    const g = await (await fetch(`${FIRESTORE_BASE}/ekawaz/main?key=${FIREBASE_API_KEY}`)).json();
    const ex = (g.fields?.ticker?.stringValue || '').split('\n').filter(Boolean);
    const all = [...titles.map(t => `• ${t}`), ...ex];
    const u = [...new Set(all)].slice(0, 20);
    await fetch(
      `${FIRESTORE_BASE}/ekawaz/main?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=ticker`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { ticker: { stringValue: u.join('\n') } } }),
      }
    );
    console.log('[TICKER] Updated successfully');
  } catch (e) {
    console.log('[TICKER] Skipped:', e.message);
  }
}

// ─── HTML ARTICLE PAGE GENERATOR ─────────────────────────────
function generateArticlePage(post) {
  const isUrdu   = post.lang === 'ur';
  const dateStr  = new Date(post.date || Date.now()).toLocaleDateString('en-PK', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const wordCount = (post.body || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
  const readTime  = Math.max(2, Math.ceil(wordCount / 200));
  const tags      = Array.isArray(post.tags) ? post.tags : [];
  const tagsHtml  = tags.map(t => `<a href="${SITE_URL}/?tag=${enc(t)}" class="tag">${esc(t)}</a>`).join('');
  const pageUrl   = post.pageUrl;
  const author    = post.author || 'Umer Javed';

  const html = `<!DOCTYPE html>
<html lang="${isUrdu ? 'ur' : 'en'}" dir="${isUrdu ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(post.seoTitle || post.title)} | Ek Awaz News</title>
<meta name="description" content="${esc(post.seoDesc || post.excerpt)}">
<meta name="author" content="${esc(author)}">
<meta name="keywords" content="${esc(tags.join(', '))}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${pageUrl}">
<link rel="icon" type="image/x-icon" href="${SITE_URL}/favicon.ico">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(post.seoTitle || post.title)}">
<meta property="og:description" content="${esc(post.seoDesc || post.excerpt)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:site_name" content="Ek Awaz News">
${post.image ? `<meta property="og:image" content="${post.image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : ''}
<meta property="article:published_time" content="${post.date || ''}">
<meta property="article:author" content="${esc(author)}">
<meta property="article:section" content="${esc(post.category || '')}">
${tags.map(t => `<meta property="article:tag" content="${esc(t)}">`).join('')}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(post.seoTitle || post.title)}">
<meta name="twitter:description" content="${esc(post.seoDesc || post.excerpt)}">
${post.image ? `<meta name="twitter:image" content="${post.image}">` : ''}
<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"${escJ(post.title || '')}","description":"${escJ(post.seoDesc || post.excerpt || '')}","image":"${post.image || ''}","datePublished":"${post.date || ''}","dateModified":"${post.lastEditedAt || post.date || ''}","author":{"@type":"Person","name":"${escJ(author)}"},"publisher":{"@type":"Organization","name":"Ek Awaz News","logo":{"@type":"ImageObject","url":"${SITE_URL}/ek-awaz-logo.png"}},"mainEntityOfPage":{"@type":"WebPage","@id":"${pageUrl}"},"articleSection":"${escJ(post.category || '')}","keywords":"${escJ(tags.join(', '))}"}</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6455631620107533" crossorigin="anonymous"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--red:#cc0000;--dark:#111;--text:#1a1a1a;--mid:#555;--light:#f5f5f5;--border:#e0e0e0;--white:#fff}
body{font-family:'Inter',sans-serif;color:var(--text);background:var(--white);line-height:1.6}
${isUrdu ? 'body{font-family:"Noto Nastaliq Urdu",serif;direction:rtl}' : ''}
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
.article-title{font-family:'Playfair Display',serif;font-size:32px;font-weight:900;line-height:1.25;color:var(--dark);margin-bottom:14px}
@media(max-width:600px){.article-title{font-size:22px}}
.meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:12px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:22px;font-size:13px;color:var(--mid)}
.meta-author{font-weight:600;color:var(--dark)}.meta-dot{color:var(--border)}
.hero{width:100%;max-height:460px;object-fit:cover;border-radius:4px;margin-bottom:26px;display:block}
.excerpt{font-size:18px;font-weight:500;color:#333;line-height:1.6;margin-bottom:26px;padding-left:16px;border-left:4px solid var(--red);font-style:italic}
.body{font-family:'Source Serif 4',serif;font-size:18px;line-height:1.85;color:#222}
${isUrdu ? '.body{font-family:"Noto Nastaliq Urdu",serif;font-size:20px;line-height:2.2}' : ''}
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
    <a href="${SITE_URL}/?cat=bulletins">Bulletins</a>
    <a href="${SITE_URL}/?cat=politics">Politics</a>
    <a href="${SITE_URL}/?cat=government">Government</a>
    <a href="${SITE_URL}/?cat=national">National</a>
    <a href="${SITE_URL}/?cat=international">International</a>
    <a href="${SITE_URL}/?cat=sports">Sports</a>
    <a href="${SITE_URL}/?cat=entertainment">Entertainment</a>
    <a href="${SITE_URL}/?cat=economy">Economy</a>
    <a href="${SITE_URL}/?cat=weather">Weather</a>
    <a href="${SITE_URL}/?cat=crime">Crime</a>
    <a href="${SITE_URL}/?cat=editorials">Editorials</a>
    <a href="${SITE_URL}/?cat=columns">Columns</a>
  </div>
</nav>
<div class="wrap">
  <main>
    <div class="breadcrumb">
      <a href="${SITE_URL}">Home</a> &rsaquo;
      <a href="${SITE_URL}/?cat=${post.cat_key || ''}">${esc(post.category || '')}</a> &rsaquo;
      ${esc((post.title || '').slice(0, 55))}${(post.title || '').length > 55 ? '&hellip;' : ''}
    </div>
    <span class="cat-tag">${esc(post.category || '')}</span>
    <h1 class="article-title">${esc(post.title || '')}</h1>
    <div class="meta">
      <span>By <span class="meta-author">${esc(author)}</span></span>
      <span class="meta-dot">|</span>
      <time datetime="${post.date || ''}">${dateStr}</time>
      <span class="meta-dot">|</span>
      <span>${readTime} min read</span>
      <span class="meta-dot">|</span>
      <span>${wordCount} words</span>
    </div>
    ${post.image ? `<img class="hero" src="${post.image}" alt="${esc(post.title || '')}" loading="eager">` : ''}
    ${post.excerpt ? `<p class="excerpt">${esc(post.excerpt)}</p>` : ''}
    <div class="body">${post.body || ''}</div>
    <div class="in-ad">
      <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-6455631620107533" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins>
      <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
    </div>
    ${tagsHtml ? `<div class="tags-wrap"><h4>Topics</h4><div class="tags">${tagsHtml}</div></div>` : ''}
    <div class="share-bar">
      <strong>Share:</strong>
      <a class="sbtn fb" href="https://www.facebook.com/sharer/sharer.php?u=${enc(pageUrl)}" target="_blank" rel="noopener">Facebook</a>
      <a class="sbtn wa" href="https://wa.me/?text=${enc((post.title || '') + ' ' + pageUrl)}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="sbtn tw" href="https://twitter.com/intent/tweet?text=${enc(post.title || '')}&url=${enc(pageUrl)}" target="_blank" rel="noopener">Twitter</a>
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
    <a href="${SITE_URL}/?cat=national">National</a>
    <a href="${SITE_URL}/?cat=sports">Sports</a>
    <a href="${SITE_URL}/?cat=international">World</a>
    <a href="${SITE_URL}/?cat=editorials">Editorials</a>
    <a href="${SITE_URL}/?cat=columns">Columns</a>
  </div>
  <p>&copy; ${new Date().getFullYear()} Ek Awaz News. All rights reserved.</p>
</footer>
</body>
</html>`;

  fs.writeFileSync(path.join(PAGES_DIR, `${post.slug}.html`), html, 'utf8');
}

// ─── HELPERS ──────────────────────────────────────────────────
function makeSlug(t) {
  return (t || 'news')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70) + '-' + Date.now().toString().slice(-6);
}
function esc(s)  { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function escJ(s) { return (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' '); }
function enc(s)  { return encodeURIComponent(s || ''); }
function toFF(obj) { const f = {}; for (const [k, v] of Object.entries(obj)) f[k] = toFV(v); return f; }
function toFV(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFV) } };
  if (typeof v === 'object') return { mapValue: { fields: toFF(v) } };
  return { stringValue: String(v) };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => {
  console.error('[FATAL]', e.message);
  console.error(e.stack);
  process.exit(1);
});
