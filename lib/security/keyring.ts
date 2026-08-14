const KEY_BYTES = 32;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,32}$/u;

export type SecretKeyring = ReadonlyMap<string, Uint8Array>;

export interface IntegrationSecretContext {
  keyring: SecretKeyring;
  currentKeyVersion: string;
  connectorId: string;
  credentialId: string;
  secretVersion: number;
}

function invalidKeyring(): Error {
  return new Error("Integration credential keyring is invalid.");
}

export function parseSecretKeyring(raw: string): SecretKeyring {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidKeyring();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw invalidKeyring();

  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > 16) throw invalidKeyring();
  const keyring = new Map<string, Uint8Array>();
  for (const [version, encoded] of entries) {
    if (!VERSION_PATTERN.test(version) || typeof encoded !== "string") throw invalidKeyring();
    let key: Uint8Array;
    try {
      const binary = atob(encoded);
      key = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
      throw invalidKeyring();
    }
    if (key.length !== KEY_BYTES) throw invalidKeyring();
    keyring.set(version, new Uint8Array(key));
  }
  return keyring;
}

export function getSecretKey(keyring: SecretKeyring, version: string): Uint8Array {
  const key = keyring.get(version);
  if (!key || key.length !== KEY_BYTES) throw invalidKeyring();
  return key;
}
