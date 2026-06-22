import selfsigned from "selfsigned";
import fs from "node:fs/promises";
import path from "node:path";

export interface Certificates {
  key: string;
  cert: string;
}

function resolveCertPaths() {
  const userDataDir = process.env.VENCORD_USER_DATA_DIR?.trim();
  const dir = userDataDir ? path.join(userDataDir, "discord-adapter-meme") : process.cwd();

  return {
    dir,
    certPath: path.join(dir, "localhost.pem"),
    keyPath: path.join(dir, "localhost-key.pem"),
  };
}

export async function getOrCreateCerts(): Promise<Certificates> {
  const { dir, certPath, keyPath } = resolveCertPaths();

  try {
    const [key, cert] = await Promise.all([
      fs.readFile(keyPath, "utf-8"),
      fs.readFile(certPath, "utf-8"),
    ]);
    console.log("Using existing SSL certificates.");
    return { key, cert };
  } catch (err) {
    console.log("Generating new self-signed SSL certificates...");

    const attrs = [{ name: "commonName", value: "localhost" }];
    const pems = await selfsigned.generate(attrs, {
      algorithm: "sha256",
      keyType: "ec",
      notBeforeDate: new Date(Date.now() - 1000),
      notAfterDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),

      extensions: [
        {
          name: "subjectAltName",
          altNames: [
            {
              type: 2, // DNS
              value: "localhost",
            },
            {
              type: 7, // IP
              ip: "127.0.0.1",
            },
            {
              type: 7, // IP
              ip: "::1",
            },
          ],
        },
      ],
    });

    const key = pems.private;
    const cert = pems.cert;

    await fs.mkdir(dir, { recursive: true });
    await Promise.all([fs.writeFile(keyPath, key), fs.writeFile(certPath, cert)]);

    console.log(`SSL certificates generated and saved to ${dir}.`);
    return { key, cert };
  }
}
