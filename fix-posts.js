// ============================================================
// EK AWAZ NEWS — FIX EXISTING POSTS v8.0
// Uses Firebase Admin SDK - fixes categories, author,
// rewrites short bodies, removes true duplicates
// Run ONCE via GitHub Actions
// ============================================================

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fetch from 'node-fetch';

function initFirebase() {
  if (getApps().length === 0) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return getFirestore();
}

const AUTHOR = 'Umer Javed';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Same category rules as autopost.js
const CAT_RULES = [
  { cat: 'Bulletins',     kws: ['breaking news','just in:','urgent:','flash:','developing story'] },
  { cat: 'Crime',         kws: ['murder','robbery','police arrested','fir registered','kidnapping','drug trafficking','corruption','fraud case','terrorist attack','bomb blast','target killing','rangers operation','fia raid','fia operation','criminal arrested','accused','sentenced','jail sentence','prison','killed in karachi','killed in lahore','shot dead','stabbed','dacoity','gang war','crime report','ctd operation'] },
  { cat: 'Sports',        kws: ['cricket','psl','pakistan super league','pcb','test match','odi cricket','t20 cricket','icc','world cup cricket','babar azam','shaheen afridi','naseem shah','mohammad rizwan','fakhar zaman','football match','hockey pakistan','olympics','asia cup','champions trophy','batting','bowling','wicket','innings','match result','tournament'] },
  { cat: 'Politics',      kws: ['pmln','pti','ppp','election','national assembly','provincial assembly','parliament','senate','prime minister','president of pakistan','imran khan','shehbaz sharif','asif zardari','nawaz sharif','maryam nawaz','bilawal bhutto','opposition leader','mna','mpa','political party','pdm','coalition government','bypolls','vote','ballot','speaker assembly'] },
  { cat: 'Government',    kws: ['federal cabinet','ministry of finance','ministry of interior','government policy','state bank of pakistan','sbp','income tax','budget 2026','ordinance','legislation','supreme court of pakistan','high court','chief justice','ogra','nepra','public service commission','ehsaas program','benazir income support'] },
  { cat: 'Entertainment', kws: ['pakistani drama','lollywood','bollywood','actor','actress','pakistani singer','hum awards','ary film','showbiz','ary digital','geo entertainment','hum tv','drama serial','mahira khan','fawad khan','atif aslam','sajal ali','hania amir','film premiere','box office','entertainment news'] },
  { cat: 'Weather',       kws: ['weather today','weather forecast','pakistan weather','rain alert','flood warning','heatwave','storm warning','cyclone','fog alert','monsoon rain','drought','pmd forecast','pakistan meteorological department','met office','weather karachi','weather lahore','weather islamabad','temperature'] },
  { cat: 'International', kws: ['united states','us president','american','india pakistan','china pakistan','russia ukraine','israel','iran nuclear','saudi arabia','united arab emirates','united kingdom','nato','united nations','trump','modi','white house','war news','ceasefire','diplomacy','foreign affairs','g20','imf pakistan','world bank','canada','australia','france','germany','turkey','afghanistan','kashmir','middle east','khalistani','csis'] },
  { cat: 'Editorials',    kws: ['opinion:','editorial:','analysis:','op-ed','viewpoint','columnist','commentary on'] },
  { cat: 'National',      kws: ['karachi','lahore','islamabad','peshawar','quetta','sindh','punjab','kpk','khyber pakhtunkhwa','balochistan','multan','rawalpindi','faisalabad','hyderabad','sialkot','gujranwala','sukkur','larkana','abbottabad','swat','gilgit','azad kashmir','pakistan'] },
];

function detectCat(title, excerpt) {
  const txt = `${title} ${excerpt}`.toLowerCase();
  for (const { cat, kws } of CAT_RULES) {
    if (kws.some(kw => txt.includes(kw))) return cat;
  }
  return 'National';
}

async function gemini(prompt) {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.75, maxOutputTokens: 2000 } })
      }
    );
    const d = await r.json();
    return (d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  } catch(e) { return ''; }
}

