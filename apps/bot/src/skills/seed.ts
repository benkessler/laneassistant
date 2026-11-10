/**
 * Seed built-in skills into a workspace.
 *
 * Reads skill definitions from ./definitions/*.md and upserts them into
 * the database. Skills are only updated if the content has changed.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@openviktor/db";
import type { Logger } from "@openviktor/shared";

interface SkillDefinition {
	name: string;
	description: string | null;
	content: string;
}

function parseSkillFile(filePath: string): SkillDefinition | null {
	const raw = readFileSync(filePath, "utf-8");

	// Parse YAML-like frontmatter
	const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!fmMatch) return null;

	const frontmatter = fmMatch[1];
	const content = fmMatch[2].trim();

	const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
	const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

	if (!nameMatch) return null;

	return {
		name: nameMatch[1].trim(),
		description: descMatch?.[1].trim() ?? null,
		content,
	};
}

function loadSkillDefinitions(): SkillDefinition[] {
	const defsDir = join(import.meta.dirname, "definitions");
	const files = readdirSync(defsDir).filter((f) => f.endsWith(".md"));
	const skills: SkillDefinition[] = [];

	for (const file of files) {
		const parsed = parseSkillFile(join(defsDir, file));
		if (parsed) skills.push(parsed);
	}

	return skills;
}

export async function seedBuiltinSkills(
	prisma: PrismaClient,
	workspaceId: string,
	logger?: Logger,
): Promise<{ created: string[]; updated: string[]; unchanged: string[] }> {
	const definitions = loadSkillDefinitions();
	const created: string[] = [];
	const updated: string[] = [];
	const unchanged: string[] = [];

	for (const def of definitions) {
		const existing = await prisma.skill.findUnique({
			where: { workspaceId_name: { workspaceId, name: def.name } },
			select: { content: true },
		});

		if (existing) {
			if (existing.content === def.content) {
				unchanged.push(def.name);
				continue;
			}
			await prisma.skill.update({
				where: { workspaceId_name: { workspaceId, name: def.name } },
				data: {
					content: def.content,
					description: def.description,
					version: { increment: 1 },
				},
			});
			updated.push(def.name);
		} else {
			await prisma.skill.create({
				data: {
					workspaceId,
					name: def.name,
					description: def.description,
					content: def.content,
					category: "builtin",
				},
			});
			created.push(def.name);
		}
	}

	if (created.length > 0 || updated.length > 0) {
		logger?.info({ created, updated, unchanged: unchanged.length }, "Seeded built-in skills");
	}

	return { created, updated, unchanged };
}
