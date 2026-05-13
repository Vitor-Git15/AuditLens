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
                        const d = this.data[params.dataIndex];
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
                    data: this.data.map(d => [d.support_percentage, d.quality_score_phi, d.delta_g]),
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
                        const d = this.data[params[0].dataIndex];
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
                data: this.data.map((_, i) => `S${i + 1}`),
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
                    data: this.data.map(d => ({
                        value: d.mean_error_mu,
                        errorPlus: d.std_error_sigma,
                        errorMinus: d.std_error_sigma
                    })),
                    type: 'bar',
                    itemStyle: { color: '#f97316' },
                    emphasis: { itemStyle: { color: '#fb923c' } },
                    // Usamos markLine para desenhar as linhas de desvio padrão
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

        const chartConfigs = [
            { id: 'quality-scatter', elementId: 'chart-metrics' },
            { id: 'error-distribution', elementId: 'chart-quality' },
            { id: 'search-metrics-kpi', elementId: 'kpi-section' },
            { id: 'quality-scatter', elementId: 'chart-support' },
            { id: 'error-distribution', elementId: 'chart-errors' }
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
        console.log('Start button found:', startBtn);
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                console.log('Start audit button clicked');
                this.startAudit();
            });
        } else {
            console.error('Start audit button not found');
        }
        
        const configForm = document.getElementById('config-form');
        console.log('Config form found:', configForm);
        if (configForm) {
            configForm.addEventListener('submit', (e) => this.handleConfigSubmit(e));
        } else {
            console.error('Config form not found');
        }

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
    }

    async handleConfigSubmit(e) {
        e.preventDefault();
        const formData = new FormData(document.getElementById('config-form'));
        const useMockCheckbox = document.getElementById('use-mock');
        const config = {
            budgets: { 'search': parseFloat(formData.get('search_budget')) || 100 },
            use_mock: useMockCheckbox ? useMockCheckbox.checked : false,
            subgroups_to_explore: formData.get('subgroups_explore')
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0),
            subgroups_to_ignore: formData.get('subgroups_ignore')
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0)
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
            { id: 'search-metrics-kpi', name: 'Search Metrics KPI', icon: '📋' },
            { id: 'metrics-evolution', name: 'Metrics Evolution (Timeline)', icon: '📉' },
            { id: 'class-balance-pie', name: 'Class Balance Pie Chart', icon: '🥧' }
        ];

        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-600">
                <h3 class="text-lg font-semibold text-slate-200 mb-4">Add New Visualization</h3>
                <div class="space-y-3">
                    ${visualizationTypes.map(type => `
                        <button class="w-full text-left p-3 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors border border-slate-600"
                                data-type="${type.id}">
                            <div class="flex items-center gap-3">
                                <span class="text-xl">${type.icon}</span>
                                <div>
                                    <div class="text-slate-200 font-medium">${type.name}</div>
                                    <div class="text-slate-400 text-sm">Add a new ${type.name.toLowerCase()}</div>
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
        }
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
        if (data.type === 'slice') {
            const slice = data.payload;
            this.metrics.push(slice);
            this.updateMetrics();
            this.addActivityLog(`Slice ${this.metrics.length} received`);
        }
    }

    updateMetrics() {
        this.visualizers.forEach((visualizer, key) => {
            if (key.includes('search-metrics-kpi')) {
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
        });
    }

    updateStatusIndicator(connected) {
        const indicator = document.getElementById('status-indicator');
        if (indicator) {
            indicator.className = connected ? 'w-2 h-2 bg-green-500 rounded-full' : 'w-2 h-2 bg-slate-600 rounded-full';
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
}

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AuditLensApp();
});
