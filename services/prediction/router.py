import logging

logger = logging.getLogger("RouteOptimiser")

# Simple hospital layout template
LAYOUT_TEMPLATES = {
    "Counter 1": "Please head to Counter 1 in the Main Hall, next to the pharmacy.",
    "Counter 2": "Please head to Counter 2 in the East Wing, behind the elevator.",
    "Counter 3": "Please head to Counter 3 in the West Wing, near the cafeteria.",
    "Counter 4": "Please head to Counter 4 in the Main Hall, opposite the reception."
}

class RouteOptimiser:
    def get_optimal_counter(self, counters, predictions):
        """
        counters: list of dicts from queue-service
        predictions: list of predicted wait times matching counters order
        """
        if not counters:
            return None, "No counters available."

        # Find index of counter with minimum predicted wait
        min_wait = min(predictions)
        min_index = predictions.index(min_wait)
        
        best_counter = counters[min_index]
        counter_id = best_counter.get('id')
        counter_name = f"Counter {counter_id}" # Simplified name matching
        
        directions = LAYOUT_TEMPLATES.get(counter_name, f"Please proceed to Counter {counter_id}.")
        
        return counter_id, directions
