/**
 * Visualizer Registry Pattern
 * Allows extensible registration and instantiation of chart visualizers
 */
class VisualizerRegistry {
    constructor() {
        this.visualizers = new Map();
    }

    register(id, VisualizerClass) {
        if (this.visualizers.has(id)) {
            console.warn(`Visualizer '${id}' already registered. Overwriting.`);
        }
        this.visualizers.set(id, VisualizerClass);
    }

    get(id) {
        if (!this.visualizers.has(id)) {
            throw new Error(`Visualizer '${id}' not found in registry`);
        }
        return this.visualizers.get(id);
    }

    create(id, container) {
        const VisualizerClass = this.get(id);
        return new VisualizerClass(container);
    }

    list() {
        return Array.from(this.visualizers.keys());
    }
}

/**
 * Base Visualizer Class
 * All specific chart visualizers extend this
 */
class BaseVisualizer {
    constructor(container) {
        this.container = container;
        this.chart = echarts.init(container, 'dark');
        this.data = [];
        this.setupResizeListener();
        this.injectInfoPopover();
        setTimeout(() => {
            if (this.chart) {
                this.chart.resize();
            }
        }, 50);
    }

    injectInfoPopover() {
        const chartContainer = this.container.closest('.chart-container');
        if (chartContainer) {
            const header = chartContainer.querySelector('.chart-header');
            if (header && !header.querySelector('.insight-wrapper')) {
                const closeBtn = header.querySelector('.btn-close-chart');
                const wrapper = document.createElement('div');
                wrapper.className = 'insight-wrapper mr-2';
                wrapper.innerHTML = `
                    <svg class="w-4 h-4 insight-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <div class="insight-popover">
                        <div class="insight-section-title">O que é</div>
                        <div class="insight-section-content insight-what">Gráfico de Análise Visual</div>
                        <div class="insight-section-title">O que avalia</div>
                        <div class="insight-section-content insight-why">Métricas de performance ou comportamento do modelo</div>
                        <div class="insight-section-title">Insight Atual</div>
                        <div class="insight-section-content insight-dynamic insight-current">Aguardando dados suficientes para análise</div>
                    </div>
                `;
                
                wrapper.addEventListener('mouseenter', () => {
                    const insight = this.getInsight();
                    wrapper.querySelector('.insight-what').textContent = insight.what || 'Definição não disponível';
                    wrapper.querySelector('.insight-why').textContent = insight.why || 'Avaliação não disponível';
                    wrapper.querySelector('.insight-current').textContent = insight.current || 'Aguardando dados suficientes para análise';
                });
                
                if (closeBtn) {
                    header.insertBefore(wrapper, closeBtn);
                } else {
                    header.appendChild(wrapper);
                }
            }
        }
    }

    getInsight() {
        return {
            what: "Gráfico Base",
            why: "Estrutura genérica para componentes de visualização.",
            current: "Nenhum dado dinâmico para analisar no momento."
        };
    }

    setupResizeListener() {
        const resizeObserver = new ResizeObserver(() => {
            if (this.chart) {
                this.chart.resize();
            }
        });
        resizeObserver.observe(this.container);
    }

    hasCompatibleData() {
        return true; // Default, subclasses can override
    }

