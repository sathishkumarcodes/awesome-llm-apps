"""
Portfolio Intelligence / Daily Insight Engine
Calculates attribution and generates narrative insights
"""
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

class AttributionEntry:
    def __init__(self, symbol: str, name: str, impact_value: float, impact_pct: float, price_change_pct: float):
        self.symbol = symbol
        self.name = name
        self.impact_value = impact_value
        self.impact_pct = impact_pct
        self.price_change_pct = price_change_pct

    def to_dict(self):
        return {
            "symbol": self.symbol,
            "name": self.name,
            "impactValue": self.impact_value,
            "impactPct": self.impact_pct,
            "priceChangePct": self.price_change_pct
        }

class SectorAttribution:
    def __init__(self, sector: str, weight_pct: float, perf_pct: float):
        self.sector = sector
        self.weight_pct = weight_pct
        self.perf_pct = perf_pct

    def to_dict(self):
        return {
            "sector": self.sector,
            "weightPct": self.weight_pct,
            "perfPct": self.perf_pct
        }

class ConcentrationMetrics:
    def __init__(self, top_holding_pct: float, top3_pct: float, top_sector_pct: float):
        self.top_holding_pct = top_holding_pct
        self.top3_pct = top3_pct
        self.top_sector_pct = top_sector_pct

    def to_dict(self):
        return {
            "topHoldingPct": self.top_holding_pct,
            "top3Pct": self.top3_pct,
            "topSectorPct": self.top_sector_pct
        }

class DailyAttribution:
    def __init__(
        self,
        change_pct: float,
        change_value: float,
        top_gainers: List[AttributionEntry],
        top_losers: List[AttributionEntry],
        sector_breakdown: List[SectorAttribution],
        concentration: ConcentrationMetrics
    ):
        self.change_pct = change_pct
        self.change_value = change_value
        self.top_gainers = top_gainers
        self.top_losers = top_losers
        self.sector_breakdown = sector_breakdown
        self.concentration = concentration

    def to_dict(self):
        return {
            "changePct": self.change_pct,
            "changeValue": self.change_value,
            "topGainers": [g.to_dict() for g in self.top_gainers],
            "topLosers": [l.to_dict() for l in self.top_losers],
            "sectorBreakdown": [s.to_dict() for s in self.sector_breakdown],
            "concentration": self.concentration.to_dict()
        }

