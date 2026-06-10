from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import json
import asyncio
import random
import math
from datetime import datetime, timezone
from typing import Set, Optional, List, Dict
from pathlib import Path
from models import Slice, ConfigParameters, SearchMetrics, ConsumeRequest, RunStatus
from data_loaders import MalwareDataLoader, ToxicityDataLoader
from orchestrator import ModelOrchestrator
import logging

logger = logging.getLogger("audit_transmission")
logger.setLevel(logging.INFO)

file_handler = logging.FileHandler("audit_transmission.log", encoding="utf-8")
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)


class ConnectionManager:
    """Manages active WebSocket connections for broadcasting."""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        """Accept and register a new connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
    
    async def disconnect(self, websocket: WebSocket):
        """Remove a disconnected client."""
        self.active_connections.discard(websocket)
    
    async def broadcast(self, message: dict):
        """Send message to all connected clients."""
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                disconnected.add(connection)
        
        for conn in disconnected:
            await self.disconnect(conn)


class ConfigurationState:
    """Stores the current audit configuration."""
    
    def __init__(self):
        self.budgets: dict = {"search": 0.0}
        self.subgroups_to_explore: list = []
        self.subgroups_to_ignore: list = []
        self.weights: dict = {}
        self.use_mock: bool = False
        self.budget_consumed: float = 0.0
        self.status: RunStatus = RunStatus.IDLE
        self.max_gap: int = 5
        self.gamma: float = 0.5
        self.min_support: int = 10
        self.min_count_class: int = 5
        self.uct_factor: float = 1.2
        self.jaccard_threshold: float = 0.3
        self.model_server_url: str = "http://localhost:8002"
        self.domain: str = "malware"
        self.dataset_path: Optional[str] = None
        self.identity_filters: List[str] = []
    
    def update(self, config: ConfigParameters):
        """Update configuration from API."""
        if config.budgets is not None:
            self.budgets = config.budgets
            self.budget_consumed = 0.0
            if self.get_remaining_budget() > 0:
                self.status = RunStatus.RUNNING

        if config.subgroups_to_explore is not None:
            self.subgroups_to_explore = config.subgroups_to_explore
        if config.subgroups_to_ignore is not None:
            self.subgroups_to_ignore = config.subgroups_to_ignore
        if config.weights is not None:
            self.weights = config.weights
        if config.use_mock is not None:
            self.use_mock = config.use_mock
        if config.max_gap is not None:
            self.max_gap = config.max_gap
        if config.gamma is not None:
            self.gamma = config.gamma
        if config.min_support is not None:
            self.min_support = config.min_support
        if config.min_count_class is not None:
            self.min_count_class = config.min_count_class
        if config.uct_factor is not None:
            self.uct_factor = config.uct_factor
        if config.jaccard_threshold is not None:
            self.jaccard_threshold = config.jaccard_threshold
        if config.model_server_url is not None:
            self.model_server_url = config.model_server_url
        if config.domain is not None:
            self.domain = config.domain
        if config.dataset_path is not None:
            self.dataset_path = config.dataset_path
        if config.identity_filters is not None:
            self.identity_filters = config.identity_filters
    
    def get_remaining_budget(self) -> float:
        """Get remaining search budget."""
        total_budget = self.budgets.get("search", 0)
        return max(0, total_budget - self.budget_consumed)
    
    def consume_budget(self, amount: float = 1.0):
        """Consume budget."""
        self.budget_consumed += amount


def generate_mock_slice() -> dict:
    """Generate realistic mock Slice data."""
    return {
        "pattern_descriptor": f"({random.randint(1,10)}) -> ({random.randint(11,20)})",
        "error_class_0": random.uniform(0.1, 0.5),
        "error_class_1": random.uniform(0.1, 0.5),
        "top10_avg_quality": random.uniform(0.5, 0.9),
        "top10_avg_support": random.uniform(10, 100),
        "soft_error": random.uniform(0.01, 0.3),
        "quality_score_phi": random.uniform(0.5, 0.99),
        "separation_sg": random.uniform(0.1, 0.8),
        "baseline_deviation_dgB": random.uniform(-10, 10),
        "class_balance_bg": random.uniform(0.4, 0.9),
        "support_penalty_pgB": random.uniform(-5, 5),
        "delta_g": random.uniform(0.01, 0.5),
        "mean_error_mu": random.uniform(0.01, 0.2),
        "std_error_sigma": random.uniform(0.001, 0.05),
        "p_value_bh": random.uniform(0.001, 0.1),
        "support_count": random.randint(10, 500),
        "support_percentage": random.uniform(0.1, 50.0),
        "search_metrics": {
            "explored_patterns": random.randint(5, 100),
            "filtered_similarity": random.uniform(0.3, 0.95),
            "search_space_coverage": random.uniform(0.1, 0.9)
        }
    }


mcts_state = {
    "top_quality": 0.5,
    "iterations_since_last_gain": 0,
    "total_explored_nodes": 0
}


def generate_mock_pattern(pid: int, config_state: ConfigurationState) -> dict:
    """Generate a mock PatternObject using search parameters and math equations."""
    min_sup = max(10, config_state.min_support)
    base_support = random.randint(min_sup, 400)
    support = int(base_support + (config_state.gamma * (500 - base_support)))
    
    min_c = max(5, config_state.min_count_class)
    count_0 = random.randint(min_c, max(min_c + 1, support - min_c))
    count_1 = max(min_c, support - count_0)
    support = count_0 + count_1
    class_balance = 1.0 - abs(count_0 - count_1) / support
    
    errors_class_0 = [max(0.0, min(1.0, random.gauss(0.12, 0.06))) for _ in range(min(count_0, 100))]
    errors_class_1 = [max(0.0, min(1.0, random.gauss(0.68, 0.08))) for _ in range(min(count_1, 100))]
    
    mu_0 = sum(errors_class_0) / len(errors_class_0) if errors_class_0 else 0.12
    mu_1 = sum(errors_class_1) / len(errors_class_1) if errors_class_1 else 0.68
    delta_g = abs(mu_0 - mu_1)
    
    var_0 = sum((x - mu_0)**2 for x in errors_class_0) / len(errors_class_0) if errors_class_0 else 0.0036
    var_1 = sum((x - mu_1)**2 for x in errors_class_1) / len(errors_class_1) if errors_class_1 else 0.0064
    max_var = max(var_0, var_1, 0.0001)
    separation = delta_g / (1.0 + max_var)
    
    deviation = max(abs(mu_0 - 0.3), abs(mu_1 - 0.32))
    
    size_ratio = support / 1000.0
    support_penalty = size_ratio ** config_state.gamma
    
    phi_raw = (separation * deviation) * (class_balance * support_penalty)
    quality = 1.0 / (1.0 + math.exp(-3.0 * phi_raw))
    
    word_attributions = []
    embedding_coords = [0.0, 0.0]
    
    if config_state.domain == "malware":
        items_pool = [
            ["API=RegOpenKeyEx", "API=RegSetValueEx", "API=RegQueryValueEx"],
            ["API=CreateFileW", "API=ReadFile", "API=WriteFile", "API=DeleteFileW"],
            ["API=socket", "API=connect", "API=send", "API=recv"],
            ["API=CreateProcessW", "API=OpenProcess", "API=VirtualAllocEx"]
        ]
        # Generate semantic cluster coordinate for sequence embeddings
        cluster = random.choice([0, 1, 2, 3]) # registry, file, network, process cluster
        if cluster == 0: # registry
            embedding_coords = [random.gauss(-4.0, 1.2), random.gauss(-3.0, 1.2)]
        elif cluster == 1: # file
            embedding_coords = [random.gauss(4.0, 1.2), random.gauss(3.0, 1.2)]
        elif cluster == 2: # network
            embedding_coords = [random.gauss(-3.0, 1.2), random.gauss(4.0, 1.2)]
        else: # process
            embedding_coords = [random.gauss(3.0, 1.2), random.gauss(-4.0, 1.2)]
    else:
        items_pool = [
            ["identity=female", "identity=male"],
            ["identity=homosexual_gay_or_lesbian", "identity=heterosexual"],
            ["context=politics", "context=social_media", "context=news"],
            ["target=toxic", "target=nontoxic"]
        ]
        if config_state.identity_filters:
            active_filters = []
            if "female" in config_state.identity_filters:
                active_filters.append("identity=female (100% women context)")
            if "sexual_orientation" in config_state.identity_filters:
                active_filters.append("identity=gay_or_lesbian (100% sexual orientation context)")
            if active_filters:
                items_pool.insert(0, active_filters)
        
        # Word attributions for Integrated Gradients
        comments_pool = [
            ("This is stupid and wrong, go away.", [("This", 0.01), ("is", 0.02), ("stupid", 0.85), ("and", 0.01), ("wrong,", 0.42), ("go", 0.15), ("away.", 0.22)]),
            ("Women should stay out of politics, they are emotional.", [("Women", 0.11), ("should", 0.01), ("stay", 0.05), ("out", 0.02), ("of", -0.01), ("politics,", 0.18), ("they", 0.05), ("are", 0.03), ("emotional.", 0.74)]),
            ("Gays are destroying traditional values and should be banned.", [("Gays", 0.28), ("are", 0.03), ("destroying", 0.65), ("traditional", 0.12), ("values", -0.02), ("and", 0.01), ("should", 0.05), ("be", 0.01), ("banned.", 0.82)]),
            ("She is a wonderful doctor and always listens.", [("She", 0.02), ("is", 0.01), ("a", -0.01), ("wonderful", -0.45), ("doctor", -0.08), ("and", -0.01), ("always", -0.12), ("listens.", -0.22)]),
            ("The parade celebrating gay pride was full of joy.", [("The", -0.01), ("parade", -0.08), ("celebrating", -0.35), ("gay", -0.02), ("pride", -0.42), ("was", 0.01), ("full", -0.15), ("of", 0.0), ("joy.", -0.52)])
        ]
        chosen_comment, word_attributions = random.choice(comments_pool)
                
    length = random.randint(2, 4)
    seq = []
    selected_pools = random.sample(items_pool, min(length, len(items_pool)))
    for idx_s, pool in enumerate(selected_pools):
        itemset = random.sample(pool, random.randint(1, min(2, len(pool))))
        gap = 0 if idx_s == 0 else random.randint(1, config_state.max_gap)
        seq.append({
            "itemset": itemset,
            "gap_before": gap
        })
        
    desc_parts = []
    for item in seq:
        items_str = " & ".join(item["itemset"])
        if item["gap_before"] > 0:
            desc_parts.append(f"-[gap={item['gap_before']}]-> ({items_str})")
        else:
            desc_parts.append(f"({items_str})")
    pattern_descriptor = " ".join(desc_parts)
        
    return {
        "id": f"p{pid}",
        "quality_score": quality,
        "attributes": {
            "support": support,
            "complexity": float(len(seq)),
            "separation": separation,
            "deviation": deviation,
            "class_balance": class_balance,
            "support_penalty_pgB": support_penalty,
            "delta_g": delta_g,
            "error_class_0": mu_0,
            "error_class_1": mu_1,
            "mean_error_mu": (mu_0 * count_0 + mu_1 * count_1) / support,
            "std_error_sigma": math.sqrt(max_var),
            "p_value_bh": random.uniform(0.001, 0.05),
            "support_percentage": (support / 1000.0) * 100.0,
            "embedding_coords": embedding_coords
        },
        "example_slice": {
            "errors_class_0": errors_class_0,
            "errors_class_1": errors_class_1,
            "sequence": seq,
            "word_attributions": word_attributions
        },
        "pattern_descriptor": pattern_descriptor
    }


def generate_mock_snapshot(iteration: int, config_state: ConfigurationState) -> dict:
    """Generate an AuditSnapshot with stateful MCTS progress and global metrics."""
    global mcts_state
    
    new_nodes = int(random.randint(10, 50) * config_state.uct_factor)
    mcts_state["total_explored_nodes"] += new_nodes
    search_space = 50000
    
    prob = 0.25 * (config_state.uct_factor / 1.2)
    has_jump = random.random() < prob
    if has_jump or mcts_state["iterations_since_last_gain"] > 20:
        mcts_state["top_quality"] = min(0.98, mcts_state["top_quality"] + random.uniform(0.005, 0.03))
        mcts_state["iterations_since_last_gain"] = 0
    else:
        mcts_state["iterations_since_last_gain"] += 1
        
    rollout_success_rate = max(0.1, min(0.95, 0.65 + 0.1 * math.sin(iteration / 5.0) + random.uniform(-0.05, 0.05)))
    
    num_patterns = random.randint(5, 12)
    patterns = [generate_mock_pattern(i + 1, config_state) for i in range(num_patterns)]
    patterns.sort(key=lambda p: p["quality_score"], reverse=True)
    patterns[0]["quality_score"] = mcts_state["top_quality"]
    
    global_errors_class_0 = [max(0.0, min(1.0, random.gauss(0.3, 0.15))) for _ in range(200)]
    global_errors_class_1 = [max(0.0, min(1.0, random.gauss(0.32, 0.15))) for _ in range(200)]
    global_mu = (sum(global_errors_class_0) + sum(global_errors_class_1)) / 400
    
    # 1. Identity Faceted Error Metrics (Toxicity exclusive)
    # We facet FP and FN rates across Geral vs Women vs Gay/Lesbian
    fp_geral = random.uniform(0.05, 0.12)
    fn_geral = random.uniform(0.08, 0.15)
    
    # Simulate higher error rates for protected identity sub-groups to demonstrate model bias
    fp_female = fp_geral * random.uniform(1.8, 2.5) 
    fn_female = fn_geral * random.uniform(0.6, 1.1)
    
    fp_gay = fp_geral * random.uniform(2.2, 3.2) # High False Positive (e.g. flagging gay identity words as toxic)
    fn_gay = fn_geral * random.uniform(0.5, 0.8)
    
    identity_metrics = {
        "groups": ["Global Baseline", "Female Identity Context", "Sexual Orientation Context"],
        "false_positives": [fp_geral, fp_female, fp_gay],
        "false_negatives": [fn_geral, fn_female, fn_gay]
    }
    
    # 2. Problematic High-Loss Slices (Toxicity exclusive)
    problematic_slices = [
        {"slice": "identity=homosexual_gay_or_lesbian & word=banned", "loss": 0.92, "support": 42},
        {"slice": "identity=female & word=emotional", "loss": 0.84, "support": 64},
        {"slice": "identity=homosexual_gay_or_lesbian & word=destroying", "loss": 0.79, "support": 38},
        {"slice": "identity=female & word=politics", "loss": 0.65, "support": 92}
    ]
    
    # 3. Subsequence Importance Heatmap (Malware exclusive)
    # Map APIs against active pattern IDs
    apis = ["API=RegOpenKeyEx", "API=CreateFileW", "API=WriteFile", "API=socket", "API=connect", "API=send", "API=CreateProcessW", "API=VirtualAllocEx"]
    subsequence_importance = {
        "apis": apis,
        "patterns": [p["id"] for p in patterns],
        "matrix": []
    }
    for p_idx, p in enumerate(patterns):
        for api_idx, api in enumerate(apis):
            # Assign importance score depending on whether the API appears in the pattern's sequences
            has_api = any(api in item.get("itemset", []) or any(api.replace("API=", "") in it for it in item.get("itemset", [])) for item in p.get("example_slice", {}).get("sequence", []))
            weight = random.uniform(0.6, 0.95) if has_api else random.uniform(0.01, 0.15)
            subsequence_importance["matrix"].append([api_idx, p_idx, round(weight, 3)])
            
    # 4. Embeddings Scatter (Malware exclusive)
    embeddings = [
        {
            "id": p["id"],
            "coords": p["attributes"]["embedding_coords"],
            "label": p["attributes"]["error_class_1"] > 0.5, # Malware (True) vs Benign (False)
            "descriptor": p["pattern_descriptor"]
        }
        for p in patterns
    ]

    return {
        "id": f"run-mock-{iteration}",
        "iteration": iteration,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": {"source": "mock-run"},
        "global_metrics": {
            "avg_error": global_mu,
            "tree_progress": min(1.0, mcts_state["total_explored_nodes"] / search_space),
            "top_quality": mcts_state["top_quality"],
            "explored_nodes": mcts_state["total_explored_nodes"],
            "search_space": search_space,
            "explored_rate": float(new_nodes),
            "stability": mcts_state["iterations_since_last_gain"],
            "rollout_success_rate": rollout_success_rate,
            "global_errors_class_0": global_errors_class_0,
            "global_errors_class_1": global_errors_class_1,
            
            # New domain visualization statistics
            "identity_metrics": identity_metrics,
            "problematic_slices": problematic_slices,
            "subsequence_importance": subsequence_importance,
            "embeddings": embeddings
        },
        "discovered_patterns": patterns
    }


HISTORY_FILE = Path(__file__).parent / "audit_history.json"
slice_history: list[dict] = []

def save_slice_history():
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump(slice_history, f, indent=2)
    except Exception as e:
        print(f"Error saving slice history: {e}")

def load_slice_history():
    global slice_history, next_iteration
    try:
        if HISTORY_FILE.exists():
            with open(HISTORY_FILE, "r") as f:
                slice_history = json.load(f)
            if slice_history:
                next_iteration = max(s.get("iteration", 0) for s in slice_history) + 1
                print(f"Loaded {len(slice_history)} snapshots from audit_history.json. Next iteration: {next_iteration}")
    except Exception as e:
        print(f"Error loading slice history: {e}")

# Removed background_streamer as AuditLens is strictly passive now and receives data via POST /api/snapshots

# Global state
connection_manager = ConnectionManager()
config_state = ConfigurationState()
streamer_task = None
control_queue: asyncio.Queue = asyncio.Queue()
next_iteration = 1

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifespan: startup and shutdown."""
    
    print("Starting AuditLens...")
    load_slice_history()
    
    yield
    
    print("Shutting down AuditLens...")
    if streamer_task:
        streamer_task.cancel()
        try:
            await streamer_task
        except asyncio.CancelledError:
            pass
    
    for websocket in list(connection_manager.active_connections):
        await connection_manager.disconnect(websocket)


