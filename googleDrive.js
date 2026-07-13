const GOOGLE_CLIENT_ID = "31285013229-gu07d9375jjgqsvsp1djp5qs2h9mv7s3.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let tokenClient = null;
let accessToken = "";
let tokenExpiresAt = 0;

function loadGoogleIdentityScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () =>
      reject(new Error("לא ניתן לטעון את שירות ההרשאות של Google."));
    document.head.appendChild(script);
  });
}

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) {
    return accessToken;
  }

  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {},
        error_callback: (error) => reject(error),
      });
    }

    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      accessToken = response.access_token;
      tokenExpiresAt =
        Date.now() + Number(response.expires_in || 3600) * 1000;
      resolve(accessToken);
    };

    tokenClient.requestAccessToken({
      prompt: accessToken ? "" : "consent",
    });
  });
}

async function driveRequest(url, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Drive ${response.status}: ${details}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findOrCreateFolder(name, parentId = null) {
  const parentClause = parentId
    ? `'${escapeDriveQuery(parentId)}' in parents and `
    : "";

  const q =
    `${parentClause}name='${escapeDriveQuery(name)}' and ` +
    `mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const found = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q,
        fields: "files(id,name)",
        spaces: "drive",
      })
  );

  if (found.files?.length) return found.files[0].id;

  const created = await driveRequest(
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    }
  );

  return created.id;
}

async function ensureFolderPath(parts) {
  let parentId = null;

  for (const rawPart of parts) {
    const part = String(rawPart || "").trim();
    if (!part) continue;
    parentId = await findOrCreateFolder(part, parentId);
  }

  return parentId;
}

export async function uploadFileToDrive(file, folderParts) {
  const token = await getAccessToken();
  const folderId = await ensureFolderPath(folderParts);

  const metadata = {
    name: file.name,
    ...(folderId ? { parents: [folderId] } : {}),
  };

  const boundary = `sidurim_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

  const body = new Blob(
    [
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\n`,
      `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?" +
      new URLSearchParams({
        uploadType: "multipart",
        fields: "id,name,webViewLink,iconLink,mimeType,size",
      }),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Drive ${response.status}: ${details}`);
  }

  return response.json();
}

export async function deleteDriveFile(fileId) {
  if (!fileId) return;

  await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE" }
  );
}
