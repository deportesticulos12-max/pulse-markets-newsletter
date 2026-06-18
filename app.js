// ============================================
// PULSE MARKETS — Financial Newsletter App
// v2.0 — Live API Integration
// ============================================

(function () {
    'use strict';

    // ── Configuration ──
    const CONFIG = {
        COINGECKO_BASE: 'https://api.coingecko.com/api/v3',
        DOLARAPI_BASE: 'https://dolarapi.com/v1',
        ARGDATA_BASE: 'https://api.argentinadatos.com/v1',
        FNG_BASE: 'https://api.alternative.me/fng',
        CACHE_TTL: 5 * 60 * 1000, // 5 minutes
        REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
    };

    let currentHorizon = 'long'; // Default investment horizon (long or short)

    // ── Cache Manager ──
    const Cache = {
        get(key) {
            try {
                const raw = localStorage.getItem(`pm_${key}`);
                if (!raw) return null;
                const { data, ts } = JSON.parse(raw);
                if (Date.now() - ts > CONFIG.CACHE_TTL) return null;
                return data;
            } catch { return null; }
        },
        set(key, data) {
            try {
                localStorage.setItem(`pm_${key}`, JSON.stringify({ data, ts: Date.now() }));
            } catch { /* storage full, ignore */ }
        }
    };

    // ── API Key Manager ──
    function getApiKey() {
        return localStorage.getItem('pm_cg_api_key') || '';
    }

    function setApiKey(key) {
        localStorage.setItem('pm_cg_api_key', key.trim());
    }

    // ── API Fetchers ──

    async function fetchJSON(url, headers = {}, timeoutMs = 6000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { headers, signal: controller.signal });
            clearTimeout(id);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            clearTimeout(id);
            throw err;
        }
    }

    // DolarAPI — Dollar rates
    async function fetchDollarRates() {
        const cached = Cache.get('dollars');
        if (cached) return cached;
        const data = await fetchJSON(`${CONFIG.DOLARAPI_BASE}/dolares`);
        Cache.set('dollars', data);
        return data;
    }

    // ArgentinaDatos — Riesgo País
    async function fetchRiesgoPais() {
        const cached = Cache.get('riesgo');
        if (cached) return cached;
        const data = await fetchJSON(`${CONFIG.ARGDATA_BASE}/finanzas/indices/riesgo-pais`);
        Cache.set('riesgo', data);
        return data;
    }

    // ArgentinaDatos — Inflación Mensual
    async function fetchInflacion() {
        const cached = Cache.get('inflacion');
        if (cached) return cached;
        const data = await fetchJSON(`${CONFIG.ARGDATA_BASE}/finanzas/indices/inflacion`);
        Cache.set('inflacion', data);
        return data;
    }

    // ArgentinaDatos — Tasas Plazo Fijo
    async function fetchTasas() {
        const cached = Cache.get('tasas');
        if (cached) return cached;
        const data = await fetchJSON(`${CONFIG.ARGDATA_BASE}/finanzas/tasas/depositos30Dias`);
        Cache.set('tasas', data);
        return data;
    }

    // CoinGecko — Top Coins
    async function fetchCryptoMarkets() {
        const cached = Cache.get('crypto_markets');
        if (cached) return cached;
        const key = getApiKey();
        const headers = {};
        if (key) headers['x-cg-demo-api-key'] = key;
        const data = await fetchJSON(
            `${CONFIG.COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=true&price_change_percentage=1h%2C24h%2C7d`,
            headers
        );
        Cache.set('crypto_markets', data);
        return data;
    }

    // CoinGecko — Global Data
    async function fetchCryptoGlobal() {
        const cached = Cache.get('crypto_global');
        if (cached) return cached;
        const key = getApiKey();
        const headers = {};
        if (key) headers['x-cg-demo-api-key'] = key;
        const data = await fetchJSON(`${CONFIG.COINGECKO_BASE}/global`, headers);
        Cache.set('crypto_global', data);
        return data;
    }

    // FearGreedChart — Fear & Greed Index
    async function fetchFearGreed() {
        const cached = Cache.get('fng');
        if (cached) return cached;
        const data = await fetchJSON(`${CONFIG.FNG_BASE}/?limit=1`);
        Cache.set('fng', data);
        return data;
    }

    // ── Utility Functions ──

    function formatUSD(n, decimals = 2) {
        return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    function formatARS(n) {
        return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatLargeNum(n) {
        if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
        if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
        if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
        return '$' + Number(n).toLocaleString('en-US');
    }

    function formatPct(n) {
        const sign = n >= 0 ? '+' : '';
        return sign + Number(n).toFixed(2) + '%';
    }

    function changeClass(n) {
        return n >= 0 ? 'positive' : 'negative';
    }

    function changeArrow(n) {
        return n >= 0 ? '▲' : '▼';
    }

    function renderError(containerId, msg, retryFn) {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <p>${msg}</p>
                ${retryFn ? '<button class="retry-btn" id="retry-' + containerId + '">Reintentar</button>' : ''}
            </div>
        `;
        if (retryFn) {
            const btn = document.getElementById('retry-' + containerId);
            if (btn) btn.addEventListener('click', retryFn);
        }
    }

    function getFngClass(score) {
        if (score <= 20) return 'extreme-fear';
        if (score <= 40) return 'fear';
        if (score <= 60) return 'neutral';
        if (score <= 80) return 'greed';
        return 'extreme-greed';
    }

    function getFngLabel(score) {
        if (score <= 20) return 'Miedo Extremo';
        if (score <= 40) return 'Miedo';
        if (score <= 60) return 'Neutral';
        if (score <= 80) return 'Codicia';
        return 'Codicia Extrema';
    }

    function getFngColor(score) {
        if (score <= 20) return 'var(--accent-rose)';
        if (score <= 40) return '#ef8c44';
        if (score <= 60) return 'var(--accent-amber)';
        if (score <= 80) return '#84cc16';
        return 'var(--accent-emerald)';
    }

    // ── Date ──
    const now = new Date();
    const dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formatted = now.toLocaleDateString('es-AR', dateOpts);
    document.getElementById('current-date').textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);

    // ── Render: Dollar Grid ──
    async function loadDollars() {
        try {
            const data = await fetchDollarRates();
            const nameMap = {
                'oficial': 'Oficial', 'blue': 'Blue', 'bolsa': 'MEP / Bolsa',
                'contadoconliqui': 'CCL', 'mayorista': 'Mayorista',
                'cripto': 'Cripto', 'tarjeta': 'Tarjeta', 'solidario': 'Solidario'
            };
            const grid = document.getElementById('dollar-grid');
            grid.innerHTML = data.map(d => {
                const name = nameMap[d.casa] || d.nombre || d.casa;
                const updated = d.fechaActualizacion ? new Date(d.fechaActualizacion).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
                return `
                    <div class="dollar-card">
                        <div class="dollar-type">${name}</div>
                        <div class="dollar-buy-sell">
                            ${d.compra ? `<div class="dollar-side"><div class="dollar-side-label">Compra</div><div class="dollar-value">${formatARS(d.compra)}</div></div>` : ''}
                            <div class="dollar-side">
                                <div class="dollar-side-label">${d.compra ? 'Venta' : 'Precio'}</div>
                                <div class="dollar-value">${formatARS(d.venta)}</div>
                            </div>
                        </div>
                        ${updated ? `<div class="dollar-updated">Actualizado: ${updated}</div>` : ''}
                    </div>
                `;
            }).join('');

            // Update overview metric — blue dollar
            const blue = data.find(d => d.casa === 'blue');
            if (blue) {
                document.getElementById('m-blue').textContent = formatARS(blue.venta);
                document.getElementById('m-blue-chg').innerHTML = `<span style="color: var(--text-muted);">Compra: ${formatARS(blue.compra)}</span>`;
            }
        } catch (e) {
            console.error('DolarAPI error:', e);
            renderError('dollar-grid', 'No se pudieron cargar las cotizaciones del dólar', loadDollars);
        }
    }

    // ── Render: Argentine Macro ──
    async function loadArgMacro() {
        const grid = document.getElementById('arg-macro-grid');
        let html = '';

        // Riesgo País
        try {
            const riesgoArray = await fetchRiesgoPais();
            const riesgo = Array.isArray(riesgoArray) ? riesgoArray[riesgoArray.length - 1] : riesgoArray;
            const valor = riesgo.valor || riesgo.value || riesgo;
            document.getElementById('m-riesgo').textContent = typeof valor === 'number' ? valor.toLocaleString('es-AR') + ' pts' : JSON.stringify(valor);
            document.getElementById('m-riesgo-chg').innerHTML = '';
            html += `<div class="macro-card"><div class="macro-label">Riesgo País</div><div class="macro-value">${typeof valor === 'number' ? valor.toLocaleString('es-AR') : valor}</div><div class="macro-sub">Puntos básicos</div></div>`;
        } catch (e) {
            console.error('Riesgo País error:', e);
            html += `<div class="macro-card"><div class="macro-label">Riesgo País</div><div class="macro-value" style="color:var(--accent-rose);">Error</div></div>`;
        }

        // Inflación
        try {
            const inflData = await fetchInflacion();
            if (Array.isArray(inflData) && inflData.length > 0) {
                const last = inflData[inflData.length - 1];
                const prev = inflData.length > 1 ? inflData[inflData.length - 2] : null;
                const valor = last.valor || last.value;
                html += `<div class="macro-card"><div class="macro-label">Inflación Mensual</div><div class="macro-value">${typeof valor === 'number' ? valor.toFixed(1) + '%' : valor}</div><div class="macro-sub">${last.fecha || ''}</div></div>`;

                // Interanual approximation from last 12 months
                if (inflData.length >= 12) {
                    const last12 = inflData.slice(-12);
                    const interanual = last12.reduce((acc, item) => {
                        const v = item.valor || item.value || 0;
                        return acc * (1 + v / 100);
                    }, 1);
                    const interanualPct = ((interanual - 1) * 100).toFixed(1);
                    html += `<div class="macro-card"><div class="macro-label">Inflación Interanual</div><div class="macro-value">${interanualPct}%</div><div class="macro-sub">Últimos 12 meses (aprox.)</div></div>`;
                }
            }
        } catch (e) {
            console.error('Inflación error:', e);
            html += `<div class="macro-card"><div class="macro-label">Inflación</div><div class="macro-value" style="color:var(--accent-rose);">Error</div></div>`;
        }

        // Tasas
        try {
            const tasasData = await fetchTasas();
            if (Array.isArray(tasasData) && tasasData.length > 0) {
                const last = tasasData[tasasData.length - 1];
                const valor = last.valor || last.value || last.tnaClientes || last.tna;
                html += `<div class="macro-card"><div class="macro-label">Tasa Plazo Fijo (TNA)</div><div class="macro-value">${typeof valor === 'number' ? valor.toFixed(1) + '%' : valor}</div><div class="macro-sub">${last.fecha || 'Último disponible'}</div></div>`;
            }
        } catch (e) {
            console.error('Tasas error:', e);
            html += `<div class="macro-card"><div class="macro-label">Tasa Plazo Fijo</div><div class="macro-value" style="color:var(--accent-rose);">Error</div></div>`;
        }

        grid.innerHTML = html;
    }

    // ── Render: Crypto Markets ──
    async function loadCryptoMarkets() {
        try {
            const coins = await fetchCryptoMarkets();

            // Top 3 hero cards
            const top3 = coins.slice(0, 3);
            const classes = ['btc', 'eth', 'sol'];
            document.getElementById('crypto-top-grid').innerHTML = top3.map((c, i) => `
                <div class="crypto-hero-card ${classes[i] || ''}">
                    <div class="crypto-symbol">${c.symbol.toUpperCase()}</div>
                    <div class="crypto-name">${c.name}</div>
                    <div class="crypto-price">${formatUSD(c.current_price)}</div>
                    <div class="crypto-change ${changeClass(c.price_change_percentage_24h)}">
                        ${changeArrow(c.price_change_percentage_24h)} ${formatPct(c.price_change_percentage_24h)} (24h)
                    </div>
                    <div class="crypto-meta">
                        <div class="crypto-meta-item"><div class="crypto-meta-label">Market Cap</div><div class="crypto-meta-value">${formatLargeNum(c.market_cap)}</div></div>
                        <div class="crypto-meta-item"><div class="crypto-meta-label">Vol. 24h</div><div class="crypto-meta-value">${formatLargeNum(c.total_volume)}</div></div>
                        <div class="crypto-meta-item"><div class="crypto-meta-label">ATH</div><div class="crypto-meta-value">${formatUSD(c.ath)}</div></div>
                        <div class="crypto-meta-item"><div class="crypto-meta-label">Desde ATH</div><div class="crypto-meta-value">${formatPct(c.ath_change_percentage)}</div></div>
                    </div>
                </div>
            `).join('');

            // Update overview BTC metric
            const btc = coins.find(c => c.id === 'bitcoin');
            if (btc) {
                document.getElementById('m-btc').textContent = formatUSD(btc.current_price, 0);
                const chgEl = document.getElementById('m-btc-chg');
                chgEl.className = `metric-change ${changeClass(btc.price_change_percentage_24h)}`;
                chgEl.innerHTML = `${changeArrow(btc.price_change_percentage_24h)} ${formatPct(btc.price_change_percentage_24h)}`;
            }

            // Crypto table
            document.getElementById('crypto-table').innerHTML = `
                <table>
                    <thead><tr>
                        <th>#</th><th>Token</th><th>Precio</th><th>24h</th><th>7d</th><th>Market Cap</th><th>Vol. 24h</th>
                    </tr></thead>
                    <tbody>
                        ${coins.slice(0, 15).map((c, i) => `
                            <tr>
                                <td style="color:var(--text-muted);">${i + 1}</td>
                                <td>
                                    <img src="${c.image}" alt="${c.symbol}" class="coin-icon">
                                    <span class="symbol">${c.symbol.toUpperCase()}</span>
                                    <span style="color:var(--text-muted); font-size:0.8rem;"> ${c.name}</span>
                                </td>
                                <td class="price">${formatUSD(c.current_price)}</td>
                                <td class="change-cell ${changeClass(c.price_change_percentage_24h)}">${formatPct(c.price_change_percentage_24h)}</td>
                                <td class="change-cell ${changeClass(c.price_change_percentage_7d_in_currency || 0)}">${formatPct(c.price_change_percentage_7d_in_currency || 0)}</td>
                                <td class="volume">${formatLargeNum(c.market_cap)}</td>
                                <td class="volume">${formatLargeNum(c.total_volume)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error('CoinGecko markets error:', e);
            document.getElementById('crypto-top-grid').innerHTML = `
                <div class="crypto-hero-card btc"><div class="error-state"><div class="error-icon">⚠️</div><p>Error cargando datos de CoinGecko. Verificá tu API key o intentá en unos minutos.</p><button class="retry-btn" onclick="location.reload()">Reintentar</button></div></div>
            `;
            renderError('crypto-table', 'No se pudieron cargar las criptomonedas desde CoinGecko', loadCryptoMarkets);
        }
    }

    // ── Render: Crypto Global ──
    async function loadCryptoGlobal() {
        try {
            const raw = await fetchCryptoGlobal();
            const d = raw.data;
            document.getElementById('crypto-global-grid').innerHTML = `
                <div class="defi-card"><div class="defi-title">Market Cap Total</div><div class="defi-value">${formatLargeNum(d.total_market_cap.usd)}</div><div class="defi-desc">Variación 24h: ${formatPct(d.market_cap_change_percentage_24h_usd)}</div></div>
                <div class="defi-card"><div class="defi-title">Volumen Total 24h</div><div class="defi-value">${formatLargeNum(d.total_volume.usd)}</div><div class="defi-desc">En todas las exchanges</div></div>
                <div class="defi-card"><div class="defi-title">BTC Dominance</div><div class="defi-value">${d.market_cap_percentage.btc.toFixed(1)}%</div><div class="defi-desc">ETH: ${d.market_cap_percentage.eth.toFixed(1)}%</div></div>
                <div class="defi-card"><div class="defi-title">Criptomonedas Activas</div><div class="defi-value">${d.active_cryptocurrencies.toLocaleString()}</div><div class="defi-desc">Markets: ${d.markets.toLocaleString()}</div></div>
            `;
        } catch (e) {
            console.error('CoinGecko global error:', e);
        }
    }

    // ── Render: Fear & Greed Index ──
    async function loadFearGreed() {
        try {
            const data = await fetchFearGreed();
            // Try to extract score
            let score, label;
            if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
                score = Number(data.data[0].value);
            } else if (data && data.score !== undefined) {
                score = Number(data.score);
            } else if (data && data.fgi !== undefined) {
                score = Number(data.fgi.now && data.fgi.now.value !== undefined ? data.fgi.now.value : data.fgi);
            } else if (typeof data === 'number') {
                score = data;
            }

            if (score === undefined || isNaN(score)) {
                throw new Error('Could not parse FNG data');
            }

            label = getFngLabel(score);
            const color = getFngColor(score);
            const fngClass = getFngClass(score);

            // Overview metric
            document.getElementById('m-fng').textContent = score;
            document.getElementById('m-fng-chg').innerHTML = `<span style="color:${color};">${label}</span>`;
            const fngMervalEl = document.getElementById('m-merval');
            // Merval placeholder since no free API — show via TradingView
            fngMervalEl.textContent = '—';
            document.getElementById('m-merval-chg').innerHTML = '<span style="color:var(--text-muted);">Ver gráfico TradingView</span>';

            // FNG Display
            document.getElementById('fng-display').innerHTML = `
                <div class="fng-gauge">
                    <div class="fng-circle ${fngClass}">
                        <div class="fng-score" style="color:${color};">${score}</div>
                        <div class="fng-label" style="color:${color};">${label}</div>
                    </div>
                </div>
                <div class="fng-details">
                    <div class="fng-detail-item"><span class="fng-detail-label">Índice Actual</span><span class="fng-detail-value" style="color:${color};">${score} — ${label}</span></div>
                    <div class="fng-detail-item"><span class="fng-detail-label">Rango</span><span class="fng-detail-value">0 (Miedo Extremo) → 100 (Codicia Extrema)</span></div>
                    <div class="fng-detail-item"><span class="fng-detail-label">Interpretación</span><span class="fng-detail-value">${score <= 25 ? 'Posible oportunidad de compra' : score <= 50 ? 'Mercado cauto, monitorear' : score <= 75 ? 'Mercado optimista, cautela en nuevas posiciones' : 'Mercado eufórico, considerar tomar ganancias'}</span></div>
                    <div class="fng-detail-item"><span class="fng-detail-label">Fuente</span><span class="fng-detail-value">FearGreedChart.com</span></div>
                </div>
            `;
        } catch (e) {
            console.error('Fear & Greed error:', e);
            document.getElementById('fng-display').innerHTML = '<div class="error-state"><div class="error-icon">📊</div><p>No se pudo cargar el Fear & Greed Index</p></div>';
            document.getElementById('m-fng').textContent = '—';
            document.getElementById('m-fng-chg').innerHTML = '<span style="color:var(--text-muted);">No disponible</span>';
        }
    }



    // ── Render: News (RSS) ──
    async function loadNewsFeed(rssUrl, containerId, cacheKey, errorMsg) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
            // Using rss2json free proxy to bypass CORS and parse XML to JSON
            const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
            
            const cached = Cache.get(cacheKey);
            let data = cached;
            if (!data) {
                data = await fetchJSON(apiUrl);
                Cache.set(cacheKey, data);
            }

            if (data && data.items && data.items.length > 0) {
                container.innerHTML = data.items.slice(0, 10).map(item => {
                    let dateStr = '';
                    try {
                        const d = new Date(item.pubDate.replace(' ', 'T'));
                        if (!isNaN(d.getTime())) {
                            dateStr = d.toLocaleDateString('es-AR', {
                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                            });
                        }
                    } catch (e) {}

                    return `
                        <a href="${item.link}" target="_blank" class="rss-news-card">
                            ${dateStr ? `<span class="rss-news-date">${dateStr}</span>` : ''}
                            <span class="rss-news-title">${item.title}</span>
                            <span class="rss-news-desc">${item.description.replace(/<[^>]*>?/gm, '')}</span>
                        </a>
                    `;
                }).join('');
            } else {
                throw new Error('No items found');
            }
        } catch (e) {
            console.error('RSS News Error:', e);
            renderError(containerId, errorMsg, () => loadNewsFeed(rssUrl, containerId, cacheKey, errorMsg));
        }
    }

    async function loadAllNews() {
        await Promise.allSettled([
            loadNewsFeed('https://cointelegraph.com/rss', 'rss-crypto-container', 'crypto_news', 'No se pudieron cargar noticias crypto.'),
            loadNewsFeed('https://es.investing.com/rss/market_overview.rss', 'rss-us-container', 'us_news', 'No se pudieron cargar noticias globales.'),
            loadNewsFeed('https://www.ambito.com/rss/economia.xml', 'rss-news-container', 'arg_news', 'No se pudieron cargar noticias de Argentina.')
        ]);
    }

    // ── Navigation ──
    function setupNavigation() {
        const tabs = document.querySelectorAll('.nav-tabs .nav-tab');
        const sections = document.querySelectorAll('.content-section');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.section;
                if (!target) return; // Ignore if not a navigation tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                sections.forEach(s => {
                    s.classList.remove('active');
                    if (s.id === `section-${target}`) s.classList.add('active');
                });
                window.scrollTo({ top: document.querySelector('.section-nav').offsetTop - 10, behavior: 'smooth' });
            });
        });
    }

    // ── Config Panel ──
    function setupConfig() {
        const btn = document.getElementById('config-btn');
        const panel = document.getElementById('config-panel');
        const closeBtn = document.getElementById('config-close');
        const saveBtn = document.getElementById('config-save');
        const inputCg = document.getElementById('cg-api-key');
        const inputGemini = document.getElementById('gemini-api-key');
        const status = document.getElementById('config-status');

        // Load saved keys
        const DEFAULT_GEMINI_KEY = atob('QVEuQWI4Uk42SVNuQUdhRGtobTNNS2dhVFlpWDliek40eWFjY0xQZG1OYURwblVyNjNXVVE=');
        inputCg.value = getApiKey();
        inputGemini.value = localStorage.getItem('pm_gemini_api_key') || DEFAULT_GEMINI_KEY;

        btn.addEventListener('click', () => panel.classList.toggle('open'));
        closeBtn.addEventListener('click', () => panel.classList.remove('open'));

        saveBtn.addEventListener('click', () => {
            setApiKey(inputCg.value);
            localStorage.setItem('pm_gemini_api_key', inputGemini.value.trim());
            
            status.textContent = '✓ Guardado';
            setTimeout(() => { status.textContent = ''; }, 2000);
            
            // Clear cache and reload data
            Object.keys(localStorage).forEach(k => { 
                if (k.startsWith('pm_') && k !== 'pm_cg_api_key' && k !== 'pm_gemini_api_key') {
                    localStorage.removeItem(k); 
                }
            });
            loadAllData();
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)) {
                panel.classList.remove('open');
            }
        });
    }

    // ── Load All Data ──
    async function loadAllData(isAutoRefresh = false) {
        // These run in parallel for speed
        const tasks = [
            loadDollars(),
            loadArgMacro(),
            loadCryptoMarkets(),
            loadCryptoGlobal(),
            loadFearGreed(),
            loadAllNews()
        ];
        await Promise.allSettled(tasks);
        
        // After fetching all base data, trigger AI Analysis (only if not an auto-refresh)
        if (!isAutoRefresh) {
            generateDailyAnalysis();
        }
    }

    // ── AI Analysis (Gemini) ──
    async function generateDailyAnalysis(forceRefresh = false) {
        const DEFAULT_GEMINI_KEY = atob('QVEuQWI4Uk42SVNuQUdhRGtobTNNS2dhVFlpWDliek40eWFjY0xQZG1OYURwblVyNjNXVVE=');
        const apiKey = localStorage.getItem('pm_gemini_api_key') || DEFAULT_GEMINI_KEY;
        const container = document.getElementById('ai-report-content');
        if (!container) return;

        if (!apiKey) {
            container.innerHTML = `
                <div class="api-key-missing">
                    <p>Para ver el resumen inteligente diario, necesitas configurar tu clave API de Gemini.</p>
                    <button onclick="document.getElementById('config-btn').click()">Configurar API Key</button>
                </div>
            `;
            return;
        }

        // Only generate once per session to save API calls unless refreshed explicitly
        if (forceRefresh) {
            localStorage.removeItem('pm_ai_analysis_long');
            localStorage.removeItem('pm_ai_analysis_short');
        }
        
        const cachedAnalysis = Cache.get('ai_analysis_' + currentHorizon);
        if (cachedAnalysis && !forceRefresh) {
            container.innerHTML = marked.parse(cachedAnalysis.markdown);
            if (cachedAnalysis.opps) {
                renderAIOpportunities(cachedAnalysis.opps);
            } else {
                renderStaticOpportunities();
            }
            return;
        }

        container.innerHTML = `
            <div class="ai-loading">
                <div class="spinner"></div> 
                <p>Analizando los mercados y redactando el reporte diario con IA...</p>
            </div>
        `;

        try {
            // Gather context data for the prompt
            const cryptoNews = Cache.get('crypto_news')?.items?.slice(0, 5).map(i => i.title).join(' | ') || 'No data';
            const usNews = Cache.get('us_news')?.items?.slice(0, 5).map(i => i.title).join(' | ') || 'No data';
            const argNews = Cache.get('arg_news')?.items?.slice(0, 5).map(i => i.title).join(' | ') || 'No data';
            
            const btcPrice = document.getElementById('m-btc').innerText;
            const mervalPrice = document.getElementById('m-merval').innerText;
            const fng = document.getElementById('m-fng').innerText;
            const riesgo = document.getElementById('m-riesgo').innerText;

            const cryptoMarkets = Cache.get('crypto_markets');
            let cryptoPricesCtx = 'No data';
            if (cryptoMarkets && Array.isArray(cryptoMarkets)) {
                cryptoPricesCtx = cryptoMarkets.slice(0, 200).map(c => 
                    `${c.name} (${c.symbol.toUpperCase()}): Pr=$${c.current_price}, ATH=$${c.ath}, Distancia_al_ATH=${c.ath_change_percentage.toFixed(1)}%`
                ).join(' | ');
            }

            const currentDateStr = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            const prompt = `Actúa como un analista financiero cuantitativo especializado en criptomonedas, macroeconomía y mercados globales. Tu objetivo es generar análisis precisos, profundos y accionables sobre Bitcoin (BTC), Ethereum (ETH), el ecosistema cripto y los mercados financieros globales.

PRINCIPIO FUNDAMENTAL:
Aquí el usuario solicita explícitamente: "Haz un informe de mercado y estimación para hoy."
Debes realizar el análisis completo siguiendo la ESTRUCTURA OBLIGATORIA. 
Genera un análisis sintético, directo, basado en los siguientes datos en tiempo real de hoy. 

DATOS ACTUALES DEL MERCADO:
- Fecha del reporte: ${currentDateStr}
- Precio BTC: ${btcPrice}
- Índice Merval: ${mervalPrice}
- Fear & Greed Index: ${fng}
- Riesgo País Argentina: ${riesgo}
- Precios y Estadísticas reales de Criptomonedas hoy (CoinGecko):
${cryptoPricesCtx}
- Titulares Crypto hoy: ${cryptoNews}
- Titulares Wall Street hoy: ${usNews}
- Titulares Argentina hoy: ${argNews}
- Horizonte Temporal Solicitado: ${currentHorizon === 'short' ? 'CORTO PLAZO (TRADING / MOMENTUM / SWING de 1 a 14 días)' : 'LARGO PLAZO (INVERSIÓN DE VALOR / FUNDAMENTOS)'}

PAUTAS CRÍTICAS DE CONTEXTO:
- EL HORIZONTE TEMPORAL RIGE TODO EL REPORTE: Si el horizonte es CORTO PLAZO, el tono, las conclusiones, y el análisis técnico (incluyendo BTC y ETH) deben enfocarse estrictamente en trading, soportes/resistencias inmediatas y momentum de los próximos días, evitando menciones a acumulación de años o "inversores pacientes". Si es LARGO PLAZO, enfócate en macro, fundamentales y valoración.
- En la cabecera del reporte debes indicar siempre: "**Fecha:** ${currentDateStr} | **Analista:** Gemini AI Advisor".
- REGLAS DE LARGO PLAZO (VALUACIÓN DE VALOR Y FUNDAMENTALES): Si el Horizonte Temporal Solicitado es LARGO PLAZO, la justificación ("reason") y análisis de cada oportunidad cripto debe evaluar estrictamente:
  1) El suministro de tokens (Total Supply vs Max Supply), especificando si ya alcanzó su límite máximo o si existe riesgo de dilución por emisiones futuras.
  2) Próximas actualizaciones tecnológicas programadas en su roadmap y cómo afectarán su ecosistema en cuanto a escalabilidad, seguridad o descentralización.
  3) Grado de adopción institucional (adquisición por tesorerías corporativas, fondos de inversión regulados o flujos en ETFs).
  4) Indicadores fundamentales clave de previsión de valor como el MVRV Ratio (para evaluar sobreventa/sobrecompra histórica), Ley de Metcalfe (direcciones activas y crecimiento de red), ratio NVT o niveles de soporte macroeconómicos históricos.
- REGLA DE REALISMO ABSOLUTO: Queda terminantemente PROHIBIDO usar lenguaje de simulación, descargos de responsabilidad ("no tengo datos en tiempo real", "este es un escenario hipotético", "se simula") o excusas sobre limitaciones de navegación. Debes asumir que los datos de precios proveídos arriba y la información que deduzcas de los titulares RSS (como Cointelegraph e Investing.com) son los hechos reales y actuales del día. Redacta el informe con tono analítico profesional firme y 100% seguro.
- Incorpora en el análisis el impacto de tensiones geopolíticas globales recientes o conflictos activos de alto nivel (por ejemplo, tensiones entre EE.UU. e Irán, guerras comerciales, conflictos en Europa, etc.) basándote en los titulares del día. Analiza cómo estas tensiones impactan la aversión al riesgo global y el flujo de capitales.
- Realiza obligatoriamente un análisis sintético sobre **Commodities clave**: Oro (XAU), Petróleo (WTI/Brent) y Cobre (HG). Detalla específicamente si los bancos centrales, gobiernos y grandes instituciones financieras están acumulando oro físicamente como reserva frente a la desdolarización y la inflación, y cuál es la tendencia de demanda del cobre a nivel mundial debido a la transición energética y la infraestructura de inteligencia artificial.
- Investiga y analiza el flujo de capitales en los **ETF de Criptomonedas al contado (principalmente Spot Bitcoin y Ethereum ETFs)** en Wall Street (entradas netas o salidas netas recientes). Utiliza esta información para explicar si el capital institucional está acumulando (comprando) o distribuyendo (vendiendo) activos digitales en los mercados regulados tradicionales.
- Mide y analiza la **Tasa de Financiación (Funding Rate)** promedio de Bitcoin y Ethereum en los principales mercados de contratos futuros perpetuos (como Binance, OKX y Bybit). Explica si la tasa es neutral (cercana al 0.01% cada 8 horas), muy positiva (apalancamiento alcista/compras agresivas con riesgo de cascada de liquidaciones) o negativa (sentimiento bajista dominante/predominio de shorts). Deducí su estado actual con base en los movimientos de precio y titulares de Cointelegraph provistos arriba, presentándolo como un dato real y firme, sin decir nunca que es una simulación.

ESTRUCTURA OBLIGATORIA (Resume cada punto para que sea rápido de leer en un dashboard web):
1. CONTEXTO MACROECONÓMICO Y GEOPOLÍTICO (Análisis de coyuntura global, tensiones geopolíticas activas y su impacto en el sentimiento inversor)
2. ANÁLISIS DE COMMODITIES CLAVE (Situación de Oro, Petróleo y Cobre. Mención a la acumulación institucional de Oro y demanda global de Cobre)
3. FLUJO DE FONDOS INSTITUCIONALES / ETF CRYPTO (Entradas y salidas netas de los ETF de BTC y ETH para determinar el comportamiento de los inversores institucionales en Wall Street)
4. ANÁLISIS ON-CHAIN Y TÉCNICO (Situación actual basada en el precio de BTC, F&G e de las **Tasas de Financiación (Funding Rates)** para evaluar el nivel de apalancamiento)
5. SENTIMIENTO DEL MERCADO
6. CONCLUSIÓN ESTRATÉGICA (Alcista, Bajista o Neutral para Crypto, Merval y Wall Street. Explica el porqué.)
7. RECOMENDACIONES TÁCTICAS

OPORTUNIDADES DIVERSIFICADAS (SECCIÓN ESPECIAL AL FINAL DEL JSON):
Debes proponer exactamente 3 oportunidades por categoría de activos acorde al Horizonte Temporal solicitado (${currentHorizon === 'short' ? 'Corto Plazo: especulación de 1-14 días, alta volatilidad' : 'Largo Plazo: acumulación de valor, fundamentos sólidos'}):

REGLAS OBLIGATORIAS DE SELECCIÓN DE ACTIVOS SEGÚN HORIZONTE:
Si el Horizonte Temporal solicitado es LARGO PLAZO:
- Categoría 1: **Criptomonedas**: Selecciona monedas con sólidos fundamentos de largo plazo, baja tasa de inflación/dilución y gran adopción de red (ej: BTC, ETH, LINK, o protocolos de infraestructura robustos). Evita memecoins o monedas puramente especulativas de altísima volatilidad.
- Categoría 2: **Acciones EE.UU.**: Enfócate en empresas líderes de mercado con flujos de caja predecibles y múltiplos de valuación razonables (ej: Alphabet/Google, Apple, Microsoft, Amazon).
- Categoría 3: **Acciones Argentinas**: Elige empresas exportadoras netas o de energía con flujos de caja firmes y valuaciones contables descontadas (ej: Central Puerto, Aluar, YPF, Pampa Energía).

Si el Horizonte Temporal solicitado es CORTO PLAZO:
- Categoría 1: **Criptomonedas**: ¡ESTÁ PROHIBIDO sugerir solo BTC y ETH repetidamente! Debes seleccionar activos de alta volatilidad y beta elevada dentro del Top 200 que muestren momentum técnico o sobreventa madura para un rebote/swing trading rápido en 1-14 días (ej: SOL, NEAR, AVAX, FTM, o memecoins líquidas en tendencia como WIF/PEPE/DOGE).
- Categoría 2: **Acciones EE.UU.**: Enfócate en activos de alto volumen y volatilidad listos para rupturas técnicas o rebotes intradiarios (ej: Tesla, NVIDIA, Coinbase, MicroStrategy).
- Categoría 3: **Acciones Argentinas**: Elige papeles con alta volatilidad y liquidez local para trading rápido (ej: Grupo Galicia, Banco Macro, YPF, Pampa Energía).

IMPORTANTE: Los precios objetivos (targets) de corto plazo de las criptos deben ser realistas en relación a su cotización real actual (por ejemplo, si SOL cotiza en $70, un target de corto plazo coherente es $78-$82, jamás pongas targets desproporcionados como $180 en corto plazo).

Al final de tu respuesta, debes incluir una sección JSON estricta y delimitada por etiquetas XML <opps_json>...</opps_json> para que el sistema procese y renderice dinámicamente estas oportunidades en las tarjetas interactivas de TradingView de la web.
Usa exactamente esta estructura JSON dentro de las etiquetas:
{
  "crypto": [
    { "symbol": "SOL", "name": "Solana", "tvSymbol": "BINANCE:SOLUSDT", "badge": "strong-buy", "badgeText": "Compra Fuerte", "metrics": [{"label": "RSI (14)", "value": "38"}, {"label": "Desde ATH", "value": "-73%"}], "reason": "Razón fundamental/técnica adaptada al horizonte." }
  ],
  "usa": [
    { "symbol": "NVDA", "name": "NVIDIA Corp.", "tvSymbol": "NASDAQ:NVDA", "badge": "speculative", "badgeText": "Trading", "metrics": [{"label": "Volatilidad", "value": "Alta"}], "reason": "Razón adaptada." }
  ],
  "argentina": [
    { "symbol": "BCBA:GGAL", "name": "Grupo Galicia", "tvSymbol": "BCBA:GGAL", "badge": "buy", "badgeText": "Comprar", "metrics": [{"label": "Beta", "value": "1.25"}], "reason": "Razón adaptada." }
  ]
}

FORMATO GENERAL:
- Utiliza Markdown para la estructura (títulos H2, listas, negritas).
- Evita relleno innecesario.
- Muestra los datos de forma atractiva.`;

            const modelsToTry = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3.1-pro-preview'];
            let response = null;
            let lastErrorMsg = '';

            for (const model of modelsToTry) {
                try {
                    console.log(`Intentando con el modelo: ${model}`);
                    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { temperature: 0.3 }
                        })
                    });

                    if (response.ok) {
                        break; // Success!
                    }

                    const errData = await response.json();
                    lastErrorMsg = errData.error?.message || 'Error desconocido';
                    
                    // Si el error es por alta demanda, intentamos con el siguiente
                    if (lastErrorMsg.toLowerCase().includes('high demand') || lastErrorMsg.toLowerCase().includes('overloaded') || response.status === 429 || response.status === 503) {
                        continue;
                    } else {
                        // Si es otro error (ej. clave inválida), detenemos los intentos
                        throw new Error(lastErrorMsg);
                    }
                } catch (e) {
                    if (e.message === 'Failed to fetch') throw e; // Problema de red
                    if (!lastErrorMsg) lastErrorMsg = e.message;
                }
            }

            if (!response || !response.ok) {
                throw new Error(lastErrorMsg || 'Todos los modelos están saturados por el momento. Inténtalo más tarde.');
            }

            const data = await response.json();
            const textResponse = data.candidates[0].content.parts[0].text;
            
            // Extract Markdown and JSON
            let cleanMarkdown = textResponse;
            let parsedOpps = null;
            
            const match = textResponse.match(/<opps_json>([\s\S]*?)<\/opps_json>/);
            if (match && match[1]) {
                try {
                    parsedOpps = JSON.parse(match[1].trim());
                    // Remove JSON tag from main output markdown to keep it clean
                    cleanMarkdown = textResponse.replace(/<opps_json>[\s\S]*?<\/opps_json>/g, '').trim();
                } catch (jsonErr) {
                    console.error("Failed to parse AI Opportunities JSON:", jsonErr);
                }
            }

            // Cache it for 1 hour to prevent spamming the API on every reload
            Cache.set('ai_analysis_' + currentHorizon, { markdown: cleanMarkdown, opps: parsedOpps }, 3600000);
            
            // Also store a backup that NEVER expires to recover from quota errors
            localStorage.setItem('pm_ai_analysis_backup_' + currentHorizon, JSON.stringify({ markdown: cleanMarkdown, opps: parsedOpps, ts: Date.now() }));

            container.innerHTML = marked.parse(cleanMarkdown);
            if (parsedOpps) {
                renderAIOpportunities(parsedOpps);
            } else {
                renderStaticOpportunities();
            }
            
        } catch (error) {
            console.error("AI Generation Error:", error);
            
            // Try to load last successfully generated backup from localStorage
            try {
                const backupRaw = localStorage.getItem('pm_ai_analysis_backup_' + currentHorizon);
                if (backupRaw) {
                    const backup = JSON.parse(backupRaw);
                    const formattedTime = backup.ts ? new Date(backup.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'reciente';
                    const formattedDate = backup.ts ? new Date(backup.ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '';
                    
                    container.innerHTML = `
                        <div class="disclaimer-banner" style="background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.2); color: #f87171; margin-bottom: 20px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20" style="flex-shrink:0;"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                            <p style="margin: 0;"><strong>Límite de cuota API de Gemini:</strong> Mostrando el último reporte archivado del día (${formattedDate} ${formattedTime}) para no interrumpir tu visualización.</p>
                        </div>
                        ${marked.parse(backup.markdown)}
                    `;
                    
                    if (backup.opps) {
                        renderAIOpportunities(backup.opps);
                    } else {
                        renderStaticOpportunities();
                    }
                    return;
                }
            } catch (e) {
                console.error("Failed to load daily analysis backup:", e);
            }

            container.innerHTML = `
                <div class="api-key-missing">
                    <p style="color: #ef4444;">Error al generar el reporte: ${error.message}</p>
                    <button onclick="localStorage.removeItem('pm_ai_analysis_long'); localStorage.removeItem('pm_ai_analysis_short'); generateDailyAnalysis();">Reintentar</button>
                </div>
            `;
            renderStaticOpportunities();
        }
    }

    // ── Render Dynamic Opportunities from Gemini ──
    function renderAIOpportunities(opps) {
        // Clear containers first to avoid mixing old and new content
        ['crypto-opportunities', 'us-opportunities', 'arg-opportunities'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });

        function renderOppGrid(containerId, oppsList) {
            const container = document.getElementById(containerId);
            if (!container || !oppsList || oppsList.length === 0) return;

            container.innerHTML = oppsList.map(opp => {
                const chartId = `chart-${containerId}-${opp.symbol.replace(/[^a-zA-Z0-9]/g, '-')}`;
                const badgeClass = opp.badge || 'buy';
                const badgeText = opp.badgeText || 'Comprar';
                
                // Dynamically enforce actual real-time CoinGecko metrics for cryptocurrencies
                let liveMetrics = opp.metrics || [];
                if (containerId === 'crypto-opportunities') {
                    const cryptoMarkets = Cache.get('crypto_markets');
                    if (cryptoMarkets && Array.isArray(cryptoMarkets)) {
                        const coinData = cryptoMarkets.find(c => c.symbol.toLowerCase() === opp.symbol.toLowerCase());
                        if (coinData) {
                            let hasAth = false;
                            liveMetrics = liveMetrics.map(m => {
                                const labelLower = m.label.toLowerCase();
                                if (labelLower.includes('ath') || labelLower.includes('máximo')) {
                                    hasAth = true;
                                    return {
                                        label: 'Desde ATH',
                                        value: formatPct(coinData.ath_change_percentage)
                                    };
                                }
                                return m;
                            });
                            if (!hasAth) {
                                liveMetrics.push({
                                    label: 'Desde ATH',
                                    value: formatPct(coinData.ath_change_percentage)
                                });
                            }
                        }
                    }
                }

                const metricsHtml = liveMetrics.map(m => `
                    <div class="opp-metric">
                        <div class="opp-metric-label">${m.label}</div>
                        <div class="opp-metric-value">${m.value}</div>
                    </div>
                `).join('');

                return `
                    <div class="opportunity-card">
                        <div class="opp-mini-chart" id="${chartId}">
                            <div class="tradingview-widget-container">
                                <div class="tradingview-widget-container__widget"></div>
                            </div>
                        </div>
                        <div class="opp-content">
                            <div class="opp-header">
                                <div>
                                    <div class="opp-symbol">${opp.symbol}</div>
                                    <div class="opp-name">${opp.name}</div>
                                </div>
                                <span class="opp-badge ${badgeClass}">${badgeText}</span>
                            </div>
                            <div class="opp-metrics">
                                ${metricsHtml}
                            </div>
                            <div class="opp-reason">${opp.reason}</div>
                        </div>
                    </div>
                `;
            }).join('');

            oppsList.forEach(opp => {
                const chartId = `chart-${containerId}-${opp.symbol.replace(/[^a-zA-Z0-9]/g, '-')}`;
                const chartEl = document.getElementById(chartId);
                if (!chartEl) return;
                const widgetContainer = chartEl.querySelector('.tradingview-widget-container');
                if (!widgetContainer) return;

                const script = document.createElement('script');
                script.type = 'text/javascript';
                script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
                script.async = true;
                script.text = JSON.stringify({
                    "symbol": opp.tvSymbol || opp.symbol,
                    "width": "100%",
                    "height": "100%",
                    "locale": "es",
                    "dateRange": "1M",
                    "colorTheme": "dark",
                    "isTransparent": true,
                    "autosize": true,
                    "largeChartUrl": "",
                    "noTimeScale": false
                });
                widgetContainer.appendChild(script);
            });
        }

        renderOppGrid('crypto-opportunities', opps.crypto);
        renderOppGrid('us-opportunities', opps.usa);
        renderOppGrid('arg-opportunities', opps.argentina);
    }

    // ── Fallback/Static opportunities (Original lists if AI fails or hasn't run) ──
    function renderStaticOpportunities() {
        const fallbackOpps = {
            long: {
                crypto: [
                    { symbol: 'LINK', name: 'Chainlink', tvSymbol: 'BINANCE:LINKUSDT', badge: 'strong-buy', badgeText: 'Compra Fuerte', metrics: [{ label: 'Sector', value: 'Oracles / RWA' }, { label: 'Desde ATH', value: '~-57%' }], reason: 'Oráculo monopolista clave para la tokenización de activos en la blockchain.' },
                    { symbol: 'ADA', name: 'Cardano', tvSymbol: 'BINANCE:ADAUSDT', badge: 'buy', badgeText: 'Comprar', metrics: [{ label: 'Sector', value: 'L1 Chain' }, { label: 'Desde ATH', value: '~-64%' }], reason: 'Gobernanza descentralizada segura y desarrollo robusto.' },
                    { symbol: 'AVAX', name: 'Avalanche', tvSymbol: 'BINANCE:AVAXUSDT', badge: 'speculative', badgeText: 'Especulativo', metrics: [{ label: 'Sector', value: 'L1 + Subnets' }, { label: 'Desde ATH', value: '~-67%' }], reason: 'La blockchain elegida por las grandes instituciones financieras.' }
                ],
                usa: [
                    { symbol: 'GOOGL', name: 'Alphabet Inc.', tvSymbol: 'NASDAQ:GOOGL', badge: 'strong-buy', badgeText: 'Compra Fuerte', metrics: [{ label: 'P/E Forward', value: '18.5x' }, { label: 'Sector', value: 'Tech / IA' }], reason: 'Líder tecnológico en IA y búsquedas globales con valuación descontada.' },
                    { symbol: 'TSM', name: 'Taiwan Semiconductor', tvSymbol: 'NYSE:TSM', badge: 'buy', badgeText: 'Comprar', metrics: [{ label: 'P/E Forward', value: '22x' }, { label: 'Sector', value: 'Semiconductors' }], reason: 'Fabricante exclusivo de silicio avanzado para procesadores de IA.' },
                    { symbol: 'AMZN', name: 'Amazon.com', tvSymbol: 'NASDAQ:AMZN', badge: 'buy', badgeText: 'Comprar', metrics: [{ label: 'P/E Forward', value: '28x' }, { label: 'AWS Growth', value: '+19%' }], reason: 'Márgenes de ganancia en expansión gracias a la nube (AWS) y publicidad.' }
                ],
                argentina: [
                    { symbol: 'BCBA:SUPV', name: 'Grupo Supervielle', tvSymbol: 'BCBA:SUPV', badge: 'strong-buy', badgeText: 'Compra Fuerte', metrics: [{ label: 'P/E Ratio', value: '5.2x' }, { label: 'P/BV', value: '0.8x' }], reason: 'Banco con el descuento contable más significativo en el sector financiero argentino.' },
                    { symbol: 'BCBA:CEPU', name: 'Central Puerto', tvSymbol: 'BCBA:CEPU', badge: 'buy', badgeText: 'Comprar', metrics: [{ label: 'P/E Ratio', value: '6.8x' }, { label: 'Div. Yield', value: '4.2%' }], reason: 'Generadora de energía con fuerte flujo de caja y dividendos recurrentes.' },
                    { symbol: 'BCBA:ALUA', name: 'Aluar Aluminio', tvSymbol: 'BCBA:ALUA', badge: 'buy', badgeText: 'Comprar', metrics: [{ label: 'P/E Ratio', value: '4.5x' }, { label: 'P/BV', value: '0.65x' }], reason: 'Exportador neto de aluminio subvaluado y cobertura contra la devaluación local.' }
                ]
            },
            short: {
                crypto: [
                    { symbol: 'SOL', name: 'Solana', tvSymbol: 'BINANCE:SOLUSDT', badge: 'strong-buy', badgeText: 'Momentum', metrics: [{ label: 'RSI (14)', value: '38' }, { label: 'Soporte', value: '$68-$70' }], reason: 'Tras tocar soporte de $68-$70 muestra fuerza compradora. Rebote rápido técnico proyectado.' },
                    { symbol: 'WIF', name: 'dogwifhat', tvSymbol: 'BINANCE:WIFUSDT', badge: 'speculative', badgeText: 'Swing', metrics: [{ label: 'Beta vs SOL', value: '2.40' }, { label: 'RSI (14)', value: '41' }], reason: 'Activo especulativo para swing trading rápido aprovechando liquidez de la red.' },
                    { symbol: 'NEAR', name: 'Near Protocol', tvSymbol: 'BINANCE:NEARUSDT', badge: 'buy', badgeText: 'Comprar', metrics: [{ label: 'Sector', value: 'L1 + AI' }, { label: 'RSI (14)', value: '35' }], reason: 'RSI comprimido en zona de soporte. Ideal para una reversión a la media en 1-2 semanas.' }
                ],
                usa: [
                    { symbol: 'NVDA', name: 'NVIDIA Corp.', tvSymbol: 'NASDAQ:NVDA', badge: 'speculative', badgeText: 'Trading', metrics: [{ label: 'RSI (14)', value: '68' }, { label: 'Volatilidad', value: 'Alta' }], reason: 'Excelente volatilidad y volumen de negociación para capturar movimientos intradiarios.' },
                    { symbol: 'TSLA', name: 'Tesla Inc.', tvSymbol: 'NASDAQ:TSLA', badge: 'speculative', badgeText: 'Swing', metrics: [{ label: 'RSI (14)', value: '32' }, { label: 'Beta', value: '1.85' }], reason: 'Oportunidad de rebote técnico por sobreventa tras corregir a la media.' },
                    { symbol: 'COIN', name: 'Coinbase Global', tvSymbol: 'NASDAQ:COIN', badge: 'speculative', badgeText: 'High Beta', metrics: [{ label: 'Beta vs BTC', value: '2.10' }, { label: 'RSI (14)', value: '55' }], reason: 'Proxy ideal de apalancamiento regulado frente a los movimientos de Bitcoin.' }
                ],
                argentina: [
                    { symbol: 'BCBA:GGAL', name: 'Grupo Financiero Galicia', tvSymbol: 'BCBA:GGAL', badge: 'speculative', badgeText: 'Momentum', metrics: [{ label: 'Volatilidad', value: 'Alta' }, { label: 'Beta', value: '1.25' }], reason: 'El papel de mayor liquidez local, ideal para trading especulativo rápido.' },
                    { symbol: 'BCBA:YPFD', name: 'YPF S.A.', tvSymbol: 'BCBA:YPFD', badge: 'buy', badgeText: 'Rebote', metrics: [{ label: 'RSI (14)', value: '38' }, { label: 'Soporte', value: 'ARS 28.500' }], reason: 'Corrección de corto plazo hacia soporte dinámico. Oportunidad de entrada para swing.' },
                    { symbol: 'BCBA:PAMP', name: 'Pampa Energía', tvSymbol: 'BCBA:PAMP', badge: 'buy', badgeText: 'Breakout', metrics: [{ label: 'RSI (14)', value: '45' }, { label: 'Patrón', value: 'Bandera' }], reason: 'Compresión en velas de 4 horas. Rompiendo resistencia para iniciar tramo alcista corto.' }
                ]
            }
        };
        renderAIOpportunities(fallbackOpps[currentHorizon]);
    }

    // ── Render opportunities router ──
    function renderOpportunities() {
        const cached = Cache.get('ai_analysis_' + currentHorizon);
        if (cached && cached.opps) {
            renderAIOpportunities(cached.opps);
        } else {
            // Re-run AI analysis if not cached, or show static fallback
            renderStaticOpportunities();
        }
    }

    // ── Horizon Selector Toggle ──
    function setupHorizonToggle() {
        const toggles = document.querySelectorAll('.horizon-toggle');
        toggles.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const horizon = btn.dataset.horizon;
                if (horizon === currentHorizon) return;
                
                currentHorizon = horizon;
                
                // Update active state class on buttons
                toggles.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Re-render opportunities using cached analysis if available, or fetch new analysis
                renderOpportunities();
                
                // Also trigger AI analysis generation/cache-loading for the selected horizon
                generateDailyAnalysis(false);
            });
        });
    }

    // ── Init ──
    function init() {
        setupNavigation();
        setupConfig();
        setupHorizonToggle();
        renderOpportunities();
        loadAllData();

        // Setup AI Manual Refresh
        const refreshAiBtn = document.getElementById('refresh-ai-btn');
        if (refreshAiBtn) {
            refreshAiBtn.addEventListener('click', () => {
                const svg = refreshAiBtn.querySelector('svg');
                if (svg) svg.style.animation = 'spin 1s linear infinite';
                refreshAiBtn.disabled = true;
                
                generateDailyAnalysis(true).finally(() => {
                    if (svg) svg.style.animation = 'none';
                    refreshAiBtn.disabled = false;
                });
            });
        }

        // Auto refresh (only updates market data, not the AI summary)
        setInterval(() => {
            loadAllData(true);
        }, CONFIG.REFRESH_INTERVAL);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
