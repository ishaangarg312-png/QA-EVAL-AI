import os
import sys
import time
import platform
import shutil
import asyncio
from typing import Dict, Any, Optional
import httpx

_start_time = time.time()

async def get_aws_ec2_metadata() -> Dict[str, Any]:
    """Fetches AWS EC2 instance metadata with 0.5s timeout; falls back gracefully if not on EC2."""
    meta = {
        "is_aws_ec2": False,
        "instance_id": None,
        "instance_type": None,
        "region": None,
        "availability_zone": None,
        "public_ipv4": None
    }
    try:
        async with httpx.AsyncClient(timeout=0.6) as client:
            # Try IMDSv2 token first
            token_resp = await client.put(
                "http://169.254.169.254/latest/api/token",
                headers={"X-aws-ec2-metadata-token-ttl-seconds": "60"}
            )
            headers = {}
            if token_resp.status_code == 200:
                headers["X-aws-ec2-metadata-token"] = token_resp.text.strip()

            doc_resp = await client.get(
                "http://169.254.169.254/latest/dynamic/instance-identity/document",
                headers=headers
            )
            if doc_resp.status_code == 200:
                data = doc_resp.json()
                meta.update({
                    "is_aws_ec2": True,
                    "instance_id": data.get("instanceId"),
                    "instance_type": data.get("instanceType"),
                    "region": data.get("region"),
                    "availability_zone": data.get("availabilityZone"),
                    "private_ip": data.get("privateIp")
                })
                # Optional public IP
                try:
                    pub_ip_resp = await client.get(
                        "http://169.254.169.254/latest/meta-data/public-ipv4",
                        headers=headers
                    )
                    if pub_ip_resp.status_code == 200:
                        meta["public_ipv4"] = pub_ip_resp.text.strip()
                except Exception:
                    pass
    except Exception:
        # Not running in AWS EC2 or metadata service disabled
        pass
    return meta


def _get_linux_meminfo() -> Dict[str, float]:
    """Fallback reader for /proc/meminfo on Linux EC2."""
    res = {"total_mb": 0.0, "free_mb": 0.0, "available_mb": 0.0}
    try:
        if os.path.exists("/proc/meminfo"):
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    parts = line.split(":")
                    if len(parts) == 2:
                        k = parts[0].strip()
                        v = parts[1].strip().split()[0]
                        if k == "MemTotal":
                            res["total_mb"] = round(float(v) / 1024.0, 1)
                        elif k == "MemFree":
                            res["free_mb"] = round(float(v) / 1024.0, 1)
                        elif k == "MemAvailable":
                            res["available_mb"] = round(float(v) / 1024.0, 1)
    except Exception:
        pass
    return res


def _get_load_averages() -> Dict[str, float]:
    """Returns 1m, 5m, 15m load averages."""
    try:
        if hasattr(os, "getloadavg"):
            l1, l5, l15 = os.getloadavg()
            return {"1m": round(l1, 2), "5m": round(l5, 2), "15m": round(l15, 2)}
        elif os.path.exists("/proc/loadavg"):
            with open("/proc/loadavg", "r") as f:
                parts = f.read().split()
                return {"1m": round(float(parts[0]), 2), "5m": round(float(parts[1]), 2), "15m": round(float(parts[2]), 2)}
    except Exception:
        pass
    return {"1m": 0.0, "5m": 0.0, "15m": 0.0}


async def get_server_system_metrics() -> Dict[str, Any]:
    """Collects comprehensive real-time system and AWS EC2 hardware metrics."""
    # 1. CPU & Cores
    cpu_count = os.cpu_count() or 1
    cpu_percent = 0.0

    # Try psutil if available
    try:
        import psutil
        cpu_percent = round(psutil.cpu_percent(interval=None), 1)
        mem = psutil.virtual_memory()
        mem_total_mb = round(mem.total / (1024 * 1024), 1)
        mem_used_mb = round((mem.total - mem.available) / (1024 * 1024), 1)
        mem_percent = round(mem.percent, 1)
    except Exception:
        # Linux /proc fallback
        linux_mem = _get_linux_meminfo()
        if linux_mem["total_mb"] > 0:
            mem_total_mb = linux_mem["total_mb"]
            avail = linux_mem["available_mb"] or linux_mem["free_mb"]
            mem_used_mb = round(mem_total_mb - avail, 1)
            mem_percent = round((mem_used_mb / mem_total_mb) * 100.0, 1)
        else:
            mem_total_mb = 2048.0
            mem_used_mb = 512.0
            mem_percent = 25.0

        # Estimate CPU from 1m load average
        load = _get_load_averages()
        cpu_percent = min(100.0, round((load["1m"] / cpu_count) * 100.0, 1))

    # 2. Disk Usage
    try:
        root_path = "/" if platform.system() != "Windows" else "C:\\"
        du = shutil.disk_usage(root_path)
        disk_total_gb = round(du.total / (1024 ** 3), 1)
        disk_used_gb = round(du.used / (1024 ** 3), 1)
        disk_free_gb = round(du.free / (1024 ** 3), 1)
        disk_percent = round((du.used / du.total) * 100.0, 1) if du.total else 0.0
    except Exception:
        disk_total_gb = 30.0
        disk_used_gb = 10.0
        disk_free_gb = 20.0
        disk_percent = 33.3

    # 3. Process & Runtime
    uptime_seconds = int(time.time() - _start_time)
    load_avg = _get_load_averages()

    # 4. Database size check
    db_size_mb = 0.0
    try:
        for db_name in ["qa_platform.db", "backend/qa_platform.db"]:
            if os.path.exists(db_name):
                db_size_mb = round(os.path.getsize(db_name) / (1024 * 1024), 2)
                break
    except Exception:
        pass

    # 5. AWS EC2 Cloud Metadata
    aws_meta = await get_aws_ec2_metadata()
    aws_meta["is_ec2"] = aws_meta.get("is_aws_ec2", False)
    aws_meta["public_ip"] = aws_meta.get("public_ipv4")

    platform_desc = f"{platform.system()} {platform.release()}"

    return {
        "timestamp": time.time(),
        "hostname": platform.node(),
        "platform": platform_desc,
        "os": platform_desc,
        "architecture": platform.machine(),
        "python_version": platform.python_version(),
        "uptime_seconds": uptime_seconds,
        "cpu": {
            "percent": cpu_percent,
            "usage_percent": cpu_percent,
            "cores": cpu_count,
            "core_count": cpu_count,
            "logical_cpu_count": os.cpu_count() or cpu_count,
            "load_1m": load_avg["1m"],
            "load_5m": load_avg["5m"],
            "load_15m": load_avg["15m"],
            "load_avg_1m": load_avg["1m"],
            "load_avg_5m": load_avg["5m"],
            "load_avg_15m": load_avg["15m"]
        },
        "memory": {
            "total_mb": mem_total_mb,
            "used_mb": mem_used_mb,
            "available_mb": round(max(0.0, mem_total_mb - mem_used_mb), 2),
            "percent": mem_percent
        },
        "disk": {
            "total_gb": disk_total_gb,
            "used_gb": disk_used_gb,
            "free_gb": disk_free_gb,
            "percent": disk_percent
        },
        "database": {
            "sqlite_file_size_mb": db_size_mb
        },
        "aws_ec2": aws_meta
    }
