FROM node:22-slim

# 1. Install dependencies, add the official GitHub CLI repo, and install packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    gosu \
    && mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# 3. Create working directories and config folders with proper permissions
RUN mkdir -p /workspace /home/node/.claude && chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

# 4. Copy the entrypoint script
COPY --chown=node:node entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# USER node

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["claude", "--remote-control"]


