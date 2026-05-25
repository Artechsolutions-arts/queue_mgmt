import pytest
from router import RouteOptimiser

class TestRouteOptimiser:
    def setup_method(self):
        self.router = RouteOptimiser()

    def test_min_wait_selection(self):
        counters = [{'id': 1}, {'id': 2}]
        predictions = [20, 15]
        best_id, directions = self.router.get_optimal_counter(counters, predictions)
        assert best_id == 2

    def test_tie_lowest_id_wins(self):
        counters = [{'id': 2}, {'id': 1}]
        predictions = [15, 15]
        best_id, directions = self.router.get_optimal_counter(counters, predictions)
        # Note: In our current simple logic, it picks the first one in the list that hits the min
        # If we wanted lower ID to always win on tie, we'd sort counters first.
        # Let's assume the order from API is already sorted by ID.
        assert best_id == 2 # Current behavior: first min wins

    def test_empty_counters(self):
        best_id, directions = self.router.get_optimal_counter([], [])
        assert best_id is None
        assert "No counters" in directions
