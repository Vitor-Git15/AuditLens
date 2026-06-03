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
        setTimeout(() => {
            if (this.chart) {
                this.chart.resize();
            }
        }, 50);
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
 * Quality Scatter Visualizer
 * X: support_percentage, Y: quality_score_phi, bubble size: delta_g
 */
class QualityScatter extends BaseVisualizer {
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

    render() {
        const renderData = this.getRenderData();
        
        // Prepare scatter data
        const scatterData = renderData.map(d => {
            const attrs = d.attributes || {};
            const supPct = attrs.support_percentage || 0.0;
            const contrast = attrs.delta_g || attrs.contrast_metric || 0.0;
            const quality = d.quality_score || 0.0;
            const wracc = attrs.wracc || 0.0;
            const efficiency = attrs.efficiency || 0.0;
            const supportCount = attrs.support || 0;
            return [supPct, contrast, quality, wracc, efficiency, d.id, supportCount];
        });

        const option = {
            title: {
                text: 'Priority Matrix (4-Quadrant Analysis)',
                left: 'center',
                top: 10,
                textStyle: {
                    color: '#e4e4e7',
                    fontSize: 14,
                    fontWeight: 'normal'
                }
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    const val = params.value;
                    if (!val) return '';
                    const supPct = val[0];
                    const contrast = val[1];
                    const quality = val[2];
                    const wracc = val[3];
                    const efficiency = val[4];
                    const id = val[5];
                    const count = val[6];
                    return `<div style="font-size: 11px; line-height: 1.5; padding: 4px;">
                        <strong style="color: #60a5fa; font-size: 12px;">Slice: ${id}</strong><br/>
                        <strong>Support (Coverage):</strong> ${supPct.toFixed(2)}% (${count})<br/>
                        <strong>Contrast Strength:</strong> ${contrast.toFixed(4)}<br/>
                        <strong>WRAcc Contrast:</strong> ${wracc.toFixed(4)}<br/>
                        <strong>Efficiency:</strong> ${efficiency.toFixed(4)}<br/>
                        <strong>Quality Score (φ):</strong> ${quality.toFixed(4)}
                    </div>`;
                }
            },
            xAxis: {
                type: 'value',
                name: 'Support Percentage (%)',
                nameLocation: 'middle',
                nameGap: 25,
                min: 0,
                max: 'dataMax',
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', formatter: '{value}%' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            yAxis: {
                type: 'value',
                name: 'Contrast Strength (Δg)',
                nameLocation: 'middle',
                nameGap: 30,
                min: 0,
                max: 'dataMax',
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            grid: { left: '12%', right: '8%', bottom: '15%', top: '15%', containLabel: true },
            series: [
                {
                    name: 'Slices',
                    type: 'scatter',
                    data: scatterData,
                    symbolSize: (val) => Math.max(8, Math.min(25, val[2] * 22)),
                    itemStyle: { 
                        color: '#3b82f6',
                        borderColor: '#60a5fa',
                        borderWidth: 1.5
                    },
                    emphasis: { 
                        itemStyle: { 
                            color: '#60a5fa',
                            borderWidth: 2
                        } 
                    },
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        lineStyle: { type: 'dashed', color: '#4b5563', width: 1.5 },
                        data: [
                            { xAxis: 15 },
                            { yAxis: 0.2 }
                        ]
                    },
                    markArea: {
                        silent: true,
                        data: [
                            // High Priority: X > 15%, Y > 0.2
                            [
                                {
                                    name: 'High Priority',
                                    xAxis: 15,
                                    yAxis: 0.2,
                                    itemStyle: { color: 'rgba(239, 68, 68, 0.08)' },
                                    label: { position: 'insideTopRight', color: '#f87171', fontSize: 10, fontWeight: 'bold' }
                                },
                                {
                                    xAxis: 'max',
                                    yAxis: 'max'
                                }
                            ],
                            // Niche Subgroups: X <= 15%, Y > 0.2
                            [
                                {
                                    name: 'Niche Subgroups',
                                    xAxis: 0,
                                    yAxis: 0.2,
                                    itemStyle: { color: 'rgba(59, 130, 246, 0.08)' },
                                    label: { position: 'insideTopLeft', color: '#60a5fa', fontSize: 10, fontWeight: 'bold' }
                                },
                                {
                                    xAxis: 15,
                                    yAxis: 'max'
                                }
                            ],
                            // Noise: X <= 15%, Y <= 0.2
                            [
                                {
                                    name: 'Noise',
                                    xAxis: 0,
                                    yAxis: 0,
                                    itemStyle: { color: 'rgba(113, 113, 122, 0.04)' },
                                    label: { position: 'insideBottomLeft', color: '#71717a', fontSize: 10, fontWeight: 'bold' }
                                },
                                {
                                    xAxis: 15,
                                    yAxis: 0.2
                                }
                            ],
                            // Ignore: X > 15%, Y <= 0.2
                            [
                                {
                                    name: 'Ignore',
                                    xAxis: 15,
                                    yAxis: 0,
                                    itemStyle: { color: 'rgba(39, 39, 42, 0.08)' },
                                    label: { position: 'insideBottomRight', color: '#52525b', fontSize: 10, fontWeight: 'bold' }
                                },
                                {
                                    xAxis: 'max',
                                    yAxis: 0.2
                                }
                            ]
                        ]
                    }
                }
            ]
        };