    showEmptyState() {
        if (this.chart) {
            this.chart.dispose();
            this.chart = null;
        }
        this.container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full w-full p-6 text-center select-none" style="min-height: 250px;">
                <svg class="w-12 h-12 text-zinc-700 mb-3 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-xs text-zinc-400 max-w-xs font-medium leading-relaxed">
                    No visualization data has been transmitted for this metric in the current execution cycle.
                </p>
            </div>
        `;
    }

    update(data) {
        this.data = data;
        if (!this.hasCompatibleData()) {
            this.showEmptyState();
        } else {
            if (!this.chart) {
                this.container.innerHTML = '';
                this.chart = echarts.init(this.container, 'dark');
                setTimeout(() => {
                    if (this.chart) {
                        this.chart.resize();
                    }
                }, 50);
            }
            this.render();
        }
    }

    getRenderData() {
        if (Array.isArray(this.data)) {
            return this.data;
        }
        if (this.data && this.data.snapshots) {
            const snapshots = this.data.snapshots;
            if (snapshots.length === 0) return [];
            return snapshots.map(s => {
                const best = s.discovered_patterns?.[0];
                return {
                    pattern_descriptor: best?.id || s.id,
                    quality_score_phi: s.global_metrics?.top_quality || best?.quality_score || 0.5,
                    support_percentage: best?.attributes?.support_percentage || ((best?.attributes?.support || 0) / 10),
                    error_class_0: best?.attributes?.error_class_0 || 0.2,
                    error_class_1: best?.attributes?.error_class_1 || 0.2,
                    support_count: best?.attributes?.support || 100,
                    mean_error_mu: s.global_metrics?.avg_error || best?.attributes?.mean_error_mu || 0.25,
                    std_error_sigma: best?.attributes?.std_error_sigma || 0.05,
                    soft_error: best?.attributes?.soft_error || 0.1,
                    p_value_bh: best?.attributes?.p_value_bh || 0.01,
                    delta_g: best?.attributes?.delta_g || 0.05,
                    top10_avg_quality: s.global_metrics?.top_quality || 0.5,
                    search_metrics: { explored_patterns: s.global_metrics?.explored_nodes || 0, search_space_coverage: s.global_metrics?.tree_progress || 0.5 }
                };
            });
        }
        return [];
    }

    render() {
        throw new Error('render() must be implemented by subclass');
    }

    dispose() {
        this.chart.dispose();
    }
}

/**
 * Trade-off Scatter Map Visualizer
 * X: Support, Y: Contrast (Δg), Size: Quality (φ), Color: Class Balance
 */
class TradeoffScatter extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        const latest = snapshots[snapshots.length - 1];
        return latest && latest.discovered_patterns && latest.discovered_patterns.length > 0;
    }

    getRenderData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return [];
        const latest = snapshots[snapshots.length - 1];
        return latest.discovered_patterns || [];
    }

    getInsight() {
        return {
            what: "Trade-off Map (Contrast vs Support)",
            why: "Mapeia as fatias descobertas avaliando o trade-off crítico: fatias com alta divergência de erro (Contraste Δg) tendem a ter menor representatividade (Suporte). O tamanho da bolha representa a Qualidade (φ) global final, e a cor denota o equilíbrio das classes.",
            current: "Analise os quadrantes para identificar as fatias de maior impacto."
        };
    }

    render() {
        const renderData = this.getRenderData();
        
        const scatterData = renderData.map(d => {
            const attrs = d.attributes || {};
            const support = attrs.support || 0;
            const contrast = attrs.delta_g || 0.0;
            const quality = d.quality_score || 0.0;
            const balance = attrs.class_balance || 0.5;
            return [support, contrast, quality, balance, d.id];
        });

        const option = {
            tooltip: {
                trigger: 'item',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    const val = params.value;
                    return `<div style="font-size: 11px; line-height: 1.5; padding: 4px;">
                        <strong style="color: #60a5fa; font-size: 12px;">Slice: ${val[4]}</strong><br/>
                        <strong>Support (N):</strong> ${val[0]} amostras<br/>
                        <strong>Contrast (Δg):</strong> ${val[1].toFixed(4)}<br/>
                        <strong>Quality (φ):</strong> ${val[2].toFixed(4)}<br/>
                        <strong>Class Balance:</strong> ${(val[3] * 100).toFixed(1)}% / ${((1 - val[3]) * 100).toFixed(1)}%
                    </div>`;
                }
            },
            visualMap: {
                min: 0, max: 1,
                dimension: 3,
                orient: 'vertical',
                right: 0,
                top: 'center',
                text: ['100% C0', '100% C1'],
                calculable: true,
                inRange: { color: ['#ef4444', '#a855f7', '#3b82f6'] },
                textStyle: { color: '#a1a1a6', fontSize: 10 }
            },
            xAxis: {
                type: 'value',
                name: 'Support (Amostras)',
                nameLocation: 'middle',
                nameGap: 25,
                scale: true,
                min: (value) => Math.max(0, Math.floor(value.min - (value.max - value.min) * 0.1)),
                max: (value) => Math.ceil(value.max + (value.max - value.min) * 0.1),
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', fontSize: 10 },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            yAxis: {
                type: 'value',
                name: 'Contrast Strength (Δg)',
                nameLocation: 'middle',
                nameGap: 30,
                scale: true,
                min: (value) => Math.max(0, value.min - (value.max - value.min) * 0.1),
                max: (value) => value.max + (value.max - value.min) * 0.1,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            grid: { left: '10%', right: '15%', bottom: '15%', top: '15%', containLabel: true },
            series: [{
                name: 'Slices',
                type: 'scatter',
                data: scatterData,
                symbolSize: (val) => Math.max(8, Math.min(30, val[2] * 30)),
                itemStyle: { borderColor: '#18181b', borderWidth: 1 }
            }]
        };

        this.chart.setOption(option);
    }
}

/**
 * Quality Score Radar Visualizer
 */
class QualityDecompositionRadar extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        return snapshots[snapshots.length - 1]?.discovered_patterns?.length > 0;
    }

    getInsight() {
        return {
            what: "Quality Score Components",
            why: "A Quality Score (φ) bruta do MCTS é uma composição matemática. Este radar desconstrói a métrica para a Top-1 Slice, permitindo entender exatamente qual fator puxou o escore para cima (Separação, Desvio, Balanceamento ou Suporte).",
            current: "Visualizando métricas normalizadas."
        };
    }

    render() {
        const snapshots = this.data?.snapshots || [];
        const latest = snapshots[snapshots.length - 1];
        const topSlice = latest?.discovered_patterns?.[0];
        if (!topSlice) return;

        const attrs = topSlice.attributes || {};
        const sep = Math.min(1.0, attrs.separation || 0.0);
        const dev = Math.min(1.0, attrs.deviation || 0.0);
        // Normalize balance so that 0.5 is 1.0 (perfect balance), and 0 or 1 is 0.0
        const balRaw = attrs.class_balance || 0.5;
        const bal = 1.0 - (Math.abs(0.5 - balRaw) * 2);
        const sup = attrs.support_penalty_pgB || 0.0;

        const option = {
            tooltip: { trigger: 'item', backgroundColor: '#18181b', borderColor: '#27272a', textStyle: { color: '#e4e4e7' } },
            radar: {
                indicator: [
                    { name: 'Separation (s)', max: 1.0 },
                    { name: 'Deviation (d)', max: 1.0 },
                    { name: 'Balance (b)', max: 1.0 },
                    { name: 'Support Penalty (p)', max: 1.0 }
                ],
                splitNumber: 4,
                axisName: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: ['#27272a', '#27272a', '#3f3f46', '#3f3f46'] } },
                splitArea: { areaStyle: { color: ['#18181b', '#18181b', '#18181b', '#18181b'] } },
                axisLine: { lineStyle: { color: '#3f3f46' } }
            },
            series: [{
                name: 'Quality Components',
                type: 'radar',
                data: [{
                    value: [sep, dev, bal, sup],
                    name: `Top Slice: ${topSlice.id}`,
                    itemStyle: { color: '#60a5fa' },
                    areaStyle: { color: 'rgba(96, 165, 250, 0.4)' }
                }]
            }]
        };
        this.chart.setOption(option);
    }
}

/**
 * Soft Error Distribution Visualizer
 */
class SoftErrorDistribution extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        return snapshots[snapshots.length - 1]?.discovered_patterns?.length > 0;
    }

    getInsight() {
        return {
            what: "Soft Error Distribution (μ ± σ)",
            why: "Plota o erro médio (μ) e a margem de variância (σ) para as duas classes alvo da Top-1 Slice. Permite comparar visualmente o erro local, justificando a anomalia.",
            current: "O intervalo representa ±1 desvio padrão."
        };
    }

    render() {
        const selectedPattern = window.app?.selectedPattern;
        if (!selectedPattern) {
            this.chart.clear();
            this.chart.setOption({
                title: {
                    text: 'Selecione um padrão na lista\npara visualizar a distribuição de Soft Error',
                    left: 'center', top: 'center',
                    textStyle: { color: '#a1a1a6', fontSize: 12, fontWeight: 'normal' }
                }
            });
            return;
        }

        const topSlice = selectedPattern;
        const attrs = topSlice.attributes || {};
        const mu0 = attrs.error_class_0 || 0;
        const mu1 = attrs.error_class_1 || 0;
        const sig0 = attrs.std_class_0 || 0;
        const sig1 = attrs.std_class_1 || 0;

        // Custom error bar rendering using ECharts custom series
        const data = [
            [0, mu0, Math.max(0, mu0 - sig0), Math.min(1, mu0 + sig0)],
            [1, mu1, Math.max(0, mu1 - sig1), Math.min(1, mu1 + sig1)]
        ];

        const renderItem = (params, api) => {
            const xValue = api.value(0);
            const highPoint = api.coord([xValue, api.value(3)]);
            const lowPoint = api.coord([xValue, api.value(2)]);
            const halfWidth = api.size([1, 0])[0] * 0.1;
            const style = api.style({ stroke: api.visual('color'), fill: null, lineWidth: 2 });
            
            return {
                type: 'group',
                children: [
                    { type: 'line', shape: { x1: highPoint[0], y1: highPoint[1], x2: lowPoint[0], y2: lowPoint[1] }, style: style },
                    { type: 'line', shape: { x1: highPoint[0] - halfWidth, y1: highPoint[1], x2: highPoint[0] + halfWidth, y2: highPoint[1] }, style: style },
                    { type: 'line', shape: { x1: lowPoint[0] - halfWidth, y1: lowPoint[1], x2: lowPoint[0] + halfWidth, y2: lowPoint[1] }, style: style }
                ]
            };
        };

        const option = {
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#18181b', borderColor: '#27272a', textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    const val = params[0].value;
                    if (!val) return '';
                    const mu = val[1].toFixed(4);
                    const sig = (val[3] - val[1]).toFixed(4);
                    const className = val[0] === 0 ? "Classe 0" : "Classe 1";
                    return `<div style="padding: 4px;"><strong>${className}</strong><br/>μ: ${mu}<br/>σ: ±${sig}</div>`;
                }
            },
            grid: { left: '15%', right: '10%', bottom: '15%', top: '20%', containLabel: true },
            xAxis: {
                type: 'category',
                data: ['Classe 0', 'Classe 1'],
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' }
            },
            yAxis: {
                type: 'value',
                name: 'Soft Error (Loss)',
                nameLocation: 'middle', nameGap: 40,
                min: 0.0, max: 1.0,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            series: [
                {
                    type: 'scatter',
                    name: 'Média (μ)',
                    data: [[0, mu0], [1, mu1]],
                    itemStyle: { color: '#60a5fa' },
                    symbolSize: 12
                },
                {
                    type: 'custom',
                    name: 'Variância (±σ)',
                    renderItem: renderItem,
                    data: data,
                    itemStyle: { color: '#60a5fa' }
                }
            ]
        };
        this.chart.setOption(option);
    }
}

/**
 * SubsequenceImportanceHeatmap Visualizer
 * X: API Operation names, Y: Discover patterns IDs, Value: Attribution weight
 */
class SubsequenceImportanceHeatmap extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        const latest = snapshots[snapshots.length - 1];
        return latest && latest.global_metrics && latest.global_metrics.subsequence_importance;
    }

    render() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return;
        const latest = snapshots[snapshots.length - 1];
        const dataInfo = latest.global_metrics.subsequence_importance;
        
        const option = {
            title: {
                text: 'Subsequence API Importance Heatmap',
                left: 'center',
                top: 10,
                textStyle: { color: '#e4e4e7', fontSize: 14, fontWeight: 'normal' }
            },
            tooltip: {
                position: 'top',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    const api = dataInfo.apis[params.value[0]];
                    const pattern = dataInfo.patterns[params.value[1]];
                    const weight = params.value[2];
                    return `<div style="font-size: 11px; padding: 4px; line-height: 1.5;">
                        <strong style="color: #60a5fa;">API:</strong> ${api}<br/>
                        <strong style="color: #a855f7;">Pattern ID:</strong> ${pattern}<br/>
                        <strong>Attribution weight:</strong> ${weight.toFixed(3)}
                    </div>`;
                }
            },
            grid: { left: '15%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                data: dataInfo.apis.map(api => api.replace("API=", "")),
                axisLabel: { color: '#a1a1a6', rotate: 25, fontSize: 9 },
                splitArea: { show: true }
            },
            yAxis: {
                type: 'category',
                data: dataInfo.patterns,
                axisLabel: { color: '#a1a1a6' },
                splitArea: { show: true }
            },
            visualMap: {
                min: 0,
                max: 1,
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: 5,
                textStyle: { color: '#a1a1a6', fontSize: 10 },
                inRange: {
                    color: ['#18181b', '#1e293b', '#0369a1', '#0284c7', '#0284c7', '#0ea5e9', '#38bdf8']
                }
            },
            series: [{
                name: 'Attribution Weight',
                type: 'heatmap',
                data: dataInfo.matrix,
                label: {
                    show: true,
                    fontSize: 9,
                    color: '#e2e8f0',
                    formatter: (p) => p.value[2] > 0.2 ? p.value[2].toFixed(2) : ''
                },
                emphasis: {
                    itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' }
                }
            }]
        };
        this.chart.setOption(option);
    }
}

/**
 * SequenceEmbeddingScatter Visualizer
 * Coordinates: t-SNE or UMAP projection, Color: Target label class
 */
class SequenceEmbeddingScatter extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        const latest = snapshots[snapshots.length - 1];
        return latest && latest.global_metrics && latest.global_metrics.embeddings;
    }

    render() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return;
        const latest = snapshots[snapshots.length - 1];
        const embeddings = latest.global_metrics.embeddings || [];
        
        const malwareSeries = embeddings.filter(e => e.label).map(e => [...e.coords, e.id, e.descriptor]);
        const benignSeries = embeddings.filter(e => !e.label).map(e => [...e.coords, e.id, e.descriptor]);
        
        const option = {
            title: {
                text: 'Sequence Embedding Projection (UMAP)',
                left: 'center',
                top: 10,
                textStyle: { color: '#e4e4e7', fontSize: 14, fontWeight: 'normal' }
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    const val = params.value;
                    return `<div style="font-size: 11px; max-width: 250px; white-space: normal; line-height: 1.5; padding: 4px;">
                        <strong style="color: ${params.color}; font-size: 12px;">${val[2]} (${params.seriesName})</strong><br/>
                        <strong>UMAP coords:</strong> [${val[0].toFixed(2)}, ${val[1].toFixed(2)}]<br/>
                        <strong>Sequence trace:</strong> <span style="font-family: monospace; font-size: 10px; color: #a1a1a6;">${val[3]}</span>
                    </div>`;
                }
            },
            legend: {
                data: ['Malicious Slices', 'Benign Slices'],
                textStyle: { color: '#a1a1a6' },
                bottom: 10
            },
            grid: { left: '10%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
            xAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            series: [
                {
                    name: 'Malicious Slices',
                    type: 'scatter',
                    data: malwareSeries,
                    symbolSize: 12,
                    itemStyle: {
                        color: '#ef4444',
                        borderColor: '#f87171',
                        borderWidth: 1.5
                    }
                },
                {
                    name: 'Benign Slices',
                    type: 'scatter',
                    data: benignSeries,
                    symbolSize: 12,
                    itemStyle: {
                        color: '#3b82f6',
                        borderColor: '#60a5fa',
                        borderWidth: 1.5
                    }
                }
            ]
        };
        this.chart.setOption(option);
    }
}

/**
 * IdentityFacetedErrorMatrix Visualizer
 * Faceted bar graphs comparing False Positive and False Negative rates across groups
 */
class IdentityFacetedErrorMatrix extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        const latest = snapshots[snapshots.length - 1];
        return latest && latest.global_metrics && latest.global_metrics.identity_metrics;
    }

    render() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return;
        const latest = snapshots[snapshots.length - 1];
        const dataInfo = latest.global_metrics.identity_metrics;
        
        const option = {
            title: {
                text: 'Error Bias Faceted by Identity Group',
                left: 'center',
                top: 10,
                textStyle: { color: '#e4e4e7', fontSize: 14, fontWeight: 'normal' }
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    let html = `<div style="font-size: 11px; padding: 4px; line-height: 1.5;">
                        <strong style="color: #60a5fa; font-size: 12px;">${params[0].name}</strong><br/>`;
                    params.forEach(p => {
                        html += `<strong>${p.seriesName}:</strong> ${(p.value * 100).toFixed(2)}%<br/>`;
                    });
                    html += `</div>`;
                    return html;
                }
            },
            legend: {
                data: ['False Positive Rate (FPR)', 'False Negative Rate (FNR)'],
                textStyle: { color: '#a1a1a6' },
                bottom: 10
            },
            grid: { left: '10%', right: '5%', bottom: '20%', top: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                data: dataInfo.groups,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                name: 'Error Rate (%)',
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', formatter: (v) => `${(v * 100).toFixed(0)}%` },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            series: [
                {
                    name: 'False Positive Rate (FPR)',
                    type: 'bar',
                    data: dataInfo.false_positives,
                    itemStyle: { color: '#ef4444' },
                    label: {
                        show: true,
                        position: 'top',
                        color: '#f87171',
                        formatter: (p) => `${(p.value * 100).toFixed(1)}%`
                    }
                },
                {
                    name: 'False Negative Rate (FNR)',
                    type: 'bar',
                    data: dataInfo.false_negatives,
                    itemStyle: { color: '#fb923c' },
                    label: {
                        show: true,
                        position: 'top',
                        color: '#fdba74',
                        formatter: (p) => `${(p.value * 100).toFixed(1)}%`
                    }
                }
            ]
        };
        this.chart.setOption(option);
    }
}

/**
 * ProblematicSliceDiscoveryPanel Visualizer
 * Grid-based card list highlighting high-loss feature + identity subgroups
 */
class ProblematicSliceDiscoveryPanel {
    constructor(container) {
        this.container = container;
        this.data = null;
    }

    update(data) {
        this.data = data;
        this.render();
    }

    render() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) {
            this.container.innerHTML = '<div class="text-xs text-zinc-505 py-6 text-center">Awaiting data iterations...</div>';
            return;
        }
        const latest = snapshots[snapshots.length - 1];
        const slices = latest.global_metrics?.problematic_slices || [];
        
        if (slices.length === 0) {
            this.container.innerHTML = '<div class="text-xs text-zinc-505 py-6 text-center">No high-loss slices flagged.</div>';
            return;
        }
        
        this.container.replaceChildren();
        
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 w-full';
        
        slices.forEach(s => {
            const card = document.createElement('div');
            card.className = 'bg-zinc-850 border border-zinc-800 hover:border-red-950 p-4 rounded-lg flex flex-col justify-between transition-colors shadow';
            
            const header = document.createElement('div');
            header.className = 'flex justify-between items-start mb-2';
            
            const sliceDesc = document.createElement('span');
            sliceDesc.className = 'text-xs font-semibold text-zinc-200 font-mono break-all pr-2';
            sliceDesc.textContent = s.slice;
            
            const badge = document.createElement('span');
            badge.className = 'px-2 py-0.5 bg-red-950/60 text-red-400 border border-red-900/40 rounded text-[9px] font-bold uppercase tracking-wide flex-shrink-0';
            badge.textContent = `Loss: ${s.loss.toFixed(2)}`;
            
            header.appendChild(sliceDesc);
            header.appendChild(badge);
            
            const stats = document.createElement('div');
            stats.className = 'flex justify-between items-center text-[10px] text-zinc-500 mt-2 border-t border-zinc-800/60 pt-2';
            
            const sup = document.createElement('span');
            sup.textContent = `Support: n = ${s.support}`;
            
            const action = document.createElement('button');
            action.className = 'text-blue-400 hover:text-blue-300 font-medium cursor-pointer transition-colors';
            action.textContent = 'Focus Search';
            action.onclick = async () => {
                try {
                    await fetch('/api/control/focus', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pattern_id: s.slice, focused: true })
                    });
                    window.app.addActivityLog(`Focused exploration search on: ${s.slice}`);
                    window.app.fetchCurrentConfig();
                } catch(err) {
                    console.error('Focus slice err:', err);
                }
            };
            
            stats.appendChild(sup);
            stats.appendChild(action);
            
            card.appendChild(header);
            card.appendChild(stats);
            grid.appendChild(card);
        });
        
        this.container.appendChild(grid);
    }

    dispose() {}
}

/**
 * Metrics Evolution Visualizer
 * Line chart to show progression over time
 */
class MetricsEvolution extends BaseVisualizer {
    hasCompatibleData() {
        return Array.isArray(this.data) && this.data.length > 0;
    }

    render() {
        if (!this.data || this.data.length === 0) return;
        const option = {
            title: { text: 'Evolution over Iterations', left: 'center', top: 10, textStyle: { color: '#e4e4e7', fontSize: 14, fontWeight: 'normal' } },
            tooltip: { trigger: 'axis', backgroundColor: '#18181b', borderColor: '#27272a', textStyle: { color: '#e4e4e7' } },
            xAxis: {
                type: 'category',
                name: 'Iterations',
                nameLocation: 'middle',
                nameGap: 30,
                data: this.data.map((d, i) => d.search_metrics ? d.search_metrics.explored_patterns : i),
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' }
            },
            yAxis: {
                type: 'value',
                name: 'Quality Score',
                nameLocation: 'middle',
                nameGap: 40,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } },
                min: 'dataMin',
                max: 'dataMax'
            },
            grid: { left: '12%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
            series: [
                {
                    name: 'Top 10 Avg Quality',
                    type: 'line',
                    data: this.data.map(d => d.top10_avg_quality || 0),
                    itemStyle: { color: '#a855f7' },
                    lineStyle: { width: 2 },
                    smooth: true
                },
                {
                    name: 'Best Pattern Quality',
                    type: 'line',
                    data: this.data.map(d => d.quality_score_phi || 0),
                    itemStyle: { color: '#3b82f6' },
                    lineStyle: { width: 2 },
                    smooth: true
                }
            ]
        };
        this.chart.setOption(option);
    }
}

/**
 * Class Balance Pie Chart
 */
class ClassBalancePie extends BaseVisualizer {
    hasCompatibleData() {
        return Array.isArray(this.data) && this.data.length > 0;
    }

    render() {
        if (!this.data || this.data.length === 0) return;
        const latest = this.data[this.data.length - 1];
        
        const size0 = Math.round(latest.support_count * (latest.class_balance_bg || 0.5));
        const size1 = latest.support_count - size0;

        const option = {
            title: { text: 'Class Balance (Best Pattern)', left: 'center', top: 10, textStyle: { color: '#e4e4e7', fontSize: 14, fontWeight: 'normal' } },
            tooltip: { trigger: 'item', backgroundColor: '#18181b', borderColor: '#27272a', textStyle: { color: '#e4e4e7' } },
            series: [
                {
                    type: 'pie',
                    radius: '60%',
                    center: ['50%', '55%'],
                    data: [
                        { value: size0, name: 'Class 0', itemStyle: { color: '#ef4444' } },
                        { value: size1, name: 'Class 1', itemStyle: { color: '#3b82f6' } }
                    ],
                    label: { color: '#a1a1a6' },
                    itemStyle: { borderColor: '#18181b', borderWidth: 2 }
                }
            ]
        };
        this.chart.setOption(option);
    }
}

/**
 * Slices Heatmap Visualizer
 * Shows multiple metrics across top slices
 */
class SlicesHeatmap extends BaseVisualizer {
    hasCompatibleData() {
        return Array.isArray(this.data) && this.data.length > 0;
    }

    render() {
        if (!this.data || this.data.length === 0) return;
        
        const slices = this.data;
        const yAxisData = slices.map((_, i) => `Slice ${i + 1}`);
        const metrics = ['Quality', 'Support (%)', 'Err C0', 'Err C1'];
        
        const data = [];
        slices.forEach((slice, i) => {
            data.push([0, i, slice.quality_score_phi || 0]);
            data.push([1, i, (slice.support_percentage || 0) / 100]); // normalized to 0-1 range for visual map roughly
            data.push([2, i, slice.error_class_0 || 0]);
            data.push([3, i, slice.error_class_1 || 0]);
        });

        const option = {
            tooltip: {
                position: 'top',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' },
                formatter: function (params) {
                    const val = params.value[2].toFixed(4);
                    return `Slice ${params.value[1] + 1}<br/>${metrics[params.value[0]]}: ${val}`;
                }
            },
            grid: { left: '12%', right: '10%', bottom: '15%', top: '5%', containLabel: true },
            xAxis: {
                type: 'category',
                data: metrics,
                axisLabel: { color: '#a1a1a6' },
                splitArea: { show: true }
            },
            yAxis: {
                type: 'category',
                data: yAxisData,
                axisLabel: { color: '#a1a1a6' },
                splitArea: { show: true }
            },
            visualMap: {
                min: 0,
                max: 1,
                calculable: true,
                orient: 'vertical',
                right: '0%',
                top: 'center',
                textStyle: { color: '#a1a1a6' },
                inRange: {
                    color: ['#172554', '#1e3a8a', '#1e40af', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa']
                }
            },
            series: [{
                name: 'Metrics',
                type: 'heatmap',
                data: data,
                label: { show: true, color: '#fff', formatter: (p) => p.value[2].toFixed(2) },
                emphasis: {
                    itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' }
                }
            }]
        };
        this.chart.setOption(option);
    }
}

/**
 * Search Metrics KPI Visualizer (DOM-based, not canvas)
 */
class SearchMetricsKPI {
    constructor(container) {
        this.container = container;
        this.data = null;
    }

    update(searchMetrics) {
        this.data = searchMetrics || {};
        this.render();
    }

    render() {
        const kpiPatterns = document.getElementById('kpi-patterns');
        const kpiCoverage = document.getElementById('kpi-coverage');
        const kpiSlices = document.getElementById('kpi-slices');
        const kpiPattern = document.getElementById('kpi-pattern');
        const kpiAvgQuality = document.getElementById('kpi-avg-quality');
        const kpiExplorationCost = document.getElementById('kpi-exploration-cost');
        const kpiExplorationCostSub = document.getElementById('kpi-exploration-cost-sub');

        if (kpiPatterns) {
            kpiPatterns.textContent = this.data.explored_patterns || 0;
        }
        if (kpiCoverage) {
            kpiCoverage.textContent = ((this.data.search_space_coverage || 0) * 100).toFixed(1) + '%';
        }
        if (kpiSlices) {
            kpiSlices.textContent = this.data._sliceCount || 0;
        }
        if (kpiPattern) {
            kpiPattern.textContent = this.data.pattern_descriptor || '-';
            kpiPattern.title = this.data.pattern_descriptor || '';
        }
        if (kpiAvgQuality) {
            kpiAvgQuality.textContent = this.data.top10_avg_quality ? this.data.top10_avg_quality.toFixed(4) : '0.0000';
        }
        if (kpiExplorationCost) {
            const timeGained = this.data.budget_consumed || 0.0;
            const slicesFound = this.data._sliceCount || 0;
            kpiExplorationCost.textContent = `${timeGained.toFixed(1)}s / ${slicesFound} slices`;
            if (kpiExplorationCostSub) {
                const ratio = slicesFound > 0 ? (timeGained / slicesFound) : 0.0;
                kpiExplorationCostSub.textContent = `Ratio: ${ratio.toFixed(2)}s/slice`;
            }
        }
    }

    dispose() {
        // DOM-based visualizer, no cleanup needed
    }
}

/**
 * Convergence Chart - Step chart showing quality progression
 */
class ConvergenceChart extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        const latest = snapshots[snapshots.length - 1];
        return latest && latest.global_metrics && latest.global_metrics.anytime_quality && latest.global_metrics.anytime_quality.length > 0;
    }

    getInsight() {
        return {
            what: "Quality Convergence (Step Chart)",
            why: "Acompanha o maior Quality Score (φ) encontrado ao longo do tempo/iterações. Uma curva em degraus íngreme no início indica que o algoritmo MCTSExtent convergiu rapidamente para subgrupos de alto contraste.",
            current: "Observando a convergência em tempo real."
        };
    }

    render() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return;
        const latest = snapshots[snapshots.length - 1];
        const history = latest.global_metrics.anytime_quality || [];

        const option = {
            title: { text: 'Quality Convergence', left: 'center', top: 10, textStyle: { color: '#e4e4e7', fontSize: 14, fontWeight: 'normal' } },
            tooltip: { 
                trigger: 'axis', 
                backgroundColor: '#18181b', 
                borderColor: '#27272a', 
                textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    const p = params[0];
                    if (!p || !p.value) return '';
                    return `<div style="font-size: 11px; padding: 4px; line-height: 1.5;">
                        <strong>Elapsed Time:</strong> ${p.value[0].toFixed(2)}s<br/>
                        <strong>Top Quality φ:</strong> ${p.value[1].toFixed(4)}
                    </div>`;
                }
            },
            xAxis: {
                type: 'value',
                name: 'Elapsed Time (s)',
                nameLocation: 'middle',
                nameGap: 25,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            yAxis: {
                type: 'value',
                name: 'Top Quality Score',
                nameLocation: 'middle',
                nameGap: 40,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            grid: { left: '12%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
            series: [{
                name: 'Top Quality',
                type: 'line',
                step: 'start',
                data: history,
                itemStyle: { color: '#10b981' },
                lineStyle: { width: 2 },
                areaStyle: { color: 'rgba(16, 185, 129, 0.2)' }
            }]
        };
        this.chart.setOption(option);
    }
}

/**
 * Bubble Chart - Quality vs Support with complexity as bubble size
 */
class BubbleChartViz extends BaseVisualizer {
    hasCompatibleData() {
        return Array.isArray(this.data) && this.data.length > 0;
    }

    render() {
        if (!this.data || this.data.length === 0) return;
        const bubbleData = this.data.map(d => ({
            value: [d.support_percentage || 50, d.quality_score_phi || 0.5, d.delta_g || 0.05],
            itemStyle: { color: '#06b6d4', borderColor: '#0ea5e9', borderWidth: 1 }
        }));
        
        const option = {
            title: { text: 'Quality vs Support (Bubble Size = Δg)', left: 'center', top: 10, textStyle: { color: '#e4e4e7', fontSize: 14, fontWeight: 'normal' } },
            tooltip: { 
                trigger: 'item', 
                backgroundColor: '#18181b', 
                borderColor: '#27272a', 
                textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    if (params.value) {
                        return `Support: ${params.value[0].toFixed(1)}%<br/>Quality: ${params.value[1].toFixed(4)}<br/>Δg: ${params.value[2].toFixed(4)}`;
                    }
                }
            },
            xAxis: {
                type: 'value',
                name: 'Support (%)',
                nameLocation: 'middle',
                nameGap: 30,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            yAxis: {
                type: 'value',
                name: 'Quality Score (φ)',
                nameLocation: 'middle',
                nameGap: 40,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            grid: { left: '12%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
            series: [{
                name: 'Patterns',
                type: 'scatter',
                symbolSize: (val) => Math.max(8, Math.min(25, val[2] * 200)),
                data: bubbleData,
                emphasis: { itemStyle: { color: '#00d9ff', borderWidth: 2 } }
            }]
        };
        this.chart.setOption(option);
    }
}

/**
 * Pareto Frontier Visualizer
 * Scatter plot and line curve for Quality vs. Support Pareto-optimal frontier
 */
class ParetoFrontier extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        const latest = snapshots[snapshots.length - 1];
        return latest && latest.global_metrics && latest.global_metrics.pareto_frontier && latest.global_metrics.pareto_frontier.length > 0;
    }

    showEmptyState() {
        if (this.chart) {
            this.chart.dispose();
            this.chart = null;
        }
        this.container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full w-full p-6 text-center select-none" style="min-height: 250px;">
                <svg class="w-12 h-12 text-zinc-700 mb-3 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-xs text-zinc-400 max-w-xs font-medium leading-relaxed">
                    No visualization data has been transmitted for this metric in the current execution cycle.
                </p>
            </div>
        `;
    }

