export function renderDashboardHtml(dashboardPath: string = '/__apiwatch'): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ApiWatch — Performance & Regression Debugger</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
            dark: { 900: '#0b0f19', 800: '#111827', 700: '#1f2937', 600: '#374151' }
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    code, pre, .font-mono { font-family: 'JetBrains Mono', monospace; }
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: #111827; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
  </style>
</head>
<body class="bg-dark-900 text-gray-100 min-h-screen custom-scrollbar">

  <!-- TOP NAV -->
  <header class="border-b border-dark-700 bg-dark-800/80 backdrop-blur sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30 text-lg tracking-wider">
          👁️
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="font-bold text-lg tracking-tight text-white">ApiWatch</span>
            <span class="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">v1.0.0</span>
          </div>
          <p class="text-xs text-gray-400">Zero-Config Performance & Regression Debugger</p>
        </div>
      </div>

      <div class="flex items-center space-x-4">
        <!-- Live status pulse -->
        <div class="flex items-center space-x-2 bg-dark-700/60 px-3 py-1.5 rounded-lg border border-dark-600 text-xs">
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span class="text-gray-300 font-medium" id="status-label">Monitoring Active</span>
        </div>

        <button onclick="fetchData()" class="px-3 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 border border-dark-600 text-xs font-medium text-gray-200 transition flex items-center space-x-1.5">
          <span>🔄 Refresh</span>
        </button>

        <button onclick="clearData()" class="px-3 py-1.5 rounded-lg bg-red-950/30 hover:bg-red-900/50 border border-red-800/40 text-xs font-medium text-red-300 transition">
          Clear DB
        </button>
      </div>
    </div>
  </header>

  <!-- MAIN CONTAINER -->
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

    <!-- KPI STATS CARDS -->
    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <div class="bg-dark-800 border border-dark-700 rounded-xl p-4 shadow-sm">
        <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Requests</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span id="kpi-requests" class="text-2xl font-bold text-white tracking-tight">0</span>
          <span class="text-xs text-gray-400" id="kpi-routes">0 routes</span>
        </div>
      </div>

      <div class="bg-dark-800 border border-dark-700 rounded-xl p-4 shadow-sm">
        <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">P95 Latency</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span id="kpi-p95" class="text-2xl font-bold text-emerald-400 tracking-tight">0ms</span>
          <span class="text-xs text-gray-400" id="kpi-avg">avg: 0ms</span>
        </div>
      </div>

      <div class="bg-dark-800 border border-dark-700 rounded-xl p-4 shadow-sm">
        <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Error Rate</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span id="kpi-errors" class="text-2xl font-bold text-gray-200 tracking-tight">0%</span>
          <span class="text-xs text-gray-400" id="kpi-error-count">0 errors</span>
        </div>
      </div>

      <div class="bg-dark-800 border border-rose-900/50 rounded-xl p-4 shadow-sm bg-gradient-to-br from-dark-800 to-rose-950/20">
        <span class="text-xs font-medium text-rose-300 uppercase tracking-wider">Regressions</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span id="kpi-regressions" class="text-2xl font-bold text-rose-400 tracking-tight">0</span>
          <span class="text-xs text-rose-300/80">root causes flagged</span>
        </div>
      </div>

      <div class="bg-dark-800 border border-amber-900/50 rounded-xl p-4 shadow-sm bg-gradient-to-br from-dark-800 to-amber-950/20">
        <span class="text-xs font-medium text-amber-300 uppercase tracking-wider">N+1 Issues</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span id="kpi-nplusone" class="text-2xl font-bold text-amber-400 tracking-tight">0</span>
          <span class="text-xs text-amber-300/80">loop patterns</span>
        </div>
      </div>
    </section>

    <!-- SECTION: REGRESSIONS & ROOT CAUSE DIAGNOSIS -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
            <span>🔴 Performance Regression Diagnosis</span>
          </h2>
          <p class="text-xs text-gray-400">Compares today's P95 response times to historical baseline and pinpoints exact query regressions</p>
        </div>
      </div>

      <div id="regressions-container" class="space-y-3">
        <!-- Populated via JS -->
      </div>
    </section>

    <!-- SECTION: N+1 QUERY DETECTION -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
            <span>⚠️ N+1 Query Bottlenecks</span>
          </h2>
          <p class="text-xs text-gray-400">Detects database queries repeatedly executed in a loop inside a single request</p>
        </div>
      </div>

      <div id="nplusone-container" class="space-y-3">
        <!-- Populated via JS -->
      </div>
    </section>

    <!-- TAB NAVIGATION -->
    <div class="border-b border-dark-700">
      <nav class="flex space-x-8">
        <button onclick="switchTab('endpoints')" id="tab-btn-endpoints" class="tab-btn border-b-2 border-indigo-500 py-3 text-sm font-semibold text-white">
          API Endpoints
        </button>
        <button onclick="switchTab('queries')" id="tab-btn-queries" class="tab-btn border-b-2 border-transparent py-3 text-sm font-semibold text-gray-400 hover:text-gray-200">
          SQL Query Analytics
        </button>
        <button onclick="switchTab('traces')" id="tab-btn-traces" class="tab-btn border-b-2 border-transparent py-3 text-sm font-semibold text-gray-400 hover:text-gray-200">
          Live Request Waterfall
        </button>
      </nav>
    </div>

    <!-- TAB 1: ENDPOINTS -->
    <section id="tab-content-endpoints" class="space-y-4">
      <div class="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-gray-300">
            <thead class="bg-dark-700/50 uppercase text-[11px] font-semibold text-gray-400 border-b border-dark-700">
              <tr>
                <th class="py-3 px-4">Method & Route</th>
                <th class="py-3 px-4">Requests</th>
                <th class="py-3 px-4">Avg</th>
                <th class="py-3 px-4">P50</th>
                <th class="py-3 px-4">P90</th>
                <th class="py-3 px-4 text-indigo-300">P95</th>
                <th class="py-3 px-4">P99</th>
                <th class="py-3 px-4">Avg SQL Time</th>
                <th class="py-3 px-4">SQL Count / Req</th>
                <th class="py-3 px-4">Error %</th>
              </tr>
            </thead>
            <tbody id="endpoints-table-body" class="divide-y divide-dark-700 font-mono">
              <!-- Populated via JS -->
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- TAB 2: SQL QUERIES -->
    <section id="tab-content-queries" class="space-y-4 hidden">
      <div class="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-gray-300">
            <thead class="bg-dark-700/50 uppercase text-[11px] font-semibold text-gray-400 border-b border-dark-700">
              <tr>
                <th class="py-3 px-4">Query Fingerprint</th>
                <th class="py-3 px-4">Route</th>
                <th class="py-3 px-4">Calls</th>
                <th class="py-3 px-4">Avg Duration</th>
                <th class="py-3 px-4 text-indigo-300">P95</th>
                <th class="py-3 px-4">Max Duration</th>
                <th class="py-3 px-4">Total Time Spent</th>
              </tr>
            </thead>
            <tbody id="queries-table-body" class="divide-y divide-dark-700 font-mono">
              <!-- Populated via JS -->
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- TAB 3: TRACES WATERFALL -->
    <section id="tab-content-traces" class="space-y-4 hidden">
      <div class="bg-dark-800 border border-dark-700 rounded-xl p-4 shadow-sm">
        <h3 class="text-sm font-semibold text-white mb-3">Recent Request Traces (Click to inspect breakdown)</h3>
        <div id="traces-list" class="space-y-2">
          <!-- Populated via JS -->
        </div>
      </div>
    </section>

  </main>

  <!-- TRACE MODAL -->
  <div id="trace-modal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-dark-800 border border-dark-700 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
      <div class="p-4 border-b border-dark-700 flex items-center justify-between bg-dark-700/40">
        <div>
          <h3 class="font-bold text-white text-sm" id="modal-title">Trace Details</h3>
          <span class="text-xs text-gray-400 font-mono" id="modal-subtitle"></span>
        </div>
        <button onclick="closeModal()" class="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-dark-600 transition">✕</button>
      </div>

      <div class="p-6 overflow-y-auto space-y-6 custom-scrollbar text-xs" id="modal-body">
        <!-- Trace details -->
      </div>
    </div>
  </div>

  <!-- SCRIPT -->
  <script>
    const API_BASE = '${dashboardPath}/api';
    let currentTab = 'endpoints';

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('border-indigo-500', 'text-white');
        btn.classList.add('border-transparent', 'text-gray-400');
      });
      document.getElementById('tab-btn-' + tab).classList.add('border-indigo-500', 'text-white');
      document.getElementById('tab-btn-' + tab).classList.remove('border-transparent', 'text-gray-400');

      document.getElementById('tab-content-endpoints').classList.toggle('hidden', tab !== 'endpoints');
      document.getElementById('tab-content-queries').classList.toggle('hidden', tab !== 'queries');
      document.getElementById('tab-content-traces').classList.toggle('hidden', tab !== 'traces');
    }

    async function fetchData() {
      try {
        const [overviewRes, endpointsRes, queriesRes, regressionsRes, nplusoneRes, tracesRes] = await Promise.all([
          fetch(API_BASE + '/overview').then(r => r.json()),
          fetch(API_BASE + '/endpoints').then(r => r.json()),
          fetch(API_BASE + '/slow-queries').then(r => r.json()),
          fetch(API_BASE + '/regressions').then(r => r.json()),
          fetch(API_BASE + '/n-plus-one').then(r => r.json()),
          fetch(API_BASE + '/traces').then(r => r.json())
        ]);

        renderOverview(overviewRes, regressionsRes, nplusoneRes);
        renderRegressions(regressionsRes);
        renderNPlusOne(nplusoneRes);
        renderEndpoints(endpointsRes);
        renderQueries(queriesRes);
        renderTraces(tracesRes);
      } catch (err) {
        console.error('Failed to load ApiWatch metrics:', err);
      }
    }

    function renderOverview(overview, regressions, nplusone) {
      document.getElementById('kpi-requests').innerText = (overview.totalRequests || 0).toLocaleString();
      document.getElementById('kpi-routes').innerText = (overview.distinctRoutes || 0) + ' routes';
      document.getElementById('kpi-p95').innerText = (overview.p95DurationMs || 0) + 'ms';
      document.getElementById('kpi-avg').innerText = 'avg: ' + (overview.avgDurationMs || 0) + 'ms';
      document.getElementById('kpi-errors').innerText = (overview.errorRate || 0) + '%';
      document.getElementById('kpi-error-count').innerText = (overview.errorCount || 0) + ' errors';
      document.getElementById('kpi-regressions').innerText = (regressions || []).length;
      document.getElementById('kpi-nplusone').innerText = (nplusone || []).length;

      const p95El = document.getElementById('kpi-p95');
      if (overview.p95DurationMs > 300) p95El.className = 'text-2xl font-bold text-rose-400 tracking-tight';
      else if (overview.p95DurationMs > 100) p95El.className = 'text-2xl font-bold text-amber-400 tracking-tight';
      else p95El.className = 'text-2xl font-bold text-emerald-400 tracking-tight';
    }

    function renderRegressions(regressions) {
      const container = document.getElementById('regressions-container');
      if (!regressions || regressions.length === 0) {
        container.innerHTML = \`
          <div class="bg-dark-800/60 border border-dark-700/60 rounded-xl p-5 text-center text-xs text-gray-400">
            <span class="text-emerald-400 font-semibold">✨ All endpoints running smoothly.</span> No regressions detected against historical baseline.
          </div>
        \`;
        return;
      }

      container.innerHTML = regressions.map(r => {
        const severityBadge = r.severity === 'CRITICAL' 
          ? '<span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30">CRITICAL +'+ r.increasePercentage +'%</span>'
          : '<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">WARNING +'+ r.increasePercentage +'%</span>';

        const culpritsHtml = (r.topCulpritQueries || []).map(q => \`
          <div class="bg-dark-900/80 border border-dark-700 rounded-lg p-3 space-y-2 mt-2">
            <div class="flex items-center justify-between text-xs">
              <span class="font-mono text-rose-300 font-semibold truncate max-w-md">\${escapeHtml(q.fingerprint)}</span>
              <span class="text-rose-400 font-bold font-mono">+\${q.deltaMs}ms (+\${q.increasePercentage}%)</span>
            </div>
            <div class="text-[11px] text-gray-400 flex space-x-4 font-mono">
              <span>Baseline: <strong class="text-gray-300">\${q.baselineAvgMs}ms</strong></span>
              <span>Today: <strong class="text-rose-400">\${q.currentAvgMs}ms</strong></span>
              <span>Latency Contribution: <strong class="text-rose-300">\${q.contributionToLatencyPercent}%</strong></span>
            </div>
          </div>
        \`).join('');

        const recsHtml = r.recommendations.map(rec => \`<li class="text-gray-300">• \${escapeHtml(rec)}</li>\`).join('');

        return \`
          <div class="bg-dark-800 border-l-4 border-l-rose-500 border border-dark-700 rounded-xl p-5 shadow-lg space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <span class="px-2.5 py-1 rounded bg-dark-700 font-mono text-xs font-bold text-indigo-300">\${r.method}</span>
                <span class="font-mono text-sm font-bold text-white">\${r.route}</span>
                \${severityBadge}
              </div>
              <div class="text-right text-xs">
                <div class="text-gray-400">Baseline P95: <span class="font-mono text-gray-200">\${r.baselineP95Ms}ms</span> ➔ Today: <span class="font-mono text-rose-400 font-bold">\${r.currentP95Ms}ms</span></div>
              </div>
            </div>

            <div class="bg-rose-950/20 border border-rose-900/30 rounded-lg p-3 text-xs text-rose-200">
              <span class="font-bold">Root Cause Diagnosis:</span> \${escapeHtml(r.suspectedCause)}
            </div>

            \${culpritsHtml ? \`<div><h4 class="text-xs font-semibold text-gray-300">Culprit Queries:</h4>\${culpritsHtml}</div>\` : ''}

            <div class="text-xs space-y-1">
              <h4 class="font-semibold text-gray-400 uppercase text-[10px] tracking-wider">Actionable Recommendations:</h4>
              <ul class="space-y-1">\${recsHtml}</ul>
            </div>
          </div>
        \`;
      }).join('');
    }

    function renderNPlusOne(nplusone) {
      const container = document.getElementById('nplusone-container');
      if (!nplusone || nplusone.length === 0) {
        container.innerHTML = \`
          <div class="bg-dark-800/60 border border-dark-700/60 rounded-xl p-5 text-center text-xs text-gray-400">
            <span class="text-emerald-400 font-semibold">✨ Zero N+1 query leaks detected.</span>
          </div>
        \`;
        return;
      }

      container.innerHTML = nplusone.map(item => \`
        <div class="bg-dark-800 border-l-4 border-l-amber-500 border border-dark-700 rounded-xl p-4 shadow space-y-3">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded bg-dark-700 font-mono text-indigo-300 font-semibold">\${item.method}</span>
              <span class="font-mono font-bold text-white">\${item.route}</span>
              <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">Avg \${item.avgQueriesPerRequest} queries / request</span>
            </div>
            <span class="text-amber-400 font-mono font-bold">Wasting ~\${item.avgTimeWastedMs}ms</span>
          </div>

          <div class="bg-dark-900 border border-dark-700 rounded-lg p-3 font-mono text-xs text-amber-200">
            \${escapeHtml(item.queryFingerprint)}
          </div>

          <div class="text-xs text-gray-300">
            <span class="text-indigo-400 font-semibold">Fix:</span> \${escapeHtml(item.recommendation)}
          </div>
        </div>
      \`).join('');
    }

    function renderEndpoints(endpoints) {
      const tbody = document.getElementById('endpoints-table-body');
      if (!endpoints || endpoints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="py-6 text-center text-gray-500 font-sans">No API requests recorded yet. Make a few API calls to start seeing real-time analytics!</td></tr>';
        return;
      }

      tbody.innerHTML = endpoints.map(e => \`
        <tr class="hover:bg-dark-700/40 transition">
          <td class="py-3 px-4 flex items-center space-x-2">
            <span class="px-1.5 py-0.5 rounded bg-dark-700 text-indigo-300 font-semibold text-[10px]">\${e.method}</span>
            <span class="font-bold text-gray-100">\${e.route}</span>
          </td>
          <td class="py-3 px-4 text-gray-400 font-sans">\${e.totalRequests.toLocaleString()}</td>
          <td class="py-3 px-4 text-gray-300">\${e.avgDurationMs}ms</td>
          <td class="py-3 px-4 text-gray-400">\${e.p50Ms}ms</td>
          <td class="py-3 px-4 text-gray-300">\${e.p90Ms}ms</td>
          <td class="py-3 px-4 \${e.p95Ms > 300 ? 'text-rose-400 font-bold' : (e.p95Ms > 100 ? 'text-amber-400 font-semibold' : 'text-emerald-400')}">\${e.p95Ms}ms</td>
          <td class="py-3 px-4 text-gray-400">\${e.p99Ms}ms</td>
          <td class="py-3 px-4 text-indigo-300">\${e.avgSqlDurationMs}ms</td>
          <td class="py-3 px-4 text-gray-300">\${e.avgQueriesPerRequest}</td>
          <td class="py-3 px-4 \${e.errorRate > 0 ? 'text-rose-400 font-bold' : 'text-gray-400'}">\${e.errorRate}%</td>
        </tr>
      \`).join('');
    }

    function renderQueries(queries) {
      const tbody = document.getElementById('queries-table-body');
      if (!queries || queries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-gray-500 font-sans">No SQL queries recorded yet.</td></tr>';
        return;
      }

      tbody.innerHTML = queries.map(q => \`
        <tr class="hover:bg-dark-700/40 transition">
          <td class="py-3 px-4 text-gray-200 truncate max-w-sm" title="\${escapeHtml(q.fingerprint)}">\${escapeHtml(q.fingerprint)}</td>
          <td class="py-3 px-4 text-indigo-300">\${q.route}</td>
          <td class="py-3 px-4 text-gray-400 font-sans">\${q.callCount.toLocaleString()}</td>
          <td class="py-3 px-4 text-gray-300">\${q.avgDurationMs}ms</td>
          <td class="py-3 px-4 \${q.p95Ms > 100 ? 'text-rose-400 font-bold' : 'text-emerald-400'}">\${q.p95Ms}ms</td>
          <td class="py-3 px-4 text-gray-400">\${q.maxDurationMs}ms</td>
          <td class="py-3 px-4 text-amber-300">\${q.totalDurationMs}ms</td>
        </tr>
      \`).join('');
    }

    function renderTraces(traces) {
      const container = document.getElementById('traces-list');
      if (!traces || traces.length === 0) {
        container.innerHTML = '<div class="text-center py-6 text-xs text-gray-500 font-sans">No trace records found.</div>';
        return;
      }

      container.innerHTML = traces.slice(0, 30).map(t => {
        const statusColor = t.statusCode >= 500 ? 'text-rose-400 bg-rose-950/40 border-rose-800' : (t.statusCode >= 400 ? 'text-amber-400 bg-amber-950/40 border-amber-800' : 'text-emerald-400 bg-emerald-950/40 border-emerald-800');
        const sqlPercentage = t.durationMs > 0 ? Math.min(100, Math.round((t.totalSqlMs / t.durationMs) * 100)) : 0;
        const appPercentage = 100 - sqlPercentage;

        return \`
          <div onclick="openTraceModal('\${t.traceId}')" class="cursor-pointer bg-dark-900/60 hover:bg-dark-700/60 border border-dark-700 rounded-xl p-3.5 transition space-y-2">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center space-x-2 font-mono">
                <span class="px-2 py-0.5 rounded border text-[10px] font-bold \${statusColor}">\${t.statusCode}</span>
                <span class="font-bold text-white">\${t.method} \${t.route}</span>
                <span class="text-gray-500 text-[11px] truncate max-w-xs">\${t.url}</span>
              </div>
              <div class="flex items-center space-x-3 font-mono text-xs">
                <span class="text-gray-400">\${t.queryCount} SQL queries (\${t.totalSqlMs}ms)</span>
                <span class="font-bold \${t.durationMs > 300 ? 'text-rose-400' : 'text-emerald-400'}">\${t.durationMs}ms</span>
              </div>
            </div>

            <!-- Mini Waterfall Bar -->
            <div class="w-full bg-dark-700 rounded-full h-1.5 flex overflow-hidden">
              <div class="bg-indigo-500 h-full" style="width: \${appPercentage}%" title="Application Logic: \${appPercentage}%"></div>
              <div class="bg-amber-400 h-full" style="width: \${sqlPercentage}%" title="SQL Execution: \${sqlPercentage}%"></div>
            </div>
          </div>
        \`;
      }).join('');
    }

    async function openTraceModal(traceId) {
      const modal = document.getElementById('trace-modal');
      const body = document.getElementById('modal-body');
      modal.classList.remove('hidden');

      body.innerHTML = '<div class="text-center py-8 text-gray-400">Loading trace...</div>';

      try {
        const t = await fetch(API_BASE + '/trace/' + traceId).then(r => r.json());
        document.getElementById('modal-title').innerText = t.method + ' ' + t.route;
        document.getElementById('modal-subtitle').innerText = 'Trace ID: ' + t.traceId + ' • ' + new Date(t.timestamp).toLocaleTimeString();

        const sqlPercentage = t.durationMs > 0 ? Math.min(100, Math.round((t.totalSqlMs / t.durationMs) * 100)) : 0;
        const appDuration = Math.max(0, Math.round((t.durationMs - t.totalSqlMs) * 100) / 100);

        const queriesList = (t.queries || []).map((q, idx) => \`
          <div class="bg-dark-900 border border-dark-700 rounded-lg p-3 space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-indigo-300 font-mono">Query #\${idx + 1} (\${q.driver})</span>
              <span class="font-mono font-bold text-amber-400">\${q.durationMs}ms</span>
            </div>
            <pre class="text-gray-300 text-[11px] overflow-x-auto p-2 bg-dark-950 rounded border border-dark-800 font-mono">\${escapeHtml(q.rawSql)}</pre>
          </div>
        \`).join('');

        body.innerHTML = \`
          <!-- Summary Header -->
          <div class="grid grid-cols-3 gap-3">
            <div class="bg-dark-900 p-3 rounded-lg border border-dark-700">
              <span class="text-gray-400 block text-[10px] uppercase">Total Request Time</span>
              <span class="text-lg font-bold text-white font-mono">\${t.durationMs}ms</span>
            </div>
            <div class="bg-dark-900 p-3 rounded-lg border border-dark-700">
              <span class="text-gray-400 block text-[10px] uppercase">App / Middleware</span>
              <span class="text-lg font-bold text-indigo-300 font-mono">\${appDuration}ms</span>
            </div>
            <div class="bg-dark-900 p-3 rounded-lg border border-dark-700">
              <span class="text-gray-400 block text-[10px] uppercase">Database (SQL) Time</span>
              <span class="text-lg font-bold text-amber-300 font-mono">\${t.totalSqlMs}ms (\${sqlPercentage}%)</span>
            </div>
          </div>

          <!-- Executed Queries -->
          <div class="space-y-3">
            <h4 class="font-semibold text-white text-xs uppercase tracking-wider">Executed Queries (\${(t.queries || []).length})</h4>
            <div class="space-y-2">
              \${queriesList.length ? queriesList : '<p class="text-gray-400">No database queries executed in this request.</p>'}
            </div>
          </div>
        \`;
      } catch (err) {
        body.innerHTML = '<div class="text-center py-8 text-rose-400">Failed to load trace.</div>';
      }
    }

    function closeModal() {
      document.getElementById('trace-modal').classList.add('hidden');
    }

    async function clearData() {
      if (confirm('Clear all recorded ApiWatch performance metrics?')) {
        await fetch(API_BASE + '/clear', { method: 'POST' });
        fetchData();
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Auto load & poll every 4 seconds
    fetchData();
    setInterval(fetchData, 4000);
  </script>
</body>
</html>
`;
}
