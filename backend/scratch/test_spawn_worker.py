import subprocess
import sys
import os
import time
import sqlite3

backend_dir = r"c:\Users\Ishaan\Documents\universal-ai-agent-qa-platform-main\backend"
env = os.environ.copy()
env["PYTHONPATH"] = backend_dir

proc = subprocess.Popen(
    [sys.executable, "-m", "app.worker", "--concurrency", "2"],
    cwd=backend_dir,
    env=env,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
)
print("Started PID:", proc.pid)
time.sleep(2.5)

db_path = os.path.join(backend_dir, "qa_platform.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT worker_id, pid, status, last_seen_at FROM worker_heartbeats WHERE status = 'ONLINE'")
rows = cur.fetchall()
print("ONLINE workers in DB:", rows)
conn.close()

proc.terminate()
time.sleep(1)
print("Terminated successfully")
