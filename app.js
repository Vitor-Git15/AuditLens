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
    }

    setupResizeListener() {
        const resizeObserver = new ResizeObserver(() => {
            this.chart.resize();
        });
        resizeObserver.observe(this.container);
    }

    update(data) {
        this.data = data;
        this.render();
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
    render() {
        const renderData = this.getRenderData();
        const option = {
            title: {
                text: 'Quality Score vs Support Percentage',
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
                    if (params.componentSubType === 'scatter') {
                        const d = renderData[params.dataIndex];
                        return `<div style="font-size: 11px; line-height: 1.5;">
                            <strong>Slice ${params.dataIndex + 1}</strong><br/>
                            Support: ${d.support_percentage.toFixed(2)}%<br/>
                            Quality: ${d.quality_score_phi.toFixed(4)}<br/>
                            Soft Error: ${d.soft_error.toFixed(4)}<br/>
                            P-Value: ${d.p_value_bh.toFixed(4)}<br/>
                            Count: ${d.support_count}
                        </div>`;
                    }
                }
            },
            xAxis: {
                type: 'value',
                name: 'Support Percentage (%)',
                nameLocation: 'middle',
                nameGap: 30,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', formatter: '{value}%' },
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
            grid: { left: '8%', right: '5%', bottom: '12%', top: '15%', containLabel: true },
            series: [
                {
                    name: 'Quality vs Support',
                    type: 'scatter',
                    data: renderData.map(d => [d.support_percentage, d.quality_score_phi, d.delta_g]),
                    symbolSize: (val) => Math.max(6, Math.min(20, val[2] * 15)),
                    itemStyle: { 
                        color: '#0ea5e9',
                        borderColor: '#06b6d4',
                        borderWidth: 1
                    },
                    emphasis: { 
                        itemStyle: { 
                            color: '#00d9ff',
                            borderWidth: 2
                        } 
                    }
                }
            ]
        };
        this.chart.setOption(option);
    }
}

/**
 * Error Distribution Visualizer
 * Bar chart with error bars for std_error_sigma
 */
