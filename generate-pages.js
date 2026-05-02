#!/usr/bin/env node
// ============================================================
// Ek Awaz News — Page Generator
// Runs every 30 min via GitHub Actions
// Fetches ALL published posts from Firebase
// Generates missing HTML pages in /news/
// Works for both auto-posted AND manually posted articles
// ============================================================

const fs   = require('fs');
const path = require('path');

const FIREBASE_PROJECT_ID = 'ekawaznews-a114a';
const FIREBASE_API_KEY    = 'AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8';
const FIRESTORE_BASE      = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const PAGES_DIR           = path.join(__dirname, 'news');
const SITE_URL            = 'https://ekawaznews.github.io';

// ─── MAIN ─────────────────────────────────────────────────────
async function main() {
  console.log('[PageGen] Ek Awaz Page Generator starting...');

  if (!fs.existsSync(PAGES_DIR)) fs.mkdirSync(PAGES_DIR, { recursive: true });

  // Load slug index (tracks which post IDs already have pages)
  const indexPath  = path.join(PAGES_DIR, 'slug-index.json');
  const slugIndex  = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {};

  // Fetch all posts from Firebase
  const posts = await fetchAllPosts();
  console.log(`[PageGen] ${posts.length} posts fetched from Firebase`);

  let generated = 0;

  for (const post of posts) {
    // Only process published posts
    if (post.status !== 'published') continue;

    const postId = String(post.id);

    // Skip if page already generated for this post ID
    if (slugIndex[postId] && fs.existsSync(path.join(PAGES_DIR, slugIndex[postId]))) {
      continue;
    }

    // Generate slug from title
    const slug     = makeSlug(post.title || 'news', postId);
    const filename = `${slug}.html`;

    // Attach slug and pageUrl to post object
    post.slug    = slug;
    post.pageUrl = `${SITE_URL}/news/${filename}`;

    // Generate the HTML page
    generateArticlePage(post);

    // Record in slug index
    slugIndex[postId] = filename;
    generated++;

    // Write pageUrl + slug back to Firebase so main site uses it for sharing
    await writePageUrlToFirebase(postId, post.pageUrl, post.slug);

    console.log(`[PageGen] Generated: news/${filename}`);
  }

  // Save updated slug index
  fs.writeFileSync(indexPath, JSON.stringify(slugIndex, null, 2), 'utf8');

  console.log(`[PageGen] Done. ${generated} new pages generated. ${Object.keys(slugIndex).length} total indexed.`);
}

