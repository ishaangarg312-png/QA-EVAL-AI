import sqlite3
import os

db_path = "qa_platform.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("UPDATE worker_heartbeats SET status = 'OFFLINE' WHERE worker_id != 'embedded-worker-fastapi'")
    conn.commit()
    cur.execute("SELECT worker_id, pid, status FROM worker_heartbeats WHERE status = 'ONLINE'")
    print("Active Online Workers:", cur.fetchall())
    conn.close()
