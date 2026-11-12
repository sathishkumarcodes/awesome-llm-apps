"""
Financial projections and Monte Carlo simulation service
"""
import random
import math
from typing import Dict, List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def calculate_deterministic_projection(
    current_value: float,
    monthly_contribution: float,
    annual_contribution_increase_pct: float,
    expected_annual_return_pct: float,
    years: int,
    current_age: Optional[int] = None
) -> List[Dict]:
    """
    Calculate deterministic projection path (no randomness)
    Returns: [{year: int, age?: int, portfolioValue: float}, ...]
    """
    path = []
    portfolio_value = current_value
    monthly_return = expected_annual_return_pct / 12.0
    
    for year in range(years + 1):
        if year == 0:
            path.append({
                "year": year,
                "age": current_age + year if current_age else None,
                "portfolioValue": portfolio_value
            })
            continue
        
        # Apply monthly contributions and returns for this year
        for month in range(12):
            # Add monthly contribution (increases annually)
            contribution_multiplier = (1 + annual_contribution_increase_pct) ** (year - 1)
            monthly_contribution_this_year = monthly_contribution * contribution_multiplier
            
            portfolio_value += monthly_contribution_this_year
            portfolio_value *= (1 + monthly_return)
        
        path.append({
            "year": year,
            "age": current_age + year if current_age else None,
            "portfolioValue": round(portfolio_value, 2)
        })
    
    return path

def run_monte_carlo_simulation(
    current_value: float,
    monthly_contribution: float,
    annual_contribution_increase_pct: float,
    expected_annual_return_pct: float,
    annual_volatility_pct: float,
    years: int,
    num_simulations: int = 500,
    current_age: Optional[int] = None,
    target_amount: Optional[float] = None,
    target_age: Optional[int] = None,
    return_all_paths: bool = False
) -> tuple:
    """
    Run Monte Carlo simulation
    
    Returns:
    - List of all simulation paths (limited sample for UI)
    - List of ending values for all simulations
    - List of FI years (if target_amount provided)
    """
    all_paths = []
    ending_values = []
    fi_years = []
    
    for sim in range(num_simulations):
        portfolio_value = current_value
        path = []
        fi_year = None
        
        for year in range(years + 1):
            if year == 0:
                path.append({
                    "year": year,
                    "age": current_age + year if current_age else None,
                    "portfolioValue": portfolio_value
                })
                continue
            
            # Draw annual return from normal distribution
            annual_return = random.gauss(expected_annual_return_pct, annual_volatility_pct)
            monthly_return = annual_return / 12.0
            
            # Apply monthly contributions and returns
            for month in range(12):
                contribution_multiplier = (1 + annual_contribution_increase_pct) ** (year - 1)
                monthly_contribution_this_year = monthly_contribution * contribution_multiplier
                
                portfolio_value += monthly_contribution_this_year
                portfolio_value *= (1 + monthly_return)
            
            # Check if FI target reached
            if target_amount and fi_year is None:
                if portfolio_value >= target_amount:
                    if target_age is None or (current_age and current_age + year <= target_age):
                        fi_year = year
            
            path.append({
                "year": year,
                "age": current_age + year if current_age else None,
                "portfolioValue": round(portfolio_value, 2)
            })
        
        all_paths.append(path)
        ending_values.append(portfolio_value)
        if fi_year is not None:
            fi_years.append(fi_year)
    
    # Return all paths if requested, otherwise limited sample for UI
    if return_all_paths:
        return all_paths, ending_values, fi_years
    else:
        sample_paths = all_paths[:10]  # First 10 for UI display
        return sample_paths, ending_values, fi_years

def calculate_percentile(values: List[float], percentile: float) -> float:
    """Calculate percentile from a list of values"""
    if not values:
        return 0.0
    
    sorted_values = sorted(values)
    index = int(len(sorted_values) * percentile / 100.0)
    index = min(index, len(sorted_values) - 1)
    return sorted_values[index]

def calculate_median_path(all_paths: List[List[Dict]], years: int) -> List[Dict]:
    """Calculate median path from all Monte Carlo simulations"""
    if not all_paths:
        return []
    
    median_path = []
    for year in range(years + 1):
        year_values = [path[year]["portfolioValue"] for path in all_paths if year < len(path)]
        if year_values:
            median_value = calculate_percentile(year_values, 50)
            median_path.append({
                "year": year,
                "age": all_paths[0][year].get("age") if all_paths and year < len(all_paths[0]) else None,
                "portfolioValue": round(median_value, 2)
            })
    
    return median_path

def calculate_confidence_bands(all_paths: List[List[Dict]], years: int) -> tuple:
    """Calculate p10 and p90 confidence bands from all paths"""
    if not all_paths:
        return [], []
    
    p10_path = []
    p90_path = []
    
    for year in range(years + 1):
        year_values = [path[year]["portfolioValue"] for path in all_paths if year < len(path)]
        if year_values:
            p10_value = calculate_percentile(year_values, 10)
            p90_value = calculate_percentile(year_values, 90)
            p10_path.append({
                "year": year,
                "age": all_paths[0][year].get("age") if all_paths and year < len(all_paths[0]) else None,
                "portfolioValue": round(p10_value, 2)
            })
            p90_path.append({
                "year": year,
                "age": all_paths[0][year].get("age") if all_paths and year < len(all_paths[0]) else None,
                "portfolioValue": round(p90_value, 2)
            })
    
    return p10_path, p90_path

