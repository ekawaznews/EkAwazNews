// ============================================================
// EK AWAZ NEWS — PAGE GENERATOR v5.0
// Creates individual HTML pages for every article
// Features: Share buttons (WhatsApp, FB, Twitter, Copy Link)
// Full SEO meta tags, Open Graph, Schema.org NewsArticle
// Author: Umer Javed on every page
// Run: node generate-pages.js
// ============================================================

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const CFG = {
  FB_KEY:   "AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8",
  FB_BASE:  "https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents",
  SITE_URL: "https://ekawaznews.github.io",
  SITE_NAME:"Ek Awaz News",
  LOGO_URL: "https://raw.githubusercontent.com/ekawaznews/ekawaznews.github.io/main/ek-awaz-logo.png",
  NEWS_DIR: "./news",
};

// ── SLUG GENERATOR ────────────────────────────────────────────
function toSlug(title, id) {
  const slug = (title || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return `${slug}-${id}`;
}

// ── FORMAT DATE ───────────────────────────────────────────────
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-PK", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi"
    });
  } catch { return iso || ""; }
}

// ── GET CATEGORY COLOR ────────────────────────────────────────
function getCatColor(cat) {
  const colors = {
    "Politics":"#CC0000","Government":"#8B0000","Sports":"#1a6b1a",
    "Entertainment":"#7c3aed","Weather":"#0369a1","International":"#b45309",
    "Crime":"#991b1b","Editorials":"#374151","Bulletins":"#CC0000",
    "National":"#CC0000","Columns":"#6b21a8",
  };
  return colors[cat] || "#CC0000";
}

