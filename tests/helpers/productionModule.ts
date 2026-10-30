import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

/** Execute production logic while replacing external effects at the import boundary. */
export function loadProductionModule<T>(file: string, scope: Record<string, unknown>): T {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const code = ts.transpileModule(source.statements.filter(statement => !ts.isImportDeclaration(statement))
    .map(statement => statement.getText(source)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(code, { exports, console, Headers, Response, URL, AbortController, Error, TypeError, Date, ...scope });
  return exports as T;
}
