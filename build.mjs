import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";

import * as esbuild from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";
import { minify as minifyHtml } from "html-minifier-terser";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(projectRoot, "dist");

const args = new Set(process.argv.slice(2));
const enableObfuscation = !args.has("--no-obfuscate");

const excludedDirectories = new Set([
  "dist",
  "node_modules",
  ".git",
  "tools",
  "__pycache__"
]);

const excludedFilenames = new Set([
  "build.mjs",
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json"
]);

const excludedExtensions = new Set([
  ".md",
  ".sql",
  ".py",
  ".mjs",
  ".log"
]);

function isPathAllowed(sourcePath) {
  const relativePath = path.relative(projectRoot, sourcePath);
  if (!relativePath || relativePath === "") {
    return true;
  }

  const normalized = relativePath.split(path.sep);
  if (normalized.some((segment) => excludedDirectories.has(segment))) {
    return false;
  }

  const baseName = path.basename(sourcePath);
  if (excludedFilenames.has(baseName)) {
    return false;
  }

  const extension = path.extname(baseName).toLowerCase();
  if (excludedExtensions.has(extension)) {
    return false;
  }

  return true;
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await walkFiles(absolutePath);
      files.push(...nestedFiles);
      continue;
    }
    files.push(absolutePath);
  }

  return files;
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (!isPathAllowed(absolutePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      const nestedFiles = await collectSourceFiles(absolutePath);
      files.push(...nestedFiles);
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

async function copyAllowedSourceTree() {
  const sourceFiles = await collectSourceFiles(projectRoot);
  for (const sourceFile of sourceFiles) {
    const relativePath = path.relative(projectRoot, sourceFile);
    const destinationFile = path.join(distDir, relativePath);
    await mkdir(path.dirname(destinationFile), { recursive: true });
    await copyFile(sourceFile, destinationFile);
  }

  return sourceFiles.map((sourceFile) => {
    return path.join(distDir, path.relative(projectRoot, sourceFile));
  });
}

async function minifyCssFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const result = await esbuild.transform(source, {
    loader: "css",
    minify: true,
    legalComments: "none"
  });
  await writeFile(filePath, result.code, "utf8");
}

async function minifyHtmlFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const html = await minifyHtml(source, {
    collapseWhitespace: true,
    collapseInlineTagWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeOptionalTags: false,
    keepClosingSlash: true,
    minifyCSS: true,
    minifyJS: false
  });
  await writeFile(filePath, html, "utf8");
}

function obfuscateJavaScript(code) {
  const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 0.8,
    identifierNamesGenerator: "hexadecimal",
    transformObjectKeys: true,
    renameGlobals: false,
    unicodeEscapeSequence: false
  });
  return obfuscationResult.getObfuscatedCode();
}

async function processJavaScriptFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const minified = await esbuild.transform(source, {
    loader: "js",
    minify: true,
    legalComments: "none",
    target: "es2019"
  });

  const output = enableObfuscation
    ? obfuscateJavaScript(minified.code)
    : minified.code;

  await writeFile(filePath, output, "utf8");
}

async function build() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const copiedFiles = await copyAllowedSourceTree();
  const htmlFiles = copiedFiles.filter((filePath) => filePath.toLowerCase().endsWith(".html"));
  const cssFiles = copiedFiles.filter((filePath) => filePath.toLowerCase().endsWith(".css"));
  const jsFiles = copiedFiles.filter((filePath) => filePath.toLowerCase().endsWith(".js"));

  for (const filePath of cssFiles) {
    await minifyCssFile(filePath);
  }

  for (const filePath of htmlFiles) {
    await minifyHtmlFile(filePath);
  }

  for (const filePath of jsFiles) {
    await processJavaScriptFile(filePath);
  }

  const distStats = await stat(distDir);
  if (!distStats.isDirectory()) {
    throw new Error("Build failed: dist directory is missing.");
  }

  console.log("Build completed.");
  console.log("Output:", distDir);
  console.log("Obfuscation:", enableObfuscation ? "enabled" : "disabled");
  console.log("Processed files:", {
    html: htmlFiles.length,
    css: cssFiles.length,
    js: jsFiles.length
  });
}

build().catch((error) => {
  console.error("Build failed:", error && error.message ? error.message : error);
  process.exitCode = 1;
});
