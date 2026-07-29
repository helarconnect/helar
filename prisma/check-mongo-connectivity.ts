import { Resolver, lookup } from "node:dns/promises";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

function getMongoSrvHost(connectionString: string) {
  const match = connectionString.match(/^mongodb\+srv:\/\/[^@]+@([^/?]+)(?:[/?]|$)/i);

  if (!match) {
    throw new Error("DATABASE_URL is not a mongodb+srv connection string.");
  }

  return match[1];
}

async function resolveWith(
  resolver: Resolver,
  kind: "TXT" | "SRV",
  name: string
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    const value =
      kind === "TXT" ? await resolver.resolveTxt(name) : await resolver.resolveSrv(name);

    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown DNS error"
    };
  }
}

async function lookupHost(host: string) {
  try {
    const result = await lookup(host);
    return { ok: true as const, value: result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown lookup error"
    };
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing.");
  }

  const srvHost = getMongoSrvHost(connectionString);
  const srvRecordName = `_mongodb._tcp.${srvHost}`;

  const systemResolver = new Resolver();
  const googleResolver = new Resolver();
  googleResolver.setServers(["8.8.8.8", "1.1.1.1"]);

  const [systemTxt, systemSrv, googleTxt, googleSrv, rootLookup] = await Promise.all([
    resolveWith(systemResolver, "TXT", srvHost),
    resolveWith(systemResolver, "SRV", srvRecordName),
    resolveWith(googleResolver, "TXT", srvHost),
    resolveWith(googleResolver, "SRV", srvRecordName),
    lookupHost(srvHost)
  ]);

  console.log(
    JSON.stringify(
      {
        connectionStringKind: "mongodb+srv",
        host: srvHost,
        systemDns: {
          lookup: rootLookup,
          srv: systemSrv,
          txt: systemTxt
        },
        publicDns: {
          srv: googleSrv,
          txt: googleTxt
        }
      },
      null,
      2
    )
  );

  // If public DNS works but system DNS fails, the app code is fine and the local resolver is the problem.
  if (!systemSrv.ok && googleSrv.ok) {
    console.error(
      "\nDiagnosis: Atlas SRV records exist, but the current system DNS resolver cannot resolve them."
    );
    process.exit(2);
  }

  if (!googleSrv.ok) {
    console.error("\nDiagnosis: Atlas SRV records could not be resolved even through public DNS.");
    process.exit(3);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
