import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import handler from 'serve-handler';

const host = '127.0.0.1';
const port = 8000;
const publicDirectory = process.cwd();
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const requiredFiles = ['package.json', 'index.html'];

async function ensureWorkspaceDirectory() {
  const missing = [];

  for (const file of requiredFiles) {
    try {
      await access(path.join(publicDirectory, file), constants.R_OK);
    } catch {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `serve-static must be run from an app workspace directory containing ${requiredFiles.join(' and ')}. Missing: ${missing.join(', ')}. Current directory: ${publicDirectory}`,
    );
  }

  const packageJsonPath = path.join(publicDirectory, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const rootPackageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const workspaceDirectories = rootPackageJson.workspaces.map((workspacePath) =>
    path.resolve(repositoryRoot, workspacePath),
  );

  if (packageJson.private !== true || typeof packageJson.name !== 'string') {
    throw new Error(
      `serve-static must be run from a private app workspace package. Current directory: ${publicDirectory}`,
    );
  }

  if (!workspaceDirectories.includes(publicDirectory)) {
    throw new Error(
      `serve-static must be run from one of the root package.json workspaces. Current directory: ${publicDirectory}`,
    );
  }
}

function withNoStore(response) {
  response.setHeader('Cache-Control', 'no-store');
}

function shutdown(server, signal) {
  console.log(`\n${signal} received. Stopping static server...`);
  server.close((error) => {
    if (error) {
      console.error(`Failed to stop static server: ${error.message}`);
      process.exit(1);
    }

    console.log('Static server stopped.');
    process.exit(0);
  });
}

try {
  await ensureWorkspaceDirectory();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const server = createServer(async (request, response) => {
  withNoStore(response);

  if (request.url === '/' || request.url === '') {
    try {
      const indexHtml = await readFile(path.join(publicDirectory, 'index.html'));
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(indexHtml);
    } catch (error) {
      response.statusCode = 500;
      response.end(`Failed to read index.html: ${error.message}`);
    }
    return;
  }

  return handler(request, response, {
    public: publicDirectory,
    directoryListing: false,
    cleanUrls: false,
    headers: [
      {
        source: '**/*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
    ],
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use on ${host}. Stop the existing server before running dev again.`);
  } else {
    console.error(`Static server failed: ${error.message}`);
  }

  process.exit(1);
});

process.on('SIGINT', () => shutdown(server, 'SIGINT'));
process.on('SIGTERM', () => shutdown(server, 'SIGTERM'));

server.listen(port, host, () => {
  console.log(`Serving workspace: ${publicDirectory}`);
  console.log(`Local URL: http://${host}:${port}/`);
});
