# Claude Code Remote with Headroom Support (VPS Setup)

This project provides a fully configurable Docker setup to run [Claude Code](https://github.com/anthropics/claude-code) with **Remote Control** enabled on a Virtual Private Server (VPS). It includes transparent GitHub authentication, Git identity mapping, automated session backups, and optional context compression via [Headroom](https://github.com/chopratejas/headroom).

---

## Features

- **VPS-Ready:** Easily host your Claude Code agent on any Linux VPS.
- **Secure GitHub Auth:** Uses a GitHub Personal Access Token to authenticate all git clone/push/pull commands without exposing SSH keys inside the container.
- **Dockerized Sandbox:** Runs in an isolated Docker container with essential tools (`git`, `curl`, `gh` CLI).
- **Auto Mode Integration:** Configured to run in Claude's Auto Mode (`--permission-mode auto`) by default, utilizing an AI safety classifier to auto-approve safe tasks and eliminate prompt fatigue.
- **Context Compression (Optional):** Integrates [Headroom](https://github.com/chopratejas/headroom) to compress tool outputs, command logs, and file structures. This reduces token consumption by **60% to 95%** while retaining answer quality.
- **User Identity Adapter:** Dynamically maps the running container user (UID/GID) to match your host system user. This prevents files created by the agent inside the shared `/workspace` from being owned by `root` on the host.
- **Session & Connection Persistence:** Configures a persistent session name (defaults to the repository name) and a unique static UUID, allowing your Remote Control session connection to persist across container re-creations without re-pairing.
- **Interactive Config-Backed Setup:** A clean configuration setup (`setup.sh` + `config.js`) verifies host paths, writes to a schema-validated `config.json`, and compiles variables to `.env` automatically.
- **Auto-Restore Session:** Restores the Claude authentication state from the host machine backups (`.claude.json`) if it gets lost during container recreation.

---

## Prerequisites

Ensure the following tools are installed and configured on your VPS host machine:

- **Docker** and **Docker Compose**
- **Git**
- **Claude Code CLI (`@anthropic-ai/claude-code`)**: Before running the sandbox, you must install the Claude Code client on your VPS host and authenticate (by running `claude` and completing the login process) under the same user account that will execute the container. The Docker setup mounts and reads the session configuration (including `~/.claude.json`) directly from this user's home directory.
- A **GitHub Personal Access Token (PAT)**:
  - **Quick Creation:** You can use this [pre-filled Fine-Grained PAT template link](https://github.com/settings/personal-access-tokens/new?name=Claude+Code+Remote+Token&description=Token+for+Claude+Code+Remote+Sandbox+with+contents+and+PR+access&metadata=read&contents=write&pull_requests=write&expires_in=none) to auto-populate the required permissions.
  - **Security Best Practice:** In the token creation form, it is highly recommended to restrict the **Repository access** option to **"Only select repositories"** and select only the repository you want the agent to work on, following the principle of least privilege.
  - **Repository permissions:** Read & Write access to code (repository/contents).
  - **Metadata permissions:** Read access to metadata.
  - **Pull Requests (Optional):** Read & Write access to pull requests if you want the agent to use the GitHub CLI (`gh`), which is pre-installed in the sandbox, to manage PRs (e.g. creating or reviewing PRs).

---

## Getting Started

### 1. Configure and Prepare

Run the interactive setup script:
```bash
./setup.sh
```

This script runs the interactive setup wizard (`config.js`) inside a temporary Node Docker container to query your VPS settings, validate paths, generate a schema-validated **`config.json`**, and compile the **`.env`** file automatically.

During setup, you will be prompted for:
- Your **GitHub Personal Access Token**.
- The default **GitHub Repository** to clone (if the target directory is empty).
- Git user details (`GIT_USER_NAME` and `GIT_USER_EMAIL`).
- Paths for the project directory, Claude configuration directory (`~/.claude`), and session credentials file (`~/.claude.json`).
- A **Session Name** for Remote Control (defaults to your repository name, e.g. `world-cup-2026`). A unique, persistent **Session UUID** will be generated automatically.
- A **Permission Mode** for Claude Code (defaults to `auto`).
- Whether to enable **Headroom** context compression. If enabled, the project name for Headroom stats will default to your Session Name.

### 2. Run the Container

If you did not opt to launch the container automatically at the end of `setup.sh`, you can build and start it manually:

```bash
docker compose up -d --build
```

### 3. Check Logs and Authenticate

If you followed the prerequisites and logged in to Claude on your VPS host (`claude` or `claude login`), your authentication state (`~/.claude.json`) is mounted automatically, and the agent will start authenticated.

Otherwise, if you need to authenticate inside the container, view the container logs to find the authentication URL:

```bash
docker compose logs -f
```

Click the provided URL, sign in with your Anthropic account, copy the authentication token, and execute it into the container (if the remote control asks for it), or ensure your host configuration (`~/.claude.json`) is correctly populated under the same user running the docker commands.

---

## Management Commands

| Action | Command |
|---|---|
| **Start in background** | `docker compose up -d` |
| **Stop container** | `docker compose down` |
| **View logs** | `docker compose logs -f` |
| **Rebuild container** | `docker compose build --no-cache` |
| **Open container terminal** | `docker compose exec claude-agent bash` |

---

## How Headroom Integration Works

When Headroom context compression is enabled during the interactive `setup.sh` script:
1. **Multi-Container Layout:** Docker Compose loads the `headroom` profile (`COMPOSE_PROFILES="headroom"`), spinning up the official `ghcr.io/chopratejas/headroom:latest` proxy container alongside the `claude-agent`.
2. **Transparent Routing:** The `claude-agent` container is configured with the `ANTHROPIC_BASE_URL` environment variable pointing to `http://headroom:8787`. All of Claude Code's Anthropic API requests are automatically routed through the Headroom proxy.
3. **Context Compression:** Headroom intercepts the traffic, compressing large tool outputs, file AST trees, and logs on-the-fly to reduce token usage by **60% to 95%** before transmitting the data to Anthropic.
4. **Metrics Persistence:** Headroom persistent savings statistics and learning logs are saved in `/root/.headroom` within the `headroom` container. By mounting the host folder defined in `HEADROOM_CONFIG_PATH`, all metrics are preserved between container restarts.

If Headroom is disabled:
1. The `headroom` service profile is not loaded, saving host memory and CPU resources.
2. The `claude-agent` container communicates directly with the official Anthropic API endpoint (`https://api.anthropic.com`) as standard.

---

## Auto Mode & Container Sandboxing

By default, the container runs Claude Code in **Auto Mode** (`--permission-mode auto`).

### Why Auto Mode?
Auto Mode replaces routine permission prompts with a background safety classifier. This classifier evaluates pending tool actions and automatically approves safe operations (like reading or editing files in the workspace and running standard git operations) while blocking actions that appear destructive, irreversible, or outside the scope of your request. This significantly reduces "approval fatigue" during remote control sessions.

### Security & Isolation (The Sandbox)
Because the Claude Code agent runs entirely inside an isolated Docker container, the container acts as a secure sandbox. Any filesystem changes, commands, or tool executions occur within this sandbox and cannot access or modify the host VPS system files or configurations directly. This sandboxed architecture makes running in Auto Mode highly secure and safe.

### Customizing Auto Mode Rules
You can customize the classifier's behavior (e.g. telling it which repositories, buckets, or domains are trusted to avoid false-positive blocks on routine tasks) by defining an `autoMode` settings block in your user configuration.

Since the container automatically mounts your host's Claude credentials file (`CLAUDE_JSON_PATH` which defaults to `~/.claude.json`), you can customize the configuration directly in `~/.claude.json` on the host:

```json
{
  "permissions": {
    "defaultMode": "auto"
  },
  "autoMode": {
    "environment": [
      "$defaults",
      "Source control: github.com/your-org and all repos under it",
      "Trusted internal domains: *.internal.example.com"
    ]
  }
}
```

You can change the permission mode to other values (e.g., `default`, `acceptEdits`, `plan`, `dontAsk`, or `bypassPermissions` if you want to bypass prompts entirely in your sandbox) by setting the `PERMISSION_MODE` environment variable in your `.env` or during the interactive `./setup.sh` configuration.

---

## Custom Skills and Rules (.agents)

For custom agent instructions, workflows, or rules (such as TDD guidelines, code style rules, or custom skills) to be loaded and used by the agent inside the container, they must be located inside the project repository under the `.agents/` folder.

Since the container mounts your project repository to `/workspace`, the agent will automatically discover, load, and follow these rules and skills when it initializes.


