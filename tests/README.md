# Tests

This directory contains test suites for both backend and frontend components.

## Backend Tests

Backend tests are written using `pytest` and `pytest-asyncio` for async testing.

### Running Backend Tests

```bash
cd backend
pip install -r requirements.txt
pip install pytest pytest-asyncio httpx
pytest ../tests/backend/ -v
```

### Test Structure

- `test_health.py` - Health check endpoint tests
- `test_models.py` - Pydantic model validation tests
- `test_config.py` - Configuration tests
- `test_api_endpoints.py` - API endpoint integration tests
- `conftest.py` - Pytest fixtures and configuration

## Frontend Tests

Frontend tests are written using `vitest` and `@testing-library/react`.

### Running Frontend Tests

```bash
cd frontend
pnpm install
pnpm test
```

### Test Structure

- `utils/` - Utility function tests (haptics, PnL calculations)
- `components/` - React component tests
- `setup.ts` - Test setup and configuration
- `vitest.config.ts` - Vitest configuration

## CI/CD

Tests are automatically run on push and pull requests via GitHub Actions (`.github/workflows/ci.yml`).

