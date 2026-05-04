// ============================================================
// EK AWAZ NEWS — NEWS SITEMAP GENERATOR
// Auto-generates news-sitemap.xml from Firebase posts
// Google News requires this for indexing
// Run: node generate-sitemap.js
// ============================================================

import fetch from 'node-fetch';
import fs from 'fs';

const FB_KEY  = "AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8";
const FB_BASE = "https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents";
const SITE    = "https://ekawaznews.github.io";

function toSlug(title, id) {
  return (title || "").toLowerCase()
    .replace(/[^\w\s-]/g,"").replace(/\s+/g,"-")
    .replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,70) + "-" + id;
}

async function main() {
  console.log("📡 Fetching posts for sitemap...");

  const posts = [];
  let nextPage = null;

  do {
    const url = `${FB_BASE}/ekawaz_posts?pageSize=200${nextPage?`&pageToken=${nextPage}`:""}&key=${FB_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    (d.documents||[]).forEach(doc => {
      const f = doc.fields||{};
      const title = f.title?.stringValue||"";
      const id    = f.id?.integerValue||doc.name.split("/").pop().replace("post_","");
      const date  = f.date?.stringValue||new Date().toISOString();
      const cat   = f.category?.stringValue||"National";
      const status= f.status?.stringValue||"published";
      if(status==="published"&&title) posts.push({title,id,date,cat});
    });
    nextPage = d.nextPageToken||null;
  } while(nextPage);

  console.log(`📰 Found ${posts.length} posts`);

  // Sort by date newest first
  posts.sort((a,b) => new Date(b.date) - new Date(a.date));

  // ── NEWS SITEMAP (Google News — last 2 days only) ─────────
  const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
  const recentPosts = posts.filter(p => new Date(p.date).getTime() > twoDaysAgo);

  const newsSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${recentPosts.map(p => {
  const slug = toSlug(p.title, p.id);
  const pubDate = new Date(p.date).toISOString().split("T")[0];
  const safeTitle = p.title.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  return `
  <url>
    <loc>${SITE}/news/${slug}.html</loc>
    <news:news>
      <news:publication>
        <news:name>Ek Awaz News</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${p.date}</news:publication_date>
      <news:title>${safeTitle}</news:title>
      <news:keywords>${p.cat}, Pakistan, Pakistani News, Ek Awaz News</news:keywords>
    </news:news>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
    <lastmod>${p.date}</lastmod>
  </url>`;
}).join("")}
</urlset>`;

  fs.writeFileSync("news-sitemap.xml", newsSitemap, "utf8");
  console.log(`✅ news-sitemap.xml: ${recentPosts.length} recent articles`);

  // ── FULL SITEMAP (all articles) ───────────────────────────
  const fullSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

  <url><loc>${SITE}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE}/about.html</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${SITE}/contact.html</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${SITE}/privacy.html</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>

${posts.map(p => {
  const slug = toSlug(p.title, p.id);
  return `  <url>
    <loc>${SITE}/news/${slug}.html</loc>
    <lastmod>${p.date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
}).join("\n")}
</urlset>`;

  fs.writeFileSync("sitemap.xml", fullSitemap, "utf8");
  console.log(`✅ sitemap.xml: ${posts.length} total articles`);
  console.log("\n🎉 Sitemaps generated successfully!");
}

main().catch(e => { console.error("💥 Error:", e); process.exit(1); });