async function rewriteShortBody(title, excerpt, cat) {
  const body = await gemini(`You are a journalist at Ek Awaz News Pakistan.
Write a complete 800-word news article in HTML about this topic.
Use <p> for paragraphs and <h2> for headings.
NO bullet points. NO hyphens. NO em dashes. Active voice. Short sentences.
Sound like Dawn.com journalist.

Category: ${cat}
Title: ${title}
Available info: ${excerpt}

Write sections: lead paragraph, full details, background, impact on Pakistan, official statements, what happens next.
Bold key names with <strong>name</strong>.`);

  return (body || '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#+\s+(.+)$/gm, (m, t) => `<h2>${t}</h2>`)
    .replace(/^[-•]\s+(.+)$/gm, '<p>$1</p>')
    .replace(/ — /g, '. ').replace(/—/g, ' ')
    .trim();
}

async function main() {
  console.log('════════════════════════════════════════════');
  console.log('   🔧 EK AWAZ NEWS — FIX EXISTING POSTS');
  console.log(`   ⏰  ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`);
  console.log('════════════════════════════════════════════\n');

  const db = initFirebase();

  // Fetch ALL posts
  console.log('📡 Fetching all posts...');
  const snap = await db.collection('ekawaz_posts').get();
  const posts = [];
  snap.forEach(doc => {
    const d = doc.data();
    posts.push({ docId: doc.id, ...d });
  });
  console.log(`📰 Found ${posts.length} posts\n`);

  // ── STEP 1: Find true duplicates by title similarity ─────
  console.log('🔍 Finding duplicates...');
  const seen = new Map();
  const toDelete = [];

  for (const post of posts) {
    if (!post.title) continue;
    const key = post.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().slice(0, 55);
    const words = new Set(key.split(/\s+/).filter(w => w.length > 4));

    let isDupe = false;
    for (const [storedKey, storedWords] of seen.values()) {
      const matches = [...words].filter(w => storedWords.has(w)).length;
      if (key === storedKey || matches >= 4) { isDupe = true; break; }
    }

    if (isDupe) {
      toDelete.push(post.docId);
      console.log(`  🗑️  Dupe: "${post.title.slice(0, 55)}"`);
    } else {
      seen.set(post.docId, [key, words]);
    }
  }

  // Delete duplicates in batches
  console.log(`\n🗑️  Deleting ${toDelete.length} duplicates...`);
  const batch = db.batch();
  let batchCount = 0;
  for (const docId of toDelete) {
    batch.delete(db.collection('ekawaz_posts').doc(docId));
    batchCount++;
    if (batchCount === 400) {
      await batch.commit();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();
  console.log(`✅ Deleted ${toDelete.length} duplicates\n`);

  // ── STEP 2: Fix remaining posts ──────────────────────────
  const remaining = posts.filter(p => !toDelete.includes(p.docId) && p.title);
  console.log(`🔧 Fixing ${remaining.length} remaining posts...\n`);

  let catFixed = 0, authorFixed = 0, bodyFixed = 0;

  for (const [i, post] of remaining.entries()) {
    try {
      const updates = {};
      let needsUpdate = false;

      // Fix author
      if (post.author !== AUTHOR) {
        updates.author = AUTHOR;
        authorFixed++;
        needsUpdate = true;
      }

      // Fix category
      const correctCat = detectCat(post.title, post.excerpt || '');
      const correctKey = correctCat.toLowerCase()
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-').replace(/^-|-$/g, '') || 'national';

      if (post.category !== correctCat) {
        updates.category = correctCat;
        updates.cat_key = correctKey;
        updates.categories = [correctCat];
        catFixed++;
        needsUpdate = true;
        console.log(`  📂 [${i+1}] Cat: "${post.category}" → "${correctCat}" | "${post.title.slice(0, 45)}"`);
      }

      // Fix short body (under 500 chars of actual text)
      const bodyText = (post.body || '').replace(/<[^>]*>/g, '').trim();
      if (bodyText.length < 500 && process.env.GEMINI_API_KEY) {
        console.log(`  ✍️  [${i+1}] Rewriting short body (${bodyText.length} chars)...`);
        const newBody = await rewriteShortBody(post.title, post.excerpt || post.title, correctCat);
        if (newBody && newBody.replace(/<[^>]*>/g, '').trim().length > 300) {
          updates.body = newBody;
          bodyFixed++;
          needsUpdate = true;
        }
        await sleep(3000); // Gemini rate limit
      }

      if (needsUpdate) {
        await db.collection('ekawaz_posts').doc(post.docId).update(updates);
        console.log(`  ✅ Fixed: "${post.title.slice(0, 50)}"`);
        await sleep(200);
      }
    } catch(e) {
      console.log(`  ⚠️  Error on "${post.title?.slice(0,40)}":`, e.message);
    }
  }

  // ── STEP 3: Update ticker with latest posts ───────────────
  console.log('\n📺 Updating ticker...');
  try {
    const recentSnap = await db.collection('ekawaz_posts')
      .where('status', '==', 'published')
      .orderBy('date', 'desc')
      .limit(15)
      .get();

    const headlines = [];
    recentSnap.forEach(doc => {
      const d = doc.data();
      if (d.title) headlines.push(`• ${d.title}`);
    });

    if (headlines.length > 0) {
      await db.collection('ekawaz').doc('main').set(
        { ticker: headlines, tickerUpdatedAt: new Date().toISOString() },
        { merge: true }
      );
      console.log(`✅ Ticker updated: ${headlines.length} headlines`);
    }
  } catch(e) { console.log('❌ Ticker:', e.message); }

  console.log('\n════════════════════════════════════════════');
  console.log(`   🗑️  Duplicates deleted:     ${toDelete.length}`);
  console.log(`   📂  Categories fixed:       ${catFixed}`);
  console.log(`   ✍️   Short bodies rewritten:  ${bodyFixed}`);
  console.log(`   👤  Authors fixed:           ${authorFixed}`);
  console.log(`   📺  Ticker updated:          ✅`);
  console.log('════════════════════════════════════════════\n');
}

main().catch(e => { console.error('💥 Fatal:', e); process.exit(1); });