// ─── FETCH ALL FIREBASE POSTS ─────────────────────────────────
async function fetchAllPosts() {
  const posts = [];
  let pageToken = null;

  do {
    const url = `${FIRESTORE_BASE}/ekawaz_posts?key=${FIREBASE_API_KEY}&pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res  = await fetch(url);
    if (!res.ok) { console.error('[Firebase] Fetch error:', res.status); break; }

    const data = await res.json();
    if (data.documents) {
      for (const doc of data.documents) {
        try {
          posts.push(fromFirestoreDoc(doc));
        } catch (e) {
          console.log('[PageGen] Skipping malformed doc:', e.message);
        }
      }
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return posts;
}

// ─── CONVERT FIRESTORE DOC TO PLAIN OBJECT ────────────────────
function fromFirestoreDoc(doc) {
  const fields = doc.fields || {};
  const obj    = {};
  for (const [k, v] of Object.entries(fields)) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj;
}

function fromFirestoreValue(v) {
  if ('stringValue'  in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue'  in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue'    in v) return null;
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue'     in v) {
    const m = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) m[k] = fromFirestoreValue(val);
    return m;
  }
  return null;
}

// ─── GENERATE ARTICLE HTML PAGE ───────────────────────────────
function generateArticlePage(post) {
  const isUrdu   = post.lang === 'ur';
  const dateStr  = new Date(post.date || Date.now()).toLocaleDateString('en-PK', { year:'numeric', month:'long', day:'numeric' });
  const readTime = Math.max(1, Math.ceil(((post.body||'').replace(/<[^>]+>/g,'').split(' ').length) / 200));
  const tags     = Array.isArray(post.tags) ? post.tags : [];
  const tagsHtml = tags.map(t => `<a href="${SITE_URL}/?tag=${enc(t)}" class="tag">${esc(t)}</a>`).join('');
  const pageUrl  = post.pageUrl;
  const author   = post.author || 'Umer Javed';
  const seoTitle = post.seoTitle || post.title || '';
  const seoDesc  = post.seoDesc  || post.excerpt || '';
  const category = post.category || 'General';
  const cat_key  = post.cat_key  || 'home-general';
  const series   = post.series   || '';

  const html = `<!DOCTYPE html>
<html lang="${isUrdu?'ur':'en'}" dir="${isUrdu?'rtl':'ltr'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(seoTitle)} | Ek Awaz News</title>
<meta name="description" content="${esc(seoDesc)}">
<meta name="author" content="${esc(author)}">
<meta name="keywords" content="${esc(tags.join(', '))}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${pageUrl}">
<link rel="icon" type="image/x-icon" href="${SITE_URL}/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="${SITE_URL}/favicon-32x32.png">
<link rel="apple-touch-icon" href="${SITE_URL}/apple-touch-icon.png">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(seoTitle)}">
<meta property="og:description" content="${esc(seoDesc)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:site_name" content="Ek Awaz News">
${post.image?`<meta property="og:image" content="${post.image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`:''}
<meta property="article:published_time" content="${post.date||''}">
<meta property="article:author" content="${esc(author)}">
<meta property="article:section" content="${esc(category)}">
${tags.map(t=>`<meta property="article:tag" content="${esc(t)}">`).join('')}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(seoTitle)}">
<meta name="twitter:description" content="${esc(seoDesc)}">
${post.image?`<meta name="twitter:image" content="${post.image}">`:''}
<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"${escJ(post.title||'')}","description":"${escJ(seoDesc)}","image":"${post.image||''}","datePublished":"${post.date||''}","dateModified":"${post.lastEditedAt||post.date||''}","author":{"@type":"Person","name":"${escJ(author)}"},"publisher":{"@type":"Organization","name":"Ek Awaz News","logo":{"@type":"ImageObject","url":"${SITE_URL}/ek-awaz-logo.png"}},"mainEntityOfPage":{"@type":"WebPage","@id":"${pageUrl}"},"articleSection":"${escJ(category)}","keywords":"${escJ(tags.join(', '))}"}</script>
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
      <a href="${SITE_URL}/?cat=${cat_key}">${esc(category)}</a> &rsaquo;
      ${esc((post.title||'').slice(0,50))}${(post.title||'').length>50?'&hellip;':''}
    </div>
    <span class="cat-tag">${esc(category)}</span>
    ${series?`<span class="cat-tag ser-tag">${esc(series)}</span>`:''}
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

// ─── HELPERS ─────────────────────────────────────────────────
function makeSlug(title, id) {
  const base = (title||'news')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70);
  const suffix = String(id).slice(-6);
  return `${base}-${suffix}`;
}

function esc(s)  { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escJ(s) { return (s||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,' '); }
function enc(s)  { return encodeURIComponent(s||''); }


// ─── WRITE pageUrl BACK TO FIREBASE ─────────────────────────
async function writePageUrlToFirebase(postId, pageUrl, slug) {
  try {
    const FIREBASE_API_KEY = 'AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8';
    const FIRESTORE_BASE   = 'https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents';
    const url = `${FIRESTORE_BASE}/ekawaz_posts/${String(postId)}?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=pageUrl&updateMask.fieldPaths=slug`;
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          pageUrl: { stringValue: pageUrl },
          slug:    { stringValue: slug },
        }
      }),
    });
  } catch(e) {
    console.log(`[PageGen] Firebase write-back skipped for ${postId}:`, e.message);
  }
}

// ─── RUN ─────────────────────────────────────────────────────
main().catch(e => { console.error('[PageGen] Fatal:', e.message); process.exit(1); });
