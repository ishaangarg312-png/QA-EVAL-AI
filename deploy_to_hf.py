import os
import sys
from pathlib import Path
from huggingface_hub import HfApi

def deploy():
    print("=" * 70)
    print("🚀 EVAL AI Platform - Hugging Face Spaces Deployment")
    print("=" * 70)

    # 1. Get Space Repo ID
    repo_id = os.getenv("HF_SPACE_ID")
    if not repo_id:
        repo_id = input("\nEnter your Hugging Face Space ID (format: username/space-name): ").strip()
    
    if not repo_id or "/" not in repo_id:
        print("❌ Error: Invalid Space ID. Format must be 'username/space-name' (e.g. ishaan/eval-ai-platform)")
        sys.exit(1)

    # 2. Get HF Token
    token = os.getenv("HF_TOKEN")
    if not token:
        print("\nGet your free Access Token with 'Write' permission at:")
        print("👉 https://huggingface.co/settings/tokens\n")
        token = input("Enter your Hugging Face Access Token (starts with hf_...): ").strip()

    if not token:
        print("❌ Error: Access token is required to upload.")
        sys.exit(1)

    # 3. Excluded patterns
    ignore_patterns = [
        "node_modules/**",
        "frontend/node_modules/**",
        "**/venv/**",
        "**/.venv/**",
        "**/__pycache__/**",
        "**/.pytest_cache/**",
        "**/.git/**",
        "**/.neon/**",
        "**/*.pyc",
        "qa_platform.db",
        "*.bat"
    ]

    root_dir = Path(__file__).resolve().parent

    print(f"\n📦 Uploading codebase to Hugging Face Space: '{repo_id}'...")
    print("⏳ Building and packaging files (excluding node_modules and cache)...")

    try:
        api = HfApi(token=token)
        future = api.upload_folder(
            folder_path=str(root_dir),
            repo_id=repo_id,
            repo_type="space",
            ignore_patterns=ignore_patterns,
            commit_message="Deploy EVAL AI Enterprise Platform"
        )
        print("\n" + "=" * 70)
        print("🎉 Code successfully uploaded to Hugging Face!")
        print(f"🔗 View build logs and live app at: https://huggingface.co/spaces/{repo_id}")
        print("=" * 70)
        print("\nHugging Face is now automatically building your Docker container.")
        print("In ~2-3 minutes, your live app will be accessible at:")
        
        user_name, space_name = repo_id.split("/", 1)
        subdomain = f"{user_name}-{space_name}".lower().replace("_", "-").replace(".", "-")
        print(f"👉 Direct App URL: https://{subdomain}.hf.space")
        print("=" * 70)
    except Exception as e:
        print(f"\n❌ Deployment failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    deploy()
