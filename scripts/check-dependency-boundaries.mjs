import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const repositoryRoot = process.cwd();
const restrictedImportsByDirectory = new Map([
  ["packages/domain/src", ["next", "react", "@prisma", "@tiptap", "pdfjs", "aws-sdk", "@aws-sdk"]],
  ["packages/application/src", ["next", "react", "@prisma", "@tiptap", "pdfjs", "aws-sdk", "@aws-sdk"]]
]);

function findTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return findTypeScriptFiles(entryPath);
    }

    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function importsRestrictedAdapter(source, adapterName) {
  const escapedName = adapterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const importExpression = new RegExp(`(?:from\\s*["']${escapedName}|import\\s*["']${escapedName})`);
  return importExpression.test(source);
}

const violations = [];

for (const [directory, restrictedImports] of restrictedImportsByDirectory) {
  for (const filePath of findTypeScriptFiles(join(repositoryRoot, directory))) {
    const source = readFileSync(filePath, "utf8");
    for (const restrictedImport of restrictedImports) {
      if (importsRestrictedAdapter(source, restrictedImport)) {
        violations.push(`${relative(repositoryRoot, filePath)} imports restricted adapter ${restrictedImport}.`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
}