    render() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return;
        const latest = snapshots[snapshots.length - 1];
        const patterns = latest.discovered_patterns || [];

        // Extrair todos os pontos (Support Percentage, Quality Score, ID)
        let allPoints = patterns.map(p => ({
            x: (p.attributes.support_percentage || ((p.attributes.support || 0) / 10)),
            y: p.quality_score || 0,
            id: p.id
        }));

        // Sort por X (asc), e depois Y (asc)
        allPoints.sort((a, b) => {
            if (a.x !== b.x) return a.x - b.x;
            return a.y - b.y;
        });

        // Computar a Fronteira de Pareto (Max(X) e Max(Y))
        let paretoFrontier = [];
        let max_y = -Infinity;
        // Percorremos da direita (maior X) para a esquerda (menor X)
        for (let i = allPoints.length - 1; i >= 0; i--) {
            if (allPoints[i].y >= max_y) {
                // É ótimo ou igual ao ótimo (não-dominado)
                paretoFrontier.push(allPoints[i]);
                max_y = allPoints[i].y;
            }
        }
        // Inverte para ficar ordenado da esquerda (menor X) para direita (maior X) para o traçado de linha
        paretoFrontier.reverse();

        const option = {
            title: {
                text: 'Pareto Frontier (Quality vs. Support)',
                left: 'center',
                top: 10,
                textStyle: { color: '#e4e4e7', fontSize: 14, fontWeight: 'normal' }
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    const val = params.value;
                    if (!val) return '';
                    return `<div style="font-size: 11px; padding: 4px; line-height: 1.5;">
                        <strong style="color: #60a5fa; font-size: 12px;">Pattern: ${val[2]}</strong><br/>
                        <strong>Support (Coverage):</strong> ${val[0].toFixed(2)}%<br/>
                        <strong>Quality Score (φ):</strong> ${val[1].toFixed(4)}
                    </div>`;
                }
            },
            xAxis: {
                type: 'value',
                name: 'Support Percentage (%)',
                nameLocation: 'middle',
                nameGap: 25,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', formatter: '{value}%' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            yAxis: {
                type: 'value',
                name: 'Quality Score (φ)',
                nameLocation: 'middle',
                nameGap: 30,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            grid: { left: '12%', right: '8%', bottom: '15%', top: '15%', containLabel: true },
            series: [
                {
                    name: 'All Discovered Slices',
                    type: 'scatter',
                    data: allPoints.map(p => [p.x, p.y, p.id]),
                    symbolSize: 6,
                    itemStyle: { color: '#71717a', opacity: 0.4 } // Baixa opacidade
                },
                {
                    name: 'Pareto Frontier',
                    type: 'line',
                    data: paretoFrontier.map(p => [p.x, p.y, p.id]),
                    lineStyle: { color: '#ef4444', width: 2 },
                    symbol: 'circle',
                    symbolSize: 8,
                    itemStyle: { color: '#ef4444', borderColor: '#fca5a5', borderWidth: 1.5 },
                    smooth: false // Pareto real costuma ser em ângulos retos ou retas, mas vamos deixar false para não extrapolar a matemática
                }
            ]
        };

        this.chart.setOption(option);
    }
}

/**
 * Feature Importance Visualizer
 * Horizontal bar chart for statistical prevalence of attributes in top nodes
 */
class FeatureImportance extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        const latest = snapshots[snapshots.length - 1];
        return latest && latest.global_metrics && latest.global_metrics.feature_importance && Object.keys(latest.global_metrics.feature_importance).length > 0;
    }

    showEmptyState() {
        if (this.chart) {
            this.chart.dispose();
            this.chart = null;
        }
        this.container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full w-full p-6 text-center select-none" style="min-height: 250px;">
                <svg class="w-12 h-12 text-zinc-700 mb-3 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-xs text-zinc-400 max-w-xs font-medium leading-relaxed">
                    No visualization data has been transmitted for this metric in the current execution cycle.
                </p>
            </div>
        `;
    }

    getInsight() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) {
            return {
                what: "Feature Importance (Tree Frequency)",
                why: "Identifica quais características ou APIs são mais frequentes nos nós que levam à descoberta de fatias (slices) problemáticas.",
                current: "Aguardando dados de features."
            };
        }
        
        const latest = snapshots[snapshots.length - 1];
        const importance = latest.global_metrics?.feature_importance || {};
        const entries = Object.entries(importance);
        
        if (entries.length === 0) {
            return {
                what: "Feature Importance (Tree Frequency)",
                why: "Identifica quais características são predominantes nos melhores nós da árvore de busca.",
                current: "Nenhuma feature identificada no top 5% dos nós."
            };
        }
        
        const topFeature = entries.reduce((prev, curr) => (curr[1] > prev[1]) ? curr : prev);
        const ratio = Math.min((topFeature[1] * 100), 100).toFixed(1);

        return {
            what: "Feature Importance (Tree Frequency)",
            why: "Mede a prevalência de atributos nas regras que formam os piores ou melhores subgrupos. Características muito prevalentes costumam ser as 'causas-raiz'.",
            current: `A característica '${topFeature[0]}' está presente em ${ratio}% das regras associadas aos nós de maior qualidade.`
        };
    }

    render() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return;
        const latest = snapshots[snapshots.length - 1];
        const importance = latest.global_metrics.feature_importance || {};

        // Sort items by importance ascending for vertical rendering bottom-to-top
        const sortedItems = Object.entries(importance).sort((a, b) => a[1] - b[1]);
        const yData = sortedItems.map(item => item[0]);
        const xData = sortedItems.map(item => Math.min(item[1], 1.0));

        const option = {
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    const p = params[0];
                    return `<div style="font-size: 11px; padding: 4px;">
                        <strong>Attribute:</strong> ${p.name}<br/>
                        <strong>Prevalence Ratio:</strong> ${(p.value * 100).toFixed(1)}%
                    </div>`;
                }
            },
            xAxis: {
                type: 'value',
                name: 'Prevalence in Top 5% Nodes',
                nameLocation: 'middle',
                nameGap: 25,
                min: 0,
                max: 1.0,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', formatter: (val) => `${(val * 100).toFixed(0)}%` },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            yAxis: {
                type: 'category',
                data: yData,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { 
                    color: '#a1a1a6', 
                    fontSize: 10,
                    formatter: (val) => val.length > 20 ? val.substring(0, 20) + '...' : val
                }
            },
            grid: { left: 130, right: '8%', bottom: '15%', top: '5%', containLabel: false },
            series: [
                {
                    name: 'Prevalence',
                    type: 'bar',
                    data: xData,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                            { offset: 0, color: '#1e3a8a' },
                            { offset: 1, color: '#3b82f6' }
                        ]),
                        borderRadius: [0, 4, 4, 0]
                    }
                }
            ]
        };

        this.chart.setOption(option);
    }
}

/**
 * Depth Histogram Visualizer
 * Vertical bar chart for tree layer node distribution
 */
class DepthHistogram extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        const latest = snapshots[snapshots.length - 1];
        return latest && latest.global_metrics && latest.global_metrics.depth_histogram && latest.global_metrics.depth_histogram.length > 0;
    }

    showEmptyState() {
        if (this.chart) {
            this.chart.dispose();
            this.chart = null;
        }
        this.container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full w-full p-6 text-center select-none" style="min-height: 250px;">
                <svg class="w-12 h-12 text-zinc-700 mb-3 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-xs text-zinc-400 max-w-xs font-medium leading-relaxed">
                    No visualization data has been transmitted for this metric in the current execution cycle.
                </p>
            </div>
        `;
    }

    render() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return;
        const latest = snapshots[snapshots.length - 1];
        const depthHist = latest.global_metrics.depth_histogram || [];

        const xData = depthHist.map((_, i) => `Depth ${i}`);

        const option = {
            title: {
                text: 'Tree Topology & Search Depth Distribution',
                left: 'center',
                top: 10,
                textStyle: { color: '#e4e4e7', fontSize: 14, fontWeight: 'normal' }
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' }
            },
            xAxis: {
                type: 'category',
                data: xData,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' }
            },
            yAxis: {
                type: 'value',
                name: 'Node Count',
                nameLocation: 'middle',
                nameGap: 35,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            grid: { left: '12%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
            series: [
                {
                    name: 'Nodes',
                    type: 'bar',
                    data: depthHist,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#10b981' },
                            { offset: 1, color: '#047857' }
                        ]),
                        borderRadius: [4, 4, 0, 0]
                    }
                }
            ]
        };

        this.chart.setOption(option);
    }
}

/**
 * Contrast KDE Chart - Kernel Density Estimation
 */
class ContrastKDEChart extends BaseVisualizer {
    hasCompatibleData() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return false;
        const latestSnapshot = snapshots[snapshots.length - 1];
        const selectedPattern = this.data.selectedPattern || latestSnapshot.discovered_patterns?.[0];
        return !!selectedPattern;
    }

    render() {
        const snapshots = this.data.snapshots || [];
        if (snapshots.length === 0) return;
        
        const latestSnapshot = snapshots[snapshots.length - 1];
        const selectedPattern = this.data.selectedPattern || latestSnapshot.discovered_patterns?.[0];
        if (!selectedPattern) return;
        
        const baseClass0 = latestSnapshot.global_metrics?.global_errors_class_0 || [];
        const baseClass1 = latestSnapshot.global_metrics?.global_errors_class_1 || [];
        const sliceClass0 = selectedPattern.example_slice?.errors_class_0 || [];
        const sliceClass1 = selectedPattern.example_slice?.errors_class_1 || [];
        
        const xGrid = [];
        for (let i = 0; i <= 50; i++) xGrid.push(i / 50.0);
        
        const yBase0 = this.evaluateKDEAtGrid(xGrid, baseClass0);
        const yBase1 = this.evaluateKDEAtGrid(xGrid, baseClass1);
        const ySlice0 = this.evaluateKDEAtGrid(xGrid, sliceClass0);
        const ySlice1 = this.evaluateKDEAtGrid(xGrid, sliceClass1);
        
        const option = {
            title: {
                text: `Contrast: ${selectedPattern.id} vs Baseline Error Distribution`,
                left: 'center',
                top: 10,
                textStyle: { color: '#e4e4e7', fontSize: 13, fontWeight: '500' }
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' }
            },
            legend: {
                data: ['Base Class 0', 'Base Class 1', 'Slice Class 0', 'Slice Class 1'],
                bottom: 10,
                textStyle: { color: '#a1a1a6', fontSize: 10 }
            },
            xAxis: {
                type: 'category',
                data: xGrid.map(v => v.toFixed(2)),
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', fontSize: 9 }
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            grid: { left: '12%', right: '5%', bottom: '20%', top: '15%', containLabel: true },
            series: [
                {
                    name: 'Base Class 0',
                    type: 'line',
                    data: yBase0,
                    itemStyle: { color: '#94a3b8' },
                    lineStyle: { type: 'dashed', width: 1.5 },
                    smooth: true
                },
                {
                    name: 'Base Class 1',
                    type: 'line',
                    data: yBase1,
                    itemStyle: { color: '#64748b' },
                    lineStyle: { type: 'dashed', width: 1.5 },
                    smooth: true
                },
                {
                    name: 'Slice Class 0',
                    type: 'line',
                    data: ySlice0,
                    itemStyle: { color: '#3b82f6' },
                    areaStyle: { color: 'rgba(59, 130, 246, 0.15)' },
                    smooth: true
                },
                {
                    name: 'Slice Class 1',
                    type: 'line',
                    data: ySlice1,
                    itemStyle: { color: '#ef4444' },
                    areaStyle: { color: 'rgba(239, 68, 68, 0.15)' },
                    smooth: true
                }
            ]
        };
        this.chart.setOption(option);
    }
    
    evaluateKDEAtGrid(grid, data) {
        if (data.length === 0) return grid.map(() => 0.0);
        const h = 1.06 * Math.pow(data.length, -0.2);
        return grid.map(xi => {
            let density = 0;
            data.forEach(xj => {
                const u = (xi - xj) / h;
                density += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
            });
            return parseFloat((density / (data.length * h)).toFixed(4));
        });
    }
}

