SHELL := /bin/bash
COMPOSE := docker compose

.PHONY: help up down build logs ps migrate seed staff sim test clean

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Build and start the full stack (migrate runs first as a one-shot)
	$(COMPOSE) up --build -d

down: ## Stop and remove containers
	$(COMPOSE) down

build: ## Build all images
	$(COMPOSE) build

logs: ## Tail all service logs
	$(COMPOSE) logs -f --tail=200

ps: ## Show container status
	$(COMPOSE) ps

migrate: ## Apply Django migrations (re-runs the migrate one-shot)
	$(COMPOSE) run --rm migrate

seed: ## Seed demo service types + counters + a staff user
	$(COMPOSE) exec queue-service python manage.py seed_data
	$(COMPOSE) exec queue-service python manage.py create_staff

staff: ## (Re)create the staff user using STAFF_USERNAME/STAFF_PASSWORD from .env
	$(COMPOSE) exec queue-service python manage.py create_staff

sim: ## Run the kiosk simulator (against running stack)
	python scripts/simulate_queue.py 5

test: ## Run backend tests inside the queue-service container
	$(COMPOSE) exec -e DJANGO_ENV=test queue-service python manage.py test core tests -v 1

clean: ## Stop stack and remove volumes (DESTRUCTIVE)
	$(COMPOSE) down -v
