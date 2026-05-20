from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import json
import asyncio
import random
import math
from datetime import datetime, timezone
from typing import Set
from pathlib import Path
from models import Slice, ConfigParameters, SearchMetrics, ConsumeRequest, RunStatus


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
        self.budgets: dict = {"search": 100}
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
    
    def update(self, config: ConfigParameters):
        """Update configuration from API."""
        self.budgets = config.budgets
        self.subgroups_to_explore = config.subgroups_to_explore
        self.subgroups_to_ignore = config.subgroups_to_ignore
        self.weights = config.weights
        self.use_mock = config.use_mock
        self.max_gap = config.max_gap
        self.gamma = config.gamma
        self.min_support = config.min_support
        self.min_count_class = config.min_count_class
        self.uct_factor = config.uct_factor
        self.jaccard_threshold = config.jaccard_threshold
        self.budget_consumed = 0.0
        self.status = RunStatus.RUNNING
    
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
    
    items_pool = [
        ["device=Mobile", "device=Desktop", "device=Tablet"],
        ["browser=Chrome", "browser=Safari", "browser=Firefox"],
        ["country=US", "country=BR", "country=DE", "country=JP"],
        ["page=Checkout", "page=Cart", "page=Home"],
        ["action=Search", "action=Add", "action=Buy"]
    ]
    length = random.randint(2, 4)
    seq = []
    selected_pools = random.sample(items_pool, length)
    for idx_s, pool in enumerate(selected_pools):
        itemset = random.sample(pool, random.randint(1, min(2, len(pool))))
        gap = 0 if idx_s == 0 else random.randint(1, config_state.max_gap)
        seq.append({
            "itemset": itemset,
            "gap_before": gap
        })
        
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
            "support_percentage": (support / 1000.0) * 100.0
        },
        "example_slice": {
            "errors_class_0": errors_class_0,
            "errors_class_1": errors_class_1,
            "sequence": seq
        }
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
            "global_errors_class_1": global_errors_class_1
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


async def background_streamer(manager: ConnectionManager, config: ConfigurationState):
    """Background task that streams mock slice data to connected clients."""
    while True:
        try:
            if config.use_mock and config.status == RunStatus.RUNNING:
                remaining_budget = config.get_remaining_budget()
                
                if remaining_budget > 0:
                    global next_iteration
                    try:
                        record = generate_mock_snapshot(next_iteration, config)
                        next_iteration += 1
                        slice_history.append(record)
                        config.consume_budget(5.0)
                        
                        save_slice_history()
                        
                        await manager.broadcast({"type": "snapshot", "snapshot": record})
                        await manager.broadcast({
                            "type": "status",
                            "status": RunStatus.RUNNING.value,
                            "budget": config.get_remaining_budget(),
                            "slices_found": len(slice_history)
                        })
                    except Exception as e:
                        print(f"Error generating snapshot: {e}")
                else:
                    config.status = RunStatus.PAUSED
                    await manager.broadcast({
                        "type": "status",
                        "status": RunStatus.PAUSED.value,
                        "budget": 0,
                        "slices_found": len(slice_history)
                    })
            
            # Sleep very briefly (0.05s) to let the entire budget run complete immediately
            await asyncio.sleep(0.05)
        
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in background streamer: {e}")
            await asyncio.sleep(1.0)


# Global state
connection_manager = ConnectionManager()
config_state = ConfigurationState()
streamer_task = None
control_queue: asyncio.Queue = asyncio.Queue()
next_iteration = 1

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifespan: startup and shutdown."""
    global streamer_task
    
    print("Starting AuditLens...")
    load_slice_history()
    streamer_task = asyncio.create_task(background_streamer(connection_manager, config_state))
    
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


@app.post("/api/config")
async def set_config(config: ConfigParameters):
    """
    Receive and process user interaction parameters for model auditing.
    
    Args:
        config: Configuration with budgets and subgroup exploration/ignore settings
    
    Returns:
        Confirmation of received configuration
    """
    config_state.update(config)
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

@app.post("/api/control/{action}")
async def control_run(action: str):
    """
    Control the execution state (pause, resume, finish, clear).
    """
    if action == "pause":
        config_state.status = RunStatus.PAUSED
    elif action == "resume":
        config_state.status = RunStatus.RUNNING
    elif action == "finish":
        config_state.status = RunStatus.COMPLETED
    elif action == "clear":
        global slice_history, next_iteration
        slice_history = []
        next_iteration = 1
        config_state.status = RunStatus.IDLE
        config_state.budgets['search'] = 100.0 # reset search budget
        if HISTORY_FILE.exists():
            try:
                HISTORY_FILE.unlink()
            except Exception as e:
                print(f"Error deleting history file: {e}")
        await connection_manager.broadcast({
            "type": "clear",
            "status": config_state.status.value,
            "budget": config_state.get_remaining_budget(),
            "slices_found": 0
        })
        return {"status": "cleared"}
    else:
        return {"error": "Invalid action"}

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
    return {
        "budgets": config_state.budgets,
        "explore": config_state.subgroups_to_explore,
        "ignore": config_state.subgroups_to_ignore,
        "use_mock": config_state.use_mock,
        "remaining_budget": config_state.get_remaining_budget(),
        "weights": config_state.weights,
        "max_gap": config_state.max_gap,
        "gamma": config_state.gamma,
        "min_support": config_state.min_support,
        "min_count_class": config_state.min_count_class,
        "uct_factor": config_state.uct_factor,
        "jaccard_threshold": config_state.jaccard_threshold
    }


@app.post("/api/control")
async def control_post(payload: dict = Body(...)):
    """Accept control JSON (pause, update, etc) for human-in-the-loop."""
    action = payload.get('action')
    await control_queue.put(payload)
    
    if action == 'pause':
        config_state.status = RunStatus.PAUSED
    elif action == 'resume':
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
