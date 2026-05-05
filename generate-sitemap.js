// EK AWAZ NEWS — SITEMAP GENERATOR v8.0 (Firebase Admin)
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

function initFirebase() {
  if (getApps().length === 0) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return getFirestore();
}

const SITE = 'https://ekawaznews.github.io';

function toSlug(title, id) {
  return (title||'').toLowerCase().replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,70)+'-'+id;
}

async function main() {
  console.log('🗺️  Generating sitemaps...');
  const db = initFirebase();

  const snap = await db.collection('ekawaz_posts').where('status','==','published').get();
  const posts = [];
  snap.forEach(doc => { const d = doc.data(); if (d.title && d.id) posts.push({title:d.title,id:d.id,date:d.date||new Date().toISOString(),cat:d.category||'National'}); });
  posts.sort((a,b) => new Date(b.date)-new Date(a.date));

  // News sitemap (last 2 days)
  const twoDaysAgo = Date.now() - 2*24*60*60*1000;
  const recent = posts.filter(p => new Date(p.date).getTime() > twoDaysAgo);

  const newsSM = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${recent.map(p=>{const slug=toSlug(p.title,p.id);const safe=p.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');return`  <url><loc>${SITE}/news/${slug}.html</loc><news:news><news:publication><news:name>Ek Awaz News</news:name><news:language>en</news:language></news:publication><news:publication_date>${p.date}</news:publication_date><news:title>${safe}</news:title><news:keywords>${p.cat}, Pakistan, Pakistani News, Ek Awaz News</news:keywords></news:news><changefreq>hourly</changefreq><priority>0.9</priority></url>`;}).join('\n')}
</urlset>`;
  fs.writeFileSync('news-sitemap.xml', newsSM, 'utf8');
  console.log(`✅ news-sitemap.xml: ${recent.length} articles`);

  // Full sitemap
  const fullSM = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE}/about.html</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${SITE}/contact.html</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${SITE}/privacy.html</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
${posts.map(p=>`  <url><loc>${SITE}/news/${toSlug(p.title,p.id)}.html</loc><lastmod>${p.date}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('\n')}
</urlset>`;
  fs.writeFileSync('sitemap.xml', fullSM, 'utf8');
  console.log(`✅ sitemap.xml: ${posts.length} total articles`);
}

main().catch(e => { console.error('💥 Fatal:', e); process.exit(1); });