def calculate_fi_estimate(
    fi_years: List[int],
    current_age: Optional[int],
    current_year: Optional[int] = None
) -> tuple:
    """Calculate median FI year and age"""
    if not fi_years:
        return None, None
    
    if current_year is None:
        current_year = datetime.now().year
    
    median_fi_year_offset = calculate_percentile(fi_years, 50)
    median_fi_year = current_year + int(median_fi_year_offset)
    
    if current_age:
        median_fi_age = current_age + int(median_fi_year_offset)
    else:
        median_fi_age = None
    
    return median_fi_year, median_fi_age

def calculate_tax_implications(
    portfolio_value: float,
    withdrawal_rate_pct: float,
    effective_tax_rate_pct: float
) -> Dict:
    """Calculate tax implications for withdrawals"""
    annual_withdrawal_gross = portfolio_value * (withdrawal_rate_pct / 100.0)
    tax_amount = annual_withdrawal_gross * (effective_tax_rate_pct / 100.0)
    annual_withdrawal_net = annual_withdrawal_gross - tax_amount
    
    return {
        "grossWithdrawal": round(annual_withdrawal_gross, 2),
        "taxAmount": round(tax_amount, 2),
        "netWithdrawal": round(annual_withdrawal_net, 2),
        "withdrawalRatePct": withdrawal_rate_pct,
        "taxRatePct": effective_tax_rate_pct
    }

class ProjectionService:
    def __init__(self):
        pass
    
    def calculate_projection(
        self,
        current_portfolio_value: float,
        monthly_contribution: float,
        annual_contribution_increase_pct: float,
        expected_annual_return_pct: float,
        annual_volatility_pct: float,
        years: int,
        current_age: Optional[int] = None,
        target_amount: Optional[float] = None,
        target_age: Optional[int] = None,
        effective_tax_rate_pct: float = 0.0,
        num_simulations: int = 500
    ) -> Dict:
        """
        Calculate full projection with deterministic and Monte Carlo paths
        """
        # Deterministic projection
        deterministic_path = calculate_deterministic_projection(
            current_portfolio_value,
            monthly_contribution,
            annual_contribution_increase_pct,
            expected_annual_return_pct,
            years,
            current_age
        )
        
        # Monte Carlo simulation - get sample paths for UI and all paths for statistics
        sample_paths, ending_values, fi_years = run_monte_carlo_simulation(
            current_portfolio_value,
            monthly_contribution,
            annual_contribution_increase_pct,
            expected_annual_return_pct,
            annual_volatility_pct,
            years,
            num_simulations,
            current_age,
            target_amount,
            target_age,
            return_all_paths=False
        )
        
        # Get all paths for accurate percentile calculations
        all_paths, _, _ = run_monte_carlo_simulation(
            current_portfolio_value,
            monthly_contribution,
            annual_contribution_increase_pct,
            expected_annual_return_pct,
            annual_volatility_pct,
            years,
            num_simulations,
            current_age,
            target_amount,
            target_age,
            return_all_paths=True
        )
        
        # Calculate summary statistics from all simulations
        median_ending = calculate_percentile(ending_values, 50)
        p10_ending = calculate_percentile(ending_values, 10)
        p90_ending = calculate_percentile(ending_values, 90)
        
        # Probability of hitting target
        probability_hitting_target = None
        if target_amount:
            hits = sum(1 for val in ending_values if val >= target_amount)
            probability_hitting_target = (hits / len(ending_values)) * 100.0 if ending_values else 0.0
        
        # FI estimates
        median_fi_year, median_fi_age = calculate_fi_estimate(fi_years, current_age)
        
        # Calculate median path and confidence bands from ALL paths (for accuracy)
        median_path = calculate_median_path(all_paths, years)
        p10_path, p90_path = calculate_confidence_bands(all_paths, years)
        
        # Tax implications (if target amount provided)
        tax_info = None
        if target_amount and effective_tax_rate_pct > 0:
            # Use median ending value or target amount, whichever is reached
            final_value = median_ending if median_ending >= target_amount else target_amount
            tax_info = calculate_tax_implications(final_value, 4.0, effective_tax_rate_pct)  # 4% withdrawal rule
        
        summary = {
            "medianEndingValue": round(median_ending, 2),
            "p10EndingValue": round(p10_ending, 2),
            "p90EndingValue": round(p90_ending, 2),
            "probabilityOfHittingTarget": round(probability_hitting_target, 1) if probability_hitting_target is not None else None,
            "estimatedFIYear": median_fi_year,
            "estimatedFIAge": median_fi_age,
            "taxInfo": tax_info
        }
        
        return {
            "deterministicPath": deterministic_path,
            "monteCarloPathsSample": sample_paths,
            "medianPath": median_path,
            "p10Path": p10_path,
            "p90Path": p90_path,
            "summary": summary
        }

# Global instance
projection_service = ProjectionService()

