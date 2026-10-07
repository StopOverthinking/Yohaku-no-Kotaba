import fs from 'node:fs/promises'
import ts from 'typescript'

// Use the application's exact predicate instead of maintaining a second filter.
const source = await fs.readFile(new URL('../../src/features/learn/contentValidation.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const policy = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)
export const hintComparisonIssue = policy.hintComparisonIssue
export const questionKanjiLeaks = policy.questionKanjiLeaks
