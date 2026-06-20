const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');
const crypto = require('crypto');

// Helper to prompt user
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const questionSecret = (query) => new Promise((resolve) => {
  const oldWrite = rl._writeToOutput;
  let isMuted = false;

  rl._writeToOutput = function _writeToOutput(stringToWrite) {
    if (!isMuted) {
      rl.output.write(stringToWrite);
      return;
    }
    if (stringToWrite === '\r\n' || stringToWrite === '\n' || stringToWrite === '\r') {
      rl.output.write(stringToWrite);
      return;
    }
  };

  rl.question(query, (answer) => {
    rl._writeToOutput = oldWrite;
    resolve(answer);
  });

  isMuted = true;
});

// Path resolver
function resolvePath(userPath) {
  if (userPath.startsWith('~')) {
    const hostHome = process.env.HOST_HOME || '/root';
    return path.join(hostHome, userPath.slice(1));
  }
  if (!path.isAbsolute(userPath)) {
    const hostPwd = process.env.HOST_PWD || '/app';
    return path.join(hostPwd, userPath);
  }
  return userPath;
}

// GitHub API helper
function fetchGithubIdentity(token) {
  return new Promise((resolve) => {
    if (!token) return resolve(null);
    
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: '/user',
      method: 'GET',
      headers: {
        'User-Agent': 'node-config-agent',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      },
      timeout: 5000
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve({
              login: parsed.login,
              name: parsed.name || parsed.login,
              email: parsed.email || `${parsed.login}@users.noreply.github.com`
            });
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function main() {
  let config = {};
  const configFile = 'config.json';
  
  if (fs.existsSync(configFile)) {
    try {
      config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      console.log('\x1b[33m[Info] Loaded existing config.json.\x1b[0m');
    } catch (e) {
      console.log('\x1b[31m[Warning] Could not parse config.json, starting fresh.\x1b[0m');
    }
  }

  console.log('\x1b[35m--- GitHub & Git Settings ---\x1b[0m');

  const repoDefault = config.github?.repo || '';
  const repoInput = await question(`Enter GitHub repo to clone if workspace is empty (e.g. owner/repo) [${repoDefault}]: `);
  const githubRepo = repoInput === '' ? repoDefault : repoInput;

  let patUrl = 'https://github.com/settings/personal-access-tokens/new?name=Claude+Code+Remote+Token&description=Token+for+Claude+Code+Remote+Sandbox+with+contents+and+PR+access&metadata=read&contents=write&pull_requests=write&expires_in=none';
  if (githubRepo && githubRepo.includes('/')) {
    const parts = githubRepo.split('/');
    const owner = parts[0];
    const repo = parts.slice(1).join('/');
    patUrl = `https://github.com/settings/personal-access-tokens/new?name=Claude+Code+-+${encodeURIComponent(repo)}&description=Token+for+Claude+Code+Remote+agent+on+${encodeURIComponent(githubRepo)}&target_name=${encodeURIComponent(owner)}&metadata=read&contents=write&pull_requests=write&expires_in=none`;
  }

  console.log('\n\x1b[36m[Tip] You can quickly generate a Fine-Grained GitHub PAT with the required permissions by opening this link:');
  console.log(`\x1b[34m${patUrl}\x1b[0m`);
  console.log('It is highly recommended to select "Only select repositories" and choose only the target repository for security.\n\x1b[0m');

  const tokenDefault = config.github?.token || '';
  const tokenInput = await questionSecret(`Enter GitHub Personal Access Token [${tokenDefault ? 'HIDDEN' : 'none'}]: `);
  const token = tokenInput === '' ? tokenDefault : tokenInput;

  let githubIdentity = null;
  if (token) {
    console.log(' [Info] Fetching identity from GitHub API...');
    githubIdentity = await fetchGithubIdentity(token);
    if (githubIdentity) {
      console.log(` [Info] GitHub User Found: \x1b[34m${githubIdentity.login}\x1b[0m (${githubIdentity.name} <${githubIdentity.email}>)`);
    } else {
      console.log(' \x1b[33m[Warning] Could not retrieve GitHub user. Token might be invalid or rate-limited.\x1b[0m');
    }
  }

  const defaultGitName = githubIdentity?.name || config.git?.name || 'Claude Remote Agent';
  const gitNameInput = await question(`Enter Git User Name for container commits [${defaultGitName}]: `);
  const gitName = gitNameInput === '' ? defaultGitName : gitNameInput;

  const defaultGitEmail = githubIdentity?.email || config.git?.email || 'agent@example.com';
  const gitEmailInput = await question(`Enter Git User Email for container commits [${defaultGitEmail}]: `);
  const gitEmail = gitEmailInput === '' ? defaultGitEmail : gitEmailInput;

  console.log('\n\x1b[35m--- Path Configurations ---\x1b[0m');
  const defaultProjectPath = config.paths?.workspace || './workspace';
  const projectPathInput = await question(`Enter path to workspace directory on VPS host [${defaultProjectPath}]: `);
  const projectPathRaw = projectPathInput === '' ? defaultProjectPath : projectPathInput;
  const projectPath = resolvePath(projectPathRaw);

  const defaultClaudeConfig = config.paths?.claudeConfig || '~/.claude';
  const claudeConfigInput = await question(`Enter path to Claude config directory on VPS host [${defaultClaudeConfig}]: `);
  const claudeConfigRaw = claudeConfigInput === '' ? defaultClaudeConfig : claudeConfigInput;
  const claudeConfig = resolvePath(claudeConfigRaw);

  const defaultClaudeJson = config.paths?.claudeJson || '~/.claude.json';
  const claudeJsonInput = await question(`Enter path to Claude credentials file on VPS host [${defaultClaudeJson}]: `);
  const claudeJsonRaw = claudeJsonInput === '' ? defaultClaudeJson : claudeJsonInput;
  const claudeJson = resolvePath(claudeJsonRaw);

  console.log('\n\x1b[35m--- Session Naming ---\x1b[0m');
  const defaultSessionName = config.session?.name || (githubRepo ? path.basename(githubRepo) : path.basename(projectPath));
  const sessionNameInput = await question(`Enter display name for this Remote Control session [${defaultSessionName}]: `);
  const sessionName = sessionNameInput === '' ? defaultSessionName : sessionNameInput;
  
  // Persist or generate a unique UUID for this session, or use a dynamic one
  const defaultPersist = (config.session?.uuid && config.session.uuid !== '') ? 'y' : 'n';
  console.log('\n\x1b[36m[Tip] Reusing the same session ID avoids having to re-pair the remote connection on restarts, but can sometimes cause the session to lock up.\x1b[0m');
  const persistInput = await question(`Persist the same session ID across restarts? (y/N) [${defaultPersist}]: `);
  const persistSession = persistInput === '' ? (defaultPersist === 'y') : ['y', 'yes'].includes(persistInput.toLowerCase().trim());

  let sessionUuid = '';
  if (persistSession) {
    const existingUuid = config.session?.uuid;
    if (existingUuid && existingUuid !== '') {
      const resetInput = await question(`Keep existing session UUID (${existingUuid})? (Y/n): `);
      const keepUuid = resetInput === '' || ['y', 'yes'].includes(resetInput.toLowerCase().trim());
      sessionUuid = keepUuid ? existingUuid : crypto.randomUUID();
    } else {
      sessionUuid = crypto.randomUUID();
    }
    console.log(` [Info] Using persistent session UUID: ${sessionUuid}`);
  } else {
    console.log(' [Info] Session UUID will be dynamic (generated on each run).');
  }

  console.log('\n\x1b[35m--- Permissions Configuration ---\x1b[0m');
  const defaultPermissionMode = config.permissions?.mode || 'auto';
  const permissionModeInput = await question(`Enter permission mode (auto, default, acceptEdits, plan, dontAsk, bypassPermissions) [${defaultPermissionMode}]: `);
  const permissionMode = permissionModeInput === '' ? defaultPermissionMode : permissionModeInput;

  console.log('\n\x1b[35m--- Headroom context compression (Experimental) ---\x1b[0m');
  console.log('\x1b[33m[Warning] Use Headroom with caution and under supervision.');
  console.log('          An increase in cache write activity has been observed when activated.');
  console.log('          It is disabled by default in the configuration.\x1b[0m');
  const defaultUseHeadroom = config.headroom?.enabled !== undefined ? config.headroom.enabled : false;
  const useHeadroomInput = await question(`Enable Headroom context compression? (y/N) [${defaultUseHeadroom ? 'y' : 'n'}]: `);
  let useHeadroom = defaultUseHeadroom;
  if (useHeadroomInput !== '') {
    useHeadroom = ['y', 'yes'].includes(useHeadroomInput.toLowerCase().trim());
  }

  let headroomConfig = '~/.headroom';
  let headroomProject = config.headroom?.projectName || sessionName;
  let headroomPort = '8787';

  if (useHeadroom) {
    const defaultHeadroomConfig = config.headroom?.configPath || '~/.headroom';
    const headroomConfigInput = await question(`Enter path to Headroom config directory on VPS host [${defaultHeadroomConfig}]: `);
    headroomConfig = resolvePath(headroomConfigInput === '' ? defaultHeadroomConfig : headroomConfigInput);

    const defaultHeadroomProject = config.headroom?.projectName || sessionName;
    const headroomProjectInput = await question(`Enter project name for Headroom stats segmentation [${defaultHeadroomProject}]: `);
    headroomProject = headroomProjectInput === '' ? defaultHeadroomProject : headroomProjectInput;

    const defaultHeadroomPort = config.headroom?.hostPort || '8787';
    const headroomPortInput = await question(`Enter host port to expose Headroom proxy [${defaultHeadroomPort}]: `);
    headroomPort = headroomPortInput === '' ? defaultHeadroomPort : headroomPortInput;
  }

  // Host UID/GID dynamic adapters
  const hostUid = process.env.HOST_UID || '1000';
  const hostGid = process.env.HOST_GID || '1000';

  // Construct JSON config
  const finalConfig = {
    github: {
      token: token,
      repo: githubRepo
    },
    git: {
      name: gitName,
      email: gitEmail
    },
    paths: {
      workspace: projectPathRaw,
      claudeConfig: claudeConfigRaw,
      claudeJson: claudeJsonRaw
    },
    session: {
      name: sessionName,
      uuid: sessionUuid
    },
    permissions: {
      mode: permissionMode
    },
    headroom: {
      enabled: useHeadroom,
      configPath: useHeadroom ? headroomConfig : undefined,
      projectName: useHeadroom ? headroomProject : undefined,
      hostPort: useHeadroom ? headroomPort : undefined
    },
    user: {
      puid: hostUid,
      pgid: hostGid
    }
  };

  // Save config.json
  fs.writeFileSync(configFile, JSON.stringify(finalConfig, null, 2), 'utf8');
  console.log(`\n\x1b[32m[Success] Configuration saved to ${configFile}\x1b[0m`);

  // Build .env file contents
  const envContent = [
    `# Auto-generated configuration by config.js`,
    `GITHUB_TOKEN="${token}"`,
    `GITHUB_REPO="${githubRepo}"`,
    `GIT_USER_NAME="${gitName}"`,
    `GIT_USER_EMAIL="${gitEmail}"`,
    `PROJECT_PATH="${projectPath}"`,
    `CLAUDE_CONFIG_PATH="${claudeConfig}"`,
    `CLAUDE_JSON_PATH="${claudeJson}"`,
    `SESSION_NAME="${sessionName}"`,
    `SESSION_UUID="${sessionUuid}"`,
    `PERMISSION_MODE="${permissionMode}"`,
    `HEADROOM_CONFIG_PATH="${useHeadroom ? headroomConfig : resolvePath('~/.headroom')}"`,
    `HEADROOM_PROJECT_NAME="${useHeadroom ? headroomProject : ''}"`,
    `HEADROOM_HOST_PORT="${headroomPort}"`,
    `COMPOSE_PROFILES="${useHeadroom ? 'headroom' : ''}"`,
    `ANTHROPIC_BASE_URL="${useHeadroom ? `http://headroom:8787/p/${headroomProject}` : ''}"`,
    `PUID="${hostUid}"`,
    `PGID="${hostGid}"`
  ].join('\n') + '\n';

  fs.writeFileSync('.env', envContent, 'utf8');
  console.log('\x1b[32m[Success] Environment variables compiled to .env\x1b[0m\n');

  rl.close();
}

main().catch(err => {
  console.error('\x1b[31m[Error] Setup process failed:\x1b[0m', err);
  process.exit(1);
});
