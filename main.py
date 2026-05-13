from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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
from models import Slice, ConfigParameters, SearchMetrics, ConsumeRequest


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
        self.use_mock: bool = False
        self.budget_consumed: float = 0.0
    
    def update(self, config: ConfigParameters):
        """Update configuration from API."""
        self.budgets = config.budgets
        self.subgroups_to_explore = config.subgroups_to_explore
        self.subgroups_to_ignore = config.subgroups_to_ignore
        self.use_mock = config.use_mock
        self.budget_consumed = 0.0
    
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


async def background_streamer(manager: ConnectionManager, config: ConfigurationState):
    """Background task that streams mock slice data to connected clients."""
    while True:
        try:
            if config.use_mock:
                remaining_budget = config.get_remaining_budget()
                
                if remaining_budget > 0 and len(manager.active_connections) > 0:
                    slice_data = generate_mock_slice()
                    
                    try:
                        validated_slice = Slice(**slice_data)
                        message = {
                            "type": "slice",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "payload": validated_slice.model_dump()
                        }
                        slice_history.append(message)
                        if len(slice_history) > 100:
                            slice_history.pop(0)
                        await manager.broadcast(message)
                        config.consume_budget(1.0)
                    except Exception as e:
                        print(f"Error validating slice: {e}")
            
            await asyncio.sleep(random.uniform(1.0, 2.0))
        
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in background streamer: {e}")
            await asyncio.sleep(1.0)


# Global state
connection_manager = ConnectionManager()
config_state = ConfigurationState()
streamer_task = None
slice_history: list[dict] = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifespan: startup and shutdown."""
    global streamer_task
    
    print("Starting AuditLens...")
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
    return {
        "status": "config_updated",
        "budgets": config_state.budgets,
        "explore": config_state.subgroups_to_explore,
        "ignore": config_state.subgroups_to_ignore,
        "use_mock": config_state.use_mock,
        "remaining_budget": config_state.get_remaining_budget()
    }


@app.websocket("/ws/metrics")
async def websocket_metrics(websocket: WebSocket):
    """
    WebSocket endpoint for streaming real-time slice discovery metrics.
    """
    await connection_manager.connect(websocket)
    for message in slice_history:
        await websocket.send_json(message)
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
    The received data will be broadcast to all connected web clients.
    """
    message = {
        "type": "slice",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": slice_data.model_dump()
    }
    slice_history.append(message)
    if len(slice_history) > 100:
        slice_history.pop(0)
    await connection_manager.broadcast(message)
    config_state.consume_budget(1.0)
    return {
        "status": "broadcasted", 
        "remaining_budget": config_state.get_remaining_budget()
    }


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
        "remaining_budget": config_state.get_remaining_budget()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