class MCTSDiagnosticsPanel {
    constructor(container) {
        this.container = container;
        this.data = null;
    }
    
    update(data) {
        this.data = data;
        this.render();
    }
    
    render() {
        const snapshots = this.data.snapshots || [];
        if (snapshots.length === 0) {
            this.container.innerHTML = `
                <div class="col-span-4 flex flex-col items-center justify-center p-6 text-center select-none w-full" style="min-height: 200px;">
                    <svg class="w-12 h-12 text-zinc-700 mb-3 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p class="text-xs text-zinc-400 max-w-xs font-medium leading-relaxed">
                        No visualization data has been transmitted for this metric in the current execution cycle.
                    </p>
                </div>
            `;
            return;
        }
        
        const latest = snapshots[snapshots.length - 1];
        const metrics = latest.global_metrics || {};
        
        const explored = metrics.explored_nodes || 0;
        const total = metrics.search_space || 50000;
        const progress = ((explored / total) * 100).toFixed(2);
        const stability = metrics.stability !== undefined ? metrics.stability : 0;
        const rate = (metrics.explored_rate || 0).toFixed(1);
        const rolloutSuccess = ((metrics.rollout_success_rate || 0) * 100).toFixed(1);
        
        const stabilityColor = stability > 1000 ? 'text-red-500' : (stability > 200 ? 'text-yellow-500' : 'text-green-500');
        const pathDiversity = metrics.path_diversity !== undefined ? metrics.path_diversity : 0.0;
        
        // Search space diagnostics
        const ssDiag = metrics.search_space_diagnostics || {
            dead_end_ratio: 0.0,
            total_nodes: 0,
            dead_end_nodes: 0,
            min_support_active: 10
        };
        const deadEndPct = ssDiag.dead_end_ratio * 100;
        const searchSpaceHealth = (100 - deadEndPct).toFixed(1);
        const healthColor = searchSpaceHealth < 25 ? 'text-red-500' : (searchSpaceHealth < 50 ? 'text-yellow-500' : 'text-green-500');
        
        const minSupActive = ssDiag.min_support_active;
        const defaultMinSupport = 10;
        const isRelaxed = minSupActive < defaultMinSupport;
        const supportColor = isRelaxed ? 'text-amber-500' : 'text-green-500';
        const supportStatusText = isRelaxed ? 'Relaxed' : 'Standard';

        this.container.innerHTML = `
            <div class="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
                <div>
                    <span class="text-xs text-zinc-500 uppercase tracking-wider block">Tree Search Coverage</span>
                    <span class="text-2xl font-bold text-zinc-100 font-mono mt-1 block">${progress}%</span>
                </div>
                <div class="w-full bg-zinc-850 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div class="bg-blue-500 h-full rounded-full" style="width: ${progress}%"></div>
                </div>
                <span class="text-[10px] text-zinc-500 mt-2 block">${explored.toLocaleString()} / ${total.toLocaleString()} nodes</span>
            </div>
            
            <div class="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
                <div>
                    <span class="text-xs text-zinc-500 uppercase tracking-wider block">Search Space Health</span>
                    <span class="text-2xl font-bold ${healthColor} font-mono mt-1 block">${searchSpaceHealth}%</span>
                </div>
                <p class="text-[10px] text-zinc-400 mt-2 leading-relaxed">
                    Ratio of active, non dead-end nodes. Low health indicates search tree is fully explored.
                </p>
            </div>

            <div class="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
                <div>
                    <span class="text-xs text-zinc-500 uppercase tracking-wider block">Active Min Support</span>
                    <span class="text-2xl font-bold ${supportColor} font-mono mt-1 block">${minSupActive}</span>
                </div>
                <div class="flex justify-between items-center text-[10px] text-zinc-500 mt-2">
                    <span>Status: ${supportStatusText}</span>
                </div>
            </div>

            <div class="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
                <div>
                    <span class="text-xs text-zinc-500 uppercase tracking-wider block">Priority Set Stability</span>
                    <span class="text-2xl font-bold ${stabilityColor} font-mono mt-1 block">${stability}</span>
                </div>
                <p class="text-[10px] text-zinc-400 mt-2 leading-relaxed">
                    Iterations since last quality score gain. Lower is better. If stable for too long, search shifts subtree.
                </p>
            </div>
            
            <div class="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
                <div>
                    <span class="text-xs text-zinc-500 uppercase tracking-wider block">Rollout Reward Rate</span>
                    <span class="text-2xl font-bold text-purple-400 font-mono mt-1 block">${rolloutSuccess}%</span>
                </div>
                <div class="flex justify-between items-center text-[10px] text-zinc-500 mt-2">
                    <span>Speed: +${rate} nodes/s</span>
                    <span>Status: Active</span>
                </div>
            </div>

            <div class="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
                <div>
                    <span class="text-xs text-zinc-500 uppercase tracking-wider block">Path Diversity</span>
                    <span class="text-2xl font-bold text-blue-400 font-mono mt-1 block">${pathDiversity.toFixed(4)}</span>
                </div>
                <p class="text-[10px] text-zinc-400 mt-2 leading-relaxed">
                    Shannon Entropy of branch selection. Higher implies broader exploration.
                </p>
            </div>
        `;
    }
    
    dispose() {}
}

class PatternDetailsPanel {
    constructor(container) {
        this.container = container;
        this.data = null;
        this.selectedPatternId = null;
        this.kdeChartInstance = null;
    }
    
    update(data) {
        this.data = data;
        this.render();
    }
    
    resize() {
        if (this.kdeChartInstance) {
            this.kdeChartInstance.resize();
        }
    }