// ── GENERATE ARTICLE HTML PAGE ────────────────────────────────
function generateArticlePage(post) {
  const {
    id, title, body, excerpt, author, category, date,
    image, tags, seoTitle, seoDesc, sourceUrl, sourceName, type
  } = post;

  const slug      = toSlug(title, id);
  const pageUrl   = `${CFG.SITE_URL}/news/${slug}.html`;
  const catColor  = getCatColor(category);
  const dateStr   = formatDate(date);
  const tagsArr   = Array.isArray(tags) ? tags : (tags || "").split(",").map(t => t.trim()).filter(Boolean);
  const imgSrc    = image || `${CFG.SITE_URL}/ek-awaz-logo.png`;
  const authorName = author || "Umer Javed";
  const safeTitle  = (seoTitle || title || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const safeDesc   = (seoDesc || excerpt || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const safeImg    = imgSrc.replace(/"/g, "%22");

  // WhatsApp share text
  const waText = encodeURIComponent(`📰 ${title}\n\nRead more: ${pageUrl}\n\nEk Awaz News — ایک آواز نیوز`);
  const fbUrl  = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
  const twUrl  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(safeTitle)}&url=${encodeURIComponent(pageUrl)}&via=ekawaznews`;
  const waUrl  = `https://wa.me/?text=${waText}`;
  const liUrl  = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(safeTitle)}`;

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — ${CFG.SITE_NAME}</title>
<meta name="description" content="${safeDesc}">
<meta name="keywords" content="${tagsArr.join(", ")}">
<meta name="author" content="${authorName}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${pageUrl}">

<!-- Open Graph -->
<meta property="og:type" content="article">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${safeImg}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="${CFG.SITE_NAME}">
<meta property="article:published_time" content="${date}">
<meta property="article:author" content="${authorName}">
<meta property="article:section" content="${category}">
${tagsArr.map(t => `<meta property="article:tag" content="${t}">`).join("\n")}

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDesc}">
<meta name="twitter:image" content="${safeImg}">
<meta name="twitter:site" content="@ekawaznews">

<!-- Schema.org NewsArticle -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "${safeTitle.replace(/"/g, '\\"')}",
  "description": "${safeDesc.replace(/"/g, '\\"')}",
  "image": ["${safeImg}"],
  "datePublished": "${date}",
  "dateModified": "${date}",
  "author": {
    "@type": "Person",
    "name": "${authorName}",
    "url": "${CFG.SITE_URL}/about.html"
  },
  "publisher": {
    "@type": "Organization",
    "name": "${CFG.SITE_NAME}",
    "logo": {
      "@type": "ImageObject",
      "url": "${CFG.LOGO_URL}"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "${pageUrl}"
  },
  "articleSection": "${category}",
  "keywords": "${tagsArr.join(", ")}",
  "url": "${pageUrl}",
  "inLanguage": "en-PK"
}
</script>

<link rel="icon" href="/ek-awaz-logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700;900&family=Open+Sans:wght@400;600;700&display=swap">

<style>
/* ── RESET & BASE ─────────────────────────────────────── */
*{margin:0;padding:0;box-sizing:border-box;}
:root{
  --red:#CC0000; --red-dark:#990000; --red-light:#fff0f0;
  --text:#1a1a1a; --text-light:#555; --text-muted:#888;
  --bg:#f5f2ef; --white:#ffffff;
  --border:#e8e3df; --shadow:0 2px 12px rgba(0,0,0,0.08);
}
body{font-family:'Open Sans',Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.7;font-size:16px;}

/* ── TOP BAR ──────────────────────────────────────────── */
.top-bar{background:#1a1a1a;padding:7px 20px;display:flex;justify-content:space-between;align-items:center;font-size:12px;border-bottom:3px solid var(--red);}
.top-bar a{color:#bbb;text-decoration:none;transition:color .2s;}
.top-bar a:hover{color:white;}
.top-links{display:flex;gap:16px;}

/* ── HEADER ───────────────────────────────────────────── */
header{background:var(--white);box-shadow:var(--shadow);position:sticky;top:0;z-index:1000;}
.header-inner{max-width:1200px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:20px;}
.logo{display:flex;align-items:center;gap:12px;text-decoration:none;}
.logo img{width:50px;height:50px;border-radius:50%;object-fit:cover;border:2px solid var(--red);}
.logo-name{font-family:'Merriweather',Georgia,serif;font-size:20px;font-weight:900;color:var(--red);}
.logo-urdu{font-size:12px;color:var(--text-muted);display:block;margin-top:1px;}
.header-nav{display:flex;gap:6px;flex-wrap:wrap;}
.header-nav a{padding:6px 12px;border-radius:5px;text-decoration:none;font-size:13px;font-weight:600;color:var(--text-light);transition:all .2s;}
.header-nav a:hover,.header-nav a.active{background:var(--red);color:white;}

/* ── BREADCRUMB ───────────────────────────────────────── */
.breadcrumb{max-width:900px;margin:20px auto 0;padding:0 20px;font-size:13px;color:var(--text-muted);}
.breadcrumb a{color:var(--red);text-decoration:none;}
.breadcrumb a:hover{text-decoration:underline;}
.breadcrumb span{margin:0 6px;color:#ccc;}

/* ── MAIN LAYOUT ──────────────────────────────────────── */
.main{max-width:900px;margin:20px auto 40px;padding:0 20px;}

/* ── ARTICLE CARD ─────────────────────────────────────── */
.article-card{background:var(--white);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);}

/* ── CATEGORY BADGE ───────────────────────────────────── */
.cat-badge{display:inline-block;background:${catColor};color:white;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;padding:5px 14px;border-radius:4px;}

/* ── ARTICLE HEADER ───────────────────────────────────── */
.art-header{padding:28px 32px 20px;}
.art-title{font-family:'Merriweather',Georgia,serif;font-size:28px;font-weight:900;color:var(--text);line-height:1.35;margin:14px 0 18px;}
.art-meta{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--text-muted);padding-bottom:16px;border-bottom:2px solid var(--border);}
.art-meta .author{display:flex;align-items:center;gap:8px;font-weight:700;color:var(--text);}
.author-avatar{width:36px;height:36px;background:var(--red);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;flex-shrink:0;}
.meta-sep{color:#ddd;}

/* ── SHARE BAR (top) ──────────────────────────────────── */
.share-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:16px 32px;background:var(--red-light);border-bottom:1px solid var(--border);}
.share-label{font-size:13px;font-weight:700;color:var(--text-light);margin-right:4px;}
.share-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none;cursor:pointer;border:none;transition:all .2s;white-space:nowrap;}
.share-btn:hover{opacity:.88;transform:translateY(-1px);}
.share-wa{background:#25D366;color:white;}
.share-fb{background:#1877F2;color:white;}
.share-tw{background:#000000;color:white;}
.share-li{background:#0A66C2;color:white;}
.share-copy{background:#f3f4f6;color:#374151;border:1px solid #d1d5db;}
.share-copy:hover{background:#e5e7eb;}

/* ── FEATURED IMAGE ───────────────────────────────────── */
.art-image-wrap{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#f0eded;}
.art-image-wrap img{width:100%;height:100%;object-fit:cover;display:block;}
.img-caption{font-size:12px;color:var(--text-muted);padding:8px 32px;background:var(--bg);font-style:italic;}

/* ── ARTICLE BODY ─────────────────────────────────────── */
.art-body{padding:28px 32px;}
.art-body p{font-size:17px;line-height:1.85;color:#333;margin-bottom:20px;}
.art-body h2{font-family:'Merriweather',Georgia,serif;font-size:22px;font-weight:700;color:var(--text);margin:32px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--border);}
.art-body h3{font-size:19px;font-weight:700;color:var(--text);margin:24px 0 10px;}
.art-body strong{font-weight:700;color:var(--text);}
.art-body em{font-style:italic;}
.art-body blockquote{border-left:4px solid var(--red);padding:14px 20px;background:var(--red-light);margin:20px 0;border-radius:0 8px 8px 0;font-style:italic;font-size:16px;color:#555;}

/* ── IN-ARTICLE AD PLACEHOLDER ────────────────────────── */
.art-ad{background:#f9f9f9;border:1px dashed #ddd;border-radius:8px;padding:16px;text-align:center;font-size:12px;color:#aaa;margin:24px 0;}

/* ── SHARE BAR (bottom) ───────────────────────────────── */
.share-bar-bottom{background:var(--bg);border-top:2px solid var(--border);border-bottom:2px solid var(--border);padding:20px 32px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}

/* ── TAGS ─────────────────────────────────────────────── */
.tags-section{padding:20px 32px;border-top:1px solid var(--border);}
.tags-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:10px;}
.tags-wrap{display:flex;flex-wrap:wrap;gap:8px;}
.tag{background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600;color:var(--text-light);text-decoration:none;transition:all .2s;}
.tag:hover{background:var(--red);color:white;border-color:var(--red);}

/* ── SOURCE ───────────────────────────────────────────── */
.source-note{padding:14px 32px 20px;font-size:12px;color:var(--text-muted);}
.source-note a{color:var(--red);}

/* ── RELATED ARTICLES ─────────────────────────────────── */
.related{margin-top:28px;background:var(--white);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);}
.related-header{background:#1a1a1a;color:white;padding:14px 24px;font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px;}
.related-list{padding:8px 0;}
.related-item{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--border);text-decoration:none;color:var(--text);transition:background .2s;}
.related-item:last-child{border:none;}
.related-item:hover{background:var(--red-light);}
.related-thumb{width:80px;height:56px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#f0eded;}
.related-info .related-cat{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--red);margin-bottom:4px;}
.related-info .related-title{font-size:14px;font-weight:700;color:var(--text);line-height:1.4;}
.related-info .related-time{font-size:11px;color:var(--text-muted);margin-top:4px;}

/* ── FOOTER ───────────────────────────────────────────── */
footer{background:#1a1a1a;color:#aaa;margin-top:40px;}
.footer-inner{max-width:1200px;margin:0 auto;padding:40px 20px;display:grid;grid-template-columns:2fr 1fr 1fr;gap:40px;}
.footer-brand .fn{font-family:'Merriweather',serif;font-size:22px;font-weight:900;color:white;margin-bottom:10px;}
.footer-brand p{font-size:13px;line-height:1.7;color:#aaa;max-width:280px;}
.footer-col h4{font-size:14px;font-weight:700;color:white;margin-bottom:14px;text-transform:uppercase;letter-spacing:.5px;}
.footer-col a{display:block;font-size:13px;color:#aaa;text-decoration:none;margin-bottom:8px;transition:color .2s;}
.footer-col a:hover{color:var(--red);}
.footer-bottom{border-top:1px solid #333;padding:16px 20px;text-align:center;font-size:12px;color:#666;max-width:1200px;margin:0 auto;}

/* ── COPY TOAST ───────────────────────────────────────── */
.toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(80px);background:#1a1a1a;color:white;padding:12px 24px;border-radius:50px;font-size:14px;font-weight:600;z-index:9999;transition:transform .3s;pointer-events:none;}
.toast.show{transform:translateX(-50%) translateY(0);}

/* ── RESPONSIVE ───────────────────────────────────────── */
@media(max-width:700px){
  .art-title{font-size:22px;}
  .art-header,.art-body,.share-bar,.share-bar-bottom,.tags-section,.source-note{padding-left:18px;padding-right:18px;}
  .header-inner{flex-direction:column;gap:10px;padding:12px 16px;}
  .header-nav a{padding:5px 10px;font-size:12px;}
  .art-body p{font-size:16px;}
  .footer-inner{grid-template-columns:1fr;}
  .share-btn{padding:7px 10px;font-size:12px;}
}
@media(max-width:480px){
  .art-title{font-size:19px;}
  .share-bar,.share-bar-bottom{justify-content:center;}
}
</style>
</head>
<body>

<!-- TOP BAR -->
<div class="top-bar">
  <a href="/">🏠 Ek Awaz News | ایک آواز نیوز</a>
  <div class="top-links">
    <a href="/about.html">About</a>
    <a href="/contact.html">Contact</a>
    <a href="/privacy.html">Privacy</a>
  </div>
</div>

<!-- HEADER -->
<header>
  <div class="header-inner">
    <a href="/" class="logo">
      <img src="/ek-awaz-logo.png" alt="Ek Awaz News Logo" onerror="this.style.background='#CC0000'">
      <div>
        <span class="logo-name">Ek Awaz News</span>
        <span class="logo-urdu">ایک آواز نیوز</span>
      </div>
    </a>
    <nav class="header-nav">
      <a href="/">Home</a>
      <a href="/#politics">Politics</a>
      <a href="/#sports">Sports</a>
      <a href="/#weather" class="${category === "Weather" ? "active" : ""}">Weather</a>
      <a href="/#international">International</a>
      <a href="/#crime">Crime</a>
      <a href="/about.html">About</a>
    </nav>
  </div>
</header>

<!-- BREADCRUMB -->
<div class="breadcrumb">
  <a href="/">Home</a>
  <span>›</span>
  <a href="/#${category.toLowerCase()}">${category}</a>
  <span>›</span>
  <span>${(title || "").slice(0, 50)}${(title || "").length > 50 ? "..." : ""}</span>
</div>

<!-- MAIN -->
<main class="main">
  <article class="article-card" itemscope itemtype="https://schema.org/NewsArticle">

    <!-- ARTICLE HEADER -->
    <div class="art-header">
      <span class="cat-badge">${category.toUpperCase()}</span>
      <h1 class="art-title" itemprop="headline">${title || ""}</h1>
      <div class="art-meta">
        <div class="author" itemprop="author" itemscope itemtype="https://schema.org/Person">
          <div class="author-avatar">${authorName.charAt(0)}</div>
          <div>
            <span itemprop="name">${authorName}</span>
            <div style="font-size:11px;font-weight:400;color:var(--text-muted);">${type === "Column" ? "Senior Analyst" : type === "Bulletin" ? "News Desk" : category === "Weather" ? "Weather Correspondent" : category === "Crime" ? "Senior Reporter" : category === "International" ? "International Correspondent" : category === "Sports" ? "Sports Reporter" : "Staff Reporter"}</div>
          </div>
        </div>
        <span class="meta-sep">|</span>
        <span>🕒 ${dateStr}</span>
        <span class="meta-sep">|</span>
        <span>📖 ${Math.ceil((body || "").replace(/<[^>]*>/g, "").split(" ").length / 200)} min read</span>
        <span class="meta-sep">|</span>
        <span style="background:${catColor};color:white;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;">${category}</span>
      </div>
    </div>

    <!-- SHARE BAR TOP -->
    <div class="share-bar">
      <span class="share-label">Share:</span>
      <a class="share-btn share-wa" href="${waUrl}" target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.016.5 3.917 1.383 5.571L0 24l6.59-1.367A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.785 9.785 0 01-5.031-1.388l-.361-.214-3.741.775.797-3.639-.234-.373A9.778 9.778 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
        WhatsApp
      </a>
      <a class="share-btn share-fb" href="${fbUrl}" target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073C24 5.4 18.627 0 12 0S0 5.4 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.932-1.956 1.887v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
        Facebook
      </a>
      <a class="share-btn share-tw" href="${twUrl}" target="_blank" rel="noopener noreferrer" aria-label="Share on Twitter">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Twitter
      </a>
      <a class="share-btn share-li" href="${liUrl}" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        LinkedIn
      </a>
      <button class="share-btn share-copy" onclick="copyLink('${pageUrl}')" aria-label="Copy link">
        🔗 Copy Link
      </button>
    </div>

    <!-- FEATURED IMAGE -->
    <div class="art-image-wrap">
      <img
        src="${imgSrc}"
        alt="${safeTitle}"
        itemprop="image"
        loading="eager"
        onerror="this.src='${CFG.LOGO_URL}';this.style.objectFit='contain';this.style.padding='20px';"
      >
    </div>
    <div class="img-caption">📷 Photo: ${sourceName || "Ek Awaz News"} | ekawaznews.github.io</div>

    <!-- ARTICLE BODY -->
    <div class="art-body" itemprop="articleBody">
      ${body || `<p>${excerpt || "Article content loading..."}</p>`}

      <!-- IN-ARTICLE AD -->
      <div class="art-ad">
        <!-- Google AdSense Ad Unit — In Article -->
        <ins class="adsbygoogle"
          style="display:block;text-align:center;"
          data-ad-layout="in-article"
          data-ad-format="fluid"
          data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
          data-ad-slot="XXXXXXXXXX"></ins>
        <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
      </div>
    </div>

    <!-- SHARE BAR BOTTOM -->
    <div class="share-bar-bottom">
      <span class="share-label">📤 Share this article:</span>
      <a class="share-btn share-wa" href="${waUrl}" target="_blank" rel="noopener noreferrer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.016.5 3.917 1.383 5.571L0 24l6.59-1.367A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.785 9.785 0 01-5.031-1.388l-.361-.214-3.741.775.797-3.639-.234-.373A9.778 9.778 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
        WhatsApp
      </a>
      <a class="share-btn share-fb" href="${fbUrl}" target="_blank" rel="noopener noreferrer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M24 12.073C24 5.4 18.627 0 12 0S0 5.4 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.932-1.956 1.887v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
        Facebook
      </a>
      <a class="share-btn share-tw" href="${twUrl}" target="_blank" rel="noopener noreferrer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Twitter
      </a>
      <button class="share-btn share-copy" onclick="copyLink('${pageUrl}')">🔗 Copy Link</button>
    </div>

    <!-- TAGS -->
    <div class="tags-section">
      <div class="tags-label">🏷️ Tags</div>
      <div class="tags-wrap">
        ${tagsArr.map(t => `<a href="/#search=${encodeURIComponent(t)}" class="tag">${t}</a>`).join("")}
      </div>
    </div>

    <!-- SOURCE -->
    ${sourceName || sourceUrl ? `
    <div class="source-note">
      📌 Source: ${sourceName || "News Agency"}${sourceUrl ? ` — <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer nofollow">Original Article</a>` : ""}
    </div>` : ""}

  </article>

  <!-- RELATED ARTICLES (loaded dynamically) -->
  <div class="related" id="related-section" style="display:none;">
    <div class="related-header">📰 Related News</div>
    <div class="related-list" id="related-list"></div>
  </div>

</main>

<!-- FOOTER -->
<footer>
  <div class="footer-inner">
    <div class="footer-brand">
      <div class="fn">Ek Awaz News</div>
      <p>Pakistan's trusted digital news platform delivering accurate, timely coverage 24/7. ایک آواز نیوز — One Voice, Every Story.</p>
      <div style="display:flex;gap:12px;margin-top:16px;font-size:22px;">
        <a href="#" title="Facebook" style="color:#1877f2;">📘</a>
        <a href="#" title="Twitter/X" style="color:#aaa;">🐦</a>
        <a href="#" title="YouTube" style="color:#ff4444;">▶️</a>
        <a href="#" title="Instagram" style="color:#e1306c;">📸</a>
        <a href="#" title="WhatsApp" style="color:#25d366;">💬</a>
      </div>
    </div>
    <div class="footer-col">
      <h4>Sections</h4>
      <a href="/#politics">Politics</a>
      <a href="/#government">Government</a>
      <a href="/#sports">Sports</a>
      <a href="/#entertainment">Entertainment</a>
      <a href="/#weather">Weather</a>
      <a href="/#international">International</a>
      <a href="/#crime">Crime</a>
      <a href="/#national">National</a>
    </div>
    <div class="footer-col">
      <h4>Ek Awaz</h4>
      <a href="/about.html">About Us</a>
      <a href="/contact.html">Contact</a>
      <a href="/privacy.html">Privacy Policy</a>
      <a href="/">Home</a>
    </div>
  </div>
  <div class="footer-bottom">
    © 2026 Ek Awaz News | ایک آواز نیوز — All Rights Reserved &nbsp;·&nbsp;
    Authored by <strong style="color:#CC0000;">Umer Javed</strong>
  </div>
</footer>

<!-- COPY TOAST -->
<div class="toast" id="toast">✅ Link copied to clipboard!</div>

<script>
// ── COPY LINK ─────────────────────────────────────────────────
function copyLink(url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(showToast);
  } else {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast();
  }
}
function showToast() {
  const t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── LOAD RELATED ARTICLES ─────────────────────────────────────
async function loadRelated() {
  try {
    const cat = "${category}";
    const currentId = "${id}";
    const r = await fetch(
      "https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents/ekawaz_posts?pageSize=50&key=AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8"
    );
    const d = await r.json();
    const all = (d.documents || []).map(doc => {
      const f = doc.fields || {};
      return {
        id:       f.id?.integerValue || "",
        title:    f.title?.stringValue || "",
        category: f.category?.stringValue || "",
        image:    f.image?.stringValue || "",
        date:     f.date?.stringValue || "",
      };
    });

    // Filter: same category, not current article, has title
    const related = all
      .filter(a => a.category === cat && String(a.id) !== String(currentId) && a.title)
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);

    if (related.length === 0) return;

    const list = document.getElementById('related-list');
    list.innerHTML = related.map(a => {
      const slug = a.title.toLowerCase().replace(/[^\\w\\s-]/g,"").replace(/\\s+/g,"-").replace(/-+/g,"-").slice(0,70) + "-" + a.id;
      const timeAgo = getTimeAgo(a.date);
      return \`<a href="/news/\${slug}.html" class="related-item">
        <img class="related-thumb" src="\${a.image || '/ek-awaz-logo.png'}" alt="\${a.title}" loading="lazy" onerror="this.style.display='none'">
        <div class="related-info">
          <div class="related-cat">\${a.category}</div>
          <div class="related-title">\${a.title.slice(0,80)}\${a.title.length>80?'...':''}</div>
          <div class="related-time">🕒 \${timeAgo}</div>
        </div>
      </a>\`;
    }).join('');

    document.getElementById('related-section').style.display = 'block';
  } catch(e) { console.log('Related articles error:', e.message); }
}

function getTimeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

// ── TRACK VIEW ────────────────────────────────────────────────
async function trackView() {
  try {
    const docId = "post_${id}";
    const url = "https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents/ekawaz_posts/" + docId + "?key=AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8";
    const r = await fetch(url);
    const d = await r.json();
    const views = Number(d.fields?.views?.integerValue || 0) + 1;
    await fetch(url + "&updateMask.fieldPaths=views", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { views: { integerValue: String(views) } } })
    });
  } catch(e) {}
}

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadRelated();
  setTimeout(trackView, 3000);
});
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// FETCH ALL POSTS FROM FIREBASE
// ─────────────────────────────────────────────────────────────
async function fetchAllPosts() {
  const posts = [];
  let nextPage = null;

  do {
    const url = `${CFG.FB_BASE}/ekawaz_posts?pageSize=100${nextPage ? `&pageToken=${nextPage}` : ""}&key=${CFG.FB_KEY}`;
    const r = await fetch(url);
    const d = await r.json();

    (d.documents || []).forEach(doc => {
      const f = doc.fields || {};
      posts.push({
        id:         f.id?.integerValue || doc.name.split("/").pop().replace("post_", ""),
        title:      f.title?.stringValue || "",
        body:       f.body?.stringValue || "",
        excerpt:    f.seoDesc?.stringValue || f.excerpt?.stringValue || "",
        author:     f.author?.stringValue || "Umer Javed",
        category:   f.category?.stringValue || "National",
        date:       f.date?.stringValue || new Date().toISOString(),
        image:      f.image?.stringValue || "",
        tags:       f.tags?.arrayValue?.values?.map(v => v.stringValue) || [],
        seoTitle:   f.seoTitle?.stringValue || "",
        seoDesc:    f.seoDesc?.stringValue || "",
        sourceUrl:  f.sourceUrl?.stringValue || "",
        sourceName: f.sourceName?.stringValue || "",
        type:       f.type?.stringValue || "Article",
        status:     f.status?.stringValue || "published",
      });
    });

    nextPage = d.nextPageToken || null;
  } while (nextPage);

  return posts.filter(p => p.status === "published" && p.title);
}

// ─────────────────────────────────────────────────────────────
// BUILD SLUG INDEX (for homepage to link to real pages)
// ─────────────────────────────────────────────────────────────
function buildSlugIndex(posts) {
  const index = {};
  posts.forEach(p => {
    const slug = toSlug(p.title, p.id);
    index[String(p.id)] = `/news/${slug}.html`;
  });
  return index;
}

// ─────────────────────────────────────────────────────────────
// MAIN — Generate all pages
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log("════════════════════════════════════════════");
  console.log("   📄 EK AWAZ NEWS — PAGE GENERATOR v5.0");
  console.log(`   ⏰  ${new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`);
  console.log("════════════════════════════════════════════\n");

  // Create news directory
  if (!fs.existsSync(CFG.NEWS_DIR)) {
    fs.mkdirSync(CFG.NEWS_DIR, { recursive: true });
    console.log(`📁 Created: ${CFG.NEWS_DIR}/`);
  }

  // Fetch all posts
  console.log("📡 Fetching posts from Firebase...");
  const posts = await fetchAllPosts();
  console.log(`📰 Found ${posts.length} published posts\n`);

  if (posts.length === 0) {
    console.log("⚠️  No posts found. Make sure autopost.js has run first.");
    return;
  }

  // Build slug index
  const slugIndex = buildSlugIndex(posts);

  // Generate HTML page for each post
  let generated = 0;
  let skipped = 0;

  for (const post of posts) {
    try {
      const slug = toSlug(post.title, post.id);
      const filePath = path.join(CFG.NEWS_DIR, `${slug}.html`);

      // Skip if already exists (save time on re-runs)
      if (fs.existsSync(filePath)) {
        skipped++;
        continue;
      }

      const html = generateArticlePage(post);
      fs.writeFileSync(filePath, html, "utf8");
      generated++;

      if (generated % 10 === 0) {
        console.log(`   ✅ Generated ${generated} pages...`);
      }
    } catch(e) {
      console.log(`   ❌ Error for "${post.title.slice(0,40)}":`, e.message);
    }
  }

  // Save slug index JSON (used by index.html to link to pages)
  const indexPath = path.join(CFG.NEWS_DIR, "slug-index.json");
  fs.writeFileSync(indexPath, JSON.stringify(slugIndex, null, 2), "utf8");
  console.log(`\n📋 Slug index saved: news/slug-index.json (${Object.keys(slugIndex).length} entries)`);

  console.log("\n════════════════════════════════════════════");
  console.log(`   ✅ Generated: ${generated} new pages`);
  console.log(`   ⏭️  Skipped (already exist): ${skipped}`);
  console.log(`   📁 Location: ./news/*.html`);
  console.log(`   🌐 Example: ${CFG.SITE_URL}/news/${toSlug(posts[0]?.title || "article", posts[0]?.id || "1")}.html`);
  console.log("════════════════════════════════════════════\n");
}

main().catch(e => { console.error("💥 Fatal:", e); process.exit(1); });
