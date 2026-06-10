import os
import json
import csv
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path

WORKSPACE_DIR = Path("/home/vitor/projetos/AuditLens").resolve()

def secure_resolve_path(user_path: str) -> Optional[Path]:
    """
    Safely resolves a user-provided file path, preventing directory traversal.
    Ensures the path lies within the workspace directory.
    """
    if not user_path:
        return None
        
    # Prevent absolute path injection outside workspace or traversal
    safe_name = os.path.basename(user_path)
    # Target path within workspace (either root or a data subdirectory)
    target_path = (WORKSPACE_DIR / safe_name).resolve()
    
    # Check boundary (enforce trailing slash check concept using resolved path check)
    if not str(target_path).startswith(str(WORKSPACE_DIR)):
        raise PermissionError("Path traversal detected. Access denied.")
        
    return target_path


class BaseDataLoader:
    """Base class for dataset loading and preprocessing."""
    
    def __init__(self, source_path: Optional[str] = None, stream_data: Optional[bytes] = None):
        self.source_path = source_path
        self.stream_data = stream_data
        self.data: List[Dict[str, Any]] = []
        
    def load(self) -> List[Dict[str, Any]]:
        """Loads and pre-processes the dataset."""
        raise NotImplementedError("Subclasses must implement load()")

    def get_summary_stats(self) -> Dict[str, Any]:
        """Returns statistical overview of the loaded dataset."""
        raise NotImplementedError("Subclasses must implement get_summary_stats()")


class MalwareDataLoader(BaseDataLoader):
    """
    Data loader for Windows API calls sequence dataset.
    Used for binary classification: Benign vs Malware.
    """
    
    def load(self) -> List[Dict[str, Any]]:
        if self.stream_data:
            # Scale-ready: read from memory stream
            try:
                content = self.stream_data.decode("utf-8")
                self._parse_csv_content(content.splitlines())
            except Exception as e:
                print(f"Error loading malware stream: {e}")
                self._generate_mock_malware_data()
        elif self.source_path:
            try:
                resolved = secure_resolve_path(self.source_path)
                if resolved and resolved.exists():
                    with open(resolved, "r", encoding="utf-8") as f:
                        self._parse_csv_content(f)
                else:
                    print(f"Malware file {self.source_path} not found. Falling back to mock generator.")
                    self._generate_mock_malware_data()
            except Exception as e:
                print(f"Error loading malware file: {e}")
                self._generate_mock_malware_data()
        else:
            self._generate_mock_malware_data()
            
        return self.data

    def _parse_csv_content(self, lines) -> None:
        """Parses CSV content representing API sequences."""
        reader = csv.DictReader(lines)
        self.data = []
        for row in reader:
            # Expected schema: sequence (string of comma-separated APIs), target (0 or 1), metadata
            sequence = row.get("sequence", "")
            target = int(row.get("target", row.get("class", 0)))
            api_list = [api.strip() for api in sequence.split(",") if api.strip()]
            
            self.data.append({
                "sequence": api_list,
                "target": target,
                "label": "Malware" if target == 1 else "Benign",
                "api_count": len(api_list),
                "features": {
                    "has_registry_ops": any("Reg" in api for api in api_list),
                    "has_network_ops": any(api in ("Send", "Recv", "InternetOpen") for api in api_list),
                    "has_process_ops": any("Process" in api or "Thread" in api for api in api_list),
                    "has_file_ops": any("File" in api for api in api_list)
                }
            })

    def _generate_mock_malware_data(self) -> None:
        """Generates realistic mock sequence data for Malware auditing."""
        import random
        # APIs by category
        registry_apis = ["RegOpenKeyEx", "RegQueryValueEx", "RegSetValueEx", "RegCloseKey"]
        file_apis = ["CreateFileW", "ReadFile", "WriteFile", "DeleteFileW"]
        process_apis = ["CreateProcessW", "OpenProcess", "VirtualAllocEx", "WriteProcessMemory"]
        network_apis = ["WSAStartup", "socket", "connect", "send", "recv"]
        benign_apis = ["GetSystemTime", "GetTickCount", "LoadLibraryW", "GetProcAddress"]
        
        self.data = []
        for i in range(200):
            is_malware = random.random() < 0.4
            seq_len = random.randint(5, 20)
            
            sequence = []
            if is_malware:
                # Malicious behaviors (e.g. inject, registry hook, connect back)
                scenario = random.choice(["injection", "ransomware", "trojan"])
                if scenario == "injection":
                    sequence = ["OpenProcess", "VirtualAllocEx", "WriteProcessMemory", "CreateRemoteThread"]
                elif scenario == "ransomware":
                    sequence = ["FindFirstFileW", "CreateFileW", "WriteFile", "DeleteFileW"]
                else: # trojan
                    sequence = ["RegOpenKeyEx", "RegSetValueEx", "socket", "connect", "send"]
                
                # Pad with random APIs
                while len(sequence) < seq_len:
                    sequence.append(random.choice(registry_apis + file_apis + network_apis + benign_apis))
            else:
                # Benign sequence
                while len(sequence) < seq_len:
                    sequence.append(random.choice(benign_apis + file_apis[:2] + registry_apis[:2]))
                    
            self.data.append({
                "sequence": sequence,
                "target": 1 if is_malware else 0,
                "label": "Malware" if is_malware else "Benign",
                "api_count": len(sequence),
                "features": {
                    "has_registry_ops": any("Reg" in api for api in sequence),
                    "has_network_ops": any(api in ("socket", "connect", "send", "recv", "WSAStartup") for api in sequence),
                    "has_process_ops": any("Process" in api or "Thread" in api for api in sequence),
                    "has_file_ops": any("File" in api for api in sequence)
                }
            })

    def get_summary_stats(self) -> Dict[str, Any]:
        total = len(self.data)
        if total == 0:
            return {"total_records": 0}
            
        malware_count = sum(1 for d in self.data if d["target"] == 1)
        benign_count = total - malware_count
        
        # Avg sequence length
        avg_len = sum(d["api_count"] for d in self.data) / total
        
        # Registry ops rates
        reg_rate = sum(1 for d in self.data if d["features"]["has_registry_ops"]) / total
        net_rate = sum(1 for d in self.data if d["features"]["has_network_ops"]) / total
        
        return {
            "total_records": total,
            "malware_count": malware_count,
            "benign_count": benign_count,
            "avg_sequence_length": round(avg_len, 2),
            "registry_operation_ratio": round(reg_rate, 2),
            "network_operation_ratio": round(net_rate, 2)
        }