    async injectBudget(patternId, seconds) {
        try {
            const res = await fetch('/api/control/inject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pattern_id: patternId,
                    seconds: seconds
                })
            });
            const result = await res.json();
            window.app.addActivityLog(`Injected +${seconds}s budget on ${patternId}`);
            
            // Switch run status to running immediately on the UI side
            window.app.updateStatusIndicator(true, 'running');
            
            await window.app.fetchCurrentConfig();
        } catch (e) {
            console.error('Failed to inject budget:', e);
        }
    }
    
    render() {
        const snapshots = this.data.snapshots || [];
        if (snapshots.length === 0) {
            this.container.innerHTML = `
                <div class="flex flex-col items-center justify-center p-6 text-center select-none w-full" style="min-height: 300px;">
                    <svg class="w-12 h-12 text-zinc-700 mb-3 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p class="text-xs text-zinc-400 max-w-xs font-medium leading-relaxed">
                        No visualization data has been transmitted for this metric in the current execution cycle.
                    </p>
                </div>
            `;
            return;
        }
        
        const latest = snapshots[snapshots.length - 1];
        const patterns = latest.discovered_patterns || [];
        if (patterns.length === 0) {
            this.container.innerHTML = '<div class="text-center text-zinc-500 py-12">No patterns discovered in this snapshot.</div>';
            return;
        }
        
        if (!this.selectedPatternId || !patterns.find(p => p.id === this.selectedPatternId)) {
            this.selectedPatternId = patterns[0].id;
        }
        
        const selectedPattern = patterns.find(p => p.id === this.selectedPatternId) || patterns[0];
        if (window.app) {
            window.app.selectedPattern = selectedPattern;
        }

        const isFocused = window.app?.currentWeights?.[selectedPattern.id] !== undefined;
        
        this.container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full mt-4" style="min-height: 500px;">
                <div class="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col overflow-hidden lg:col-span-1">
                    <div class="p-3 border-b border-zinc-800 bg-zinc-950 flex justify-between items-center">
                        <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Top Discovered Slices</span>
                        <span class="text-[10px] text-zinc-500 font-mono">${patterns.length} found</span>
                    </div>
                    <div class="flex-1 overflow-y-auto divide-y divide-zinc-800 max-h-[500px]">
                        ${patterns.map(p => {
                            const isSelected = p.id === this.selectedPatternId;
                            const bg = isSelected ? 'bg-zinc-800/80 border-l-4 border-blue-500' : 'hover:bg-zinc-800/30 border-l-4 border-transparent';
                            const quality = p.quality_score.toFixed(4);
                            const supportPct = (p.attributes.support_percentage || (p.attributes.support / 10)).toFixed(1);
                            const firstItemset = p.example_slice?.sequence?.[0]?.itemset || [];
                            const previewText = firstItemset.join(', ') || 'No items';
                            
                            return `
                                <div class="p-3 cursor-pointer transition-colors ${bg}" data-pattern-id="${p.id}">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-xs font-bold text-zinc-200 font-mono">${p.id}</span>
                                        <span class="text-xs font-semibold text-blue-400 font-mono">φ = ${quality}</span>
                                    </div>
                                    <div class="text-[11px] text-zinc-400 truncate mb-1" title="${previewText}">${previewText}</div>
                                    <div class="flex justify-between text-[10px] text-zinc-500">
                                        <span>Sup: ${supportPct}% (${p.attributes.support})</span>
                                        <span>p-val: ${p.attributes.p_value_bh.toFixed(4)}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="lg:col-span-2 flex flex-col gap-6">
                    <!-- Title and guiding controls -->
                    <div class="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <span class="text-xs text-zinc-500 uppercase tracking-wider block">Selected Slice ID</span>
                            <span class="text-lg font-bold text-zinc-150 font-mono block">${selectedPattern.id}</span>
                            <span class="text-xs text-zinc-400 mt-1 block">Quality score φ: <strong class="text-blue-400 font-mono">${selectedPattern.quality_score.toFixed(4)}</strong></span>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <button id="btn-focus-slice" class="px-3 py-1.5 rounded text-xs font-semibold border transition-colors flex items-center gap-1.5 ${isFocused ? 'bg-amber-600/20 text-amber-300 border-amber-500 hover:bg-amber-600/30' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}">
                                Focus
                            </button>
                            <button id="btn-inject-10s" class="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-blue-100 rounded text-xs font-semibold transition-colors">
                                Inject +10s
                            </button>
                            <button id="btn-inject-30s" class="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-800 text-emerald-100 rounded text-xs font-semibold transition-colors">
                                Inject +30s
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div class="bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
                            <span class="text-[10px] text-zinc-500 uppercase tracking-wider block">Slice Support</span>
                            <span class="text-lg font-bold text-zinc-200 font-mono mt-1 block">
                                ${(selectedPattern.attributes.support_percentage || (selectedPattern.attributes.support / 10)).toFixed(1)}%
                            </span>
                            <span class="text-[10px] text-zinc-500 mt-1 block">n = ${selectedPattern.attributes.support}</span>
                        </div>
                        
                        <div class="bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
                            <span class="text-[10px] text-zinc-500 uppercase tracking-wider block">Class Balance</span>
                            <span class="text-lg font-bold text-zinc-200 font-mono mt-1 block">
                                ${(selectedPattern.attributes.class_balance * 100).toFixed(1)}%
                            </span>
                            <span class="text-[10px] text-zinc-500 mt-1 block">Distribution ratio</span>
                        </div>
                        
                        <div class="bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
                            <span class="text-[10px] text-zinc-500 uppercase tracking-wider block">Contrast Δg</span>
                            <span class="text-lg font-bold text-red-400 font-mono mt-1 block">
                                ${selectedPattern.attributes.delta_g.toFixed(4)}
                            </span>
                            <span class="text-[10px] text-zinc-500 mt-1 block">Error Rate Gain</span>
                        </div>
                        
                        <div class="bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
                            <span class="text-[10px] text-zinc-500 uppercase tracking-wider block">Size Penalty</span>
                            <span class="text-lg font-bold text-zinc-200 font-mono mt-1 block">
                                ${selectedPattern.attributes.support_penalty_pgB ? selectedPattern.attributes.support_penalty_pgB.toFixed(3) : '1.0'}
                            </span>
                            <span class="text-[10px] text-zinc-500 mt-1 block">Gamma effect</span>
                        </div>
                    </div>
                    
                    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                        ${window.app?.domain === 'toxicity' ? `
                            <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-1">Interactive Word Attribution (Integrated Gradients)</span>
                            <span class="text-[10px] text-zinc-500 block mb-3">Highlighted by attribution weight. Red indicates toxic contribution; blue/green indicates safe/negative contribution. Hover for full attribution weight.</span>
                            <div class="p-3 bg-zinc-950 border border-zinc-850 rounded-lg flex flex-wrap gap-1.5 leading-relaxed">
                                ${(selectedPattern.example_slice?.word_attributions || []).map(item => {
                                    const word = item[0];
                                    const weight = item[1];
                                    const absWeight = Math.abs(weight);
                                    const opacity = Math.min(0.7, absWeight);
                                    const bgColor = weight > 0 ? `rgba(239, 68, 68, ${opacity})` : `rgba(59, 130, 246, ${opacity})`;
                                    const borderColor = weight > 0 ? `rgba(248, 113, 113, ${Math.min(0.9, opacity + 0.15)})` : `rgba(96, 165, 250, ${Math.min(0.9, opacity + 0.15)})`;
                                    const labelColorClass = weight > 0 ? 'text-red-200' : 'text-blue-200';
                                    return `
                                        <span class="inline-flex items-center px-2 py-1 mx-0.5 my-0.5 rounded border text-xs cursor-help transition-all hover:scale-105"
                                              style="background-color: ${bgColor}; border-color: ${borderColor};"
                                              title="Word: '${word}' | Attribution: ${weight > 0 ? '+' : ''}${weight.toFixed(4)}">
                                            <span class="text-zinc-100 font-medium">${word}</span>
                                            <span class="ml-1.5 text-[9px] font-bold font-mono opacity-80 ${labelColorClass}">
                                                ${weight > 0 ? '+' : ''}${weight.toFixed(2)}
                                            </span>
                                        </span>
                                    `;
                                }).join('')}
                            </div>
                        ` : `
                            <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-3">Sequential Trajectory Flow</span>
                            <div class="flex flex-wrap items-center gap-2">
                                ${(selectedPattern.example_slice?.sequence || []).map((step, idx) => {
                                    const isFirst = idx === 0;
                                    const itemsetHtml = step.itemset.map(item => `
                                        <span class="px-2 py-0.5 bg-blue-950 text-blue-300 border border-blue-800 rounded text-[10px] font-mono">
                                            ${item}
                                        </span>
                                    `).join('');
                                    
                                    const gapHtml = isFirst ? '' : `
                                        <div class="flex items-center gap-1 text-zinc-550 text-[10px] px-1 font-mono">
                                            <svg class="w-4 h-3 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                                            </svg>
                                            <span class="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 text-[9px] text-zinc-400">
                                                gap ≤ ${step.gap_before}
                                            </span>
                                            <svg class="w-4 h-3 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                                            </svg>
                                        </div>
                                    `;
                                    return `
                                        ${gapHtml}
                                        <div class="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-2 gap-1.5">
                                            <div class="w-4 h-4 bg-blue-800 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                                                ${idx + 1}
                                            </div>
                                            <div class="flex flex-wrap gap-1">
                                                ${itemsetHtml}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        `}
                    </div>
                    
                    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                        <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-3">Contrast KDE Error Density</span>
                        <div id="pattern-kde-chart" class="w-full h-64 bg-zinc-950 rounded-lg border border-zinc-800"></div>
                    </div>
                </div>
            </div>
        `;
        
        this.container.querySelectorAll('[data-pattern-id]').forEach(el => {
            el.addEventListener('click', () => {
                this.selectedPatternId = el.getAttribute('data-pattern-id');
                this.render();
            });
        });

        // Bind Focus and Inject buttons
        const focusBtn = this.container.querySelector('#btn-focus-slice');
        if (focusBtn) {
            focusBtn.addEventListener('click', async () => {
                try {
                    const res = await fetch('/api/control/focus', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pattern_id: selectedPattern.id,
                            focused: !isFocused
                        })
                    });
                    const result = await res.json();
                    window.app.addActivityLog(`${isFocused ? 'Removed focus from' : 'Focused on'} ${selectedPattern.id}`);
                    await window.app.fetchCurrentConfig();
                } catch (e) {
                    console.error('Failed to focus pattern:', e);
                }
            });
        }
        
        const inject10Btn = this.container.querySelector('#btn-inject-10s');
        if (inject10Btn) {
            inject10Btn.addEventListener('click', () => this.injectBudget(selectedPattern.id, 10.0));
        }
        
        const inject30Btn = this.container.querySelector('#btn-inject-30s');
        if (inject30Btn) {
            inject30Btn.addEventListener('click', () => this.injectBudget(selectedPattern.id, 30.0));
        }
        
        setTimeout(() => this.renderKDEChart(selectedPattern, latest), 0);
    }
    
    renderKDEChart(pattern, latestSnapshot) {
        const chartEl = document.getElementById('pattern-kde-chart');
        if (!chartEl) return;
        
        if (this.kdeChartInstance) {
            this.kdeChartInstance.dispose();
        }
        
        this.kdeChartInstance = echarts.init(chartEl, 'dark');
        
        const baseClass0 = latestSnapshot.global_metrics?.global_errors_class_0 || [];
        const baseClass1 = latestSnapshot.global_metrics?.global_errors_class_1 || [];
        const sliceClass0 = pattern.example_slice?.errors_class_0 || [];
        const sliceClass1 = pattern.example_slice?.errors_class_1 || [];
        
        const xGrid = [];
        for (let i = 0; i <= 50; i++) xGrid.push(i / 50.0);
        
        const yBase0 = this.evaluateKDEAtGrid(xGrid, baseClass0);
        const yBase1 = this.evaluateKDEAtGrid(xGrid, baseClass1);
        const ySlice0 = this.evaluateKDEAtGrid(xGrid, sliceClass0);
        const ySlice1 = this.evaluateKDEAtGrid(xGrid, sliceClass1);
        
        const option = {
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' }
            },
            legend: {
                data: ['Base Class 0', 'Base Class 1', 'Slice Class 0', 'Slice Class 1'],
                bottom: 5,
                textStyle: { color: '#a1a1a6', fontSize: 10 }
            },
            xAxis: {
                type: 'category',
                data: xGrid.map(v => v.toFixed(2)),
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', fontSize: 9 }
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            grid: { left: '5%', right: '5%', bottom: '15%', top: '8%', containLabel: true },
            series: [
                {
                    name: 'Base Class 0',
                    type: 'line',
                    data: yBase0,
                    itemStyle: { color: '#94a3b8' },
                    lineStyle: { type: 'dashed', width: 1.5 },
                    smooth: true
                },
                {
                    name: 'Base Class 1',
                    type: 'line',
                    data: yBase1,
                    itemStyle: { color: '#64748b' },
                    lineStyle: { type: 'dashed', width: 1.5 },
                    smooth: true
                },
                {
                    name: 'Slice Class 0',
                    type: 'line',
                    data: ySlice0,
                    itemStyle: { color: '#3b82f6' },
                    areaStyle: { color: 'rgba(59, 130, 246, 0.15)' },
                    smooth: true
                },
                {
                    name: 'Slice Class 1',
                    type: 'line',
                    data: ySlice1,
                    itemStyle: { color: '#ef4444' },
                    areaStyle: { color: 'rgba(239, 68, 68, 0.15)' },
                    smooth: true
                }
            ]
        };
        this.kdeChartInstance.setOption(option);
    }
    
    evaluateKDEAtGrid(grid, data) {
        if (data.length === 0) return grid.map(() => 0.0);
        const h = 1.06 * Math.pow(data.length, -0.2);
        return grid.map(xi => {
            let density = 0;
            data.forEach(xj => {
                const u = (xi - xj) / h;
                density += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
            });
            return parseFloat((density / (data.length * h)).toFixed(4));
        });
    }
    
    dispose() {
        if (this.kdeChartInstance) {
            this.kdeChartInstance.dispose();
        }
    }
}

/**
 * WebSocket Connection Manager
 */
class WebSocketManager {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.listeners = new Map();
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    console.log('WebSocket connected');
                    this.reconnectAttempts = 0;
                    this.emit('connect');
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.emit('message', data);
                    } catch (e) {
                        console.error('Failed to parse message', e);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error', error);
                    this.emit('error', error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('WebSocket disconnected');
                    this.emit('disconnect');
                    this.attemptReconnect();
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connect().catch(e => console.error('Reconnection failed', e)), this.reconnectDelay);
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket not ready');
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

/**
 * Application Controller
 */
class AuditLensApp {
    constructor() {
        this.registry = new VisualizerRegistry();
        this.visualizers = new Map();
        this.wsManager = null;
        this.metrics = [];
        this.snapshots = [];
        this.currentExploreIteration = null;
        this.playInterval = null;
        this.budgetConsumed = 0.0;
        this.remainingBudget = 0.0;
        this.currentWeights = {};
        this.interactedFields = new Set();
        this.domain = 'malware';
        this.dynamicParameters = [];
        this.dynamicValidationErrors = {};
        this.visibleChartsState = {};
 
        this.initializeVisualizers();
        this.initializeEventListeners();
        this.connectWebSocket();
        this.fetchCurrentConfig();
        this.fetchHistory();
        this.setupCardResizeSnapping();
    }

    initializeVisualizers() {
        this.registry.register('search-metrics-kpi', SearchMetricsKPI);
        this.registry.register('metrics-evolution', MetricsEvolution);
        this.registry.register('class-balance-pie', ClassBalancePie);
        this.registry.register('slices-heatmap', SlicesHeatmap);
        // New visualizers
        this.registry.register('convergence-chart', ConvergenceChart);
        this.registry.register('bubble-chart', BubbleChartViz);
        // Removed ContrastKDEChart, QualityScatter, ErrorDistribution (old)
        this.registry.register('tradeoff-scatter', TradeoffScatter);
        this.registry.register('quality-radar', QualityDecompositionRadar);
        this.registry.register('error-distribution-true', SoftErrorDistribution);
        this.registry.register('tree-diagnostics', MCTSDiagnosticsPanel);
        this.registry.register('pattern-details', PatternDetailsPanel);
        this.registry.register('pareto-frontier', ParetoFrontier);
        this.registry.register('feature-importance', FeatureImportance);
        this.registry.register('depth-histogram', DepthHistogram);
        this.registry.register('subsequence-importance', SubsequenceImportanceHeatmap);
        this.registry.register('sequence-embeddings', SequenceEmbeddingScatter);
        this.registry.register('identity-error-matrix', IdentityFacetedErrorMatrix);
        this.registry.register('problematic-slices', ProblematicSliceDiscoveryPanel);

        const chartConfigs = [
            { id: 'tradeoff-scatter', elementId: 'chart-tradeoff-map' },
            { id: 'quality-radar', elementId: 'chart-quality-radar' },
            { id: 'error-distribution-true', elementId: 'chart-error-distribution' },
            { id: 'search-metrics-kpi', elementId: 'kpi-section' },
            { id: 'tree-diagnostics', elementId: 'tree-diagnostics-container' },
            { id: 'pattern-details', elementId: 'pattern-details-container' },
            { id: 'pareto-frontier', elementId: 'chart-pareto' },
            { id: 'feature-importance', elementId: 'chart-feature-importance' },
            { id: 'depth-histogram', elementId: 'chart-depth-histogram' },
            { id: 'subsequence-importance', elementId: 'chart-subsequence-importance' },
            { id: 'sequence-embeddings', elementId: 'chart-sequence-embeddings' },
            { id: 'identity-error-matrix', elementId: 'chart-identity-error-matrix' },
            { id: 'problematic-slices', elementId: 'chart-problematic-slices' }
        ];

        chartConfigs.forEach(config => {
            const element = document.getElementById(config.elementId);
            if (element) {
                const visualizer = this.registry.create(config.id, element);
                this.visualizers.set(config.id + '-' + config.elementId, visualizer);
            }
        });
    }

    updateDomainVisibility() {
        const domain = this.domain || 'malware';
        const malwareElements = document.querySelectorAll('.malware-only');
        const toxicityElements = document.querySelectorAll('.toxicity-only');
        
        malwareElements.forEach(el => {
            if (domain === 'malware') {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
        
        toxicityElements.forEach(el => {
            if (domain === 'toxicity') {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        // Trigger chart resizes after visibility changes
        setTimeout(() => {
            this.visualizers.forEach(v => {
                if (v && v.chart && typeof v.chart.resize === 'function') {
                    v.chart.resize();
                }
                if (v && typeof v.resize === 'function') {
                    v.resize();
                }
            });
        }, 150);
    }

    initializeEventListeners() {
        console.log('Initializing event listeners...');
        
        // Setup Form submission & initial orchestration
        const setupForm = document.getElementById('setup-form');
        if (setupForm) {
            setupForm.addEventListener('submit', (e) => this.handleSetupSubmit(e));
        }
        
        // Connection verification
        const connectServerBtn = document.getElementById('btn-connect-server');
        if (connectServerBtn) {
            connectServerBtn.addEventListener('click', () => this.verifyModelServerConnection());
        }
        
        // Drag and Drop Zone styling & events
        const dragZone = document.getElementById('upload-drag-zone');
        const fileInput = document.getElementById('setup-file-input');
        const uploadText = document.getElementById('upload-text');
        
        if (dragZone && fileInput && uploadText) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    uploadText.textContent = `File selected: ${e.target.files[0].name}`;
                    dragZone.classList.add('border-blue-500');
                }
            });
            
            dragZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dragZone.classList.add('border-blue-500', 'bg-zinc-800/40');
            });
            
            dragZone.addEventListener('dragleave', () => {
                dragZone.classList.remove('border-blue-500', 'bg-zinc-800/40');
            });
            
            dragZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dragZone.classList.remove('border-blue-500', 'bg-zinc-800/40');
                if (e.dataTransfer.files.length > 0) {
                    fileInput.files = e.dataTransfer.files;
                    uploadText.textContent = `File dropped: ${e.dataTransfer.files[0].name}`;
                    dragZone.classList.add('border-blue-500');
                }
            });
        }

        const startBtn = document.getElementById('btn-start-audit');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startAudit();
            });
        }
        
        const pauseBtn = document.getElementById('btn-pause-audit');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.controlAudit('pause'));
        }
        
        const finishBtn = document.getElementById('btn-finish-audit');
        if (finishBtn) {
            finishBtn.addEventListener('click', () => this.controlAudit('finish'));
        }

        const resetBtn = document.getElementById('btn-reset-run');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetRunData());
        }

        const configForm = document.getElementById('config-form');
        console.log('Config form found:', configForm);
        if (configForm) {
            configForm.addEventListener('submit', (e) => this.handleConfigSubmit(e));
            
            // Track user interaction with config fields
            configForm.querySelectorAll('input, textarea, select').forEach(input => {
                const name = input.getAttribute('name');
                if (name) {
                    const markInteracted = () => {
                        this.interactedFields.add(name);
                    };
                    input.addEventListener('change', markInteracted);
                    input.addEventListener('input', markInteracted);
                }
            });
        } else {
            console.error('Config form not found');
        }

        // Slider dynamic readout listeners
        const sliders = ['max-gap', 'gamma', 'uct-factor', 'jaccard-threshold'];
        sliders.forEach(id => {
            const el = document.getElementById(id);
            const valEl = document.getElementById(id + '-val');
            if (el && valEl) {
                const updateValue = (e) => {
                    const val = parseFloat(e.target.value);
                    valEl.textContent = (id === 'max-gap') ? val : val.toFixed(2);
                    const name = el.getAttribute('name');
                    if (name) {
                        this.interactedFields.add(name);
                    }
                };
                el.addEventListener('input', updateValue);
                el.addEventListener('change', updateValue);
            }
        });

        // Collapsible Sidebar Toggle Logic
        const toggleSidebar = () => {
            const layout = document.querySelector('.grid-layout');
            const expandBtn = document.getElementById('btn-expand-sidebar');
            if (layout) {
                layout.classList.toggle('sidebar-collapsed');
                const isCollapsed = layout.classList.contains('sidebar-collapsed');
                
                if (expandBtn) {
                    if (isCollapsed) {
                        expandBtn.classList.remove('hidden');
                    } else {
                        expandBtn.classList.add('hidden');
                    }
                }
                
                // Trigger charts resize after CSS grid columns transition is done (300ms transition)
                setTimeout(() => {
                    this.visualizers.forEach(v => {
                        if (v && v.chart && typeof v.chart.resize === 'function') {
                            v.chart.resize();
                        }
                        if (v && typeof v.resize === 'function') {
                            v.resize();
                        }
                    });
                }, 310);
            }
        };

        const settingsBtn = document.getElementById('btn-settings');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleSidebar();
            });
        }

        const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
        if (toggleSidebarBtn) {
            toggleSidebarBtn.addEventListener('click', toggleSidebar);
        }

        const expandSidebarBtn = document.getElementById('btn-expand-sidebar');
        if (expandSidebarBtn) {
            expandSidebarBtn.addEventListener('click', toggleSidebar);
        }

        // Initialize Evolution Timeline events
        this.initializeTimelineEvents();

        const addChartBtn = document.getElementById('btn-add-chart');
        console.log('Add chart button found:', addChartBtn);
        if (addChartBtn) {
            addChartBtn.addEventListener('click', () => {
                console.log('Add chart button clicked');
                this.addNewVisualization();
            });
        } else {
            console.error('Add chart button not found');
        }

        const exportCsvBtn = document.getElementById('btn-export-csv');
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => {
                this.exportEmpiricalDataCSV();
            });
        }

        // Tabs
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = e.target.dataset.tab;
                
                // Remove active classes
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                // Add active to clicked
                e.target.classList.add('active');
                const targetContent = document.getElementById(targetTab);
                if (targetContent) targetContent.classList.add('active');
                
                // Resize charts
                setTimeout(() => {
                    this.visualizers.forEach(v => {
                        if (v) {
                            if (v.chart && typeof v.chart.resize === 'function') v.chart.resize();
                            if (typeof v.resize === 'function') v.resize();
                        }
                    });
                }, 100);
            });
        });

        // Fetch button
        const btnFetch = document.getElementById('btn-fetch-logs');
        if (btnFetch) {
            btnFetch.addEventListener('click', () => this.fetchLogs());
        }
        
        // Filter button
        const btnFilter = document.getElementById('btn-apply-filter');
        if (btnFilter) {
            btnFilter.addEventListener('click', () => this.fetchLogs());
        }

        // Use event delegation on document.body for ALL close buttons
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-close-chart');
            if (btn) {
                const container = btn.closest('.chart-container');
                if (container) {
                    this.removeChart(container);
                }
            }
        });

        // Make existing cards draggable
        document.querySelectorAll('.chart-container').forEach(card => {
            this.makeCardDraggable(card);
        });
    }

    exportEmpiricalDataCSV() {
        if (!this.snapshots || this.snapshots.length === 0) {
            alert("No telemetry history available to export.");
            return;
        }

        const headers = [
            "Iteration",
            "Timestamp",
            "Total Elapsed Time (s)",
            "Top Quality",
            "Explored Nodes",
            "Search Space",
            "Stability",
            "Rollout Success Rate (%)",
            "Max Depth",
            "Path Diversity (Entropy)",
            "UCT Factor",
            "Support Penalty (Gamma)",
            "Max Gap"
        ];

        const rows = this.snapshots.map(snapshot => {
            const m = snapshot.global_metrics || {};
            return [
                snapshot.iteration || 0,
                snapshot.timestamp || "",
                m.total_elapsed_time !== undefined ? m.total_elapsed_time : 0.0,
                m.top_quality !== undefined ? m.top_quality : 0.0,
                m.explored_nodes !== undefined ? m.explored_nodes : 0,
                m.search_space !== undefined ? m.search_space : 50000,
                m.stability !== undefined ? m.stability : 0,
                m.rollout_success_rate !== undefined ? (m.rollout_success_rate * 100).toFixed(2) : 100.0,
                m.max_depth !== undefined ? m.max_depth : 0,
                m.path_diversity !== undefined ? m.path_diversity : 0.0,
                m.uct_factor !== undefined ? m.uct_factor : 1.2,
                m.support_penalty !== undefined ? m.support_penalty : 0.5,
                m.max_gap !== undefined ? m.max_gap : 5
            ];
        });

        const csvContent = [
            headers.join(","),
            ...rows.map(r => r.map(val => {
                if (typeof val === 'string' && val.includes(',')) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `mcts_empirical_telemetry_${Date.now()}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async fetchCurrentConfig() {
        try {
            const res = await fetch('/api/config/current');
            const data = await res.json();
            this.budgetConsumed = data.budget_consumed || 0.0;
            this.remainingBudget = data.remaining_budget || 0.0;
            this.currentStatus = data.status || 'idle';
            this.currentWeights = data.weights || {};
            this.domain = data.domain || 'malware';
            
            // Toggle view visibility depending on currentStatus
            this.toggleViewMode(this.currentStatus);
            this.updateDomainVisibility();
            
            if (this.currentStatus !== 'idle') {
                await this.renderSidebarDynamicForm(data);
            }
            
            // Trigger KPI update
            this.updateMetrics();
        } catch (e) {
            console.error('Failed to fetch current config:', e);
        }
    }

    async renderSidebarDynamicForm(currentConfig) {
        if (!this.dynamicParameters || this.dynamicParameters.length === 0) {
            const url = currentConfig.model_server_url || document.getElementById('setup-model-url').value.trim();
            if (url) {
                try {
                    const res = await fetch(`/api/control/check-health?url=${encodeURIComponent(url)}`);
                    const checkData = await res.json();
                    if (checkData.online && checkData.metadata) {
                        this.dynamicParameters = checkData.metadata.parameters || [];
                    }
                } catch (e) {
                    console.error('Failed to fetch metadata for sidebar:', e);
                }
            }
        }
        
        if (this.dynamicParameters && this.dynamicParameters.length > 0) {
            this.renderDynamicForm(this.dynamicParameters, 'sidebar-dynamic-fields', 'sidebar-dyn-', true, currentConfig);
        }
    }

    async handleConfigSubmit(e) {
        if (e) e.preventDefault();
        const configForm = document.getElementById('config-form');
        if (!configForm) return;
        const formData = new FormData(configForm);
        
        const config = {};
        
        const shouldSend = (name) => {
            const value = formData.get(name);
            return value !== null && value !== undefined && value.trim() !== '';
        };

        // Subgroups explore
        if (shouldSend('subgroups_explore')) {
            config.subgroups_to_explore = formData.get('subgroups_explore')
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        } else {
            config.subgroups_to_explore = null;
        }

        // Subgroups ignore
        if (shouldSend('subgroups_ignore')) {
            config.subgroups_to_ignore = formData.get('subgroups_ignore')
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        } else {
            config.subgroups_to_ignore = null;
        }

        // Weights
        if (shouldSend('weights_input')) {
            try {
                config.weights = JSON.parse(formData.get('weights_input'));
            } catch (err) {
                console.error("Invalid JSON for weights");
                this.addActivityLog('Invalid JSON in weights');
                return;
            }
        } else {
            config.weights = null;
        }

        // Gather dynamic fields from sidebar
        const paramsList = this.sidebarDynamicParameters || this.dynamicParameters || [];
        paramsList.forEach(param => {
            const el = document.getElementById(`sidebar-dyn-${param.name}`);
            if (!el) return;
            
            let val = el.value;
            if (param.type === 'int') {
                val = parseInt(val, 10);
            } else if (param.type === 'float') {
                val = parseFloat(val);
            } else if (param.type === 'boolean') {
                val = (val === 'true');
            }
            
            if (param.name === 'budget') {
                config.budgets = { 'search': val };
            } else {
                config[param.name] = val;
            }
        });

        const isPaused = this.currentStatus === 'paused';
        try {
            if (isPaused) {
                const response = await fetch('/api/control/resume', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                const result = await response.json();
                this.addActivityLog('Resume requested with configuration updates');
                console.log('Resume response:', result);
                await this.fetchCurrentConfig();
            } else {
                const response = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                const result = await response.json();
                this.addActivityLog('Config submitted');
                console.log('Config response:', result);
                await this.fetchCurrentConfig();
            }
        } catch (error) {
            console.error('Failed to submit config:', error);
            this.addActivityLog('Submission failed');
        }
    }

    addNewVisualization(type) {
        if (type) {
            this.createVisualization(type);
            return;
        }

        // Create a modal or dropdown to select visualization type
        const visualizationTypes = [
            { id: 'quality-scatter', name: 'Quality vs Support Scatter Plot', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span>' },
            { id: 'error-distribution', name: 'Error Distribution Chart', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-red-500"></span>' },
            { id: 'convergence-chart', name: 'Quality Convergence (Step Chart)', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-green-500"></span>' },
            { id: 'bubble-chart', name: 'Bubble Chart (Quality vs Support)', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-teal-500"></span>' },
            { id: 'contrast-kde', name: 'Contrast KDE Distribution', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-pink-500"></span>' },
            { id: 'slices-heatmap', name: 'Slices Heatmap', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-orange-500"></span>' },
            { id: 'search-metrics-kpi', name: 'Search Metrics KPI', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500"></span>' },
            { id: 'metrics-evolution', name: 'Metrics Evolution (Timeline)', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-cyan-500"></span>' },
            { id: 'class-balance-pie', name: 'Class Balance Pie Chart', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-rose-500"></span>' },
            { id: 'tree-diagnostics', name: 'MCTS Tree Diagnostics', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-violet-500"></span>' },
            { id: 'pattern-details', name: 'Pattern Details Panel', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-fuchsia-500"></span>' },
            { id: 'pareto-frontier', name: 'Pareto Frontier (Quality vs. Support)', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>' },
            { id: 'feature-importance', name: 'Feature Importance (Tree Frequency)', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-amber-500"></span>' },
            { id: 'depth-histogram', name: 'Tree Topology & Search Depth', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-purple-500"></span>' }
        ];

        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-auto';
        modal.innerHTML = `
            <div class="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-600 my-8">
                <h3 class="text-lg font-semibold text-slate-200 mb-4">Add New Visualization</h3>
                <div class="space-y-3 max-h-96 overflow-y-auto">
                    ${visualizationTypes.map(type => `
                        <button class="w-full text-left p-3 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors border border-slate-600"
                                data-type="${type.id}">
                            <div class="flex items-center gap-3">
                                <span class="flex-shrink-0 flex items-center justify-center">${type.icon}</span>
                                <div>
                                    <div class="text-slate-200 font-medium text-sm">${type.name}</div>
                                    <div class="text-slate-400 text-xs">Add a new ${type.name.toLowerCase()}</div>
                                </div>
                            </div>
                        </button>
                    `).join('')}
                </div>
                <div class="flex justify-end gap-3 mt-6">
                    <button class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md transition-colors"
                            onclick="this.closest('.fixed').remove()">
                        Cancel
                    </button>
                </div>
            </div>
        `;

        // Add event listeners to type buttons
        modal.addEventListener('click', (e) => {
            const button = e.target.closest('[data-type]');
            if (button) {
                const type = button.dataset.type;
                this.createVisualization(type);
                modal.remove();
            }
        });

        document.body.appendChild(modal);
    }

    createVisualization(type) {
        // Generate unique ID for the new visualization
        const uniqueId = `${type}-${Date.now()}`;
        
        const visualizationTypes = [
            { id: 'quality-scatter', name: 'Quality vs Support Scatter Plot', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span>' },
            { id: 'error-distribution', name: 'Error Distribution Chart', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-red-500"></span>' },
            { id: 'convergence-chart', name: 'Quality Convergence (Step Chart)', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-green-500"></span>' },
            { id: 'bubble-chart', name: 'Bubble Chart (Quality vs Support)', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-teal-500"></span>' },
            { id: 'contrast-kde', name: 'Contrast KDE Distribution', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-pink-500"></span>' },
            { id: 'slices-heatmap', name: 'Slices Heatmap', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-orange-500"></span>' },
            { id: 'search-metrics-kpi', name: 'Search Metrics KPI', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500"></span>' },
            { id: 'metrics-evolution', name: 'Metrics Evolution (Timeline)', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-cyan-500"></span>' },
            { id: 'class-balance-pie', name: 'Class Balance Pie Chart', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-rose-500"></span>' },
            { id: 'tree-diagnostics', name: 'MCTS Tree Diagnostics', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-violet-500"></span>' },
            { id: 'pattern-details', name: 'Pattern Details Panel', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-fuchsia-500"></span>' },
            { id: 'pareto-frontier', name: 'Pareto Frontier (Quality vs. Support)', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>' },
            { id: 'feature-importance', name: 'Feature Importance (Tree Frequency)', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-amber-500"></span>' },
            { id: 'depth-histogram', name: 'Tree Topology & Search Depth', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-purple-500"></span>' }
        ];

        const typeInfo = visualizationTypes.find(t => t.id === type) || { name: 'New Visualization', icon: '<span class="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span>' };

        // Create container for the new visualization
        const container = document.createElement('div');
        container.className = 'chart-container rounded-lg overflow-hidden';
        container.innerHTML = `
            <div class="chart-header">
                <div class="chart-title">
                    <span class="chart-icon">${typeInfo.icon}</span>
                    ${typeInfo.name}
                </div>
                <button class="text-zinc-400 hover:text-zinc-200 transition-colors btn-close-chart" title="Remove Chart">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            <div id="${uniqueId}" class="chart-content"></div>
        `;

        const chartsContainer = document.getElementById('global-view') || document.getElementById('charts-container') || document.querySelector('.main-content');
        if (chartsContainer) {
            chartsContainer.appendChild(container);
            
            const element = document.getElementById(uniqueId);
            if (element) {
                const visualizer = this.registry.create(type, element);
                this.visualizers.set(uniqueId, visualizer);
                
                // Make the card draggable
                this.makeCardDraggable(container);
                
                // Bind close button
                const closeBtn = container.querySelector('.btn-close-chart');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        this.removeChart(container);
                    });
                }
                
                // Initial update from current session data
                this.updateMetrics();
                
                this.addActivityLog(`Added new ${typeInfo.name} visualization`);
            }
        }
    }

    async fetchHistory() {
        try {
            const res = await fetch('/api/snapshots');
            const snapshots = await res.json();
            if (Array.isArray(snapshots) && snapshots.length > 0) {
                this.snapshots = snapshots;
                // Convert snapshots to metrics for compatibility
                this.metrics = snapshots.map(snapshot => ({
                    pattern_descriptor: snapshot.id,
                    quality_score_phi: snapshot.global_metrics?.top_quality || 0.5,
                    support_percentage: 50,
                    error_class_0: 0.2,
                    error_class_1: 0.2,
                    support_count: 100,
                    mean_error_mu: snapshot.global_metrics?.avg_error || 0.25,
                    std_error_sigma: 0.05,
                    soft_error: 0.1,
                    p_value_bh: 0.01,
                    delta_g: 0.05,
                    top10_avg_quality: snapshot.global_metrics?.top_quality || 0.5,
                    search_metrics: { 
                        explored_patterns: snapshot.global_metrics?.explored_nodes || snapshot.iteration || 0, 
                        search_space_coverage: snapshot.global_metrics?.tree_progress || 0.5, 
                        filtered_similarity: 0.7 
                    }
                }));
                
                this.currentExploreIteration = this.snapshots.length;
                this.updateTimelineExplorer();
                this.updateMetrics();
                this.addActivityLog(`Loaded ${this.snapshots.length} historical snapshots`);
            }
        } catch (e) {
            console.error('Failed to fetch historical snapshots:', e);
        }
    }

    removeChart(container) {
        let removedKey = null;
        // Find if this container has a visualizer associated with it
        for (const [key, visualizer] of this.visualizers.entries()) {
            if (visualizer && (visualizer.container === container || container.contains(visualizer.container))) {
                if (typeof visualizer.dispose === 'function') {
                    try {
                        visualizer.dispose();
                    } catch (e) {
                        console.error('Error disposing visualizer:', e);
                    }
                }
                removedKey = key;
                this.visualizers.delete(key);
                break;
            }
        }
        
        if (removedKey) {
            this.visibleChartsState[removedKey] = false;
        }

        container.remove();
        this.addActivityLog('Chart state updated: removed from UI');
        
        // Trigger ECharts resize on remaining charts
        setTimeout(() => {
            this.visualizers.forEach(v => {
                if (v && v.chart && typeof v.chart.resize === 'function') {
                    v.chart.resize();
                }
            });
        }, 50);
    }

    makeCardDraggable(card) {
        card.removeAttribute('draggable');
        const header = card.querySelector('.chart-header');
        if (!header) return;

        header.setAttribute('draggable', 'true');
        
        header.addEventListener('dragstart', (e) => {
            const isButtonClick = e.target.closest('button') || e.target.closest('a');
            if (isButtonClick) {
                e.preventDefault();
                return false;
            }
            
            window.draggedCard = card;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        
        header.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.chart-container').forEach(c => {
                c.classList.remove('drag-over');
            });
            window.draggedCard = null;
        });
        
        card.addEventListener('dragenter', (e) => {
            if (window.draggedCard && window.draggedCard !== card) {
                card.classList.add('drag-over');
                
                // Live Swap Collision Flow
                const now = Date.now();
                if (this.lastDragSwapTime && (now - this.lastDragSwapTime < 350)) {
                    return;
                }
                
                const parent = card.parentNode;
                const children = Array.from(parent.children);
                const draggedIdx = children.indexOf(window.draggedCard);
                const targetIdx = children.indexOf(card);
                
                if (draggedIdx !== -1 && targetIdx !== -1 && draggedIdx !== targetIdx) {
                    this.lastDragSwapTime = now;
                    
                    if (draggedIdx < targetIdx) {
                        parent.insertBefore(window.draggedCard, card.nextSibling);
                    } else {
                        parent.insertBefore(window.draggedCard, card);
                    }
                    
                    // Immediately trigger chart resizes on swap
                    setTimeout(() => {
                        this.visualizers.forEach(v => {
                            if (v && v.chart && typeof v.chart.resize === 'function') {
                                v.chart.resize();
                            }
                            if (v && typeof v.resize === 'function') {
                                v.resize();
                            }
                        });
                    }, 50);
                }
            }
        });
        
        card.addEventListener('dragleave', () => {
            card.classList.remove('drag-over');
        });
        
        card.addEventListener('dragover', (e) => {
            if (window.draggedCard && window.draggedCard !== card) {
                e.preventDefault();
            }
        });
        
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
        });
    }

    async startAudit() {
        console.log('Starting audit...');
        const startBtn = document.getElementById('btn-start-audit');
        const isResume = startBtn && startBtn.innerHTML.trim() === 'Resume';
        
        if (isResume) {
            // "Resume" action: keep history and tree intact in memory
            await this.controlAudit('resume');
        } else {
            // "Start Audit" action: complete hard reset!
            try {
                // 1. Clear backend state
                const res = await fetch('/api/control/clear', { method: 'POST' });
                const clearResult = await res.json();
                console.log('Hard Reset clear response:', clearResult);
                
                // 2. Clear frontend state
                this.snapshots = [];
                this.metrics = [];
                this.currentExploreIteration = null;
                this.budgetConsumed = 0.0;
                this.remainingBudget = 0.0;
                
                if (this.playInterval) {
                    this.toggleTimelinePlay(false);
                }
                
                // 3. Clear all visual charts/KPIs
                this.updateTimelineExplorer();
                this.updateMetrics();
                
                // 4. Submit the current form configurations (which will also resume/start the run)
                // Note: if form is empty/neutral, it sends nulls, running the model "ao natural"
                await this.handleConfigSubmit();
                
                this.addActivityLog('New audit started (hard reset complete)');
            } catch (e) {
                console.error('Failed to start new audit:', e);
                this.addActivityLog('Failed to start new audit');
            }
        }
    }

    async controlAudit(action) {
        try {
            await fetch(`/api/control/${action}`, { method: 'POST' }).catch(e => console.warn(e));
            // Also send via new unified control endpoint
            await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, timestamp: new Date().toISOString() })
            }).catch(e => console.warn(e));
        } catch (e) {
            console.error(`Failed to ${action} audit:`, e);
        }
    }

    connectSnapshotWebSocket() {
        /**New: Connect to /ws/snapshots for AuditSnapshot streaming**/
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/snapshots`;
        console.log('Connecting to snapshots WebSocket:', wsUrl);

        try {
            const ws = new WebSocket(wsUrl);
            ws.onopen = () => {
                console.log('Snapshots WebSocket connected');
                this.addActivityLog('Connected to snapshot stream');
            };
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'snapshot' && msg.snapshot) {
                        console.log('Received AuditSnapshot:', msg.snapshot);
                        this.handleAuditSnapshot(msg.snapshot);
                    } else if (msg.type === 'clear') {
                        this.snapshots = [];
                        this.metrics = [];
                        this.currentExploreIteration = null;
                        this.updateMetrics();
                        this.updateTimelineExplorer();
                        this.addActivityLog('Audit history cleared');
                    } else if (msg.type === 'control_ack') {
                        console.log('Control ACK:', msg);
                        this.addActivityLog(`Control acknowledged: ${msg.action}`);
                    }
                } catch (e) {
                    console.warn('Failed to parse snapshot message:', e);
                }
            };
            ws.onerror = (e) => console.error('Snapshot WS error:', e);
            ws.onclose = () => {
                this.addActivityLog('Snapshot stream closed');
                setTimeout(() => this.connectSnapshotWebSocket(), 3000);
            };
        } catch (e) {
            console.error('Failed to connect snapshot WS:', e);
        }
    }

    handleAuditSnapshot(snapshot) {
        /**Handle new AuditSnapshot format with global_metrics and discovered_patterns**/
        if (!snapshot.discovered_patterns) return;
        
        this.snapshots = this.snapshots || [];
        this.snapshots.push(snapshot);
        
        // Convert AuditSnapshot patterns to old Slice format for compatibility
        const convertedSlice = {
            pattern_descriptor: snapshot.id,
            quality_score_phi: snapshot.global_metrics?.top_quality || 0.5,
            support_percentage: 50,
            error_class_0: 0.2,
            error_class_1: 0.2,
            support_count: 100,
            mean_error_mu: snapshot.global_metrics?.avg_error || 0.25,
            std_error_sigma: 0.05,
            soft_error: 0.1,
            p_value_bh: 0.01,
            delta_g: 0.05,
            top10_avg_quality: snapshot.global_metrics?.top_quality || 0.5,
            search_metrics: { 
                explored_patterns: snapshot.global_metrics?.explored_nodes || snapshot.iteration || 0, 
                search_space_coverage: snapshot.global_metrics?.tree_progress || 0.5, 
                filtered_similarity: 0.7 
            }
        };
        
        this.metrics.push(convertedSlice);

        // Auto-advance timeline value if user was tracking the latest iteration
        const timelineSlider = document.getElementById('timeline-slider');
        const isTrackingLatest = !this.currentExploreIteration || 
            (timelineSlider && parseInt(timelineSlider.value) === this.snapshots.length - 1) ||
            this.currentExploreIteration === this.snapshots.length - 1;

        if (isTrackingLatest) {
            this.currentExploreIteration = this.snapshots.length;
        }

        this.updateTimelineExplorer();
        this.updateMetrics();
        this.addActivityLog(`Snapshot ${snapshot.iteration} with ${snapshot.discovered_patterns.length} patterns`);
    }

    openSettings() {
        console.log('Opening settings...');
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/metrics`;
        console.log('Connecting to WebSocket:', wsUrl);
        
        this.wsManager = new WebSocketManager(wsUrl);
        
        this.wsManager.on('connect', () => {
            console.log('WebSocket connected successfully');
            this.updateStatusIndicator(true);
            this.addActivityLog('Connected to metrics stream');
            // Also connect to new snapshots endpoint
            this.connectSnapshotWebSocket();
        });

        this.wsManager.on('message', (data) => {
            console.log('Received WebSocket message:', data);
            this.handleMetricsMessage(data);
        });

        this.wsManager.on('disconnect', () => {
            console.log('WebSocket disconnected');
            this.updateStatusIndicator(false);
            this.addActivityLog('Disconnected from stream');
        });

        this.wsManager.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.addActivityLog('Connection error');
        });

        this.wsManager.connect().catch(e => {
            console.error('Failed to connect WebSocket:', e);
        });
    }

    handleMetricsMessage(data) {
        if (data.type === 'status') {
            this.updateStatusIndicator(true, data.status);
            this.addActivityLog(`Status: ${data.status} | Slices: ${data.slices_found}`);
        } else if (data.type === 'slice') {
            const slice = data.payload;
            this.metrics.push(slice);
            this.updateMetrics();
            this.addActivityLog(`Slice ${this.metrics.length} received`);
        }
    }

    async fetchLogs() {
        try {
            const limitInput = document.getElementById('top-x-filter');
            const limit = limitInput ? parseInt(limitInput.value) || 10 : 10;
            const res = await fetch(`/api/logs?limit=${limit}`);
            const data = await res.json();
            this.metrics = data.slices || [];
            this.updateMetrics();
            this.addActivityLog(`Fetched ${this.metrics.length} slices`);
        } catch (e) {
            console.error('Failed to fetch logs:', e);
            this.addActivityLog('Failed to fetch logs');
        }
    }

    updateMetrics() {
        const iteration = this.currentExploreIteration || (this.snapshots ? this.snapshots.length : 0);
        const subsetSnapshots = (this.snapshots && this.snapshots.length > 0) ? this.snapshots.slice(0, iteration) : [];
        const subsetMetrics = (this.snapshots && this.snapshots.length > 0) ? this.metrics.slice(0, iteration) : this.metrics;

        const snapshotPayload = {
            snapshots: subsetSnapshots,
            selectedPattern: this.selectedPattern || null
        };

        this.visualizers.forEach((visualizer, key) => {
            if (key.includes('search-metrics-kpi')) {
                const latestSlice = subsetMetrics[subsetMetrics.length - 1];
                const latestMetrics = latestSlice?.search_metrics || {};
                latestMetrics._sliceCount = subsetMetrics.length;
                latestMetrics.pattern_descriptor = latestSlice?.pattern_descriptor || '-';
                latestMetrics.top10_avg_quality = latestSlice?.top10_avg_quality || 0.0;
                latestMetrics.budget_consumed = this.budgetConsumed || 0.0;
                visualizer.update(latestMetrics);
            } else {
                if (key.includes('contrast-kde') || key.includes('tree-diagnostics') || key.includes('pattern-details') || 
                    key.includes('quality-scatter') || key.includes('error-distribution') || key.includes('pareto-frontier') || 
                    key.includes('feature-importance') || key.includes('depth-histogram') || key.includes('convergence-chart') ||
                    key.includes('subsequence-importance') || key.includes('sequence-embeddings') || 
                    key.includes('identity-error-matrix') || key.includes('problematic-slices')) {
                    visualizer.update(snapshotPayload);
                } else {
                    visualizer.update(subsetMetrics);
                }
            }
        });
    }

    updateStatusIndicator(connected, status = 'idle') {
        const dot = document.getElementById('run-status-dot');
        const text = document.getElementById('run-status-text');
        
        const startBtn = document.getElementById('btn-start-audit');
        const pauseBtn = document.getElementById('btn-pause-audit');
        const finishBtn = document.getElementById('btn-finish-audit');
        
        if (dot && text) {
            if (!connected) {
                dot.className = 'w-2 h-2 bg-red-500 rounded-full';
                text.textContent = 'Disconnected';
                if (startBtn) { startBtn.classList.remove('hidden'); startBtn.innerHTML = 'Start Audit'; }
                if (pauseBtn) pauseBtn.classList.add('hidden');
                if (finishBtn) finishBtn.classList.add('hidden');
            } else {
                if (status === 'running') {
                    dot.className = 'w-2 h-2 bg-green-500 rounded-full animate-pulse';
                    text.textContent = 'Running';
                    if (startBtn) startBtn.classList.add('hidden');
                    if (pauseBtn) pauseBtn.classList.remove('hidden');
                    if (finishBtn) finishBtn.classList.remove('hidden');
                } else if (status === 'completed') {
                    dot.className = 'w-2 h-2 bg-blue-500 rounded-full';
                    text.textContent = 'Completed';
                    if (startBtn) { startBtn.classList.remove('hidden'); startBtn.innerHTML = 'Start Audit'; }
                    if (pauseBtn) pauseBtn.classList.add('hidden');
                    if (finishBtn) finishBtn.classList.add('hidden');
                } else if (status === 'paused') {
                    dot.className = 'w-2 h-2 bg-yellow-500 rounded-full';
                    text.textContent = 'Awaiting Budget / Paused';
                    if (startBtn) { startBtn.classList.remove('hidden'); startBtn.innerHTML = 'Resume'; }
                    if (pauseBtn) pauseBtn.classList.add('hidden');
                    if (finishBtn) finishBtn.classList.remove('hidden');
                } else {
                    dot.className = 'w-2 h-2 bg-slate-500 rounded-full';
                    text.textContent = 'Ready';
                    if (startBtn) { startBtn.classList.remove('hidden'); startBtn.innerHTML = 'Start Audit'; }
                    if (pauseBtn) pauseBtn.classList.add('hidden');
                    if (finishBtn) finishBtn.classList.add('hidden');
                }
            }
        }
    }

    addActivityLog(message) {
        const log = document.getElementById('activity-log');
        if (log) {
            const entry = document.createElement('div');
            entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
            entry.className = 'text-zinc-400 text-xs';
            log.appendChild(entry);
            if (log.children.length > 50) {
                log.removeChild(log.firstChild);
            }
            log.scrollTop = log.scrollHeight;
        }
    }

    initializeTimelineEvents() {
        const slider = document.getElementById('timeline-slider');
        const playBtn = document.getElementById('btn-timeline-play');
        
        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.currentExploreIteration = val;
                
                // Pause if playing
                if (this.playInterval) {
                    this.toggleTimelinePlay(false);
                }
                
                const label = document.getElementById('timeline-label');
                if (label) {
                    label.textContent = `Iteration ${val} of ${this.snapshots.length}`;
                }
                
                this.updateMetrics();
            });
        }
        
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.toggleTimelinePlay();
            });
        }
    }

    toggleTimelinePlay(forceState) {
        const playBtn = document.getElementById('btn-timeline-play');
        const playIcon = document.getElementById('timeline-play-icon');
        const pauseIcon = document.getElementById('timeline-pause-icon');
        const slider = document.getElementById('timeline-slider');
        const speedSelect = document.getElementById('timeline-speed');
        
        const shouldPlay = forceState !== undefined ? forceState : !this.playInterval;
        
        if (shouldPlay) {
            // Start playing
            if (this.playInterval) clearInterval(this.playInterval);
            
            // If slider is at the end, reset to 1
            if (slider && parseInt(slider.value) >= this.snapshots.length) {
                slider.value = 1;
                this.currentExploreIteration = 1;
                this.updateMetrics();
            }
            
            const intervalTime = speedSelect ? parseInt(speedSelect.value) || 400 : 400;
            
            if (playIcon) playIcon.classList.add('hidden');
            if (pauseIcon) pauseIcon.classList.remove('hidden');
            
            this.playInterval = setInterval(() => {
                if (slider) {
                    let nextVal = parseInt(slider.value) + 1;
                    if (nextVal <= this.snapshots.length) {
                        slider.value = nextVal;
                        this.currentExploreIteration = nextVal;
                        
                        const label = document.getElementById('timeline-label');
                        if (label) {
                            label.textContent = `Iteration ${nextVal} of ${this.snapshots.length}`;
                        }
                        
                        this.updateMetrics();
                    } else {
                        // Reached end, stop play
                        this.toggleTimelinePlay(false);
                    }
                }
            }, intervalTime);
            
            this.addActivityLog('Replaying budget run evolution...');
        } else {
            // Pause/Stop playing
            if (this.playInterval) {
                clearInterval(this.playInterval);
                this.playInterval = null;
            }
            if (playIcon) playIcon.classList.remove('hidden');
            if (pauseIcon) pauseIcon.classList.add('hidden');
            this.addActivityLog('Replay paused');
        }
    }

    updateTimelineExplorer() {
        const container = document.getElementById('timeline-exploration-container');
        const slider = document.getElementById('timeline-slider');
        const label = document.getElementById('timeline-label');
        
        if (!container) return;
        
        if (!this.snapshots || this.snapshots.length === 0) {
            container.classList.add('hidden');
            if (this.playInterval) this.toggleTimelinePlay(false);
            return;
        }
        
        container.classList.remove('hidden');
        
        if (slider) {
            slider.max = this.snapshots.length;
            slider.min = 1;
            
            if (!this.currentExploreIteration || this.currentExploreIteration > this.snapshots.length) {
                this.currentExploreIteration = this.snapshots.length;
            }
            slider.value = this.currentExploreIteration;
        }
        
        if (label) {
            label.textContent = `Iteration ${this.currentExploreIteration} of ${this.snapshots.length}`;
        }
    }

    async resetRunData() {
        if (!confirm('Are you sure you want to clear the run history? This cannot be undone.')) {
            return;
        }
        
        try {
            const res = await fetch('/api/control/clear', { method: 'POST' });
            const data = await res.json();
            console.log('Reset response:', data);
            
            this.snapshots = [];
            this.metrics = [];
            this.currentExploreIteration = null;
            
            if (this.playInterval) {
                this.toggleTimelinePlay(false);
            }
            
            // Clear interacted fields and inputs
            this.interactedFields.clear();
            const configForm = document.getElementById('config-form');
            if (configForm) {
                configForm.reset();
            }
            // Reset slider readouts to '-'
            const sliders = ['max-gap', 'gamma', 'uct-factor', 'jaccard-threshold'];
            sliders.forEach(id => {
                const valEl = document.getElementById(id + '-val');
                if (valEl) valEl.textContent = '-';
            });
            
            this.updateTimelineExplorer();
            this.updateMetrics();
            this.toggleViewMode('idle');
            this.addActivityLog('Run logs reset and cleared');
        } catch (e) {
            console.error('Failed to reset run data:', e);
            this.addActivityLog('Failed to reset run data');
        }
    }

    setupCardResizeSnapping() {
        // Monitor mouseup to snap card sizes
        document.addEventListener('mouseup', () => {
            const containers = document.querySelectorAll('.chart-container');
            let resizedAny = false;
            
            containers.forEach(container => {
                const inlineWidth = container.style.width;
                const inlineHeight = container.style.height;
                
                if (inlineWidth) {
                    const parentWidth = container.parentNode.clientWidth;
                    const widthPx = parseFloat(inlineWidth);
                    const ratio = widthPx / parentWidth;
                    
                    // Snap width to nearest column percentage (33.33%, 50%, or 100%)
                    let targetPercentage = 100;
                    if (ratio < 0.42) {
                        targetPercentage = 33.33;
                    } else if (ratio < 0.75) {
                        targetPercentage = 50;
                    } else {
                        targetPercentage = 100;
                    }
                    
                    // Subtract gap margins (16px) proportionally
                    const gapAdjust = 16 * (1 - targetPercentage / 100);
                    container.style.width = `calc(${targetPercentage}% - ${gapAdjust}px)`;
                    resizedAny = true;
                }
                
                if (inlineHeight) {
                    const heightPx = parseFloat(inlineHeight);
                    // Snap height to increments of 50px with a minimum of 250px
                    const targetHeight = Math.max(250, Math.round(heightPx / 50) * 50);
                    container.style.height = `${targetHeight}px`;
                    resizedAny = true;
                }
            });
            
            if (resizedAny) {
                // Trigger resize callback on all visualizers
                setTimeout(() => {
                    this.visualizers.forEach(v => {
                        if (v && v.chart && typeof v.chart.resize === 'function') {
                            v.chart.resize();
                        }
                        if (v && typeof v.resize === 'function') {
                            v.resize();
                        }
                    });
                }, 50);
            }
        });
    }

    toggleViewMode(status) {
        const setupView = document.getElementById('setup-view');
        const dashboardView = document.getElementById('dashboard-view');
        
        if (!setupView || !dashboardView) return;
        
        if (status === 'idle') {
            setupView.classList.remove('hidden');
            dashboardView.classList.add('hidden');
        } else {
            setupView.classList.add('hidden');
            dashboardView.classList.remove('hidden');
            // Trigger chart resizes on show
            setTimeout(() => {
                this.visualizers.forEach(v => {
                    if (v && v.chart && typeof v.chart.resize === 'function') {
                        v.chart.resize();
                    }
                });
            }, 100);
        }
    }

    async verifyModelServerConnection() {
        const urlInput = document.getElementById('setup-model-url');
        const badge = document.getElementById('server-status-badge');
        const errorBox = document.getElementById('connection-error-box');
        const setupForm = document.getElementById('setup-form');
        const connectBtn = document.getElementById('btn-connect-server');
        
        if (!urlInput || !badge) return;
        
        badge.textContent = 'Estabelecendo conexão e lendo metadados...';
        badge.className = 'text-xs text-amber-500 font-medium';
        if (errorBox) {
            errorBox.classList.add('hidden');
            errorBox.textContent = '';
        }
        if (connectBtn) connectBtn.disabled = true;
        
        const serverUrl = urlInput.value.trim();
        if (!serverUrl) {
            badge.textContent = 'Por favor, insira um endpoint válido.';
            badge.className = 'text-xs text-red-500 font-medium';
            if (connectBtn) connectBtn.disabled = false;
            return;
        }
        
        try {
            const res = await fetch(`/api/control/check-health?url=${encodeURIComponent(serverUrl)}`);
            const data = await res.json();
            
            if (data.online) {
                badge.textContent = 'Conexão estabelecida: Servidor do Modelo Ativo.';
                badge.className = 'text-xs text-green-500 font-medium';
                
                // Parse payload parameters and build dynamic form
                const metadata = data.metadata || { parameters: [] };
                this.domain = metadata.domain || 'malware';
                
                const identitySec = document.getElementById('setup-identity-section');
                if (identitySec) {
                    if (this.domain === 'toxicity') {
                        identitySec.classList.remove('hidden');
                    } else {
                        identitySec.classList.add('hidden');
                    }
                }
                
                this.renderDynamicForm(metadata.parameters);
                
                // Transition to Step 2 (unhide form)
                if (setupForm) {
                    setupForm.classList.remove('hidden');
                    setupForm.scrollIntoView({ behavior: 'smooth' });
                }
            } else {
                badge.textContent = 'Falha na conexão.';
                badge.className = 'text-xs text-red-500 font-medium';
                if (errorBox) {
                    errorBox.textContent = data.error || 'Erro de rede ou timeout ao conectar com o modelo.';
                    errorBox.classList.remove('hidden');
                }
                if (setupForm) setupForm.classList.add('hidden');
            }
        } catch (err) {
            badge.textContent = 'Erro de rede ou timeout.';
            badge.className = 'text-xs text-red-500 font-medium';
            if (errorBox) {
                errorBox.textContent = err.message || 'Erro inesperado ao conectar com o modelo.';
                errorBox.classList.remove('hidden');
            }
            if (setupForm) setupForm.classList.add('hidden');
        } finally {
            if (connectBtn) connectBtn.disabled = false;
        }
    }

    renderDynamicForm(parameters, containerId = 'dynamic-form-fields', idPrefix = 'dyn-', isSidebar = false, currentValues = null) {
        const fieldsContainer = document.getElementById(containerId);
        if (!fieldsContainer) return;
        
        fieldsContainer.innerHTML = '';
        if (!isSidebar) {
            this.dynamicParameters = parameters;
            this.dynamicValidationErrors = {};
        } else {
            this.sidebarDynamicParameters = parameters;
            this.sidebarValidationErrors = {};
        }
        
        parameters.forEach(param => {
            const fieldWrapper = document.createElement('div');
            fieldWrapper.className = 'form-group space-y-1';
            
            const labelEl = document.createElement('label');
            labelEl.className = 'form-label';
            labelEl.setAttribute('for', `${idPrefix}${param.name}`);
            labelEl.textContent = param.label || param.name;
            if (param.required) {
                const reqSpan = document.createElement('span');
                reqSpan.className = 'text-red-500 ml-1 font-bold';
                reqSpan.textContent = '*';
                labelEl.appendChild(reqSpan);
            }
            fieldWrapper.appendChild(labelEl);
            
            // Determine active/initial value
            let val = param.default_value;
            if (currentValues) {
                if (currentValues[param.name] !== undefined) {
                    val = currentValues[param.name];
                } else if (param.name === 'budget') {
                    if (currentValues['remaining_budget'] !== undefined) {
                        val = currentValues['remaining_budget'];
                    } else if (currentValues['budgets'] && currentValues['budgets']['search'] !== undefined) {
                        val = currentValues['budgets']['search'];
                    }
                }
            }

            let inputEl;
            if (param.type === 'enum') {
                inputEl = document.createElement('select');
                inputEl.className = 'form-input';
                const options = (param.constraints && param.constraints.options) || [];
                options.forEach(opt => {
                    const optEl = document.createElement('option');
                    optEl.value = opt;
                    optEl.textContent = opt;
                    if (opt === val) optEl.selected = true;
                    inputEl.appendChild(optEl);
                });
            } else if (param.type === 'boolean') {
                inputEl = document.createElement('select');
                inputEl.className = 'form-input';
                
                const optTrue = document.createElement('option');
                optTrue.value = 'true';
                optTrue.textContent = 'True';
                if (val === true || val === 'true') optTrue.selected = true;
                
                const optFalse = document.createElement('option');
                optFalse.value = 'false';
                optFalse.textContent = 'False';
                if (val === false || val === 'false') optFalse.selected = true;
                
                inputEl.appendChild(optTrue);
                inputEl.appendChild(optFalse);
            } else {
                inputEl = document.createElement('input');
                inputEl.className = 'form-input';
                inputEl.setAttribute('id', `${idPrefix}${param.name}`);
                
                if (param.type === 'int' || param.type === 'float') {
                    inputEl.setAttribute('type', 'number');
                    if (param.type === 'float') {
                        inputEl.setAttribute('step', 'any');
                    }
                    if (param.constraints) {
                        if (param.constraints.min !== undefined) inputEl.setAttribute('min', param.constraints.min);
                        if (param.constraints.max !== undefined) inputEl.setAttribute('max', param.constraints.max);
                    }
                } else {
                    inputEl.setAttribute('type', 'text');
                }
                
                if (val !== undefined && val !== null) {
                    inputEl.value = val;
                }
            }
            
            inputEl.setAttribute('name', param.name);
            inputEl.setAttribute('id', `${idPrefix}${param.name}`);
            
            // Handle editable vs fixed fields based on 'modifiable' property
            if (isSidebar && param.modifiable === false && param.name !== 'budget') {
                inputEl.disabled = true;
                inputEl.classList.add('opacity-50', 'cursor-not-allowed');
            }
            
            const errorMsgEl = document.createElement('span');
            errorMsgEl.className = 'text-[10px] text-red-500 hidden block mt-1 font-mono';
            errorMsgEl.setAttribute('id', `${idPrefix}err-${param.name}`);
            
            const validate = () => this.validateField(param, inputEl, errorMsgEl, isSidebar);
            inputEl.addEventListener('input', validate);
            inputEl.addEventListener('change', validate);
            
            fieldWrapper.appendChild(inputEl);
            fieldWrapper.appendChild(errorMsgEl);
            
            fieldsContainer.appendChild(fieldWrapper);
            
            // Initial validation run to populate required state if empty
            validate();
        });
    }

    validateField(param, inputEl, errorMsgEl, isSidebar = false) {
        let value = inputEl.value;
        let isValid = true;
        let errorMsg = '';
        
        if (param.required && (value === undefined || value === null || value.trim() === '')) {
            isValid = false;
            errorMsg = 'Campo obrigatório.';
        } else if (value.trim() !== '') {
            if (param.type === 'int') {
                const parsed = parseInt(value, 10);
                if (isNaN(parsed) || parsed.toString() !== value.trim()) {
                    isValid = false;
                    errorMsg = 'Deve ser um número inteiro.';
                } else if (param.constraints) {
                    if (param.constraints.min !== undefined && parsed < param.constraints.min) {
                        isValid = false;
                        errorMsg = `Valor mínimo permitido é ${param.constraints.min}.`;
                    }
                    if (param.constraints.max !== undefined && parsed > param.constraints.max) {
                        isValid = false;
                        errorMsg = `Valor máximo permitido é ${param.constraints.max}.`;
                    }
                }
            } else if (param.type === 'float') {
                const parsed = parseFloat(value);
                if (isNaN(parsed)) {
                    isValid = false;
                    errorMsg = 'Deve ser um número de ponto flutuante.';
                } else if (param.constraints) {
                    if (param.constraints.min !== undefined && parsed < param.constraints.min) {
                        isValid = false;
                        errorMsg = `Valor mínimo permitido é ${param.constraints.min}.`;
                    }
                    if (param.constraints.max !== undefined && parsed > param.constraints.max) {
                        isValid = false;
                        errorMsg = `Valor máximo permitido é ${param.constraints.max}.`;
                    }
                }
            }
        }
        
        const errorsObj = isSidebar ? this.sidebarValidationErrors : this.dynamicValidationErrors;
        
        if (isValid) {
            errorMsgEl.textContent = '';
            errorMsgEl.classList.add('hidden');
            delete errorsObj[param.name];
        } else {
            errorMsgEl.textContent = errorMsg;
            errorMsgEl.classList.remove('hidden');
            errorsObj[param.name] = errorMsg;
        }
        
        if (!isSidebar) {
            const initBtn = document.getElementById('btn-initialize-pipeline');
            if (initBtn) {
                const hasErrors = Object.keys(this.dynamicValidationErrors).length > 0;
                initBtn.disabled = hasErrors;
                if (hasErrors) {
                    initBtn.classList.add('opacity-50', 'cursor-not-allowed');
                } else {
                    initBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }
        } else {
            const submitBtn = document.querySelector('#config-form button[type="submit"]');
            if (submitBtn) {
                const hasErrors = Object.keys(this.sidebarValidationErrors).length > 0;
                submitBtn.disabled = hasErrors;
                if (hasErrors) {
                    submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
                } else {
                    submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }
        }
    }

    async handleSetupSubmit(e) {
        if (e) e.preventDefault();
        
        const initBtn = document.getElementById('btn-initialize-pipeline');
        const origText = initBtn ? initBtn.textContent : '';
        if (initBtn) {
            initBtn.disabled = true;
            initBtn.textContent = 'Initializing Audit pipeline...';
        }
        
        // Show premium initialization overlay
        let loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'initializing-overlay';
        loadingOverlay.className = 'fixed inset-0 bg-zinc-950/80 backdrop-blur-md flex flex-col items-center justify-center z-50 transition-opacity duration-300';
        loadingOverlay.innerHTML = `
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
                <div class="relative w-16 h-16 mx-auto">
                    <div class="absolute inset-0 rounded-full border-4 border-blue-500/20"></div>
                    <div class="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                </div>
                <div class="space-y-1">
                    <h3 class="text-sm font-bold text-zinc-105 uppercase tracking-wider">Inicializando Análise...</h3>
                    <p class="text-xs text-zinc-400">Compilando parâmetros e instanciando pipeline MCTS</p>
                </div>
            </div>
        `;
        document.body.appendChild(loadingOverlay);
        
        try {
            const form = document.getElementById('setup-form');
            const formData = new FormData(form);
            
            const domain = this.domain || 'malware';
            const modelServerUrl = document.getElementById('setup-model-url').value.trim();
            const datasetPath = formData.get('setup_dataset_path');
            const isSimulatorUrl = (
                modelServerUrl.includes('/api/mock-model') ||
                modelServerUrl.includes('/api/simulator/handshake') ||
                modelServerUrl.includes('/api/mock-model-server')
            );
            const useMock = isSimulatorUrl;
            
            const identityFilters = [];
            const identityBoxes = document.querySelectorAll('input[name="setup_identities"]:checked');
            identityBoxes.forEach(box => {
                identityFilters.push(box.value);
            });
            
            // Compile dynamic configuration parameters
            const advancedParams = {};
            let searchBudget = 120.0;
            if (this.dynamicParameters) {
                this.dynamicParameters.forEach(param => {
                    const el = document.getElementById(`dyn-${param.name}`);
                    if (!el) return;
                    
                    let val = el.value;
                    if (param.type === 'int') {
                        val = parseInt(val, 10);
                    } else if (param.type === 'float') {
                        val = parseFloat(val);
                    } else if (param.type === 'boolean') {
                        val = (val === 'true');
                    }
                    
                    if (param.name === 'budget') {
                        searchBudget = val;
                        advancedParams.budgets = { search: val };
                    } else {
                        advancedParams[param.name] = val;
                    }
                });
            }
            
            const postData = new FormData();
            postData.append('model_server_url', modelServerUrl);
            postData.append('domain', domain);
            if (datasetPath) {
                postData.append('dataset_path', datasetPath);
            }
            postData.append('use_mock', useMock);
            postData.append('identity_filters_json', JSON.stringify(identityFilters));
            postData.append('config_params_json', JSON.stringify(advancedParams));
            
            const fileInput = document.getElementById('setup-file-input');
            if (fileInput && fileInput.files.length > 0) {
                postData.append('file', fileInput.files[0]);
            }
            
            const res = await fetch('/api/initialize', {
                method: 'POST',
                body: postData
            });
            
            const result = await res.json();
            
            if (result.status === 'error') {
                this.addActivityLog(`Initialization error: ${result.message}`);
                alert(`Error initializing pipeline: ${result.message}`);
                if (loadingOverlay) loadingOverlay.remove();
                return;
            }
            
            this.domain = domain;
            this.updateDomainVisibility();
            
            this.addActivityLog(`Audit pipeline initialized on domain: ${domain.toUpperCase()}`);
            this.addActivityLog(`Mode: ${result.use_mock ? 'Simulation' : 'Orchestrated Model Server'}`);
            
            this.snapshots = [];
            this.metrics = [];
            this.currentExploreIteration = null;
            this.budgetConsumed = 0.0;
            this.remainingBudget = searchBudget;
            
            // Fade out overlay and transition to dashboards view
            setTimeout(() => {
                if (loadingOverlay) {
                    loadingOverlay.style.opacity = '0';
                    setTimeout(() => loadingOverlay.remove(), 300);
                }
                this.toggleViewMode('running');
            }, 800);
            
            if (!this.wsManager || this.wsManager.ws.readyState !== WebSocket.OPEN) {
                this.connectWebSocket();
            } else {
                this.fetchCurrentConfig();
            }
            
        } catch (err) {
            console.error('Failed to initialize audit setup:', err);
            this.addActivityLog('Audit pipeline initialization failed.');
            alert('Failed to initialize pipeline. Check connection settings and console logs.');
            if (loadingOverlay) loadingOverlay.remove();
        } finally {
            if (initBtn) {
                initBtn.disabled = false;
                initBtn.textContent = origText;
            }
        }
    }
}

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AuditLensApp();
});
