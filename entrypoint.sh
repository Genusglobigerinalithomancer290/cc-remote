#!/bin/sh

# 1. Root pre-initialization block (runs when container starts as root)
if [ "$(id -u)" = "0" ]; then
    echo " [Info] Container started as root. Initializing User Identity Adapter..."

    # Fallback to defaults if PUID/PGID are empty or invalid
    PUID=${PUID:-1000}
    PGID=${PGID:-1000}

    # Adjust node user's UID to match host UID
    if [ "$PUID" -ne 0 ] && [ "$(id -u node 2>/dev/null)" != "$PUID" ]; then
        echo " [Info] Adjusting node user UID to $PUID"
        usermod -u "$PUID" node 2>/dev/null || echo " [Warning] Could not change node user UID"
    fi

    # Adjust node user's GID to match host GID
    if [ "$PGID" -ne 0 ] && [ "$(id -g node 2>/dev/null)" != "$PGID" ]; then
        echo " [Info] Adjusting node user GID to $PGID"
        groupmod -g "$PGID" node 2>/dev/null || echo " [Warning] Could not change node user GID"
    fi

    # Ensure /home/node and local bin paths are created and owned by the node user
    mkdir -p /home/node/.local/bin
    ln -sf /usr/local/bin/claude /home/node/.local/bin/claude
    chown -R node:node /home/node 2>/dev/null
    
    # Re-execute this script as the node user with corrected HOME environment variable
    echo " [Info] Dropping privileges to node user..."
    export HOME=/home/node
    exec gosu node "$0" "$@"
fi

# 2. User initialization block (runs as non-root user 'node')
echo " [Info] Running as non-root user node (UID: $(id -u), GID: $(id -g))"

# Configure Git identity inside the container
if [ -n "$GIT_USER_NAME" ]; then
    git config --global user.name "$GIT_USER_NAME"
fi

if [ -n "$GIT_USER_EMAIL" ]; then
    git config --global user.email "$GIT_USER_EMAIL"
fi

# Restore Claude session file if it doesn't exist but a backup is available
if [ ! -f "/home/node/.claude.json" ]; then
    # Look for the most recent backup in the mounted .claude config directory
    BACKUP_FILE=$(ls -t /home/node/.claude/backups/.claude.json.backup.* 2>/dev/null | head -n 1)
    
    if [ -n "$BACKUP_FILE" ]; then
        echo " [Info] Restoring Claude configuration from backup: $BACKUP_FILE"
        cp "$BACKUP_FILE" "/home/node/.claude.json"
    elif [ -f "/home/node/.claude/.claude.json" ]; then
        # Check parent folder fallback
        cp "/home/node/.claude/.claude.json" "/home/node/.claude.json"
    fi
fi

# Map Git requests to use the GITHUB_TOKEN transparently
if [ -n "$GITHUB_TOKEN" ]; then
    git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
    git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "git@github.com:"
fi

# Clone repository if the workspace directory is empty (no .git folder)
if [ ! -d ".git" ]; then
    if [ -n "$GITHUB_REPO" ]; then
        echo " [Info] No Git repository detected. Cloning ${GITHUB_REPO}..."
        git clone "https://github.com/${GITHUB_REPO}.git" .
    else
        echo " [Warning] The workspace folder is empty but no GITHUB_REPO was specified."
    fi
else
    echo " [Info] Git repository already exists. Skipping clone."
fi

# Automatically mark /workspace as a trusted directory and set default permission mode in Claude settings
node -e '
const fs = require("fs");
const path = "/home/node/.claude.json";
try {
  let config = {};
  if (fs.existsSync(path)) {
    config = JSON.parse(fs.readFileSync(path, "utf8"));
  }
  if (!config.projects) config.projects = {};
  if (!config.projects["/workspace"]) config.projects["/workspace"] = {};
  config.projects["/workspace"].hasTrustDialogAccepted = true;

  if (!config.permissions) config.permissions = {};
  config.permissions.defaultMode = process.env.PERMISSION_MODE || "auto";

  fs.writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
  console.log(" [Info] Automatically configured default permission mode and trusted /workspace in Claude settings.");
} catch (e) {
  console.error(" [Error] Could not configure Claude settings:", e.message);
}
'

# Execute the default command (interceptor for session UUID & name persistence)
if [ -n "$SESSION_UUID" ] && [ "$1" = "claude" ] && [ "$2" = "--remote-control" ]; then
    echo " [Info] Starting Remote Control session: $SESSION_NAME (UUID: $SESSION_UUID) in ${PERMISSION_MODE:-auto} mode"
    exec claude --session-id="$SESSION_UUID" --remote-control="$SESSION_NAME" --permission-mode="${PERMISSION_MODE:-auto}"
else
    exec "$@"
fi