class ToxicityDataLoader(BaseDataLoader):
    """
    Data loader for Toxicity Text Dataset (Jigsaw Unintended Bias derived).
    Used for binary classification: Toxic vs Non-toxic comments.
    Includes identity alignment filters for female and sexual orientation contexts.
    """
    
    def __init__(self, source_path: Optional[str] = None, stream_data: Optional[bytes] = None, identity_filters: Optional[List[str]] = None):
        super().__init__(source_path, stream_data)
        self.identity_filters = identity_filters or []
        
    def load(self) -> List[Dict[str, Any]]:
        if self.stream_data:
            # Scale-ready stream parsing
            try:
                content = self.stream_data.decode("utf-8")
                self._parse_csv_content(content.splitlines())
            except Exception as e:
                print(f"Error loading toxicity stream: {e}")
                self._generate_mock_toxicity_data()
        elif self.source_path:
            try:
                resolved = secure_resolve_path(self.source_path)
                if resolved and resolved.exists():
                    with open(resolved, "r", encoding="utf-8") as f:
                        self._parse_csv_content(f)
                else:
                    print(f"Toxicity file {self.source_path} not found. Falling back to mock generator.")
                    self._generate_mock_toxicity_data()
            except Exception as e:
                print(f"Error loading toxicity file: {e}")
                self._generate_mock_toxicity_data()
        else:
            self._generate_mock_toxicity_data()
            
        # Apply strict identity filtering if requested
        self._apply_identity_filters()
        
        return self.data

    def _parse_csv_content(self, lines) -> None:
        """Parses CSV content representing comments and toxicity annotations."""
        reader = csv.DictReader(lines)
        self.data = []
        for row in reader:
            comment = row.get("comment_text", row.get("text", ""))
            target = float(row.get("toxicity", row.get("target", 0.0)))
            is_toxic = 1 if target >= 0.5 else 0
            
            # Identity labels (normally float scores in Jigsaw representing annotator agreement ratio)
            female = float(row.get("female", 0.0))
            homosexual_gay_or_lesbian = float(row.get("homosexual_gay_or_lesbian", row.get("gay_or_lesbian", 0.0)))
            
            self.data.append({
                "text": comment,
                "target": is_toxic,
                "label": "Toxic" if is_toxic == 1 else "Non-toxic",
                "toxicity_score": target,
                "identities": {
                    "female": female,
                    "homosexual_gay_or_lesbian": homosexual_gay_or_lesbian
                }
            })

    def _generate_mock_toxicity_data(self) -> None:
        """Generates realistic comments and identity tags for simulation."""
        import random
        female_comments = [
            "She is a wonderful doctor and always listens to her patients.",
            "Women in STEM are changing the industry for the better.",
            "Her leadership during this crisis was exemplary.",
            "A panel of female executives discussed the future of tech.",
            "She decided to quit and start her own company."
        ]
        gay_lesbian_comments = [
            "The parade celebrating gay pride was full of joy and music.",
            "He wrote a book about the history of the lesbian rights movement.",
            "The community center offers support for gay youth.",
            "Gay couples should have the same rights everywhere.",
            "She lives with her wife in a beautiful house."
        ]
        neutral_comments = [
            "The weather today is cloudy with a high chance of rain.",
            "I need to buy groceries for the upcoming week.",
            "The game starts at seven in the evening.",
            "He rode his bicycle along the river path.",
            "This software update improves security and performance."
        ]
        toxic_comments = [
            "This is stupid and you are wrong, go away.",
            "I hate people who write comments like this, get a job.",
            "Women should stay out of politics, they are too emotional.",
            "Gays are destroying traditional values and should be banned.",
            "Shut up, nobody cares about your opinion anyway."
        ]
        
        self.data = []
        for i in range(250):
            is_toxic = random.random() < 0.2
            
            text = ""
            female_score = 0.0
            gay_score = 0.0
            
            if is_toxic:
                text = random.choice(toxic_comments)
                if "women" in text.lower():
                    female_score = 1.0
                elif "gays" in text.lower():
                    gay_score = 1.0
            else:
                category = random.choice(["female", "gay", "neutral"])
                if category == "female":
                    text = random.choice(female_comments)
                    female_score = 1.0
                elif category == "gay":
                    text = random.choice(gay_lesbian_comments)
                    gay_score = 1.0
                else:
                    text = random.choice(neutral_comments)
                    
            self.data.append({
                "text": text,
                "target": 1 if is_toxic else 0,
                "label": "Toxic" if is_toxic else "Non-toxic",
                "toxicity_score": 0.8 if is_toxic else 0.1,
                "identities": {
                    "female": female_score,
                    "homosexual_gay_or_lesbian": gay_score
                }
            })

    def _apply_identity_filters(self) -> None:
        """Filters the data under strict 100% identity context limits if enabled."""
        if not self.identity_filters:
            return
            
        filtered_data = []
        for d in self.data:
            keep = False
            # Check context "female" (comments annotated as 100% related to women)
            if "female" in self.identity_filters and d["identities"]["female"] == 1.0:
                keep = True
            # Check context "sexual_orientation" (comments annotated as 100% related to gay/lesbian)
            if "sexual_orientation" in self.identity_filters and d["identities"]["homosexual_gay_or_lesbian"] == 1.0:
                keep = True
                
            if keep:
                filtered_data.append(d)
                
        self.data = filtered_data

    def get_summary_stats(self) -> Dict[str, Any]:
        total = len(self.data)
        if total == 0:
            return {"total_records": 0}
            
        toxic_count = sum(1 for d in self.data if d["target"] == 1)
        nontoxic_count = total - toxic_count
        
        female_aligned = sum(1 for d in self.data if d["identities"]["female"] == 1.0)
        gay_lesbian_aligned = sum(1 for d in self.data if d["identities"]["homosexual_gay_or_lesbian"] == 1.0)
        
        return {
            "total_records": total,
            "toxic_count": toxic_count,
            "non_toxic_count": nontoxic_count,
            "female_identity_count": female_aligned,
            "sexual_orientation_identity_count": gay_lesbian_aligned,
            "toxicity_ratio": round(toxic_count / total, 2)
        }