def calculate_daily_attribution(
    current_holdings: List[Dict],
    previous_holdings: Optional[List[Dict]] = None,
    previous_total_value: Optional[float] = None
) -> DailyAttribution:
    """
    Calculate daily attribution: what drove portfolio changes
    
    Args:
        current_holdings: List of current holdings with price, quantity, etc.
        previous_holdings: List of previous holdings (optional, will use current if not provided)
        previous_total_value: Previous total portfolio value (optional)
    
    Returns:
        DailyAttribution object with change analysis
    """
    try:
        if not current_holdings or len(current_holdings) == 0:
            # Return empty attribution for no holdings
            return DailyAttribution(
                change_pct=0.0,
                change_value=0.0,
                top_gainers=[],
                top_losers=[],
                sector_breakdown=[],
                concentration=ConcentrationMetrics(0.0, 0.0, 0.0)
            )
        
        # Calculate current total value - handle different field names
        current_total_value = 0.0
        for h in current_holdings:
            # Try multiple field name variations
            total_val = h.get('total_value')
            if total_val:
                current_total_value += float(total_val)
            else:
                quantity = float(h.get('quantity', h.get('shares', 0)))
                price = float(h.get('price', h.get('current_price', 0)))
                current_total_value += quantity * price
        
        # If no previous data, use current holdings with previous price
        if previous_holdings is None:
            previous_holdings = current_holdings
            previous_total_value = 0.0
            for h in current_holdings:
                total_cost = h.get('total_cost')
                if total_cost:
                    previous_total_value += float(total_cost)
                else:
                    quantity = float(h.get('quantity', h.get('shares', 0)))
                    avg_cost = float(h.get('average_cost', h.get('avg_cost', h.get('price', 0))))
                    previous_total_value += quantity * avg_cost
        
        if previous_total_value is None:
            previous_total_value = 0.0
            for h in previous_holdings:
                total_cost = h.get('total_cost')
                if total_cost:
                    previous_total_value += float(total_cost)
                else:
                    quantity = float(h.get('quantity', h.get('shares', 0)))
                    avg_cost = float(h.get('average_cost', h.get('avg_cost', h.get('price', 0))))
                    previous_total_value += quantity * avg_cost
        
        # Calculate total change
        change_value = current_total_value - previous_total_value
        change_pct = (change_value / previous_total_value * 100) if previous_total_value > 0 else 0.0
        
        # Create a map of previous holdings by symbol for quick lookup
        prev_map = {}
        for h in previous_holdings:
            symbol = h.get('symbol', '').upper()
            prev_price = float(h.get('average_cost', h.get('price', 0)))
            prev_map[symbol] = {
                'price': prev_price,
                'quantity': float(h.get('quantity', 0)),
                'name': h.get('name', symbol)
            }
        
        # Calculate attribution for each holding
        attribution_entries = []
        
        for holding in current_holdings:
            symbol = holding.get('symbol', '').upper()
            name = holding.get('name', symbol)
            # Handle different field names for quantity
            quantity = float(holding.get('quantity', holding.get('shares', 0)))
            # Handle different field names for price
            current_price = float(holding.get('price', holding.get('current_price', 0)))
            
            # Get previous price
            if symbol in prev_map:
                prev_price = prev_map[symbol]['price']
            else:
                # New holding, use average cost as previous
                prev_price = float(holding.get('average_cost', holding.get('avg_cost', current_price)))
            
            # Calculate impact
            price_change = current_price - prev_price
            impact_value = quantity * price_change
            price_change_pct = ((current_price - prev_price) / prev_price * 100) if prev_price > 0 else 0.0
            impact_pct = (impact_value / previous_total_value * 100) if previous_total_value > 0 else 0.0
            
            attribution_entries.append(AttributionEntry(
                symbol=symbol,
                name=name,
                impact_value=impact_value,
                impact_pct=impact_pct,
                price_change_pct=price_change_pct
            ))
        
        # Sort by absolute impact value
        attribution_entries.sort(key=lambda x: abs(x.impact_value), reverse=True)
        
        # Separate gainers and losers
        top_gainers = [e for e in attribution_entries if e.impact_value > 0][:5]
        top_losers = [e for e in attribution_entries if e.impact_value < 0][:5]
        
        # Calculate sector breakdown
        sector_data = defaultdict(lambda: {'value': 0.0, 'prev_value': 0.0, 'holdings': []})
        
        for holding in current_holdings:
            sector = holding.get('sector', holding.get('type', 'Other'))
            # Handle different field names
            quantity = float(holding.get('quantity', holding.get('shares', 0)))
            current_price = float(holding.get('price', holding.get('current_price', 0)))
            # Try total_value first, then calculate
            current_value = float(holding.get('total_value', quantity * current_price))
            
            symbol = holding.get('symbol', '').upper()
            if symbol in prev_map:
                prev_price = prev_map[symbol]['price']
            else:
                prev_price = float(holding.get('average_cost', holding.get('avg_cost', current_price)))
            # Try total_cost first, then calculate
            prev_value = float(holding.get('total_cost', quantity * prev_price))
            
            sector_data[sector]['value'] += current_value
            sector_data[sector]['prev_value'] += prev_value
            sector_data[sector]['holdings'].append(holding)
        
        sector_breakdown = []
        for sector, data in sector_data.items():
            if data['prev_value'] > 0:
                weight_pct = (data['value'] / current_total_value * 100) if current_total_value > 0 else 0.0
                perf_pct = ((data['value'] - data['prev_value']) / data['prev_value'] * 100) if data['prev_value'] > 0 else 0.0
                sector_breakdown.append(SectorAttribution(
                    sector=sector,
                    weight_pct=weight_pct,
                    perf_pct=perf_pct
                ))
        
        sector_breakdown.sort(key=lambda x: abs(x.weight_pct), reverse=True)
        
        # Calculate concentration metrics
        # Sort holdings by current value
        holdings_by_value = sorted(
            current_holdings,
            key=lambda h: float(h.get('total_value', h.get('quantity', 0) * h.get('price', 0))),
            reverse=True
        )
        
        if holdings_by_value:
            top_holding_value = float(holdings_by_value[0].get('total_value', 0))
            top_holding_pct = (top_holding_value / current_total_value * 100) if current_total_value > 0 else 0.0
            
            top3_value = sum(
                float(h.get('total_value', 0))
                for h in holdings_by_value[:3]
            )
            top3_pct = (top3_value / current_total_value * 100) if current_total_value > 0 else 0.0
        else:
            top_holding_pct = 0.0
            top3_pct = 0.0
        
        # Top sector percentage
        if sector_breakdown:
            top_sector_pct = sector_breakdown[0].weight_pct
        else:
            top_sector_pct = 0.0
        
        concentration = ConcentrationMetrics(
            top_holding_pct=top_holding_pct,
            top3_pct=top3_pct,
            top_sector_pct=top_sector_pct
        )
        
        return DailyAttribution(
            change_pct=change_pct,
            change_value=change_value,
            top_gainers=top_gainers,
            top_losers=top_losers,
            sector_breakdown=sector_breakdown,
            concentration=concentration
        )
    
    except Exception as e:
        logger.error(f"Error calculating daily attribution: {str(e)}")
        # Return empty attribution on error
        return DailyAttribution(
            change_pct=0.0,
            change_value=0.0,
            top_gainers=[],
            top_losers=[],
            sector_breakdown=[],
            concentration=ConcentrationMetrics(0.0, 0.0, 0.0)
        )

