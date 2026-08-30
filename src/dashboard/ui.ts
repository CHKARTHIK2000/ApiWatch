export function renderDashboardHtml(dashboardPath: string = '/__apiwatch'): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ApiWatch — Performance Diagnosis</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
            dark: { 950: '#070a13', 900: '#0d1322', 800: '#141d33', 700: '#1e2b4a', 600: '#2d3e66' }
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    code, pre, .font-mono { font-family: 'JetBrains Mono', monospace; }
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: #0d1322; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #2d3e66; border-radius: 3px; }
  </style>
</head>
<body class="bg-dark-950 text-slate-100 min-h-screen custom-scrollbar antialiased">

  <!-- TOP NAV -->
  <header class="border-b border-dark-700 bg-dark-900/90 backdrop-blur sticky top-0 z-40">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-violet-600 flex items-center justify-center font-black text-white shadow-lg shadow-indigo-500/25 text-lg">
          👁️
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="font-extrabold text-base tracking-tight text-white">ApiWatch</span>
            <span class="text-[11px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold font-mono">DEBUGGER</span>
          </div>
          <p class="text-[11px] text-slate-400">Root-Cause Performance Diagnosis</p>
        </div>
      </div>

      <div class="flex items-center space-x-3">
        <div class="flex items-center space-x-2 bg-dark-800 px-3 py-1.5 rounded-lg border border-dark-700 text-xs">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span class="text-slate-300 font-medium text-[11px]" id="live-indicator">Live Monitoring</span>
        </div>

        <button onclick="fetchData()" class="px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 border border-dark-700 text-xs font-semibold text-slate-200 transition">
          🔄 Refresh
        </button>
      </div>
    </div>
  </header>

  <!-- MAIN CONTAINER -->
  <main class="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

    <!-- 1. DIAGNOSIS HERO FEED (PROBLEMS FIRST) -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-extrabold text-white tracking-tight flex items-center space-x-2" id="hero-title">
            <span>🚨 Detected Performance Problems</span>
          </h2>
          <p class="text-xs text-slate-400" id="hero-subtitle">Immediate diagnosis and root-cause attribution</p>
        </div>
        <div id="problem-count-badge" class="px-3 py-1 rounded-full text-xs font-bold font-mono">
          <!-- Count badge -->
        </div>
      </div>

      <!-- Problem Diagnosis Cards Container -->
      <div id="problems-feed" class="space-y-4">
        <!-- Injected via JavaScript -->
      </div>
    </section>

    <!-- 2. ENDPOINT HEALTH DIRECTORY (CLEAN & SCANNABLE) -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-bold text-white tracking-tight">Endpoint Health Directory</h3>
          <p class="text-xs text-slate-400">Click any endpoint to inspect its SQL breakdown and execution trace</p>
        </div>
        <span class="text-xs text-slate-400 font-mono" id="total-endpoints-count"></span>
      </div>

      <div class="bg-dark-900 border border-dark-700/80 rounded-2xl overflow-hidden shadow-xl">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-300">
            <thead class="bg-dark-800/80 uppercase text-[11px] font-bold text-slate-400 border-b border-dark-700 tracking-wider">
              <tr>
                <th class="py-3.5 px-5">Endpoint Route</th>
                <th class="py-3.5 px-4">P95 Latency</th>
                <th class="py-3.5 px-4">Health</th>
                <th class="py-3.5 px-4">Primary Time Spent</th>
                <th class="py-3.5 px-4">Requests</th>
                <th class="py-3.5 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody id="endpoints-body" class="divide-y divide-dark-800 font-mono">
              <!-- Injected via JavaScript -->
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 3. RECENT REQUEST WATERFALL TIMELINE -->
    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-200">Recent Request Traces</h3>
        <span class="text-xs text-slate-500">Live stream</span>
      </div>
      <div id="traces-list" class="space-y-2">
        <!-- Injected via JavaScript -->
      </div>
    </section>

  </main>

  <!-- "WHY IS THIS SLOW?" INSPECTOR MODAL -->
  <div id="trace-modal" class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-dark-900 border border-dark-700 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
      
      <!-- Modal Header -->
      <div class="p-5 border-b border-dark-700 flex items-center justify-between bg-dark-800/50">
        <div>
          <div class="flex items-center space-x-2.5">
            <span id="modal-method" class="px-2 py-0.5 rounded bg-dark-700 text-indigo-300 font-mono text-xs font-bold"></span>
            <h3 class="font-bold text-white text-base font-mono" id="modal-route"></h3>
          </div>
          <span class="text-xs text-slate-400 font-mono mt-1 block" id="modal-traceid"></span>
        </div>
        <button onclick="closeModal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-dark-800 hover:bg-dark-700 text-slate-400 hover:text-white transition">✕</button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-6 custom-scrollbar text-xs" id="modal-body">
        <!-- Injected via JS -->
      </div>
    </div>
  </div>

  <!-- JAVASCRIPT LOGIC -->
  <script>
    const API_BASE = '${dashboardPath}/api';

    async function fetchData() {
      try {
        const [overview, endpoints, regressions, nplusone, traces] = await Promise.all([
          fetch(API_BASE + '/overview').then(r => r.json()),
          fetch(API_BASE + '/endpoints').then(r => r.json()),
          fetch(API_BASE + '/regressions').then(r => r.json()),
          fetch(API_BASE + '/n-plus-one').then(r => r.json()),
          fetch(API_BASE + '/traces?limit=15').then(r => r.json())
        ]);

        renderHeroProblems(regressions, nplusone, endpoints);
        renderEndpointsDirectory(endpoints);
        renderRecentTraces(traces);
      } catch (err) {
        console.error('Failed to load ApiWatch diagnostics:', err);
      }
    }

    function renderHeroProblems(regressions, nplusone, endpoints) {
      const container = document.getElementById('problems-feed');
      const badge = document.getElementById('problem-count-badge');
      const heroTitle = document.getElementById('hero-title');

      // Also detect any static slow endpoints (>500ms) even if baseline comparison is new
      const slowEndpoints = endpoints.filter(e => e.p95Ms >= 500 && !regressions.some(r => r.route === e.route));
      const totalProblems = (regressions ? regressions.length : 0) + (nplusone ? nplusone.length : 0) + slowEndpoints.length;

      if (totalProblems === 0) {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        badge.innerText = '0 ISSUES';
        heroTitle.innerHTML = '<span>✨ All Endpoints Running Fast</span>';
        container.innerHTML = \`
          <div class="bg-dark-900 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-2 shadow-lg bg-gradient-to-b from-dark-900 to-emerald-950/10">
            <div class="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center text-xl text-emerald-400">✓</div>
            <h4 class="font-bold text-white text-sm">Zero Performance Regressions or N+1 Leaks Detected</h4>
            <p class="text-xs text-slate-400 max-w-md mx-auto">Every tracked route is responding within healthy latency boundaries and database queries are optimized.</p>
          </div>
        \`;
        return;
      }

      badge.className = 'px-3 py-1 rounded-full text-xs font-bold font-mono bg-rose-500/15 text-rose-400 border border-rose-500/30';
      badge.innerText = totalProblems + ' PROBLEMS DETECTED';
      heroTitle.innerHTML = '<span>🚨 ' + totalProblems + ' Performance Problem' + (totalProblems > 1 ? 's' : '') + ' Detected</span>';

      let cardsHtml = '';

      // 1. Render Regression Diagnoses
      if (regressions && regressions.length > 0) {
        regressions.forEach(r => {
          const culprit = r.topCulpritQueries && r.topCulpritQueries.length > 0 ? r.topCulpritQueries[0] : null;
          cardsHtml += \`
            <div class="bg-dark-900 border-l-4 border-l-rose-500 border border-dark-700/80 rounded-2xl p-5 shadow-2xl space-y-4">
              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center space-x-2">
                    <span class="px-2 py-0.5 rounded bg-dark-800 text-rose-300 font-mono text-xs font-bold">\${r.method}</span>
                    <span class="font-mono text-base font-bold text-white">\${r.route}</span>
                    <span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[11px] font-bold font-mono">+\${r.increasePercentage}% SLOWDOWN</span>
                  </div>
                  <p class="text-xs text-slate-400 mt-1">P95 Latency: <strong class="text-rose-400 font-mono font-bold">\${r.currentP95Ms}ms</strong> (Baseline was \${r.baselineP95Ms}ms)</p>
                </div>
              </div>

              <!-- WHY IS THIS SLOW BOX -->
              <div class="bg-dark-950/80 border border-dark-700 rounded-xl p-4 space-y-2.5">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-rose-300 uppercase tracking-wider text-[10px] flex items-center space-x-1.5">
                    <span>🔍 WHY IS THIS SLOW?</span>
                  </span>
                  \${culprit ? \`<span class="text-rose-400 font-mono font-bold">Query took \${culprit.currentAvgMs}ms (+\${culprit.deltaMs}ms)</span>\` : ''}
                </div>
                <p class="text-xs text-slate-200">\${escapeHtml(r.suspectedCause)}</p>
                \${culprit ? \`
                  <div class="bg-dark-900 p-2.5 rounded-lg border border-dark-800 font-mono text-[11px] text-amber-200 overflow-x-auto">
                    \${escapeHtml(culprit.sampleSql)}
                  </div>
                \` : ''}
              </div>

              <!-- ACTIONABLE RECOMMENDATION -->
              <div class="flex items-center space-x-2 text-xs text-indigo-300 bg-indigo-950/20 border border-indigo-900/30 rounded-xl px-4 py-2.5">
                <span class="font-bold uppercase text-[10px] tracking-wider text-indigo-400">RECOMMENDED FIX:</span>
                <span class="text-slate-200">\${escapeHtml(r.recommendations[0] || 'Inspect handler CPU time and query execution plan')}</span>
              </div>
            </div>
          \`;
        });
      }

      // 2. Render N+1 Query Leaks
      if (nplusone && nplusone.length > 0) {
        nplusone.forEach(n => {
          cardsHtml += \`
            <div class="bg-dark-900 border-l-4 border-l-amber-500 border border-dark-700/80 rounded-2xl p-5 shadow-2xl space-y-4">
              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center space-x-2">
                    <span class="px-2 py-0.5 rounded bg-dark-800 text-amber-300 font-mono text-xs font-bold">\${n.method}</span>
                    <span class="font-mono text-base font-bold text-white">\${n.route}</span>
                    <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] font-bold font-mono">⚠️ N+1 QUERY LEAK</span>
                  </div>
                  <p class="text-xs text-slate-400 mt-1">Executes <strong class="text-amber-300 font-mono font-bold">\${n.avgQueriesPerRequest} queries</strong> per single request (Wasting ~\${n.avgTimeWastedMs}ms)</p>
                </div>
              </div>

              <!-- WHY BOX -->
              <div class="bg-dark-950/80 border border-dark-700 rounded-xl p-4 space-y-2">
                <span class="font-bold text-amber-300 uppercase tracking-wider text-[10px] block">🔍 REPEATED IN A LOOP:</span>
                <div class="bg-dark-900 p-2.5 rounded-lg border border-dark-800 font-mono text-[11px] text-amber-200 overflow-x-auto">
                  \${escapeHtml(n.queryFingerprint)}
                </div>
              </div>

              <!-- ACTIONABLE RECOMMENDATION -->
              <div class="flex items-center space-x-2 text-xs text-amber-200 bg-amber-950/20 border border-amber-900/30 rounded-xl px-4 py-2.5">
                <span class="font-bold uppercase text-[10px] tracking-wider text-amber-400">RECOMMENDED FIX:</span>
                <span class="text-slate-200">\${escapeHtml(n.recommendation)}</span>
              </div>
            </div>
          \`;
        });
      }

      // 3. Render Standalone Slow Endpoints (>500ms)
      slowEndpoints.forEach(s => {
        const isSqlHeavy = s.avgSqlDurationMs > (s.avgDurationMs * 0.6);
        cardsHtml += \`
          <div class="bg-dark-900 border-l-4 border-l-rose-500 border border-dark-700/80 rounded-2xl p-5 shadow-2xl space-y-4">
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center space-x-2">
                  <span class="px-2 py-0.5 rounded bg-dark-800 text-rose-300 font-mono text-xs font-bold">\${s.method}</span>
                  <span class="font-mono text-base font-bold text-white">\${s.route}</span>
                  <span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[11px] font-bold font-mono">SLOW ENDPOINT</span>
                </div>
                <p class="text-xs text-slate-400 mt-1">P95 Latency: <strong class="text-rose-400 font-mono font-bold">\${s.p95Ms}ms</strong></p>
              </div>
            </div>

            <div class="bg-dark-950/80 border border-dark-700 rounded-xl p-4 space-y-2">
              <span class="font-bold text-rose-300 uppercase tracking-wider text-[10px] block">🔍 PRIMARY BOTTLENECK:</span>
              <p class="text-xs text-slate-200">\${isSqlHeavy ? \`Database execution is consuming \${s.avgSqlDurationMs}ms of the total \${s.avgDurationMs}ms request time.\` : \`Application logic or external I/O delay is consuming most of the request duration.\`}</p>
            </div>
          </div>
        \`;
      });

      container.innerHTML = cardsHtml;
    }

    function renderEndpointsDirectory(endpoints) {
      const tbody = document.getElementById('endpoints-body');
      document.getElementById('total-endpoints-count').innerText = (endpoints ? endpoints.length : 0) + ' active routes';

      if (!endpoints || endpoints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-500 font-sans">No API requests recorded yet. Make a few API calls to start seeing live analytics!</td></tr>';
        return;
      }

      tbody.innerHTML = endpoints.map(e => {
        let healthBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">🟢 FAST</span>';
        if (e.p95Ms > 500) {
          healthBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">🔴 SLOW</span>';
        } else if (e.p95Ms > 100) {
          healthBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">🟡 MODERATE</span>';
        }

        const isDbBottleneck = e.avgSqlDurationMs >= (e.avgDurationMs * 0.5);
        const bottleneckText = e.avgSqlDurationMs === 0 ? 'App Logic' : (isDbBottleneck ? \`MySQL Database (\${e.avgSqlDurationMs}ms)\` : \`App Logic (\${Math.max(0, Math.round(e.avgDurationMs - e.avgSqlDurationMs))}ms)\`);

        return \`
          <tr class="hover:bg-dark-800/60 transition cursor-pointer" onclick="openEndpointDetail('\${e.route}')">
            <td class="py-3.5 px-5 font-bold text-white flex items-center space-x-2">
              <span class="px-1.5 py-0.5 rounded bg-dark-800 text-indigo-300 text-[10px]">\${e.method}</span>
              <span>\${e.route}</span>
            </td>
            <td class="py-3.5 px-4 font-bold \${e.p95Ms > 500 ? 'text-rose-400' : (e.p95Ms > 100 ? 'text-amber-400' : 'text-emerald-400')}">\${e.p95Ms}ms</td>
            <td class="py-3.5 px-4">\${healthBadge}</td>
            <td class="py-3.5 px-4 text-slate-300 text-[11px]">\${bottleneckText}</td>
            <td class="py-3.5 px-4 text-slate-400 font-sans">\${e.totalRequests.toLocaleString()}</td>
            <td class="py-3.5 px-5 text-right font-sans">
              <button class="px-2.5 py-1 rounded bg-dark-800 hover:bg-dark-700 text-indigo-300 text-[11px] font-medium border border-dark-700 transition">
                Inspect ➔
              </button>
            </td>
          </tr>
        \`;
      }).join('');
    }

    function renderRecentTraces(traces) {
      const container = document.getElementById('traces-list');
      if (!traces || traces.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-xs text-slate-500 font-sans">No recent requests recorded.</div>';
        return;
      }

      container.innerHTML = traces.map(t => {
        const isSlow = t.durationMs > 300;
        const sqlPercent = t.durationMs > 0 ? Math.min(100, Math.round((t.totalSqlMs / t.durationMs) * 100)) : 0;
        const appPercent = 100 - sqlPercent;

        return \`
          <div onclick="openTraceModal('\${t.traceId}')" class="cursor-pointer bg-dark-900/80 hover:bg-dark-800 border border-dark-700/80 rounded-xl p-3 transition space-y-2 shadow-sm">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center space-x-2 font-mono">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold \${t.statusCode >= 500 ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-dark-800 text-slate-300'}">\${t.statusCode}</span>
                <span class="font-bold text-white">\${t.method} \${t.route}</span>
              </div>
              <div class="flex items-center space-x-3 font-mono text-xs">
                <span class="text-slate-400 text-[11px]">\${t.queryCount} SQL queries (\${t.totalSqlMs}ms)</span>
                <span class="font-bold \${isSlow ? 'text-rose-400' : 'text-emerald-400'}">\${t.durationMs}ms</span>
              </div>
            </div>

            <!-- Visual Bar -->
            <div class="w-full bg-dark-800 rounded-full h-1.5 flex overflow-hidden">
              <div class="bg-indigo-500 h-full" style="width: \${appPercent}%" title="Application Logic: \${appPercent}%"></div>
              <div class="bg-amber-400 h-full" style="width: \${sqlPercent}%" title="SQL Execution: \${sqlPercent}%"></div>
            </div>
          </div>
        \`;
      }).join('');
    }

    async function openTraceModal(traceId) {
      const modal = document.getElementById('trace-modal');
      const body = document.getElementById('modal-body');
      modal.classList.remove('hidden');

      body.innerHTML = '<div class="text-center py-8 text-slate-400 font-sans">Loading trace details...</div>';

      try {
        const t = await fetch(API_BASE + '/trace/' + traceId).then(r => r.json());
        document.getElementById('modal-method').innerText = t.method;
        document.getElementById('modal-route').innerText = t.route;
        document.getElementById('modal-traceid').innerText = 'Trace ID: ' + t.traceId + ' • ' + new Date(t.timestamp).toLocaleTimeString();

        const sqlPercentage = t.durationMs > 0 ? Math.min(100, Math.round((t.totalSqlMs / t.durationMs) * 100)) : 0;
        const appDuration = Math.max(0, Math.round((t.durationMs - t.totalSqlMs) * 100) / 100);

        const queriesList = (t.queries || []).map((q, idx) => \`
          <div class="bg-dark-950 border border-dark-700 rounded-xl p-3.5 space-y-1.5 shadow">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-indigo-300 font-mono">Query #\${idx + 1} (\${q.driver})</span>
              <span class="font-mono font-bold text-amber-400">\${q.durationMs}ms</span>
            </div>
            <pre class="text-slate-300 text-[11px] overflow-x-auto p-2.5 bg-dark-900 rounded-lg border border-dark-800 font-mono">\${escapeHtml(q.rawSql)}</pre>
          </div>
        \`).join('');

        body.innerHTML = \`
          <!-- Summary Header Cards -->
          <div class="grid grid-cols-3 gap-3">
            <div class="bg-dark-950 p-3 rounded-xl border border-dark-700">
              <span class="text-slate-400 block text-[10px] uppercase tracking-wider font-bold">Total Request Time</span>
              <span class="text-lg font-bold text-white font-mono mt-0.5 block">\${t.durationMs}ms</span>
            </div>
            <div class="bg-dark-950 p-3 rounded-xl border border-dark-700">
              <span class="text-slate-400 block text-[10px] uppercase tracking-wider font-bold">App / Middleware</span>
              <span class="text-lg font-bold text-indigo-300 font-mono mt-0.5 block">\${appDuration}ms</span>
            </div>
            <div class="bg-dark-950 p-3 rounded-xl border border-dark-700">
              <span class="text-slate-400 block text-[10px] uppercase tracking-wider font-bold">Database (SQL) Time</span>
              <span class="text-lg font-bold text-amber-300 font-mono mt-0.5 block">\${t.totalSqlMs}ms (\${sqlPercentage}%)</span>
            </div>
          </div>

          <!-- Executed Queries Section -->
          <div class="space-y-3">
            <h4 class="font-bold text-white text-xs uppercase tracking-wider">Executed SQL Queries (\${(t.queries || []).length})</h4>
            <div class="space-y-2.5">
              \${queriesList.length ? queriesList : '<p class="text-slate-400 font-sans">No database queries executed in this request.</p>'}
            </div>
          </div>
        \`;
      } catch (err) {
        body.innerHTML = '<div class="text-center py-8 text-rose-400 font-sans">Failed to load trace.</div>';
      }
    }

    async function openEndpointDetail(route) {
      const traces = await fetch(API_BASE + '/traces?limit=1&route=' + encodeURIComponent(route)).then(r => r.json());
      if (traces.length > 0) {
        openTraceModal(traces[0].traceId);
      }
    }

    function closeModal() {
      document.getElementById('trace-modal').classList.add('hidden');
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Auto-fetch data and poll every 4 seconds
    fetchData();
    setInterval(fetchData, 4000);
  </script>
</body>
</html>
`;
}