app = FastAPI(
    title="AuditLens",
    description="Local real-time model auditing web application",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def get_root():
    """Serve index.html as root."""
    return FileResponse(Path(__file__).parent / "index.html")


@app.get("/app.js")
async def get_app_js():
    """Serve app.js."""
    return FileResponse(Path(__file__).parent / "app.js", media_type="application/javascript")


@app.get("/index.html")
async def get_index():
    """Serve index.html."""
    return FileResponse(Path(__file__).parent / "index.html")


@app.post("/api/initialize")
async def initialize_audit(
    model_server_url: str = Form("http://localhost:8002"),
    domain: str = Form("malware"),
    dataset_path: Optional[str] = Form(None),
    use_mock: bool = Form(True),
    identity_filters_json: Optional[str] = Form(None),
    config_params_json: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    global slice_history, next_iteration, mcts_state
    
    logger.info(f"[initialize_audit] Received initialize request: model_server_url={model_server_url}, domain={domain}, dataset_path={dataset_path}, use_mock={use_mock}, identity_filters={identity_filters_json}, config_params={config_params_json}")
    
    identity_filters = []
    if identity_filters_json:
        try:
            identity_filters = json.loads(identity_filters_json)
        except Exception as e:
            print(f"Error parsing identity_filters_json: {e}")
            
    config_params = {}
    if config_params_json:
        try:
            config_params = json.loads(config_params_json)
        except Exception as e:
            print(f"Error parsing config_params_json: {e}")

    file_bytes = None
    if file:
        file_bytes = await file.read()
        print(f"Ingested file via upload stream: {file.filename} ({len(file_bytes)} bytes)")

    safe_dataset_path = None
    if dataset_path:
        try:
            from data_loaders import secure_resolve_path
            resolved = secure_resolve_path(dataset_path)
            if resolved:
                safe_dataset_path = str(resolved)
        except PermissionError as e:
            return {"status": "error", "message": str(e)}

    try:
        if domain == "toxicity":
            loader = ToxicityDataLoader(
                source_path=safe_dataset_path,
                stream_data=file_bytes,
                identity_filters=identity_filters
            )
        else:
            loader = MalwareDataLoader(
                source_path=safe_dataset_path,
                stream_data=file_bytes
            )
        loader.load()
        stats = loader.get_summary_stats()
        print(f"Dataset preprocessed successfully: {stats}")
    except Exception as e:
        print(f"Data loading failed: {e}")
        return {"status": "error", "message": f"Data loader error: {str(e)}"}

    url_lower = model_server_url.lower()
    is_simulator_url = any(endpoint in url_lower for endpoint in ["/api/mock-model-server", "/api/mock-model", "/api/simulator/handshake"])
    
    if is_simulator_url:
        is_online = True
        actual_use_mock = True
        print(f"Model Server at {model_server_url} recognized as simulator endpoint. Running locally.")
    else:
        orchestrator = ModelOrchestrator(model_server_url)
        is_online = orchestrator.check_health()
        print(f"Model Server at {model_server_url} online: {is_online}")
        actual_use_mock = use_mock or not is_online
    
    config_state.model_server_url = model_server_url
    config_state.domain = domain
    config_state.dataset_path = dataset_path
    config_state.identity_filters = identity_filters
    config_state.use_mock = actual_use_mock
    
    slice_history = []
    next_iteration = 1
    mcts_state = {
        "top_quality": 0.5,
        "iterations_since_last_gain": 0,
        "total_explored_nodes": 0
    }
    
    if config_params:
        pydantic_cfg = ConfigParameters(**config_params)
        config_state.update(pydantic_cfg)

    orchestration_status = "local_simulation"
    if not actual_use_mock and is_online:
        try:
            prep_ok, prep_res = orchestrator.prepare_model(
                domain=domain,
                dataset_path=safe_dataset_path,
                config=config_params,
                identity_filters=identity_filters
            )
            if not prep_ok:
                raise Exception(f"Preparation failed: {prep_res.get('error', 'unknown error')}")
                
            start_ok, start_res = orchestrator.start_search(config=config_params)
            if not start_ok:
                raise Exception(f"Handshake failed: {start_res.get('error', 'unknown error')}")
                
            config_state.status = RunStatus.RUNNING
            orchestration_status = "model_server_active"
            print("Model Server orchestration initialized and search started.")
        except Exception as e:
            print(f"Failed to orchestrate external model server: {e}. Falling back to simulation.")
            config_state.use_mock = True
            config_state.status = RunStatus.RUNNING
            orchestration_status = "simulation_fallback"
    else:
        config_state.status = RunStatus.RUNNING
        
    await connection_manager.broadcast({
        "type": "status",
        "status": config_state.status.value,
        "budget": config_state.get_remaining_budget(),
        "slices_found": 0
    })

    return {
        "status": "initialized",
        "orchestration": orchestration_status,
        "domain": domain,
        "use_mock": config_state.use_mock,
        "dataset_stats": stats,
        "config": {
            "model_server_url": config_state.model_server_url,
            "gamma": config_state.gamma,
            "min_support": config_state.min_support,
            "min_count_class": config_state.min_count_class,
            "uct_factor": config_state.uct_factor,
            "jaccard_threshold": config_state.jaccard_threshold,
        }
    }


@app.post("/api/config")
async def set_config(config: ConfigParameters):
    """
    Receive and process user interaction parameters for model auditing.
    
    Args:
        config: Configuration with budgets and subgroup exploration/ignore settings
    
    Returns:
        Confirmation of received configuration
    """
    logger.info(f"[set_config] Received configuration update: {config.model_dump_json() if hasattr(config, 'model_dump_json') else str(config)}")
    config_state.update(config)
    
    if not config_state.use_mock:
        try:
            orchestrator = ModelOrchestrator(config_state.model_server_url)
            config_payload = config.model_dump()
            
            # Always use resume to ensure the model thread is active and running with the new budget
            logger.info("[set_config] Pushing config and enforcing active state (resume).")
            res = orchestrator.control_search("resume", additional_budget=config_state.get_remaining_budget(), config=config_payload)
            if res[0]:
                config_state.status = RunStatus.RUNNING
            else:
                return {"status": "error", "error": f"Failed to push config to model: {res[1]}"}
        except Exception as e:
            logger.error(f"[set_config] Error pushing config to model: {e}")
            return {"status": "error", "error": f"Connection error: {e}"}

    asyncio.create_task(connection_manager.broadcast({
        "type": "status",
        "status": config_state.status.value,
        "budget": config_state.get_remaining_budget(),
        "slices_found": len(slice_history)
    }))
    return {
        "status": "config_updated",
        "budgets": config_state.budgets,
        "explore": config_state.subgroups_to_explore,
        "ignore": config_state.subgroups_to_ignore,
        "weights": config_state.weights,
        "use_mock": config_state.use_mock,
        "max_gap": config_state.max_gap,
        "gamma": config_state.gamma,
        "min_support": config_state.min_support,
        "min_count_class": config_state.min_count_class,
        "uct_factor": config_state.uct_factor,
        "jaccard_threshold": config_state.jaccard_threshold,
        "remaining_budget": config_state.get_remaining_budget()
    }


@app.websocket("/ws/metrics")
async def websocket_metrics(websocket: WebSocket):
    """
    WebSocket endpoint for streaming real-time slice discovery metrics.
    """
    await connection_manager.connect(websocket)
    await websocket.send_json({
        "type": "status",
        "status": config_state.status.value,
        "budget": config_state.get_remaining_budget(),
        "slices_found": len(slice_history)
    })
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    
    except WebSocketDisconnect:
        await connection_manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        await connection_manager.disconnect(websocket)


@app.post("/api/slices")
async def receive_slice(slice_data: Slice):
    """
    Endpoint for an external parallel model to send slice data.
    The received data will be wrapped in an AuditSnapshot format and broadcast to all clients.
    """
    logger.info(f"[receive_slice] Received slice: {slice_data.model_dump_json() if hasattr(slice_data, 'model_dump_json') else str(slice_data)}")
    pattern = {
        "id": slice_data.pattern_descriptor or f"p-received-{len(slice_history) + 1}",
        "quality_score": slice_data.quality_score_phi,
        "attributes": {
            "support": slice_data.support_count,
            "complexity": 1.0,
            "separation": slice_data.separation_sg,
            "deviation": slice_data.baseline_deviation_dgB,
            "class_balance": slice_data.class_balance_bg,
            "support_percentage": slice_data.support_percentage,
            "delta_g": slice_data.delta_g,
            "soft_error": slice_data.soft_error,
            "mean_error_mu": slice_data.mean_error_mu,
            "std_error_sigma": slice_data.std_error_sigma,
            "p_value_bh": slice_data.p_value_bh,
            "error_class_0": slice_data.error_class_0,
            "error_class_1": slice_data.error_class_1
        },
        "example_slice": {
            "errors_class_0": [random.gauss(slice_data.error_class_0, 0.05) for _ in range(50)],
            "errors_class_1": [random.gauss(slice_data.error_class_1, 0.05) for _ in range(50)],
            "sequence": [{"itemset": [slice_data.pattern_descriptor], "gap_before": 0}] if slice_data.pattern_descriptor else []
        }
    }
    
    snapshot = {
        "id": f"run-received-{len(slice_history) + 1}",
        "iteration": len(slice_history) + 1,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": {"source": "api-slice-post"},
        "global_metrics": {
            "avg_error": slice_data.mean_error_mu,
            "tree_progress": 1.0,
            "top_quality": slice_data.quality_score_phi,
            "explored_nodes": len(slice_history) + 1,
            "search_space": 100,
            "explored_rate": 1.0,
            "stability": 0,
            "rollout_success_rate": 1.0,
            "global_errors_class_0": [random.gauss(0.3, 0.15) for _ in range(100)],
            "global_errors_class_1": [random.gauss(0.32, 0.15) for _ in range(100)]
        },
        "discovered_patterns": [pattern]
    }
    
    slice_history.append(snapshot)
    config_state.consume_budget(1.0)
    save_slice_history()
    
    if config_state.get_remaining_budget() <= 0:
        config_state.status = RunStatus.PAUSED
    else:
        config_state.status = RunStatus.RUNNING

    await connection_manager.broadcast({"type": "snapshot", "snapshot": snapshot})
    await connection_manager.broadcast({
        "type": "status",
        "status": config_state.status.value,
        "budget": config_state.get_remaining_budget(),
        "slices_found": len(slice_history)
    })
    
    return {
        "status": "received", 
        "remaining_budget": config_state.get_remaining_budget()
    }

@app.post("/api/snapshots")
async def receive_snapshot(payload: dict = Body(...)):
    """
    Endpoint for receiving a full structured snapshot from the model.
    """
    logger.info(f"[receive_snapshot] Received snapshot metrics: {payload.get('metrics', {})}, patterns_count: {len(payload.get('patterns', []))}, status: {payload.get('status', 'running')}, consume: {payload.get('consume', 0.0)}")
    metrics = payload.get("metrics", {})
    patterns = payload.get("patterns", [])
    status = payload.get("status", "running")
    
    # Consume budget if requested in the payload
    consume_amount = payload.get("consume", 0.0)
    if consume_amount > 0:
        config_state.consume_budget(consume_amount)
        
    # Process patterns to extract/compute descriptive contrast, wracc, and efficiency metrics
    processed_patterns = []
    for p in patterns:
        if not isinstance(p, dict):
            continue
        if "attributes" not in p:
            p["attributes"] = {}
            
        attrs = p["attributes"]
        sup_pct = attrs.get("support_percentage", 0.0)
        delta_g = attrs.get("delta_g", 0.0)
        separation = attrs.get("separation", delta_g)
        
        # Calculate Contrast metrics
        attrs["wracc"] = (sup_pct / 100.0) * delta_g
        attrs["contrast_metric"] = separation
        
        # Calculate Efficiency (Quality score normalized by total time budget spent)
        attrs["efficiency"] = p.get("quality_score", 0.0) / max(1.0, config_state.budget_consumed)
        processed_patterns.append(p)
        
    iteration = metrics.get("iteration_count", len(slice_history) + 1)
    
    # Map the received payload into the standard AuditSnapshot structure
    snapshot = {
        "id": f"run-received-{iteration}",
        "iteration": iteration,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": {"source": "api-snapshot-post"},
        "global_metrics": {
            "avg_error": metrics.get("avg_error", 0.0),
            "tree_progress": metrics.get("tree_progress", 0.0),
            "top_quality": metrics.get("top_quality", 0.0),
            "explored_nodes": metrics.get("explored_nodes", 0),
            "search_space": metrics.get("search_space", 50000),
            "explored_rate": metrics.get("explored_rate", 0.0),
            "stability": metrics.get("stability", 0),
            "rollout_success_rate": metrics.get("rollout_success_rate", 1.0),
            "global_errors_class_0": metrics.get("global_errors_class_0", []),
            "global_errors_class_1": metrics.get("global_errors_class_1", []),
            
            # New config & search stats
            "uct_factor": metrics.get("uct_factor", 1.2),
            "support_penalty": metrics.get("support_penalty", 0.5),
            "max_gap": metrics.get("max_gap", 5),
            "max_depth": metrics.get("max_depth", 0),
            "total_elapsed_time": metrics.get("total_elapsed_time", 0.0),

            # New Telemetry Metrics
            "pareto_frontier": metrics.get("pareto_frontier", []),
            "feature_importance": metrics.get("feature_importance", {}),
            "depth_histogram": metrics.get("depth_histogram", []),
            "anytime_quality": metrics.get("anytime_quality", []),
            "path_diversity": metrics.get("path_diversity", 0.0),
            "search_space_diagnostics": metrics.get("search_space_diagnostics", {})
        },
        "discovered_patterns": processed_patterns
    }
    
    slice_history.append(snapshot)
    
    # Update status based on remaining budget or explicit finished status
    if config_state.get_remaining_budget() <= 0:
        config_state.status = RunStatus.PAUSED
    elif status == "finished":
        config_state.status = RunStatus.COMPLETED
    elif status == "paused":
        config_state.status = RunStatus.PAUSED
    # Do not change the run status on intermediate "running" payloads.
    
    save_slice_history()

    if status in ("running", "paused", "finished"):
        await connection_manager.broadcast({"type": "snapshot", "snapshot": snapshot})
    await connection_manager.broadcast({
        "type": "status",
        "status": config_state.status.value,
        "budget": config_state.get_remaining_budget(),
        "slices_found": len(slice_history)
    })
    
    params = {
        "gamma": config_state.gamma,
        "max_gap": config_state.max_gap,
        "min_support": config_state.min_support,
        "min_count_class": config_state.min_count_class,
        "uct_factor": config_state.uct_factor,
        "jaccard_threshold": config_state.jaccard_threshold,
    }
    if config_state.weights:
        params["weights"] = config_state.weights
        
    return {
        "status": "acknowledged",
        "remaining_budget": config_state.get_remaining_budget(),
        "run_status": config_state.status.value,
        "params": params
    }

@app.post("/api/control/inject")
async def inject_budget(payload: dict = Body(...)):
    """
    Inject additional search budget and set focus weight on a specific node/pattern.
    """
    pattern_id = payload.get("pattern_id")
    seconds = float(payload.get("seconds", 10.0))
    
    # 1. Add budget to search budget limit
    config_state.budgets["search"] = config_state.budgets.get("search", 0.0) + seconds
    
    # 2. Add focus weight to weights map
    if pattern_id:
        config_state.weights[pattern_id] = 2.0  # Focus weight multiplier
        
    # 3. Transition to running
    config_state.status = RunStatus.RUNNING
    
    # Broadcast status update
    await connection_manager.broadcast({
        "type": "status",
        "status": config_state.status.value,
        "budget": config_state.get_remaining_budget(),
        "slices_found": len(slice_history)
    })
    
    return {
        "status": "injected",
        "remaining_budget": config_state.get_remaining_budget(),
        "weights": config_state.weights,
        "run_status": config_state.status.value
    }

@app.post("/api/control/focus")
async def focus_pattern_endpoint(payload: dict = Body(...)):
    """
    Toggle focus weight on a specific pattern.
    """
    pattern_id = payload.get("pattern_id")
    focused = bool(payload.get("focused", True))
    
    if pattern_id:
        if focused:
            config_state.weights[pattern_id] = 2.0  # Focus weight
        else:
            if pattern_id in config_state.weights:
                del config_state.weights[pattern_id]
                
    return {
        "status": "focus_updated",
        "weights": config_state.weights
    }

def get_mock_metadata() -> dict:
    return {
        "status": "online",
        "parameters": [
            {
                "name": "budget",
                "label": "Search Budget (seconds)",
                "type": "int",
                "default_value": 120,
                "required": True,
                "modifiable": True,
                "constraints": {
                    "min": 5,
                    "max": 3600
                }
            },
            {
                "name": "max_gap",
                "label": "Max Sequence Gap",
                "type": "int",
                "default_value": 5,
                "required": True,
                "modifiable": False,
                "constraints": {
                    "min": 1,
                    "max": 20
                }
            },
            {
                "name": "gamma",
                "label": "Support Penalty (Gamma)",
                "type": "float",
                "default_value": 0.5,
                "required": False,
                "modifiable": True,
                "constraints": {
                    "min": 0.0,
                    "max": 1.0
                }
            },
            {
                "name": "uct_factor",
                "label": "UCT Factor (Exploration)",
                "type": "float",
                "default_value": 1.2,
                "required": True,
                "modifiable": True,
                "constraints": {
                    "min": 0.1,
                    "max": 5.0
                }
            },
            {
                "name": "min_support",
                "label": "Min Support Count",
                "type": "int",
                "default_value": 10,
                "required": True,
                "modifiable": False,
                "constraints": {
                    "min": 1
                }
            },
            {
                "name": "jaccard_threshold",
                "label": "Jaccard Threshold",
                "type": "float",
                "default_value": 0.3,
                "required": False,
                "modifiable": False,
                "constraints": {
                    "min": 0.0,
                    "max": 1.0
                }
            },
            {
                "name": "algorithm_mode",
                "label": "Algorithm Execution Mode",
                "type": "enum",
                "default_value": "standard",
                "required": True,
                "modifiable": True,
                "constraints": {
                    "options": ["standard", "aggressive", "conservative"]
                }
            },
            {
                "name": "enable_pruning",
                "label": "Enable Search Space Pruning",
                "type": "boolean",
                "default_value": True,
                "required": False,
                "modifiable": True
            },
            {
                "name": "model_signature",
                "label": "Model Signature Key",
                "type": "string",
                "default_value": "audit-default-v1",
                "required": True,
                "modifiable": False
            }
        ]
    }

@app.get("/api/mock-model-server/health")
async def mock_model_server_health():
    return {"status": "ok", "online": True}

@app.get("/api/mock-model-server/metadata")
async def mock_model_server_metadata():
    return get_mock_metadata()

@app.get("/api/simulator/handshake")
async def simulator_handshake(domain: str = "malware"):
    meta = get_mock_metadata()
    meta["domain"] = domain
    return meta

@app.get("/api/mock-model")
async def mock_model(domain: str = "malware"):
    meta = get_mock_metadata()
    meta["domain"] = domain
    return meta

@app.get("/api/control/check-health")
async def check_health_endpoint(url: str):
    """
    Checks the connectivity status and metadata of the Model Server.
    """
    logger.info(f"[check_health_endpoint] Checking health/metadata of: {url}")
    url_lower = url.lower()
    if "/api/mock-model-server" in url_lower or "/api/mock-model" in url_lower or "/api/simulator/handshake" in url_lower:
        domain = "toxicity" if "domain=toxicity" in url_lower else "malware"
        meta = get_mock_metadata()
        meta["domain"] = domain
        logger.info(f"[check_health_endpoint] Detected simulator URL. Returning metadata for domain: {domain}")
        return {"online": True, "metadata": meta}
        
    orchestrator = ModelOrchestrator(url)
    online = orchestrator.check_health()
    if not online:
        return {"online": False, "error": f"Connection failed to Model Server at {url} (refused or timeout)"}
        
    meta_ok, meta_res = orchestrator.fetch_metadata()
    if meta_ok:
        return {"online": True, "metadata": meta_res}
        
    return {"online": True, "metadata": get_mock_metadata()}


@app.post("/api/control/{action}")
async def control_run(action: str, payload: Optional[dict] = Body(None)):
    """
    Control the execution state (pause, resume, finish, clear).
    """
    logger.info(f"[control_run] Received control action: {action}")
    if action == "pause":
        config_state.status = RunStatus.PAUSED
    elif action == "resume":
        if payload:
            logger.info(f"[control_run] Resume payload received: {payload}")
            try:
                pydantic_cfg = ConfigParameters(**payload)
                config_state.update(pydantic_cfg)
            except Exception as e:
                logger.error(f"[control_run] Failed to parse and apply config update: {e}")
        if config_state.get_remaining_budget() <= 0:
            config_state.budget_consumed = 0.0
        config_state.status = RunStatus.RUNNING
    elif action == "finish":
        config_state.status = RunStatus.COMPLETED
    elif action == "clear":
        global slice_history, next_iteration
        slice_history = []
        next_iteration = 1
        config_state.status = RunStatus.IDLE
        config_state.budgets['search'] = 0.0 # reset search budget
        config_state.budget_consumed = 0.0
        if HISTORY_FILE.exists():
            try:
                HISTORY_FILE.unlink()
            except Exception as e:
                print(f"Error deleting history file: {e}")
                
        # Send clear to model server if online
        if not config_state.use_mock:
            try:
                orchestrator = ModelOrchestrator(config_state.model_server_url)
                orchestrator.control_search("clear")
            except Exception as e:
                print(f"Failed to clear model server: {e}")
                
        await connection_manager.broadcast({
            "type": "clear",
            "status": config_state.status.value,
            "budget": config_state.get_remaining_budget(),
            "slices_found": 0
        })
        return {"status": "cleared"}
    else:
        return {"error": "Invalid action"}

    # Propagate lifecycle change to external model server if active
    if not config_state.use_mock:
        try:
            orchestrator = ModelOrchestrator(config_state.model_server_url)
            model_action = action
            if action == "finish":
                model_action = "stop"
            orchestrator.control_search(model_action)
        except Exception as e:
            print(f"Failed to propagate action '{action}' to model server: {e}")

    await connection_manager.broadcast({
        "type": "status",
        "status": config_state.status.value,
        "budget": config_state.get_remaining_budget(),
        "slices_found": len(slice_history)
    })
    return {"status": config_state.status.value}

@app.get("/api/logs")
async def get_logs(limit: int = 100):
    """
    Endpoint for fetching the accumulated slice history.
    """
    return {"slices": slice_history[-limit:] if limit > 0 else slice_history}


@app.post("/api/config/consume")
async def consume_budget(req: ConsumeRequest):
    """
    Endpoint for the parallel model to consume a specific amount of the search budget (e.g. time in seconds).
    """
    config_state.consume_budget(req.amount)
    return {"remaining_budget": config_state.get_remaining_budget()}


@app.get("/api/config/current")
async def get_current_config():
    """
    Endpoint for the parallel model to fetch the current search config.
    """
    cfg = {
        "status": config_state.status.value,
        "use_mock": config_state.use_mock,
        "remaining_budget": config_state.get_remaining_budget(),
        "budget_consumed": config_state.budget_consumed,
        "model_server_url": config_state.model_server_url,
        "domain": config_state.domain,
        "dataset_path": config_state.dataset_path,
        "identity_filters": config_state.identity_filters
    }
    
    if config_state.budgets:
        cfg["budgets"] = config_state.budgets
    if config_state.subgroups_to_explore:
        cfg["explore"] = config_state.subgroups_to_explore
    if config_state.subgroups_to_ignore:
        cfg["ignore"] = config_state.subgroups_to_ignore
    if config_state.weights:
        cfg["weights"] = config_state.weights
        
    for param in ["max_gap", "gamma", "min_support", "min_count_class", "uct_factor", "jaccard_threshold"]:
        val = getattr(config_state, param, None)
        if val is not None:
            cfg[param] = val
            
    return cfg


@app.post("/api/control")
async def control_post(payload: dict = Body(...)):
    """Accept control JSON (pause, update, etc) for human-in-the-loop."""
    action = payload.get('action')
    await control_queue.put(payload)
    
    if action == 'pause':
        config_state.status = RunStatus.PAUSED
    elif action == 'resume':
        if config_state.get_remaining_budget() <= 0:
            config_state.budget_consumed = 0.0
        config_state.status = RunStatus.RUNNING
    elif action == 'finish':
        config_state.status = RunStatus.COMPLETED
    elif action == 'update':
        params = payload.get('params', {}) or {}
        for k, v in params.items():
            if k in ['max_gap', 'gamma', 'min_support', 'min_count_class', 'uct_factor', 'jaccard_threshold']:
                setattr(config_state, k, type(getattr(config_state, k))(v))
            else:
                config_state.weights[k] = v
                
    # Propagate lifecycle change to external model server if active
    if not config_state.use_mock and action in ('pause', 'resume', 'finish'):
        try:
            orchestrator = ModelOrchestrator(config_state.model_server_url)
            model_action = action
            if action == "finish":
                model_action = "stop"
            orchestrator.control_search(model_action)
        except Exception as e:
            print(f"Failed to propagate action '{action}' to model server in control_post: {e}")
    
    await connection_manager.broadcast({
        "type": "control_ack",
        "action": action,
        "status": config_state.status.value
    })
    
    return {"status": "ok", "action": action}


@app.get("/api/control/pull")
async def control_pull():
    """Long-polling endpoint for worker to pull control commands."""
    return await control_queue.get()


@app.get("/api/snapshots")
async def get_snapshots(since: int = 0, last: int | None = None):
    """Fetch buffered snapshots (for polling fallback)."""
    if last is not None:
        return slice_history[-last:]
    if since > 0:
        return [s for s in slice_history if s.get('iteration', 0) > since]
    return slice_history


@app.websocket("/ws/snapshots")
async def websocket_snapshots(websocket: WebSocket):
    """WebSocket for real-time snapshot streaming."""
    await connection_manager.connect(websocket)
    try:
        await websocket.send_json({"type": "status", "status": config_state.status.value})
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get('type') == 'ping':
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await connection_manager.disconnect(websocket)
    except Exception as e:
        print(f"WS error: {e}")
        await connection_manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
