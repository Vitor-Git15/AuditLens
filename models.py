from pydantic import BaseModel, Field
from typing import Dict


class SearchMetrics(BaseModel):
    explored_patterns: int = Field(..., description="Number of patterns explored")
    filtered_similarity: float = Field(..., description="Filtered similarity score")
    search_space_coverage: float = Field(..., description="Search space coverage percentage")


class Slice(BaseModel):
    pattern_descriptor: str = Field("", description="The textual representation of the pattern")
    error_class_0: float = Field(0.0, description="Error rate for class 0")
    error_class_1: float = Field(0.0, description="Error rate for class 1")
    top10_avg_quality: float = Field(0.0, description="Average quality of the top 10 patterns")
    top10_avg_support: float = Field(0.0, description="Average support of the top 10 patterns")
    soft_error: float = Field(..., description="Soft error metric")
    quality_score_phi: float = Field(..., description="Quality score phi")
    separation_sg: float = Field(..., description="Separation metric")
    baseline_deviation_dgB: float = Field(..., description="Baseline deviation in dB")
    class_balance_bg: float = Field(..., description="Class balance metric")
    support_penalty_pgB: float = Field(..., description="Support penalty in dB")
    delta_g: float = Field(..., description="Delta g metric")
    mean_error_mu: float = Field(..., description="Mean error")
    std_error_sigma: float = Field(..., description="Standard error")
    p_value_bh: float = Field(..., description="P-value with Benjamini-Hochberg correction")
    support_count: int = Field(..., description="Support count")
    support_percentage: float = Field(..., description="Support percentage")
    search_metrics: SearchMetrics = Field(..., description="Search metrics details")


class ConfigParameters(BaseModel):
    budgets: Dict[str, float] = Field(..., description="Exploration budgets")
    use_mock: bool = Field(False, description="Use mock model data")
    subgroups_to_explore: list[str] = Field(default_factory=list, description="Subgroups to explore")
    subgroups_to_ignore: list[str] = Field(default_factory=list, description="Subgroups to ignore")

class ConsumeRequest(BaseModel):
    amount: float
