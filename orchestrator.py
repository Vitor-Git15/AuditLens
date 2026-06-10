import urllib.request
import urllib.error
import json
from typing import Dict, Any, Optional, List, Tuple


class ModelOrchestrator:
    """
    Orchestrates the lifecycle of the external Model Server.
    Provides API wrapper methods to check health, trigger dataset preparation,
    and control MCTS execution loops.
    """
    
    def __init__(self, base_url: str = "http://localhost:8002"):
        self.base_url = base_url.rstrip("/")

    def _send_request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Tuple[bool, Dict[str, Any]]:
        """Helper to send HTTP requests to the model server."""
        url = f"{self.base_url}{path}"
        data = None
        headers = {}
        
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers = {"Content-Type": "application/json"}
            
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        
        try:
            # Short timeout to prevent blocking AuditLens
            with urllib.request.urlopen(req, timeout=3.0) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                return True, res_data
        except urllib.error.URLError as e:
            print(f"Connection error to model server at {url}: {e.reason}")
            return False, {"error": str(e.reason)}
        except Exception as e:
            print(f"Unexpected error communicating with model server at {url}: {e}")
            return False, {"error": str(e)}

    def check_health(self) -> bool:
        """
        Performs handshake / health check with the model server.
        Checks GET /health or fallback GET /.
        """
        # Try /health first
        success, _ = self._send_request("GET", "/health")
        if success:
            return True
            
        # Fallback to base root endpoint
        success, _ = self._send_request("GET", "/")
        return success

    def fetch_metadata(self) -> Tuple[bool, Dict[str, Any]]:
        """
        Fetches dynamic parameter configuration metadata from the model server.
        """
        # Try GET /metadata first
        success, res = self._send_request("GET", "/metadata")
        if success:
            return True, res
            
        # Fallback to GET /health and see if it contains parameter metadata
        success, res = self._send_request("GET", "/health")
        if success and "parameters" in res:
            return True, res
            
        return False, {"error": "Metadata endpoint not found or did not return parameters list"}

    def prepare_model(self, domain: str, dataset_path: Optional[str], config: Dict[str, Any], identity_filters: List[str] = None) -> Tuple[bool, Dict[str, Any]]:
        """
        Triggers data loading and preparation on the model server.
        Calls POST /prepare.
        """
        payload = {
            "domain": domain,
            "dataset_path": dataset_path,
            "identity_filters": identity_filters or [],
            "config": config
        }
        return self._send_request("POST", "/prepare", payload)

    def start_search(self, config: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
        """
        Triggers initial request / handshake to start MCTS search cycles.
        Calls POST /start.
        """
        payload = {
            "config": config
        }
        return self._send_request("POST", "/start", payload)

    def control_search(self, action: str, additional_budget: Optional[float] = None, config: Optional[Dict[str, Any]] = None) -> Tuple[bool, Dict[str, Any]]:
        """
        Sends lifecycle control signals (pause, resume, stop, update_config).
        Calls POST /control.
        """
        payload = {
            "action": action
        }
        if additional_budget is not None:
            payload["additional_budget"] = additional_budget
        if config is not None:
            payload["config"] = config
        return self._send_request("POST", "/control", payload)