def generate_insight_narrative(attribution: DailyAttribution) -> Dict[str, any]:
    """
    Generate AI-powered narrative insight from attribution data
    For now, uses rule-based generation. Can be enhanced with OpenAI API later.
    """
    try:
        change_pct = attribution.change_pct
        change_value = attribution.change_value
        top_gainers = attribution.top_gainers[:3]
        top_losers = attribution.top_losers[:3]
        concentration = attribution.concentration
        
        # Determine direction
        direction = "rose" if change_pct > 0 else "fell" if change_pct < 0 else "remained flat"
        abs_change_pct = abs(change_pct)
        
        # Build headline
        if abs_change_pct < 0.1:
            headline = f"Your portfolio {direction} {abs_change_pct:.2f}% today, with minimal movement."
        else:
            if top_losers and change_pct < 0:
                main_driver = top_losers[0]
                headline = f"Your portfolio {direction} {abs_change_pct:.2f}% today, driven mainly by {main_driver.symbol}."
            elif top_gainers and change_pct > 0:
                main_driver = top_gainers[0]
                headline = f"Your portfolio {direction} {abs_change_pct:.2f}% today, led by {main_driver.symbol}."
            else:
                headline = f"Your portfolio {direction} {abs_change_pct:.2f}% today."
        
        # Build details
        details_parts = []
        
        # Main movement explanation
        if top_losers and change_pct < 0:
            main_loser = top_losers[0]
            details_parts.append(
                f"{main_loser.name} ({main_loser.symbol}) dropped {abs(main_loser.price_change_pct):.1f}%, "
                f"contributing ${abs(main_loser.impact_value):,.0f} ({abs(main_loser.impact_pct):.1f}%) to today's decline."
            )
            if len(top_losers) > 1:
                second_loser = top_losers[1]
                details_parts.append(
                    f"{second_loser.symbol} also declined {abs(second_loser.price_change_pct):.1f}%, "
                    f"adding ${abs(second_loser.impact_value):,.0f} to the downturn."
                )
        elif top_gainers and change_pct > 0:
            main_gainer = top_gainers[0]
            details_parts.append(
                f"{main_gainer.name} ({main_gainer.symbol}) gained {main_gainer.price_change_pct:.1f}%, "
                f"contributing ${main_gainer.impact_value:,.0f} ({main_gainer.impact_pct:.1f}%) to today's gains."
            )
            if len(top_gainers) > 1:
                second_gainer = top_gainers[1]
                details_parts.append(
                    f"{second_gainer.symbol} also rose {second_gainer.price_change_pct:.1f}%, "
                    f"adding ${second_gainer.impact_value:,.0f} to the gains."
                )
        
        # Concentration risk warning
        if concentration.top_holding_pct > 25:
            details_parts.append(
                f"Your portfolio remains highly concentrated, with your top holding representing "
                f"{concentration.top_holding_pct:.0f}% of total value, increasing sensitivity to individual stock moves."
            )
        elif concentration.top3_pct > 50:
            details_parts.append(
                f"Your top 3 holdings represent {concentration.top3_pct:.0f}% of your portfolio, "
                f"indicating moderate concentration risk."
            )
        
        # Sector concentration
        if attribution.sector_breakdown:
            top_sector = attribution.sector_breakdown[0]
            if top_sector.weight_pct > 40:
                details_parts.append(
                    f"Your allocation is heavily weighted toward {top_sector.sector} ({top_sector.weight_pct:.0f}%), "
                    f"which {direction} {abs(top_sector.perf_pct):.1f}% today."
                )
        
        details = " ".join(details_parts) if details_parts else "Portfolio movement was distributed across multiple holdings."
        
        # Build key drivers
        key_drivers = []
        for gainer in top_gainers[:3]:
            key_drivers.append(f"{gainer.symbol}: +${gainer.impact_value:,.0f} impact (+{gainer.price_change_pct:.1f}%)")
        
        for loser in top_losers[:3]:
            key_drivers.append(f"{loser.symbol}: ${loser.impact_value:,.0f} impact ({loser.price_change_pct:.1f}%)")
        
        return {
            "headline": headline,
            "details": details,
            "keyDrivers": key_drivers[:5]  # Limit to top 5
        }
    
    except Exception as e:
        logger.error(f"Error generating insight narrative: {str(e)}")
        return {
            "headline": "Portfolio insight unavailable",
            "details": "Unable to generate insight at this time.",
            "keyDrivers": []
        }

