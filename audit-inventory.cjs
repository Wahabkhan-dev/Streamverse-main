const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const ts = require('./streamverse/node_modules/typescript/lib/typescript.js');
const norm = p => p.replaceAll('\\', '/');
const skip = new Set(['node_modules', 'node_modules - Copy', '.git', '.output', '.nitro', '.tanstack', '.data', 'dist', 'coverage', 'playwright-report', 'playwright-report-live', 'test-results', 'test-results-live', '.wrangler']);
function walk(dir, files = [], empty = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (!entries.length) empty.push(norm(dir));
  for (const ent of entries) {
    if (skip.has(ent.name)) continue;
    const file = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(file, files, empty); else files.push(norm(file));
  }
  return { files, empty };
}
const output = {};
for (const project of ['streamverse', 'streamverse-api']) {
  const { files, empty } = walk(project);
  const code = files.filter(f => /\.(?:[cm]?[jt]sx?)$/.test(f));
  const incoming = new Map(code.map(f => [f, []]));
  const exports = [];
  const packages = new Set();
  const unresolved = [];
  const texts = new Map(code.map(f => [f, fs.readFileSync(f, 'utf8')]));
  for (const [file, source] of texts) {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function resolve(specifier) {
      const spec = specifier.replace(/\?.*$/, '');
      if (!spec.startsWith('.') && !spec.startsWith('@/')) {
        if (!spec.startsWith('node:')) packages.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
        return;
      }
      const base = norm(spec.startsWith('@/') ? path.join(project, 'src', spec.slice(2)) : path.join(path.dirname(file), spec));
      const resolved = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts'].map(ext => base + ext), base + '/index.ts', base + '/index.tsx'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (resolved && incoming.has(resolved)) incoming.get(resolved).push(file);
      else if (!resolved) unresolved.push({ file, specifier });
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) resolve(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(sf) === 'require') && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) resolve(node.arguments[0].text);
      if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        const names = ts.isVariableStatement(node) ? node.declarationList.declarations.filter(d => ts.isIdentifier(d.name)).map(d => d.name.text) : node.name && ts.isIdentifier(node.name) ? [node.name.text] : [];
        for (const name of names) {
          const re = new RegExp('\\b' + name + '\\b');
          const users = [...texts].filter(([other, text]) => other !== file && re.test(text)).map(([other]) => other);
          if (!users.length) exports.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, name });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }
  const pkg = JSON.parse(fs.readFileSync(project + '/package.json', 'utf8'));
  const unreferenced = [...incoming].filter(([file, refs]) => !refs.length && file.includes('/src/')).map(([file]) => file);
  output[project] = {
    sourceFileCount: code.length, totalFilesExcludingArtifacts: files.length,
    sourceLines: [...texts.values()].reduce((n, t) => n + t.split(/\r?\n/).length, 0),
    emptyDirectories: empty, unresolvedImports: unresolved,
    noIncomingImportsCandidates: unreferenced,
    exportsWithNoOtherFileNameReferenceCandidates: exports,
    dependenciesWithoutImportCandidates: Object.keys(pkg.dependencies || {}).filter(p => !packages.has(p)),
    zeroByteFiles: files.filter(f => fs.statSync(f).size === 0),
    scratchCandidates: files.filter(f => /(?:scratch|tmp|\.log$|\.bak$|\.old$|debug|check-|test-results|test-upload)/i.test(f)),
  };
}
try {
  const tracked = cp.execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 }).split('\0').filter(Boolean);
  output.git = { trackedFiles: tracked.length, trackedDependencyFiles: tracked.filter(f => /(?:^|\/)node_modules(?: - Copy)?\//.test(f)).length, trackedGeneratedFiles: tracked.filter(f => /(?:^|\/)(?:test-results|playwright-report|dist|\.output)\//.test(f)).length, trackedEnvFiles: tracked.filter(f => /(?:^|\/)\.env(?:\.|$)/.test(f)), trackedLogFiles: tracked.filter(f => /\.log$/.test(f)).length };
} catch (e) { output.git = { unavailable: e.code }; }
fs.writeFileSync('AUDIT-INVENTORY.json', JSON.stringify(output, null, 2));
for (const [name, p] of Object.entries(output)) console.log(name, JSON.stringify(name === 'git' ? p : { codeFiles: p.sourceFileCount, lines: p.sourceLines, emptyDirectories: p.emptyDirectories, unresolvedImports: p.unresolvedImports.length, noIncomingCandidates: p.noIncomingImportsCandidates.length, noNameReferenceExports: p.exportsWithNoOtherFileNameReferenceCandidates.length, noImportDependencies: p.dependenciesWithoutImportCandidates, scratchCandidates: p.scratchCandidates }));