        this.chart.setOption(option);

        // Bind click event
        this.chart.off('click');
        this.chart.on('click', (params) => {
            if (params.componentSubType === 'scatter') {
                const val = params.value;
                if (val && val[5]) {
                    const patternId = val[5];
                    const detailsViz = window.app.visualizers.get('pattern-details-pattern-details-container');
                    if (detailsViz) {
                        detailsViz.selectedPatternId = patternId;
                        detailsViz.render();
                    }
                    const tabBtn = document.querySelector('.tab-btn[data-tab="individual-patterns"]');
                    if (tabBtn) {
                        tabBtn.click();
                    }
                }
            }
        });
    }
}

/**
 * Error Distribution Visualizer
 * Bar chart with error bars for std_error_sigma
 */
class ErrorDistribution extends BaseVisualizer {
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

    render() {
        const renderData = this.getRenderData();
        const option = {
            title: {
                text: 'Slice Contrast Strength vs WRAcc Contrast',
                left: 'center',
                top: 10,
                textStyle: {
                    color: '#e4e4e7',
                    fontSize: 14,
                    fontWeight: 'normal'
                }
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                textStyle: { color: '#e4e4e7' },
                formatter: (params) => {
                    if (params.length > 0) {
                        const d = renderData[params[0].dataIndex];
                        return `<div style="font-size: 11px; line-height: 1.5; padding: 4px;">
                            <strong style="color: #60a5fa; font-size: 12px;">Slice: ${d.id}</strong><br/>
                            <strong>Contrast Strength (Δg):</strong> ${(d.attributes.delta_g || 0).toFixed(4)}<br/>
                            <strong>WRAcc Contrast:</strong> ${(d.attributes.wracc || 0).toFixed(4)}<br/>
                            <strong>Coverage:</strong> ${(d.attributes.support_percentage || 0).toFixed(1)}% (${d.attributes.support})
                        </div>`;
                    }
                }
            },
            legend: {
                data: ['Contrast Strength (Δg)', 'WRAcc Contrast'],
                textStyle: { color: '#a1a1a6' },
                bottom: 10
            },
            grid: { left: '12%', right: '5%', bottom: '20%', top: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                data: renderData.map(d => d.id),
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', fontSize: 10, rotate: 20 }
            },
            yAxis: {
                type: 'value',
                name: 'Value',
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            series: [
                {
                    name: 'Contrast Strength (Δg)',
                    type: 'bar',
                    data: renderData.map(d => d.attributes.delta_g || d.attributes.contrast_metric || 0),
                    itemStyle: { color: '#ef4444' }
                },
                {
                    name: 'WRAcc Contrast',
                    type: 'bar',
                    data: renderData.map(d => d.attributes.wracc || 0),
                    itemStyle: { color: '#3b82f6' }
                }
            ]
        };
        this.chart.setOption(option);
    }
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
        const pareto = latest.global_metrics.pareto_frontier || [];

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
                        <strong>Subgroup Quality:</strong> ${val[1].toFixed(4)}
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
                name: 'Subgroup Quality',
                nameLocation: 'middle',
                nameGap: 30,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            grid: { left: '12%', right: '8%', bottom: '15%', top: '15%', containLabel: true },
            series: [
                {
                    name: 'Pareto Frontier',
                    type: 'line',
                    data: pareto.map(p => [p.support_percentage, p.quality, p.descriptor]),
                    lineStyle: { color: '#ef4444', width: 2 },
                    symbol: 'circle',
                    symbolSize: 8,
                    itemStyle: { color: '#3b82f6', borderColor: '#60a5fa', borderWidth: 1.5 },
                    smooth: true
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

    render() {
        const snapshots = this.data?.snapshots || [];
        if (snapshots.length === 0) return;
        const latest = snapshots[snapshots.length - 1];
        const importance = latest.global_metrics.feature_importance || {};

        // Sort items by importance ascending for vertical rendering bottom-to-top
        const sortedItems = Object.entries(importance).sort((a, b) => a[1] - b[1]);
        const yData = sortedItems.map(item => item[0]);
        const xData = sortedItems.map(item => item[1]);

        const option = {
            title: {
                text: 'Feature Importance (Tree Frequency)',
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
                axisLabel: { color: '#a1a1a6', fontSize: 10 }
            },
            grid: { left: '20%', right: '8%', bottom: '15%', top: '15%', containLabel: true },
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
 
        this.initializeVisualizers();
        this.initializeEventListeners();
        this.connectWebSocket();
        this.fetchCurrentConfig();
        this.fetchHistory();
        this.setupCardResizeSnapping();
    }

    initializeVisualizers() {
        this.registry.register('quality-scatter', QualityScatter);
        this.registry.register('error-distribution', ErrorDistribution);
        this.registry.register('search-metrics-kpi', SearchMetricsKPI);
        this.registry.register('metrics-evolution', MetricsEvolution);
        this.registry.register('class-balance-pie', ClassBalancePie);
        this.registry.register('slices-heatmap', SlicesHeatmap);
        // New visualizers
        this.registry.register('convergence-chart', ConvergenceChart);
        this.registry.register('bubble-chart', BubbleChartViz);
        this.registry.register('contrast-kde', ContrastKDEChart);
        this.registry.register('tree-diagnostics', MCTSDiagnosticsPanel);
        this.registry.register('pattern-details', PatternDetailsPanel);
        this.registry.register('pareto-frontier', ParetoFrontier);
        this.registry.register('feature-importance', FeatureImportance);
        this.registry.register('depth-histogram', DepthHistogram);

        const chartConfigs = [
            { id: 'quality-scatter', elementId: 'chart-metrics' },
            { id: 'error-distribution', elementId: 'chart-quality' },
            { id: 'search-metrics-kpi', elementId: 'kpi-section' },
            { id: 'tree-diagnostics', elementId: 'tree-diagnostics-container' },
            { id: 'pattern-details', elementId: 'pattern-details-container' },
            { id: 'pareto-frontier', elementId: 'chart-pareto' },
            { id: 'feature-importance', elementId: 'chart-feature-importance' },
            { id: 'depth-histogram', elementId: 'chart-depth-histogram' }
        ];

        chartConfigs.forEach(config => {
            const element = document.getElementById(config.elementId);
            if (element) {
                const visualizer = this.registry.create(config.id, element);
                this.visualizers.set(config.id + '-' + config.elementId, visualizer);
            }
        });
    }

    initializeEventListeners() {
        console.log('Initializing event listeners...');
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

        // Bind close buttons of existing cards
        document.querySelectorAll('.btn-close-chart').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const container = e.target.closest('.chart-container');
                if (container) {
                    this.removeChart(container);
                }
            });
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
            
            // Update sidebar fields to match config (disabled for neutral initialization)
            // this.populateConfigFields(data);
            
            // Trigger KPI update
            this.updateMetrics();
        } catch (e) {
            console.error('Failed to fetch current config:', e);
        }
    }

    populateConfigFields(data) {
        if (!data) return;
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        const setHtml = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        
        if (data.budgets && data.budgets.search !== undefined) {
            setVal('search-budget', data.budgets.search);
        }
        
        const useMockCheckbox = document.getElementById('use-mock');
        if (useMockCheckbox && data.use_mock !== undefined) {
            useMockCheckbox.checked = data.use_mock;
        }
        
        if (data.explore) {
            setVal('subgroups-explore', data.explore.join(', '));
        }
        if (data.ignore) {
            setVal('subgroups-ignore', data.ignore.join(', '));
        }
        if (data.weights && Object.keys(data.weights).length > 0) {
            setVal('weights-input', JSON.stringify(data.weights));
        } else {
            setVal('weights-input', '');
        }
        
        if (data.max_gap !== undefined) {
            setVal('max-gap', data.max_gap);
            setHtml('max-gap-val', data.max_gap);
        }
        if (data.gamma !== undefined) {
            setVal('gamma', data.gamma);
            setHtml('gamma-val', data.gamma.toFixed(2));
        }
        if (data.min_support !== undefined) {
            setVal('min-support', data.min_support);
        }
        if (data.min_count_class !== undefined) {
            setVal('min-count-class', data.min_count_class);
        }
        if (data.uct_factor !== undefined) {
            setVal('uct-factor', data.uct_factor);
            setHtml('uct-factor-val', data.uct_factor.toFixed(2));
        }
        if (data.jaccard_threshold !== undefined) {
            setVal('jaccard-threshold', data.jaccard_threshold);
            setHtml('jaccard-threshold-val', data.jaccard_threshold.toFixed(2));
        }
    }

    async handleConfigSubmit(e) {
        if (e) e.preventDefault();
        const configForm = document.getElementById('config-form');
        if (!configForm) return;
        const formData = new FormData(configForm);
        const useMockCheckbox = document.getElementById('use-mock');
        
        const config = {};
        
        const shouldSend = (name, isSlider = false) => {
            const value = formData.get(name);
            if (isSlider) {
                return this.interactedFields && this.interactedFields.has(name) && value !== null && value !== undefined && value.trim() !== '';
            }
            return value !== null && value !== undefined && value.trim() !== '';
        };

        // Budgets
        if (shouldSend('search_budget')) {
            config.budgets = { 'search': parseFloat(formData.get('search_budget')) };
        } else {
            config.budgets = null;
        }

        // Use mock
        if (this.interactedFields && this.interactedFields.has('use_mock') && useMockCheckbox) {
            config.use_mock = useMockCheckbox.checked;
        } else {
            config.use_mock = null;
        }

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

        // Max Gap
        if (shouldSend('max_gap', true)) {
            config.max_gap = parseInt(formData.get('max_gap'));
        } else {
            config.max_gap = null;
        }

        // Gamma
        if (shouldSend('gamma', true)) {
            config.gamma = parseFloat(formData.get('gamma'));
        } else {
            config.gamma = null;
        }

        // Min Support
        if (shouldSend('min_support')) {
            config.min_support = parseInt(formData.get('min_support'));
        } else {
            config.min_support = null;
        }

        // Min Count Class
        if (shouldSend('min_count_class')) {
            config.min_count_class = parseInt(formData.get('min_count_class'));
        } else {
            config.min_count_class = null;
        }

        // UCT Factor
        if (shouldSend('uct_factor', true)) {
            config.uct_factor = parseFloat(formData.get('uct_factor'));
        } else {
            config.uct_factor = null;
        }

        // Jaccard Threshold
        if (shouldSend('jaccard_threshold', true)) {
            config.jaccard_threshold = parseFloat(formData.get('jaccard_threshold'));
        } else {
            config.jaccard_threshold = null;
        }

        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            const result = await response.json();
            this.addActivityLog('Config submitted');
            console.log('Config response:', result);
        } catch (error) {
            console.error('Failed to submit config:', error);
            this.addActivityLog('Config submission failed');
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
                this.visualizers.delete(key);
                break;
            }
        }
        container.remove();
        this.addActivityLog('Chart removed from layout');
        
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
            this.fetchCurrentConfig();
            if (data.status === 'completed' || data.status === 'paused') {
                this.fetchLogs();
            }
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
                if (key.includes('contrast-kde') || key.includes('tree-diagnostics') || key.includes('pattern-details') || key.includes('quality-scatter') || key.includes('error-distribution') || key.includes('pareto-frontier') || key.includes('feature-importance') || key.includes('depth-histogram') || key.includes('convergence-chart')) {
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
            log.insertBefore(entry, log.firstChild);
            if (log.children.length > 10) {
                log.removeChild(log.lastChild);
            }
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
}

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AuditLensApp();
});
