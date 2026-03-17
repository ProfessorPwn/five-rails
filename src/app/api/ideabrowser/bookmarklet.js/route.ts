import { NextResponse } from "next/server";

// Serves the bookmarklet script that runs on ideabrowser.com
// The script extracts ideas from the page DOM and POSTs them to Five Rails
export async function GET() {
  // The bookmarklet script — runs in the user's browser on ideabrowser.com
  const script = `
(function() {
  // Prevent double-run
  if (window.__fiveRailsCapturing) return;
  window.__fiveRailsCapturing = true;

  var FIVE_RAILS_URL = document.querySelector('script[src*="bookmarklet.js"]')?.src?.match(/^(https?:\\/\\/[^/]+)/)?.[1] || 'http://localhost:3000';
  var ideas = [];
  var pageUrl = window.location.href;

  // Show status overlay
  var overlay = document.createElement('div');
  overlay.id = '__five_rails_overlay';
  overlay.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;background:#0a0c14;border:1px solid #f59e0b;border-radius:12px;padding:16px 24px;font-family:system-ui;color:#e2e8f0;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:280px;';
  overlay.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div style="width:12px;height:12px;border:2px solid #f59e0b;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div><b style="color:#f59e0b">Five Rails</b> Capturing...</div><div id="__fr_status" style="font-size:12px;color:#94a3b8">Scanning page...</div>';
  var style = document.createElement('style');
  style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
  overlay.appendChild(style);
  document.body.appendChild(overlay);
  var statusEl = document.getElementById('__fr_status');

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

  // Strategy 1: __NEXT_DATA__ (Next.js hydration)
  try {
    var nextScript = document.getElementById('__NEXT_DATA__');
    if (nextScript) {
      var nextData = JSON.parse(nextScript.textContent);
      var props = nextData?.props?.pageProps;
      if (props) {
        findIdeasInObject(props, ideas, pageUrl, 0);
      }
    }
  } catch(e) { console.log('Five Rails: __NEXT_DATA__ parse error', e); }

  // Strategy 2: Look for self.__next_f (Next.js App Router streaming data)
  try {
    if (window.__next_f) {
      for (var i = 0; i < window.__next_f.length; i++) {
        var chunk = window.__next_f[i];
        if (Array.isArray(chunk) && chunk[1]) {
          var text = typeof chunk[1] === 'string' ? chunk[1] : '';
          // Try to find JSON objects in the RSC stream
          var jsonMatches = text.match(/\\{[^{}]*"title"[^{}]*\\}/g);
          if (jsonMatches) {
            for (var j = 0; j < jsonMatches.length; j++) {
              try {
                var obj = JSON.parse(jsonMatches[j]);
                if (obj.title && obj.title.length > 3 && obj.title.length < 300) {
                  addIdea(ideas, obj, pageUrl);
                }
              } catch(e) {}
            }
          }
        }
      }
    }
  } catch(e) { console.log('Five Rails: __next_f parse error', e); }

  // Strategy 3: DOM card extraction
  try {
    var cards = document.querySelectorAll('[class*="card"], [class*="Card"], [class*="idea"], [class*="Idea"], [class*="item"], [class*="Item"], article, [role="listitem"]');
    setStatus('Found ' + cards.length + ' potential cards...');
    cards.forEach(function(card) {
      var titleEl = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"], [class*="name"], [class*="Name"], [class*="heading"]');
      if (!titleEl) return;
      var title = titleEl.textContent.trim();
      if (!title || title.length < 5 || title.length > 300) return;
      // Skip nav/footer text
      if (/^(menu|navigation|footer|copyright|privacy|terms|sign|log|register|subscribe|contact|about|faq|help)/i.test(title)) return;

      var descEl = card.querySelector('p, [class*="desc"], [class*="Desc"], [class*="summary"], [class*="Summary"], [class*="excerpt"]');
      var desc = descEl ? descEl.textContent.trim() : '';

      var catEl = card.querySelector('[class*="categ"], [class*="Categ"], [class*="badge"], [class*="Badge"], [class*="tag"], [class*="Tag"], [class*="vertical"], [class*="Vertical"]');
      var category = catEl ? catEl.textContent.trim() : '';

      var linkEl = card.querySelector('a[href]');
      var sourceUrl = linkEl ? (linkEl.href.startsWith('http') ? linkEl.href : 'https://www.ideabrowser.com' + linkEl.getAttribute('href')) : pageUrl;

      // Extract metrics from card text
      var cardText = card.textContent || '';
      var metrics = extractMetrics(cardText);

      ideas.push({
        title: title,
        description: desc || undefined,
        source_url: sourceUrl,
        category: category || undefined,
        search_volume: metrics.search_volume,
        growth_rate: metrics.growth_rate,
        pain_level: metrics.pain_level,
        revenue_potential: metrics.revenue_potential,
        execution_difficulty: metrics.execution_difficulty,
        feasibility: metrics.feasibility,
        target_market: metrics.target_market,
        competition: metrics.competition,
        go_to_market: metrics.go_to_market,
        pricing: metrics.pricing,
        sync_status: 'bookmarklet'
      });
    });
  } catch(e) { console.log('Five Rails: DOM extraction error', e); }

  // Deduplicate by title
  var seen = {};
  var unique = [];
  ideas.forEach(function(idea) {
    var key = idea.title.toLowerCase().trim();
    if (!seen[key]) {
      seen[key] = true;
      unique.push(idea);
    }
  });

  setStatus('Extracted ' + unique.length + ' unique ideas. Sending...');

  if (unique.length === 0) {
    overlay.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><b style="color:#f59e0b">Five Rails</b></div><div style="font-size:12px;color:#f87171;margin-top:8px">No ideas found on this page. Try navigating to the database or top-ideas page.</div>';
    setTimeout(function() { overlay.remove(); window.__fiveRailsCapturing = false; }, 5000);
    return;
  }

  // POST to Five Rails
  fetch(FIVE_RAILS_URL + '/api/ideabrowser/ideas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ideas: unique })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    overlay.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><b style="color:#10b981">Five Rails</b></div><div style="font-size:12px;color:#10b981;margin-top:8px">' + (data.imported || 0) + ' ideas imported, ' + (data.skipped || 0) + ' skipped (duplicates).</div><div style="font-size:11px;color:#64748b;margin-top:4px">This window will close in 5 seconds.</div>';
    setTimeout(function() { overlay.remove(); window.__fiveRailsCapturing = false; }, 5000);
  })
  .catch(function(err) {
    overlay.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><b style="color:#f87171">Five Rails</b></div><div style="font-size:12px;color:#f87171;margin-top:8px">Failed to send ideas: ' + err.message + '</div><div style="font-size:11px;color:#64748b;margin-top:4px">Make sure Five Rails is running on ' + FIVE_RAILS_URL + '</div>';
    setTimeout(function() { overlay.remove(); window.__fiveRailsCapturing = false; }, 8000);
  });

  function findIdeasInObject(obj, results, sourceUrl, depth) {
    if (depth > 6 || !obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(function(item) {
        if (item && typeof item === 'object' && !Array.isArray(item) && (item.title || item.name || item.headline)) {
          addIdea(results, item, sourceUrl);
        }
        findIdeasInObject(item, results, sourceUrl, depth + 1);
      });
    } else {
      if (obj.title || obj.name || obj.headline) {
        addIdea(results, obj, sourceUrl);
      }
      Object.values(obj).forEach(function(v) {
        findIdeasInObject(v, results, sourceUrl, depth + 1);
      });
    }
  }

  function addIdea(results, item, sourceUrl) {
    var title = String(item.title || item.name || item.headline || '').trim();
    if (!title || title.length < 5 || title.length > 300) return;
    results.push({
      title: title,
      description: item.description || item.summary || item.excerpt || undefined,
      source_url: item.url || item.source_url || sourceUrl,
      category: item.category || item.vertical || undefined,
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : item.tags || undefined,
      search_volume: String(item.search_volume || item.searchVolume || item.volume || ''),
      growth_rate: String(item.growth_rate || item.growthRate || item.growth || item.trend || ''),
      pain_level: String(item.pain_level || item.painLevel || item.pain || item.pain_score || ''),
      feasibility: String(item.feasibility || item.feasibility_score || ''),
      founder_fit: String(item.founder_fit || item.founderFit || item.fit || ''),
      revenue_potential: String(item.revenue_potential || item.revenuePotential || item.revenue || item.market_size || item.marketSize || ''),
      execution_difficulty: String(item.execution_difficulty || item.executionDifficulty || item.difficulty || ''),
      go_to_market: item.go_to_market || item.goToMarket || item.gtm || undefined,
      pricing: item.pricing || item.price || undefined,
      target_market: item.target_market || item.targetMarket || item.audience || undefined,
      competition: item.competition || item.competitors || undefined,
      sync_status: 'bookmarklet'
    });
  }

  function extractMetrics(text) {
    var m = {};
    var patterns = [
      [/search\\s*volume[:\\s]+([^,\\n<]{1,50})/i, 'search_volume'],
      [/growth(?:\\s*rate)?[:\\s]+([^,\\n<]{1,50})/i, 'growth_rate'],
      [/pain(?:\\s*level)?[:\\s]+([^,\\n<]{1,50})/i, 'pain_level'],
      [/revenue(?:\\s*potential)?[:\\s]+([^,\\n<]{1,50})/i, 'revenue_potential'],
      [/(?:execution\\s*)?difficulty[:\\s]+([^,\\n<]{1,50})/i, 'execution_difficulty'],
      [/feasibility[:\\s]+([^,\\n<]{1,50})/i, 'feasibility'],
      [/target\\s*(?:market|audience)[:\\s]+([^,\\n<]{1,80})/i, 'target_market'],
      [/competition[:\\s]+([^,\\n<]{1,80})/i, 'competition'],
    ];
    patterns.forEach(function(p) {
      var match = text.match(p[0]);
      if (match) m[p[1]] = match[1].trim();
    });
    return m;
  }
})();
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
