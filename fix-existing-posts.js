#!/usr/bin/env node
// ============================================================
// EK AWAZ NEWS — FIX EXISTING POSTS v2
// Fixes: wrong categories, short articles, author, duplicates
// Run ONCE: node fix-existing-posts.js
//
// FIX from v1: Removed "import fetch from 'node-fetch'" which
// caused SyntaxError because package.json has no "type":"module".
// Node 20 has built-in fetch — no import needed.
// ============================================================

// Node 20 built-in fetch — NO import needed
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CFG = {
  GEMINI:  GEMINI_API_KEY,
  FB_KEY:  'AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8',
  FB_BASE: 'https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents',
  AUTHOR:  'Umer Javed',
};

if (!CFG.GEMINI) {
  console.error('❌ GEMINI_API_KEY not set. Run: GEMINI_API_KEY=your_key node fix-existing-posts.js');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── CATEGORY KEYWORDS (same logic as autopost.js) ────────────
const PAKISTAN_KEYWORDS = [
  'pakistan','karachi','lahore','islamabad','peshawar','quetta',
  'rawalpindi','faisalabad','multan','hyderabad','sialkot',
  'sindh','punjab','kpk','khyber','balochistan',
  'pti','pmln','ppp','imran khan','shehbaz','nawaz','zardari',
  'sbp','pcb','psl','pak army','isi',
];

const CATS = {
  Weather:       ['weather','rain','flood','temperature','heatwave','storm','cyclone','fog','monsoon','drought','forecast','thunderstorm','smog','snowfall','pmd','met department'],
  Bulletins:     ['breaking','just in','alert','flash','developing','urgent'],
  Sports:        ['cricket','psl','pcb','match','wicket','batting','bowling','icc','t20','odi','football','hockey','squash','athlete','champion','trophy'],
  Politics:      ['politics','pmln','pti','ppp','election','senator','prime minister','imran khan','shehbaz','zardari','nawaz','vote','assembly','opposition','parliament','political','coalition'],
  Government:    ['government policy','federal','cabinet','ministry','budget','tax','ordinance','legislation','supreme court','high court','chief justice','judiciary','sbp','state bank','nepra'],
  Entertainment: ['film','drama','actor','actress','celebrity','lollywood','bollywood','music','singer','award','showbiz','drama serial','mahira','fawad','hum tv'],
  Economy:       ['sbp','imf','rupee','inflation','gdp','trade','export','import','fiscal','monetary','stock exchange','kse','budget','tax'],
  Crime:         ['murder','robbery','arrested','police','fir','kidnap','gang','drug','trafficking','corruption','fraud','theft','blast','target killing','encounter','rangers','fia','raid','criminal','accused','sentenced'],
  Editorials:    ['editorial','opinion','analysis','perspective','commentary','op-ed'],
  Columns:       ['column','columnist','op-ed'],
  International: ['usa','united states','india','china','russia','ukraine','israel','iran','saudi','uae','britain','europe','nato','trump','modi','un','g20','war','ceasefire','diplomacy','foreign'],
  National:      ['pakistan','karachi','lahore','islamabad','peshawar','quetta','sindh','punjab','kpk','khyber','balochistan','multan','rawalpindi'],
};

const CAT_KEYS = {
  Weather:       'weather',
  Bulletins:     'bulletins',
  Sports:        'sports',
  Politics:      'politics',
  Government:    'government',
  Entertainment: 'entertainment',
  Economy:       'economy',
  Crime:         'crime',
  Editorials:    'editorials',
  Columns:       'columns',
  International: 'international',
  National:      'national',
};

function detectCat(title, excerpt) {
  const txt = `${title} ${excerpt}`.toLowerCase();
  // Check international first for non-Pakistan foreign stories
  const isPakistani = PAKISTAN_KEYWORDS.some(k => txt.includes(k));

  const order = ['Weather','Bulletins','Sports','Politics','Government','Entertainment','Economy','Crime','Editorials','Columns','International','National'];
  for (const cat of order) {
    if (CATS[cat]?.some(k => txt.includes(k))) {
      // If category is International but story mentions Pakistan → National
      if (cat === 'International' && isPakistani) return 'National';
      // If category is National but no Pakistan keywords → keep it National anyway (fallback)
      return cat;
    }
  }
  return 'National';
}

// ── GEMINI: REWRITE SHORT BODY ────────────────────────────────
async function rewriteBody(title, excerpt, cat) {
  const prompt = `You are a senior journalist at Ek Awaz News Pakistan.
Write a complete 850-word news article in HTML format.

STRICT RULES:
- Write ONLY flowing HTML using <p> and <h2> tags
- NO bullet points, NO numbered lists, NO em dashes (—)
- NEVER use: Furthermore, Moreover, Additionally, In conclusion, It is worth noting, Notably, Crucial, Pivotal, Robust, Leverage, Groundbreaking
- Active voice. Short varied sentences. Dawn.com journalist style.
- Output HTML only. No markdown. No backticks. Just the HTML.

STRUCTURE (aim for 850 words):
<h2>Opening</h2>
<p>Lead: who, what, when, where — most important fact first.</p>
<p>Key details and figures.</p>
<h2>Background and Context</h2>
<p>Why this happened. History. What led here.</p>
<h2>Impact on Pakistan</h2>
<p>How this affects Pakistani citizens, government, or economy.</p>
<h2>Official Response</h2>
<p>What officials, experts, or spokespeople said.</p>
<h2>What Happens Next</h2>
<p>Upcoming steps, what to watch.</p>
<p>Closing paragraph with significance.</p>

Category: ${cat}
Title: ${title}
Context: ${excerpt}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CFG.GEMINI}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
        }),
      }
    );
    const d = await r.json();
    if (d.error) { console.log('  Gemini error:', d.error.message); return ''; }
    const body = (d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    return body
      .replace(/```html?\n?/g, '').replace(/```\n?/g, '')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^#+\s+(.+)$/gm, (m, t) => `<h2>${t}</h2>`)
      .replace(/ — /g, '. ').replace(/—/g, ' ')
      .trim();
  } catch (e) {
    console.log('  Gemini:', e.message);
    return '';
  }
}

// ── FETCH ALL POSTS ───────────────────────────────────────────
async function fetchAllPosts() {
  const posts = [];
  let nextPage = null;
  do {
    const url = `${CFG.FB_BASE}/ekawaz_posts?pageSize=100${nextPage ? `&pageToken=${nextPage}` : ''}&key=${CFG.FB_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    (d.documents || []).forEach(doc => {
      const f = doc.fields || {};
      posts.push({
        docId:    doc.name.split('/').pop(),
        id:       f.id?.integerValue || '',
        title:    f.title?.stringValue || '',
        body:     f.body?.stringValue || '',
        excerpt:  f.excerpt?.stringValue || f.seoDesc?.stringValue || '',
        category: f.category?.stringValue || '',
        cat_key:  f.cat_key?.stringValue || '',
        author:   f.author?.stringValue || '',
        status:   f.status?.stringValue || '',
        date:     f.date?.stringValue || '',
      });
    });
    nextPage = d.nextPageToken || null;
  } while (nextPage);
  return posts.filter(p => p.status === 'published' && p.title);
}

// ── UPDATE POST IN FIREBASE ───────────────────────────────────
async function updatePost(docId, fields) {
  const fieldPaths = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string')  body.fields[k] = { stringValue: v };
    else if (typeof v === 'boolean') body.fields[k] = { booleanValue: v };
  }
  try {
    const r = await fetch(
      `${CFG.FB_BASE}/ekawaz_posts/${docId}?${fieldPaths}&key=${CFG.FB_KEY}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    return r.ok;
  } catch (e) {
    console.log('  Update error:', e.message);
    return false;
  }
}

// ── UPDATE TICKER ─────────────────────────────────────────────
async function updateTicker(posts) {
  const sorted    = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  const headlines = sorted.slice(0, 15).map(p => `• ${p.title}`);
  try {
    const body = {
      fields: {
        ticker:          { stringValue: headlines.join('\n') },
        tickerUpdatedAt: { stringValue: new Date().toISOString() },
      },
    };
    const r = await fetch(
      `${CFG.FB_BASE}/ekawaz/main?updateMask.fieldPaths=ticker&updateMask.fieldPaths=tickerUpdatedAt&key=${CFG.FB_KEY}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (r.ok) console.log(`✅ Ticker updated with ${headlines.length} headlines`);
    else console.log('❌ Ticker update failed:', await r.text());
  } catch (e) {
    console.log('Ticker error:', e.message);
  }
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('   EK AWAZ NEWS — FIX EXISTING POSTS v2');
  console.log(`   ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`);
  console.log('════════════════════════════════════════════════\n');

  console.log('📡 Fetching all posts from Firebase...');
  const posts = await fetchAllPosts();
  console.log(`📰 Found ${posts.length} published posts\n`);

  let catFixed    = 0;
  let bodyFixed   = 0;
  let authorFixed = 0;
  let dupeDeleted = 0;

  // ── 1. REMOVE DUPLICATES ─────────────────────────────────────
  console.log('🔍 Checking for duplicate articles...');
  const seenKeys    = new Map();
  const dupesToDelete = [];

  for (const post of posts) {
    const key   = post.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().slice(0, 60);
    const words = post.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    let isDupe  = false;

    for (const [, storedWords] of seenKeys.values()) {
      const matches = words.filter(w => storedWords.includes(w)).length;
      if (matches >= 5) { isDupe = true; break; }
    }

    if (seenKeys.has(key) || isDupe) {
      dupesToDelete.push(post.docId);
      console.log(`  🗑️  Duplicate: "${post.title.slice(0, 55)}"`);
    } else {
      seenKeys.set(key, [key, words]);
    }
  }

  for (const docId of dupesToDelete) {
    try {
      const r = await fetch(
        `${CFG.FB_BASE}/ekawaz_posts/${docId}?key=${CFG.FB_KEY}`,
        { method: 'DELETE' }
      );
      if (r.ok) dupeDeleted++;
    } catch (e) {
      console.log('  Delete error:', e.message);
    }
    await sleep(300);
  }
  console.log(`✅ Deleted ${dupeDeleted} duplicates\n`);

  const remaining = posts.filter(p => !dupesToDelete.includes(p.docId));

  // ── 2. FIX CATEGORIES, AUTHOR, SHORT BODIES ──────────────────
  console.log('🔧 Fixing categories, authors, and short articles...\n');

  for (const [i, post] of remaining.entries()) {
    const updates    = {};
    let needsUpdate  = false;

    // Fix author
    if (post.author !== CFG.AUTHOR) {
      updates.author = CFG.AUTHOR;
      authorFixed++;
      needsUpdate = true;
    }

    // Fix category using smart detection
    const correctCat = detectCat(post.title, post.excerpt);
    const correctKey = CAT_KEYS[correctCat] || 'national';

    if (post.category !== correctCat || post.cat_key !== correctKey) {
      updates.category = correctCat;
      updates.cat_key  = correctKey;
      catFixed++;
      needsUpdate = true;
      console.log(`  📂 [${i+1}/${remaining.length}] "${post.category}" → "${correctCat}" | "${post.title.slice(0, 45)}"`);
    }

    // Fix short body — less than 1200 characters of text = too short
    const bodyText = (post.body || '').replace(/<[^>]*>/g, '').trim();
    if (bodyText.length < 1200 && post.excerpt) {
      console.log(`  ✍️  [${i+1}/${remaining.length}] Rewriting (${bodyText.length} chars → 850 words) | "${post.title.slice(0, 45)}"`);
      const newBody = await rewriteBody(post.title, post.excerpt, correctCat);
      if (newBody && newBody.length > 500) {
        updates.body = newBody;
        bodyFixed++;
        needsUpdate = true;
      }
      await sleep(2500);
    }

    if (needsUpdate) {
      const ok = await updatePost(post.docId, updates);
      if (ok) console.log(`  ✅ Updated: "${post.title.slice(0, 50)}"`);
      await sleep(600);
    }
  }

  // ── 3. UPDATE TICKER ─────────────────────────────────────────
  console.log('\n📺 Updating news ticker...');
  await updateTicker(remaining);

  // ── SUMMARY ──────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════');
  console.log(`   🗑️  Duplicates deleted:     ${dupeDeleted}`);
  console.log(`   📂  Categories fixed:       ${catFixed}`);
  console.log(`   ✍️   Short bodies rewritten:  ${bodyFixed}`);
  console.log(`   👤  Author names fixed:     ${authorFixed}`);
  console.log(`   📺  Ticker updated:         ✅`);
  console.log('════════════════════════════════════════════════\n');
  console.log('✅ Done! All existing posts fixed.\n');
}

main().catch(e => {
  console.error('💥 Fatal:', e.message);
  console.error(e.stack);
  process.exit(1);
});
