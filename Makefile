.PHONY: dev backend frontend test

dev:
	@echo "Start backend and frontend in separate terminals"
	@echo "backend: cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000"
	@echo "frontend: cd frontend/public && python -m http.server 3000"

backend:
	cd backend && uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend/public && python -m http.server 3000

test:
	cd backend && pytest -q