class ErrorDistribution extends BaseVisualizer {
    render() {
        const renderData = this.getRenderData();
        const option = {
            title: {
                text: 'Mean Error with Standard Deviation',
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
                        return `<div style="font-size: 11px; line-height: 1.5;">
                            <strong>Slice ${params[0].dataIndex + 1}</strong><br/>
                            Mean Error: ${d.mean_error_mu.toFixed(4)}<br/>
                            Class 0 Error: ${d.error_class_0.toFixed(4)}<br/>
                            Class 1 Error: ${d.error_class_1.toFixed(4)}<br/>
                            Std Dev: ±${d.std_error_sigma.toFixed(4)}<br/>
                            Range: [${(d.mean_error_mu - d.std_error_sigma).toFixed(4)}, ${(d.mean_error_mu + d.std_error_sigma).toFixed(4)}]<br/>
                            Support: ${d.support_count} (${d.support_percentage.toFixed(1)}%)
                        </div>`;
                    }
                }
            },
            grid: { left: '8%', right: '5%', bottom: '12%', top: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                data: renderData.map((d, i) => d.pattern_descriptor || `S${i + 1}`),
                name: 'Slice Index',
                nameLocation: 'middle',
                nameGap: 30,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6', fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                name: 'Error Value',
                nameLocation: 'middle',
                nameGap: 40,
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' },
                splitLine: { lineStyle: { color: '#27272a' } }
            },
            series: [
                {
                    name: 'Mean Error',
                    data: renderData.map(d => ({
                        value: d.mean_error_mu,
                        errorPlus: d.std_error_sigma,
                        errorMinus: d.std_error_sigma
                    })),
                    type: 'bar',
                    itemStyle: { color: '#f97316' },
                    emphasis: { itemStyle: { color: '#fb923c' } },
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
            grid: { left: '10%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
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
            grid: { left: '15%', right: '10%', bottom: '15%', top: '5%' },
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
        if (searchMetrics) {
            this.data = searchMetrics;
            this.render();
        }
    }

    render() {
        const kpiPatterns = document.getElementById('kpi-patterns');
        const kpiCoverage = document.getElementById('kpi-coverage');
        const kpiSlices = document.getElementById('kpi-slices');
        const kpiPattern = document.getElementById('kpi-pattern');
        const kpiAvgQuality = document.getElementById('kpi-avg-quality');

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
    }

    dispose() {
        // DOM-based visualizer, no cleanup needed
    }
}

/**
 * Convergence Chart - Step chart showing quality progression
 */
class ConvergenceChart extends BaseVisualizer {
    render() {
        if (!this.data || this.data.length === 0) return;
        const option = {
            title: { text: 'Quality Convergence', left: 'center', top: 10, textStyle: { color: '#e4e4e7', fontSize: 14, fontWeight: 'normal' } },
            tooltip: { trigger: 'axis', backgroundColor: '#18181b', borderColor: '#27272a', textStyle: { color: '#e4e4e7' } },
            xAxis: {
                type: 'category',
                name: 'Iteration',
                nameLocation: 'middle',
                nameGap: 30,
                data: this.data.map((_, i) => i),
                axisLine: { lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1a6' }
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
            grid: { left: '10%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
            series: [{
                name: 'Top Quality',
                type: 'line',
                step: 'middle',
                data: this.data.map(d => d.quality_score_phi || 0),
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
            grid: { left: '10%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
            series: [{
                name: 'Patterns',
                type: 'scatter',
                symbolSize: (val) => Math.max(8, Math.min(25, val[2] * 200)),
                data: bubbleData,
                emphasis: { itemStyle: { color: '#00d9ff', borderWidth: 2 } }
            }]
        };
    }
}

/**
 * Contrast KDE Chart - Kernel Density Estimation
 */
class ContrastKDEChart extends BaseVisualizer {
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
            grid: { left: '8%', right: '5%', bottom: '20%', top: '15%', containLabel: true },
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
            this.container.innerHTML = '<div class="col-span-3 text-center text-zinc-500 py-6">Waiting for MCTS search snapshots...</div>';
            return;
        }
        
        const latest = snapshots[snapshots.length - 1];
        const metrics = latest.global_metrics || {};
        
        const explored = metrics.explored_nodes || 0;
        const total = metrics.search_space || 50000;
        const progress = ((explored / total) * 100).toFixed(2);
        const stability = metrics.stability !== undefined ? metrics.stability : 0;
        const rate = metrics.explored_rate || 0;
        const rolloutSuccess = ((metrics.rollout_success_rate || 0) * 100).toFixed(1);
        
        const stabilityColor = stability > 15 ? 'text-yellow-500' : 'text-green-500';
        
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
    
    render() {
        const snapshots = this.data.snapshots || [];
        if (snapshots.length === 0) {
            this.container.innerHTML = '<div class="text-center text-zinc-500 py-12">No snapshots loaded yet. Start the audit to see patterns.</div>';
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

        this.initializeVisualizers();
        this.initializeEventListeners();
        this.connectWebSocket();
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

        const chartConfigs = [
            { id: 'quality-scatter', elementId: 'chart-metrics' },
            { id: 'error-distribution', elementId: 'chart-quality' },
            { id: 'search-metrics-kpi', elementId: 'kpi-section' },
            { id: 'tree-diagnostics', elementId: 'tree-diagnostics-container' },
            { id: 'pattern-details', elementId: 'pattern-details-container' }
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
        } else {
            console.error('Config form not found');
        }

        // Slider dynamic readout listeners
        const sliders = ['max-gap', 'gamma', 'uct-factor', 'jaccard-threshold'];
        sliders.forEach(id => {
            const el = document.getElementById(id);
            const valEl = document.getElementById(id + '-val');
            if (el && valEl) {
                el.addEventListener('input', (e) => {
                    const val = parseFloat(e.target.value);
                    valEl.textContent = (id === 'max-gap') ? val : val.toFixed(2);
                });
            }
        });

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
    }

    async handleConfigSubmit(e) {
        e.preventDefault();
        const formData = new FormData(document.getElementById('config-form'));
        const useMockCheckbox = document.getElementById('use-mock');
        
        let weights = {};
        try {
            const weightsRaw = formData.get('weights_input');
            if (weightsRaw && weightsRaw.trim() !== '') {
                weights = JSON.parse(weightsRaw);
            }
        } catch (e) {
            console.error("Invalid JSON for weights");
            this.addActivityLog('Invalid JSON in weights');
            return;
        }

        const config = {
            budgets: { 'search': parseFloat(formData.get('search_budget')) || 100 },
            use_mock: useMockCheckbox ? useMockCheckbox.checked : false,
            weights: weights,
            subgroups_to_explore: formData.get('subgroups_explore')
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0),
            subgroups_to_ignore: formData.get('subgroups_ignore')
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0),
            max_gap: parseInt(formData.get('max_gap')) || 5,
            gamma: parseFloat(formData.get('gamma')) || 0.5,
            uct_factor: parseFloat(formData.get('uct_factor')) || 1.2,
            jaccard_threshold: parseFloat(formData.get('jaccard_threshold')) || 0.9,
            min_support: parseInt(formData.get('min_support')) || 10,
            min_count_class: parseInt(formData.get('min_count_class')) || 5
        };

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
            { id: 'quality-scatter', name: 'Quality vs Support Scatter Plot', icon: '📊' },
            { id: 'error-distribution', name: 'Error Distribution Chart', icon: '📈' },
            { id: 'convergence-chart', name: 'Quality Convergence (Step Chart)', icon: '🎯' },
            { id: 'bubble-chart', name: 'Bubble Chart (Quality vs Support)', icon: '🫧' },
            { id: 'contrast-kde', name: 'Contrast KDE Distribution', icon: '📉' },
            { id: 'pattern-quality', name: 'Pattern Quality Panel', icon: '⭐' },
            { id: 'control-panel', name: 'Control Panel (Sliders)', icon: '🎚️' },
            { id: 'search-metrics-kpi', name: 'Search Metrics KPI', icon: '📋' },
            { id: 'metrics-evolution', name: 'Metrics Evolution (Timeline)', icon: '📊' },
            { id: 'class-balance-pie', name: 'Class Balance Pie Chart', icon: '🥧' }
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
                                <span class="text-xl">${type.icon}</span>
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
        
        // Create container for the new visualization
        const container = document.createElement('div');
        container.className = 'chart-container rounded-lg overflow-auto';
        container.innerHTML = `
            <div class="chart-header">
                <div class="chart-title">
                    <span class="chart-icon">📊</span>
                    New Visualization
                </div>
                <button class="text-slate-400 hover:text-slate-200 transition-colors"
                        onclick="this.closest('.chart-container').remove()">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            <div id="${uniqueId}" class="chart-content"></div>
        `;

        const chartsContainer = document.getElementById('charts-container') || document.querySelector('.main-content');
        if (chartsContainer) {
            chartsContainer.appendChild(container);
            
            const element = document.getElementById(uniqueId);
            if (element) {
                const visualizer = this.registry.create(type, element);
                this.visualizers.set(uniqueId, visualizer);
                
                if (this.metrics.length > 0) {
                    if (type === 'search-metrics-kpi') {
                        const latestSlice = this.metrics[this.metrics.length - 1];
                        const latestMetrics = latestSlice?.search_metrics;
                        if (latestMetrics) {
                            latestMetrics._sliceCount = this.metrics.length;
                            latestMetrics.pattern_descriptor = latestSlice.pattern_descriptor;
                            latestMetrics.top10_avg_quality = latestSlice.top10_avg_quality;
                            visualizer.update(latestMetrics);
                        }
                    } else {
                        visualizer.update(this.metrics);
                    }
                }
                
                this.addActivityLog(`Added new ${type} visualization`);
            }
        }
    }

    startAudit() {
        console.log('Starting audit...');
        if (!this.wsManager || (this.wsManager.ws && this.wsManager.ws.readyState !== WebSocket.OPEN)) {
            this.connectWebSocket();
        } else {
            this.controlAudit('resume');
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
                const latestMetrics = latestSlice?.search_metrics;
                if (latestMetrics) {
                    latestMetrics._sliceCount = subsetMetrics.length;
                    latestMetrics.pattern_descriptor = latestSlice.pattern_descriptor;
                    latestMetrics.top10_avg_quality = latestSlice.top10_avg_quality;
                    visualizer.update(latestMetrics);
                }
            } else {
                if (key.includes('contrast-kde') || key.includes('tree-diagnostics') || key.includes('pattern-details') || key.includes('quality-scatter') || key.includes('error-distribution')) {
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
            
            this.updateTimelineExplorer();
            this.updateMetrics();
            this.addActivityLog('Run logs reset and cleared');
        } catch (e) {
            console.error('Failed to reset run data:', e);
            this.addActivityLog('Failed to reset run data');
        }
    }
}

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AuditLensApp();
});
