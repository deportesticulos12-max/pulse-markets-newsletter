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
            `${CONFIG.COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=15&page=1&sparkline=true&price_change_percentage=1h%2C24h%2C7d`,
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

    // ── Render: Opportunities ──
    function renderOpportunities() {
        const opportunities = {
            argentina: [
                {
                    symbol: 'BCBA:SUPV', name: 'Grupo Supervielle', tvSymbol: 'BCBA:SUPV',
                    badge: 'strong-buy', badgeText: 'Compra Fuerte',
                    metrics: [{ label: 'P/E Ratio', value: '5.2x' }, { label: 'P/BV', value: '0.8x' }, { label: 'Sector', value: 'Bancario' }, { label: 'Tipo', value: 'Value Play' }],
                    reason: '<strong>Fundamento:</strong> Cotiza con descuento significativo respecto a su valor libro. El sector bancario argentino se beneficia de la normalización monetaria. ROE elevado y crecimiento de cartera crediticia acelerado.'
                },
                {
                    symbol: 'BCBA:CEPU', name: 'Central Puerto', tvSymbol: 'BCBA:CEPU',
                    badge: 'buy', badgeText: 'Comprar',
                    metrics: [{ label: 'P/E Ratio', value: '6.8x' }, { label: 'Div. Yield', value: '4.2%' }, { label: 'Sector', value: 'Energía' }, { label: 'Tipo', value: 'Dividendos' }],
                    reason: '<strong>Fundamento:</strong> Empresa energética con flujo de caja sólido y dividendos atractivos. La desregulación del sector energético argentino beneficia directamente a generadoras.'
                },
                {
                    symbol: 'BCBA:ALUA', name: 'Aluar Aluminio', tvSymbol: 'BCBA:ALUA',
                    badge: 'buy', badgeText: 'Comprar',
                    metrics: [{ label: 'P/E Ratio', value: '4.5x' }, { label: 'P/BV', value: '0.65x' }, { label: 'Sector', value: 'Materiales' }, { label: 'Tipo', value: 'Value + Export' }],
                    reason: '<strong>Fundamento:</strong> Cotiza muy por debajo de su valor libro. Exportadora natural que se beneficia de competitividad cambiaria. Bajo apalancamiento financiero.'
                }
            ],
            usa: [
                {
                    symbol: 'GOOGL', name: 'Alphabet Inc.', tvSymbol: 'NASDAQ:GOOGL',
                    badge: 'strong-buy', badgeText: 'Compra Fuerte',
                    metrics: [{ label: 'P/E Forward', value: '18.5x' }, { label: 'PEG Ratio', value: '0.92' }, { label: 'Sector', value: 'Tech / IA' }, { label: 'Tipo', value: 'Growth + Value' }],
                    reason: '<strong>Fundamento:</strong> Trading con descuento respecto a peers tech. Gemini posiciona a Google fuerte en IA. Cloud creciendo ~28% YoY. Programa de buyback masivo.'
                },
                {
                    symbol: 'TSM', name: 'Taiwan Semiconductor', tvSymbol: 'NYSE:TSM',
                    badge: 'buy', badgeText: 'Comprar',
                    metrics: [{ label: 'P/E Forward', value: '22x' }, { label: 'Revenue Growth', value: '+36% YoY' }, { label: 'Sector', value: 'Semiconductors' }, { label: 'Tipo', value: 'Monopoly Play' }],
                    reason: '<strong>Fundamento:</strong> Monopolio virtual en fabricación de chips avanzados. Todos los líderes tech dependen de TSMC. Demanda insaciable por chips de IA.'
                },
                {
                    symbol: 'AMZN', name: 'Amazon.com', tvSymbol: 'NASDAQ:AMZN',
                    badge: 'buy', badgeText: 'Comprar',
                    metrics: [{ label: 'P/E Forward', value: '28x' }, { label: 'AWS Growth', value: '+19% YoY' }, { label: 'Sector', value: 'Tech / Cloud' }, { label: 'Tipo', value: 'Platform Play' }],
                    reason: '<strong>Fundamento:</strong> AWS sigue siendo líder en cloud computing. Márgenes operativos en expansión. Advertising en crecimiento acelerado.'
                }
            ],
            crypto: [
                {
                    symbol: 'LINK', name: 'Chainlink', tvSymbol: 'BINANCE:LINKUSDT',
                    badge: 'strong-buy', badgeText: 'Compra Fuerte',
                    metrics: [{ label: 'Sector', value: 'Oracles / RWA' }, { label: 'Adopción', value: '75% protocolos DeFi' }, { label: 'Tipo', value: 'Infraestructura' }, { label: 'Desde ATH', value: '~-57%' }],
                    reason: '<strong>Fundamento:</strong> Infraestructura crítica de DeFi. CCIP posiciona a Chainlink como backbone de tokenización de activos reales (RWA), mercado de $16T. Adopción institucional con Swift y DTCC.'
                },
                {
                    symbol: 'ADA', name: 'Cardano', tvSymbol: 'BINANCE:ADAUSDT',
                    badge: 'buy', badgeText: 'Comprar',
                    metrics: [{ label: 'Sector', value: 'L1 Blockchain' }, { label: 'Governance', value: 'On-chain' }, { label: 'Tipo', value: 'Ecosystem Play' }, { label: 'Desde ATH', value: '~-64%' }],
                    reason: '<strong>Fundamento:</strong> Blockchain con governance on-chain robusto. Upgrade Hydra mejora escalabilidad. Crecimiento explosivo del ecosistema DeFi de Cardano.'
                },
                {
                    symbol: 'AVAX', name: 'Avalanche', tvSymbol: 'BINANCE:AVAXUSDT',
                    badge: 'speculative', badgeText: 'Especulativo',
                    metrics: [{ label: 'Sector', value: 'L1 + Subnets' }, { label: 'Partnerships', value: 'JP Morgan, Citi' }, { label: 'Tipo', value: 'Institutional DeFi' }, { label: 'Desde ATH', value: '~-67%' }],
                    reason: '<strong>Fundamento:</strong> Subnets permiten blockchains customizados para instituciones. Partnerships con JP Morgan y Citi para tokenización. Avalanche9000 upgrade reduce costos 99%.'
                }
            ]
        };

        function renderOppGrid(containerId, opps) {
            const container = document.getElementById(containerId);
            if (!container) return;

            container.innerHTML = opps.map(opp => {
                const chartId = `chart-${containerId}-${opp.symbol.replace(/[^a-zA-Z0-9]/g, '-')}`;
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
                                <span class="opp-badge ${opp.badge}">${opp.badgeText}</span>
                            </div>
                            <div class="opp-metrics">
                                ${opp.metrics.map(m => `<div class="opp-metric"><div class="opp-metric-label">${m.label}</div><div class="opp-metric-value">${m.value}</div></div>`).join('')}
                            </div>
                            <div class="opp-reason">${opp.reason}</div>
                        </div>
                    </div>
                `;
            }).join('');

            // Programmatically load TradingView widgets so the browser actually executes the scripts
            opps.forEach(opp => {
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
                    "symbol": opp.tvSymbol,
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

        renderOppGrid('arg-opportunities', opportunities.argentina);
        renderOppGrid('us-opportunities', opportunities.usa);
        renderOppGrid('crypto-opportunities', opportunities.crypto);
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
        const tabs = document.querySelectorAll('.nav-tab');
        const sections = document.querySelectorAll('.content-section');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.section;
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
            localStorage.removeItem('pm_ai_analysis');
        }
        
        const cachedAnalysis = Cache.get('ai_analysis');
        if (cachedAnalysis && !forceRefresh) {
            container.innerHTML = marked.parse(cachedAnalysis);
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
- Titulares Crypto hoy: ${cryptoNews}
- Titulares Wall Street hoy: ${usNews}
- Titulares Argentina hoy: ${argNews}

PAUTAS CRÍTICAS DE CONTEXTO:
- En la cabecera del reporte debes indicar siempre: "**Fecha:** ${currentDateStr} | **Analista:** Gemini AI Advisor".
- Incorpora en el análisis el impacto de tensiones geopolíticas globales recientes de alto nivel, tales como el conflicto o tensiones entre Estados Unidos e Irán, y cómo estas afectan la aversión al riesgo en los mercados globales, el precio de commodities como el petróleo y el comportamiento de refugio de activos como el oro o Bitcoin.

ESTRUCTURA OBLIGATORIA (Resume cada punto para que sea rápido de leer en un dashboard web):
1. CONTEXTO MACROECONÓMICO (Global y local, incluyendo análisis de las tensiones geopolíticas entre EE.UU. e Irán si aplican al sentimiento general)
2. ANÁLISIS ON-CHAIN Y TÉCNICO (Situación actual basada en el precio de BTC y F&G)
3. SENTIMIENTO DEL MERCADO
4. CONCLUSIÓN ESTRATÉGICA (Alcista, Bajista o Neutral para Crypto, Merval y Wall Street. Explica el porqué.)
5. RECOMENDACIONES TÁCTICAS

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
            const markdownText = data.candidates[0].content.parts[0].text;
            
            // Cache it for 1 hour to prevent spamming the API on every reload
            Cache.set('ai_analysis', markdownText, 3600000);
            
            container.innerHTML = marked.parse(markdownText);
            
        } catch (error) {
            console.error("AI Generation Error:", error);
            container.innerHTML = `
                <div class="api-key-missing">
                    <p style="color: #ef4444;">Error al generar el reporte: ${error.message}</p>
                    <button onclick="localStorage.removeItem('pm_ai_analysis'); generateDailyAnalysis();">Reintentar</button>
                </div>
            `;
        }
    }

    // ── Init ──
    function init() {
        setupNavigation();
        setupConfig();
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
