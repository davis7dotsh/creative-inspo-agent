import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseDocument } from "yaml"

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const skills = ["import-youtube-inspo", "find-youtube-inspo", "generate-inspo", "create-inspo-page"]
const allowedProperties = new Set(["name", "description", "license", "allowed-tools", "metadata"])

const validateSkill = (skill) => {
  const skillFile = join(projectRoot, ".codex", "skills", skill, "SKILL.md")
  const content = readFileSync(skillFile, "utf8")
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)

  if (!match) {
    throw new Error(`${skill}: invalid or missing YAML frontmatter`)
  }

  const document = parseDocument(match[1])

  if (document.errors.length > 0) {
    throw new Error(`${skill}: invalid YAML: ${document.errors[0]?.message}`)
  }

  const frontmatter = document.toJS()

  if (frontmatter === null || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    throw new Error(`${skill}: frontmatter must be a YAML mapping`)
  }

  const unexpected = Object.keys(frontmatter).filter((property) => !allowedProperties.has(property))

  if (unexpected.length > 0) {
    throw new Error(`${skill}: unexpected frontmatter properties: ${unexpected.join(", ")}`)
  }

  if (!("name" in frontmatter) || !("description" in frontmatter)) {
    throw new Error(`${skill}: frontmatter requires name and description`)
  }

  const { description, name } = frontmatter

  if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`${skill}: name must use lowercase hyphen-case`)
  }

  if (name !== skill) {
    throw new Error(`${skill}: frontmatter name must match its directory`)
  }

  if (name.length > 64) {
    throw new Error(`${skill}: name must not exceed 64 characters`)
  }

  if (typeof description !== "string" || description.trim().length === 0) {
    throw new Error(`${skill}: description must be a non-empty string`)
  }

  if (description.includes("<") || description.includes(">")) {
    throw new Error(`${skill}: description cannot contain angle brackets`)
  }

  if (description.length > 1024) {
    throw new Error(`${skill}: description must not exceed 1,024 characters`)
  }

  console.log(`${skill}: Skill is valid!`)
}

try {
  for (const skill of skills) {
    validateSkill(skill)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
