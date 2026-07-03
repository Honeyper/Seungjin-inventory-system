const fs = require("fs");
const path = require("path");
const os = require("os");

const workspace = path.resolve(process.argv[2] || process.cwd());
const command = process.argv[3] || "deploy";
const envArg = process.argv[4] || "prod";

const ENV_CONFIG_PATH = path.join(workspace, "tools", "apps-script-env.json");
const CLASP_PATH = path.join(workspace, ".clasp.json");
const ROOT_DIR = path.join(workspace, "gas");
const RC_PATH = path.join(os.homedir(), ".clasprc.json");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const clasp = readJson(CLASP_PATH, {});
const envConfig = readJson(ENV_CONFIG_PATH, { environments: {} });
const rc = readJson(RC_PATH, {});

function pickAuthField(...names) {
  for (const name of names) {
    if (rc[name]) return rc[name];
  }
  if (rc.tokens && rc.tokens.default) {
    for (const name of names) {
      if (rc.tokens.default[name]) return rc.tokens.default[name];
    }
  }
  if (rc.token) {
    for (const name of names) {
      if (rc.token[name]) return rc.token[name];
    }
  }
  if (rc.oauth2ClientSettings) {
    for (const name of names) {
      if (rc.oauth2ClientSettings[name]) return rc.oauth2ClientSettings[name];
    }
  }
  return "";
}

const refreshToken = pickAuthField("refresh_token", "refreshToken");
const clientId = pickAuthField("client_id", "clientId");
const clientSecret = pickAuthField("client_secret", "clientSecret");

if (!refreshToken || !clientId || !clientSecret) {
  throw new Error("Missing Apps Script auth configuration.");
}

async function googleFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function getAccessToken() {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const body = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!body.access_token) {
    throw new Error("Access token was not returned.");
  }
  return body.access_token;
}

function readProjectFiles() {
  return [
    {
      name: "Code",
      type: "SERVER_JS",
      source: fs.readFileSync(path.join(ROOT_DIR, "Code.js"), "utf8")
    },
    {
      name: "appsscript",
      type: "JSON",
      source: fs.readFileSync(path.join(ROOT_DIR, "appsscript.json"), "utf8")
    }
  ];
}

function getEnvConfig(env) {
  const config = envConfig.environments[env];
  if (!config || !config.scriptId) {
    throw new Error(`Missing Apps Script config for environment: ${env}`);
  }
  return config;
}

function extractProdDeploymentId() {
  const adminJs = fs.readFileSync(path.join(workspace, "frontend", "admin.js"), "utf8");
  const match = adminJs.match(/script\.google\.com\/macros\/s\/([^/]+)\/exec/);
  return match ? match[1] : "";
}

async function createProject(authHeaders, env) {
  if (envConfig.environments[env]?.scriptId) {
    throw new Error(`${env} Apps Script project already exists in ${ENV_CONFIG_PATH}.`);
  }

  const title = env === "dev"
    ? "Seungjin Inventory API DEV"
    : `Seungjin Inventory API ${env.toUpperCase()}`;
  const project = await googleFetch("https://script.googleapis.com/v1/projects", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ title })
  });

  envConfig.environments[env] = {
    scriptId: project.scriptId,
    deploymentId: "",
    webAppUrl: "",
    description: title
  };
  writeJson(ENV_CONFIG_PATH, envConfig);
  console.log(`Created ${env} Apps Script project ${project.scriptId}.`);
}

async function deployProject(authHeaders, env) {
  const config = getEnvConfig(env);
  const scriptId = config.scriptId;
  const base = `https://script.googleapis.com/v1/projects/${scriptId}`;

  await googleFetch(`${base}/content`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ files: readProjectFiles() })
  });

  const version = await googleFetch(`${base}/versions`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      description: `${env} deploy ${new Date().toISOString()}`
    })
  });

  if (config.deploymentId) {
    await googleFetch(`${base}/deployments/${config.deploymentId}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        deploymentConfig: {
          scriptId,
          versionNumber: version.versionNumber,
          manifestFileName: "appsscript",
          description: `${env} deploy ${new Date().toISOString()}`
        }
      })
    });
  } else {
    const deployment = await googleFetch(`${base}/deployments`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        versionNumber: version.versionNumber,
        manifestFileName: "appsscript",
        description: `${env} web app`
      })
    });
    config.deploymentId = deployment.deploymentId;
  }

  config.webAppUrl = `https://script.google.com/macros/s/${config.deploymentId}/exec`;
  envConfig.environments[env] = config;
  writeJson(ENV_CONFIG_PATH, envConfig);

  console.log(`Deployed ${env} Apps Script ${scriptId} to version ${version.versionNumber}.`);
  console.log(`Web app: ${config.webAppUrl}`);
}

async function runProjectFunction(authHeaders, env, functionName) {
  const config = getEnvConfig(env);
  const response = await googleFetch(`https://script.googleapis.com/v1/scripts/${config.scriptId}:run`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      function: functionName,
      parameters: [],
      devMode: true
    })
  });

  console.log(JSON.stringify(response, null, 2));
}

async function listDeployments(authHeaders, env) {
  const config = getEnvConfig(env);
  const response = await googleFetch(`https://script.googleapis.com/v1/projects/${config.scriptId}/deployments`, {
    method: "GET",
    headers: authHeaders
  });

  console.log(JSON.stringify(response, null, 2));
}

async function main() {
  if (!envConfig.environments.prod) {
    envConfig.environments.prod = {
      scriptId: clasp.scriptId,
      deploymentId: extractProdDeploymentId(),
      webAppUrl: extractProdDeploymentId() ? `https://script.google.com/macros/s/${extractProdDeploymentId()}/exec` : "",
      description: "Seungjin Inventory API PRD"
    };
    writeJson(ENV_CONFIG_PATH, envConfig);
  }

  const accessToken = await getAccessToken();
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  if (command === "create") {
    await createProject(authHeaders, envArg);
    return;
  }
  if (command === "deploy") {
    await deployProject(authHeaders, envArg);
    return;
  }
  if (command === "run") {
    await runProjectFunction(authHeaders, envArg, process.argv[5] || "healthCheck");
    return;
  }
  if (command === "list") {
    await listDeployments(authHeaders, envArg);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
