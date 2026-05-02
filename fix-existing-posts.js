#!/usr/bin/env node
// ============================================================
// EK AWAZ — ONE-TIME FIX SCRIPT
// Fixes all existing posts with empty or plain-text body
// Run once: node fix-existing-posts.js
// ============================================================

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const FIREBASE_KEY  = "AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8";
const FIREBASE_BASE = "https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents";

// Wrap plain text into HTML <p> tags
function wrapInParagraphs(text) {
  if (!text || text.trim() === '') return '';
  if (text.includes('<p>') || text.includes('<h2>')) return text; // already HTML — skip
  const paras = text
    .split(/\n{2,}|\n(?=[A-Z•\-])/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 10);
  if (paras.length === 0) return `<p>${text.trim()}</p>`;
  return paras.map(p => `<p>${p}</p>`).join('\n');
}

// Fetch all posts from Firebase (paginated)
async function fetchAllPosts() {
  const posts = [];
  let pageToken = null;

  do {
    const url = `${FIREBASE_BASE}/ekawaz_posts?pageSize=300&key=${FIREBASE_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (data.documents) {
      for (const doc of data.documents) {
        const f  = doc.fields || {};
        const id = doc.name.split('/').pop();
        posts.push({
          docId:   id,
          docName: doc.name,
          title:   f.title?.stringValue || '',
          body:    f.body?.stringValue   || '',
        });
      }
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return posts;
}

// Update body field in Firebase
async function updateBody(docId, newBody) {
  const url = `${FIREBASE_BASE}/ekawaz_posts/${docId}?updateMask.fieldPaths=body&key=${FIREBASE_KEY}`;
  const res  = await fetch(url, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields: { body: { stringValue: newBody } } }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firebase update failed (${res.status}): ${err.slice(0,100)}`);
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('================================================');
  console.log('EK AWAZ — Fix Existing Posts Body');
  console.log('================================================\n');

  console.log('Fetching all posts from Firebase...');
  const posts = await fetchAllPosts();
  console.log(`Total posts found: ${posts.length}\n`);

  let needsFix  = 0;
  let fixed     = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const post of posts) {
    const body = post.body || '';

    // Check if body needs fixing
    const isEmpty    = body.trim() === '';
    const isPlainTxt = body.length > 0 && !body.includes('<p>') && !body.includes('<h2>');

    if (!isEmpty && !isPlainTxt) {
      // Already has HTML — skip
      skipped++;
      continue;
    }

    needsFix++;

    if (isEmpty) {
      console.log(`[EMPTY]  "${post.title.slice(0,55)}" (id: ${post.docId})`);
      // Can't fix empty body without re-generating — mark with placeholder
      const placeholder = `<p>${post.title}</p><p>This article is being updated. Please check back shortly.</p>`;
      try {
        await updateBody(post.docId, placeholder);
        fixed++;
        console.log(`  → Placeholder added`);
      } catch(e) {
        errors++;
        console.log(`  → ERROR: ${e.message}`);
      }
    } else if (isPlainTxt) {
      console.log(`[PLAIN]  "${post.title.slice(0,55)}" (id: ${post.docId})`);
      const wrapped = wrapInParagraphs(body);
      try {
        await updateBody(post.docId, wrapped);
        fixed++;
        console.log(`  → Wrapped in <p> tags (${body.split('\n').filter(Boolean).length} paragraphs)`);
      } catch(e) {
        errors++;
        console.log(`  → ERROR: ${e.message}`);
      }
    }

    // Small delay to avoid Firebase rate limits
    await sleep(200);
  }

  console.log('\n================================================');
  console.log(`DONE`);
  console.log(`Total posts:     ${posts.length}`);
  console.log(`Already OK:      ${skipped}`);
  console.log(`Needed fix:      ${needsFix}`);
  console.log(`Fixed:           ${fixed}`);
  console.log(`Errors:          ${errors}`);
  console.log('================================================');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
