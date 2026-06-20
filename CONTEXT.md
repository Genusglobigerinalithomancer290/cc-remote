# Domain Glossary: cc-remote

This document defines the core domain concepts and terminology for the `cc-remote` codebase.

## Concepts

### Setup & Configuration Module
The module responsible for gathering environment variables, validating paths, and building the environment. Consolidates both host-side preparations and container-side environments through a single schema-validated interface (`config.json` and compiled `.env`).

### User Identity Adapter
A dynamic adapter at the entrypoint seam. It detects the host user's UID and GID at runtime and configures the container's running user to match. This ensures all generated filesystem changes inside `/workspace` are owned by the host user, avoiding root-permission leakage.

### Proxy Adapter
The network seam that interfaces between the Claude Code agent and the Anthropic API. Supported by headroom compression proxy and standard direct connection adapters.
