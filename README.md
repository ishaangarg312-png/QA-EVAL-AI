---
title: EVAL AI Enterprise Agent QA Platform
emoji: 🤖
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# Universal AI Agent QA Automation & Evaluation Platform

An enterprise-grade, full-stack QA automation and evaluation platform designed specifically for testing, observing, evaluating, and regression-testing complex multi-turn AI Agent workflows.

---

## 🚀 Quick Start (Running Locally)

### Prerequisites
- **Python**: 3.11+ (Tested on Python 3.14)
- **Node.js**: 18+ & `npm`

---

### 1. Start the Backend API Server

Open a terminal in the root directory:

```bash
# Navigate to the backend directory
cd backend

# (Optional) Install Python dependencies
pip install -r requirements.txt

# Start FastAPI server on port 8000
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Backend API**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Database**: SQLite `qa_platform.db` (auto-created & pre-seeded on startup)

---

### 2. Start the Frontend UI

Open a second terminal:

```bash
# Navigate to the frontend directory
cd frontend

# (Optional) Install node modules
npm install

# Start Vite dev server on port 5173
npm run dev
```

- **Web Application**: [http://127.0.0.1:5173](http://127.0.0.1:5173)

---

.\start_all.bat

## 🕹️ Interactive Features & Core Scenarios

### In the Web UI:
1. **Quality Dashboard**:
   - View real-time KPI metrics: **Pass Rate (96.4%)**, **Quality Score (94.8%)**, **Latency (2.74s)**, and **Token / Cost Analytics**.
   - Review **Release Quality Gate status (`GO / NO-GO`)**.
2. **Execute Full Travel AI Workflow (Scenario A, B, C, D)**:
   - Click the top button: **"Run Travel Agent E2E Flow"**.
   - Executes an 11-step agent trajectory: Prompt $\to$ Agent $\to$ Flight Search API $\to$ Variable Extraction $\to$ Follow-up Prompt $\to$ Booking API $\to$ Human Approval Gate $\to$ Outlook Email Dispatch $\to$ 3-Layer QA Evaluation.
3. **Visual Flow Builder**:
   - Inspect the visual DAG node canvas with step simulator, node inspector, and custom prompt/API configurations.
4. **Live Trace Timeline & Deep Inspector**:
   - Click **"Executions & Traces"** in the sidebar.
   - Inspect chronological spans, toggle **Normalized Platform Data** vs **Raw Provider Payload**, and observe masked secret tokens (`sk-live-part****************23`).
5. **Human-in-the-Loop (HITL) Gate**:
   - Review pending approval tasks (e.g. flight booking exceeding \$300 budget policy) and click **Approve** or **Reject**.
6. **3-Layer Evaluations Explorer**:
   - View **Layer 1** (Deterministic Assertions & Whole-Trajectory Sequence Integrity).
   - View **Layer 2** (Semantic Intent & Grounding Alignment).
   - View **Layer 3** (Structured LLM-as-a-Judge: Task Completion, Groundedness, Policy & Safety).
7. **Simulate Regressed Agent v2.0.0 & AI Root Cause Analysis (Scenario E & F)**:
   - Click **"Simulate Regressed Agent v2 (RCA)"**.
   - Inspect the **Version Regression Matrix** (comparing $v1.0.0$ baseline vs $v2.0.0$ target with $-20\%$ tool accuracy delta and `NO-GO` verdict).
   - Open the **AI Root Cause Analysis** modal citing grounded trace event IDs and click **"Promote to Regression Test"**.

---

## 🧪 Running Automated Tests & CLI

### Run Pytest Test Suite
```bash
# Run unit and integration tests
pytest -v
```

### Run CI/CD CLI Test Runner
```bash
cd backend

# Execute CLI runner with quality gate validation
python cli.py run --project "Enterprise Travel AI Assistant" --quality-gate 85.0
```

### Run End-to-End Platform Verification Script
```bash
# Verifies health, frontend, 11-step execution, 3-layer evals, RCA, and regression gates
python verify_platform.py
```

---

## 📂 Project Architecture

```text
├── backend/
│   ├── app/
│   │   ├── api/v1/          # 13 REST API endpoints (auth, executions, hitl, evaluations, rca, regression...)
│   │   ├── core/            # Config, async database, AES-256 Fernet security, structured logging
│   │   ├── domain/          # Context, variable interpolator, quality gate rules
│   │   ├── evaluation/      # 3-Layer evaluation engine & AI Root Cause Analysis (RCA)
│   │   ├── execution/       # Graph runtime engine & step handlers (Prompt, Agent, API, Extract, HITL, Email)
│   │   ├── integrations/    # Agent adapters (REST, Travel Demo v1/v2), LLM Provider, Email Provider
│   │   ├── models/          # 17 normalized SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic validation schemas
│   │   └── seed.py          # Enterprise Travel AI Agent seed database
│   ├── cli.py               # CI/CD CLI runner
│   └── tests/               # Pytest unit and integration tests
├── frontend/
│   ├── src/
│   │   ├── components/      # Navbar, Sidebar, StatusBadge, MetricCard, JsonViewer, Modal
│   │   ├── features/        # Dashboard, Visual Flow Builder, Live Traces, 3-Layer Evals, Regression Matrix, RCA
│   │   ├── services/        # Axios API client
│   │   └── index.css        # Cyber-dark design system & glassmorphism
│   └── vite.config.ts
├── verify_platform.py       # Full platform verification script
└── pytest.ini
```
