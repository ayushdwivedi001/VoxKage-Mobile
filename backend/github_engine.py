import os
import json
import requests
import logging

logger = logging.getLogger(__name__)

def _get_pat() -> str:
    """Retrieves the GITHUB_PAT from the environment."""
    pat = os.getenv("GITHUB_PAT", "")
    if not pat:
        # Check if we have loaded it from the active user context or fallback
        logger.warning("GITHUB_PAT environment variable is empty.")
    return pat

def _get_headers() -> dict:
    pat = _get_pat()
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "VoxKage-Mobile-Backend"
    }
    if pat:
        headers["Authorization"] = f"token {pat}"
    return headers

def github_get_profile(username: str = None) -> str:
    """Returns the authenticated GitHub user profile, or details of a specific username."""
    headers = _get_headers()
    url = f"https://api.github.com/users/{username}" if username else "https://api.github.com/user"
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            user = resp.json()
            profile = {
                "login": user.get("login"),
                "name": user.get("name"),
                "bio": user.get("bio"),
                "public_repos": user.get("public_repos"),
                "total_private_repos": user.get("total_private_repos"),
                "followers": user.get("followers"),
                "following": user.get("following"),
                "created_at": user.get("created_at")
            }
            return json.dumps(profile, indent=2)
        else:
            return f"Error: GitHub API returned {resp.status_code} - {resp.text}"
    except Exception as e:
        return f"Error: Failed to retrieve profile: {e}"

def github_list_my_repos(limit: int = 10, sort: str = "updated") -> str:
    """Lists repositories owned by the authenticated user."""
    headers = _get_headers()
    url = f"https://api.github.com/user/repos"
    params = {
        "sort": sort,
        "direction": "desc",
        "per_page": min(limit, 100)
    }
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if resp.status_code == 200:
            repos_raw = resp.json()
            repos = []
            for repo in repos_raw:
                repos.append({
                    "name": repo.get("name"),
                    "full_name": repo.get("full_name"),
                    "private": repo.get("private"),
                    "html_url": repo.get("html_url"),
                    "description": repo.get("description"),
                    "language": repo.get("language"),
                    "stargazers_count": repo.get("stargazers_count"),
                    "updated_at": repo.get("updated_at")
                })
            return json.dumps({"repos": repos, "count": len(repos)}, indent=2)
        else:
            return f"Error: GitHub API returned {resp.status_code} - {resp.text}"
    except Exception as e:
        return f"Error: Failed to list repositories: {e}"

def github_actions_list(repo: str, limit: int = 10) -> str:
    """Lists recent workflow runs for a repository."""
    headers = _get_headers()
    url = f"https://api.github.com/repos/{repo}/actions/runs"
    params = {
        "per_page": min(limit, 50)
    }
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if resp.status_code == 200:
            runs_raw = resp.json().get("workflow_runs", [])
            runs = []
            for run in runs_raw:
                runs.append({
                    "id": run.get("id"),
                    "name": run.get("name"),
                    "status": run.get("status"),
                    "conclusion": run.get("conclusion"),
                    "head_branch": run.get("head_branch"),
                    "created_at": run.get("created_at")
                })
            return json.dumps({"runs": runs, "count": len(runs)}, indent=2)
        else:
            return f"Error: GitHub API returned {resp.status_code} - {resp.text}"
    except Exception as e:
        return f"Error: Failed to list workflow runs: {e}"

def github_actions_get(repo: str, run_id: str) -> str:
    """Gets details of a specific workflow run and its jobs."""
    headers = _get_headers()
    url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}"
    jobs_url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/jobs"
    try:
        run_resp = requests.get(url, headers=headers, timeout=15)
        if run_resp.status_code != 200:
            return f"Error fetching workflow run: {run_resp.status_code} - {run_resp.text}"
        
        run = run_resp.json()
        
        jobs_resp = requests.get(jobs_url, headers=headers, timeout=15)
        jobs = []
        if jobs_resp.status_code == 200:
            jobs_raw = jobs_resp.json().get("jobs", [])
            for job in jobs_raw:
                jobs.append({
                    "id": job.get("id"),
                    "name": job.get("name"),
                    "status": job.get("status"),
                    "conclusion": job.get("conclusion")
                })
        
        details = {
            "id": run.get("id"),
            "status": run.get("status"),
            "conclusion": run.get("conclusion"),
            "jobs": jobs
        }
        return json.dumps(details, indent=2)
    except Exception as e:
        return f"Error: Failed to retrieve workflow details: {e}"

def github_get_job_logs(repo: str, job_id: str) -> str:
    """Retrieves logs for a specific job."""
    headers = _get_headers()
    url = f"https://api.github.com/repos/{repo}/actions/jobs/{job_id}/logs"
    try:
        resp = requests.get(url, headers=headers, allow_redirects=True, timeout=15)
        if resp.status_code == 200:
            logs = resp.text
            # Return last 10,000 characters to prevent context overflow
            if len(logs) > 10000:
                logs = "...(truncated)...\n" + logs[-10000:]
            return json.dumps({"logs": logs}, indent=2)
        else:
            return f"Error: GitHub API returned {resp.status_code} - {resp.text}"
    except Exception as e:
        return f"Error: Failed to get job logs: {e}"

def github_create_repo(name: str, description: str = "", private: bool = True) -> str:
    """Creates a new repository on GitHub."""
    headers = _get_headers()
    url = "https://api.github.com/user/repos"
    payload = {
        "name": name,
        "description": description,
        "private": private,
        "auto_init": True
    }
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        if resp.status_code == 201:
            repo = resp.json()
            return json.dumps({
                "status": "Success",
                "name": repo.get("name"),
                "full_name": repo.get("full_name"),
                "html_url": repo.get("html_url"),
                "clone_url": repo.get("clone_url")
            }, indent=2)
        else:
            return f"Error: GitHub API returned {resp.status_code} - {resp.text}"
    except Exception as e:
        return f"Error: Failed to create repository: {e}"
