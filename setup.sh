#!/usr/bin/env bash

# Exit on interrupt
trap 'echo -e "\n\nSetup aborted."; exit 1' INT

# Color helper variables
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0;m'

echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}   Claude Code Remote Setup (Consolidated)     ${NC}"
echo -e "${BLUE}===============================================${NC}"
echo ""

# Run the config script inside a lightweight Node container
docker run --rm -it \
  -v "$(pwd)":/app \
  -w /app \
  -e HOST_HOME="$HOME" \
  -e HOST_PWD="$(pwd)" \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  node:22-slim node config.js "$@"

# If config succeeded, load .env to prepare directories on the host
if [ $? -eq 0 ] && [ -f .env ]; then
  # Source .env safely
  set -a
  source .env 2>/dev/null
  set +a
  
  echo -e "\n${BLUE}--- Preparing Directories & Files on Host ---${NC}"
  
  # Create host directories on the host side (so they have correct user ownership)
  if [ -n "$PROJECT_PATH" ] && [ ! -d "$PROJECT_PATH" ]; then
    echo -e " [Info] Creating workspace directory: ${BLUE}$PROJECT_PATH${NC}"
    mkdir -p "$PROJECT_PATH"
  fi
  if [ -n "$CLAUDE_CONFIG_PATH" ] && [ ! -d "$CLAUDE_CONFIG_PATH" ]; then
    echo -e " [Info] Creating Claude config directory: ${BLUE}$CLAUDE_CONFIG_PATH${NC}"
    mkdir -p "$CLAUDE_CONFIG_PATH"
  fi
  if [ -n "$CLAUDE_JSON_PATH" ] && [ ! -f "$CLAUDE_JSON_PATH" ]; then
    echo -e " [Info] Creating Claude credentials file: ${BLUE}$CLAUDE_JSON_PATH${NC}"
    mkdir -p "$(dirname "$CLAUDE_JSON_PATH")"
    echo "{}" > "$CLAUDE_JSON_PATH"
  fi
  if [ "$COMPOSE_PROFILES" = "headroom" ] && [ -n "$HEADROOM_CONFIG_PATH" ] && [ ! -d "$HEADROOM_CONFIG_PATH" ]; then
    echo -e " [Info] Creating Headroom config directory: ${BLUE}$HEADROOM_CONFIG_PATH${NC}"
    mkdir -p "$HEADROOM_CONFIG_PATH"
  fi
  
  # Prompt to run container
  echo ""
  echo -e -n "${GREEN}Do you want to build and start the Docker container now?${NC} [Y/n]: "
  read -r user_input
  if [ -z "$user_input" ] || [[ "$user_input" =~ ^[yY]([eE][sS])?$ ]]; then
    echo -e "${BLUE}[Info] Starting Docker containers using docker compose...${NC}"
    docker compose up -d --build
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}[Success] Container started! Run 'docker compose logs -f' to see output.${NC}"
    else
      echo -e "${RED}[Error] Failed to start Docker container.${NC}"
    fi
  else
    echo -e "${BLUE}Setup complete! You can start the agent later by running:${NC}"
    echo -e "  docker compose up -d --build"
  fi
fi
echo ""
