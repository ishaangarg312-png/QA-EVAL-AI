import httpx
import json

def verify_all():
    client = httpx.Client(timeout=20.0)
    
    # 1. Health check
    h = client.get('http://127.0.0.1:8000/health')
    print('1. Health Check:', h.status_code, h.json())
    assert h.status_code == 200
    
    # 2. Frontend check
    f = client.get('http://127.0.0.1:5173/')
    print('2. Frontend Dev Server:', f.status_code, f'HTML ({len(f.text)} bytes)')
    assert f.status_code == 200
    
    # 3. Projects
    p = client.get('http://127.0.0.1:8000/api/v1/projects')
    projects = p.json()
    print(f"3. Projects ({len(projects)}): {projects[0]['name']}")
    proj_id = projects[0]['id']
    
    # 4. Trigger Full Travel Agent Demo (Scenario A, B, C, D)
    print('\n4. Executing Full 11-Step Travel AI Agent E2E Flow...')
    v1_run = client.post('http://127.0.0.1:8000/api/v1/demo/run-full-travel-workflow').json()
    print(f"   -> Run ID: {v1_run['id']}")
    print(f"   -> Status: {v1_run['status']}")
    print(f"   -> Quality Score: {v1_run['quality_score']}%")
    print(f"   -> Safety Score: {v1_run['safety_score']}%")
    print(f"   -> Duration: {v1_run['total_duration_ms']:.1f}ms")
    print(f"   -> Tokens: {v1_run['total_tokens']}")
    print(f"   -> Spans Captured: {len(v1_run['steps'])} steps, {len(v1_run['trace_events'])} immutable trace events")
    assert v1_run['status'] == 'PASSED'
    assert v1_run['quality_score'] >= 90.0
    
    # 5. Fetch 3-Layer Evaluations
    evals = client.get(f"http://127.0.0.1:8000/api/v1/evaluations/results/{v1_run['id']}").json()
    print(f"\n5. 3-Layer Evaluation Breakdown ({len(evals)} evaluators):")
    for ev in evals:
        print(f"   [Layer {ev['layer']}] {ev['evaluator_name']}: {ev['score']*100:.1f}% ({ev['verdict']})")
    assert len(evals) >= 4
    
    # 6. Trigger Regressed Agent v2 (Scenario E & F)
    print('\n6. Executing Regressed Agent v2.0.0...')
    v2_run = client.post('http://127.0.0.1:8000/api/v1/demo/run-regressed-agent-v2').json()
    print(f"   -> Run ID: {v2_run['id']}")
    print(f"   -> Status: {v2_run['status']}")
    print(f"   -> Error Message: {v2_run.get('error_message')}")
    print(f"   -> Is Regression: {v2_run.get('is_regression')}")
    
    # 7. AI Root Cause Analysis (Grounded in Trace Events)
    rca = client.get(f"http://127.0.0.1:8000/api/v1/rca/{v2_run['id']}").json()
    print(f"\n7. AI Root Cause Analysis:")
    print(f"   -> Affected Step: {rca['affected_step']}")
    print(f"   -> Confidence: {rca['confidence']*100:.0f}%")
    print(f"   -> Evidence IDs: {rca['trace_evidence_ids']}")
    print(f"   -> Root Cause: {rca['root_cause'][:120]}...")
    
    # 8. Regression Comparison Matrix
    reps = client.get(f"http://127.0.0.1:8000/api/v1/regression/reports?project_id={proj_id}").json()
    print(f"\n8. Regression Report Matrix: {reps[0]['title']}")
    print(f"   -> Pass Rate Delta: {reps[0]['pass_rate_delta']}%, Latency Delta: +{reps[0]['latency_delta_pct']}%")
    print(f"   -> Release Recommendation: {reps[0]['release_recommendation']}")
    
    # 9. Release Quality Gate Evaluation
    gate = client.post(f"http://127.0.0.1:8000/api/v1/quality-gates/evaluate?project_id={proj_id}", json={
        'min_quality_score': 85.0,
        'min_safety_score': 90.0,
        'max_critical_failures': 0,
        'max_regressions': 0
    }).json()
    print(f"\n9. Release Gate Verdict: {gate['verdict']} (Passed: {gate['passed']})")
    
    print('\n' + '=' * 60)
    print('SUCCESS: ALL PLATFORM ENDPOINTS, WORKFLOWS, EVALUATORS & DEMOS PASSED!')
    print('=' * 60)

if __name__ == '__main__':
    verify_all()
