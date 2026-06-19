import { readFile } from "node:fs/promises";

type GraphMailConfig = {
  TENANT_ID: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  FROM_USER: string;
};

export type SendGraphMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const DEFAULT_CONFIG_PATH =
  process.env.GRAPH_MAIL_CONFIG_PATH || "/home/tomoyuki/.config/freeslot/graph-mail.env";

function parseEnvText(text: string) {
  const config: Record<string, string> = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    config[key] = value;
  }

  return config;
}

function requireConfigValue(config: Record<string, string>, key: keyof GraphMailConfig) {
  const value = config[key];
  if (!value) {
    throw new Error(`Graph mail config is missing ${key}`);
  }
  return value;
}

export async function readGraphMailConfig(
  configPath = DEFAULT_CONFIG_PATH,
): Promise<GraphMailConfig> {
  const text = await readFile(configPath, "utf8");
  const config = parseEnvText(text);

  return {
    TENANT_ID: requireConfigValue(config, "TENANT_ID"),
    CLIENT_ID: requireConfigValue(config, "CLIENT_ID"),
    CLIENT_SECRET: requireConfigValue(config, "CLIENT_SECRET"),
    FROM_USER: requireConfigValue(config, "FROM_USER"),
  };
}

async function getGraphAccessToken(config: GraphMailConfig) {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(
    config.TENANT_ID,
  )}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Graph token request failed: ${response.status} ${detail}`);
  }

  const data = (await response.json()) as { access_token?: string };

  if (!data.access_token) {
    throw new Error("Graph token response did not include access_token");
  }

  return data.access_token;
}

export async function sendGraphMail(input: SendGraphMailInput) {
  const to = input.to.trim();
  if (!to) {
    throw new Error("Recipient email is empty");
  }

  const config = await readGraphMailConfig();
  const accessToken = await getGraphAccessToken(config);

  const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    config.FROM_USER,
  )}/sendMail`;

  const message = {
    message: {
      subject: input.subject,
      body: {
        contentType: input.html ? "HTML" : "Text",
        content: input.html ?? input.text,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
          },
        },
      ],
    },
    saveToSentItems: true,
  };

  const response = await fetch(sendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Graph sendMail failed: ${response.status} ${detail}`);
  }

  return {
    ok: true,
    from: config.FROM_USER,
    to,
  };
}
