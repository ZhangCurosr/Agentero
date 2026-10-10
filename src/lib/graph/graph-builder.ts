import type { PaperMetadata } from "@/lib/paper";
import { readVaultFile } from "@/lib/vault";
import { extractWikilinks } from "@/lib/wiki/api";
import type {
	ColorGroup,
	GraphFilterSettings,
	GraphLink,
	GraphNode,
	GraphNodeKind,
} from "./types";

type RawGraphExtraction = {
	nodes: Map<string, GraphNode>;
	links: GraphLink[];
	tagsByNode: Map<string, Set<string>>;
};

const TAG_REGEX = /(?:^|\s)#([\p{L}\p{N}_\-—/]+)(?=$|\s|[.,;:!?])/gu;

function extractTagsFromMarkdown(content: string): string[] {
	const tags = new Set<string>();
	// 1. Frontmatter tags:
	const lines = content.split(/\r?\n/);
	if (lines[0]?.trim() === "---") {
		let inTagsList = false;
		for (let i = 1; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();
			if (trimmed === "---" || trimmed === "...") {
				break;
			}
			if (trimmed.startsWith("tags:")) {
				inTagsList = true;
				const inline = trimmed.slice("tags:".length).trim();
				if (inline.startsWith("[") && inline.endsWith("]")) {
					const parts = inline
						.slice(1, -1)
						.split(",")
						.map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
						.filter(Boolean);
					for (const p of parts) tags.add(p.replace(/^#/, ""));
					inTagsList = false;
				}
			} else if (inTagsList && trimmed.startsWith("-")) {
				const tag = trimmed
					.slice(1)
					.trim()
					.replace(/^['"]|['"]$/g, "");
				if (tag) tags.add(tag.replace(/^#/, ""));
			} else if (inTagsList && trimmed && !/^\s/.test(line)) {
				inTagsList = false;
			}
		}
	}

	// 2. Inline #tags
	for (const match of content.matchAll(TAG_REGEX)) {
		const tag = match[1];
		if (tag && !/^\d+$/.test(tag)) {
			tags.add(tag);
		}
	}

	return [...tags];
}

function normalizeKey(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function stemOf(path: string): string {
	const base = path.split(/[\\/]/).pop() ?? path;
	return base.replace(/\.[^.]+$/, "");
}

export async function buildKnowledgeGraph({
	vaultPath,
	vaultMdFiles,
	paperFolders,
	paperMetaByRelPath,
}: {
	vaultPath: string | null;
	vaultMdFiles: string[];
	paperFolders: string[];
	paperMetaByRelPath?: ReadonlyMap<string, PaperMetadata>;
}): Promise<RawGraphExtraction> {
	const nodes = new Map<string, GraphNode>();
	const links: GraphLink[] = [];
	const tagsByNode = new Map<string, Set<string>>();

	// Map of paper directory relative paths for quick folding
	const paperDirSet = new Set<string>();
	for (const abs of paperFolders) {
		const rel = vaultPath
			? normalizeKey(abs.slice(vaultPath.length))
			: normalizeKey(abs);
		if (rel) paperDirSet.add(rel);
	}
	// Also ensure all papers from library store are included
	if (paperMetaByRelPath) {
		for (const rel of paperMetaByRelPath.keys()) {
			const norm = normalizeKey(rel);
			if (norm) paperDirSet.add(norm);
		}
	}

	// 1. Add Paper Nodes (folded paper directories)
	for (const rel of paperDirSet) {
		const meta = paperMetaByRelPath?.get(rel);
		const label = meta?.title?.trim() || stemOf(rel);
		const tags = new Set<string>();
		if (meta?.tags) {
			for (const t of meta.tags) {
				const name = typeof t === "string" ? t : t.name;
				if (name) tags.add(name.replace(/^#/, ""));
			}
		}

		nodes.set(rel, {
			id: rel,
			label,
			kind: "paper",
			path: rel,
			degree: 0,
			inDegree: 0,
			outDegree: 0,
			tags: [...tags],
			authors: meta?.authors,
			year: meta?.year,
			publication: meta?.publication,
			citationCount: meta?.citation_count,
			doi: meta?.doi,
			arxivId: meta?.arxiv_id,
			x: (Math.random() - 0.5) * 400,
			y: (Math.random() - 0.5) * 400,
			vx: 0,
			vy: 0,
			radius: 6,
		});
		tagsByNode.set(rel, tags);
	}

	// 2. Add Markdown Note Nodes
	for (const rel of vaultMdFiles) {
		const normalized = normalizeKey(rel);
		// Check if it belongs to a paper folder
		let inPaper = false;
		for (const pDir of paperDirSet) {
			if (normalized === pDir || normalized.startsWith(`${pDir}/`)) {
				inPaper = true;
				break;
			}
		}

		if (inPaper) continue; // Folded into paper node

		const label = stemOf(normalized);
		nodes.set(normalized, {
			id: normalized,
			label,
			kind: "note",
			path: normalized,
			degree: 0,
			inDegree: 0,
			outDegree: 0,
			tags: [],
			x: (Math.random() - 0.5) * 400,
			y: (Math.random() - 0.5) * 400,
			vx: 0,
			vy: 0,
			radius: 5,
		});
		tagsByNode.set(normalized, new Set());
	}

	// 3. Read markdown files to parse wikilinks and tags
	const readBatch = async (files: string[]) => {
		for (const rel of files) {
			const normRel = normalizeKey(rel);
			let content = "";
			try {
				content = await readVaultFile(rel);
			} catch {
				continue;
			}

			// Determine source node ID (if in paper directory, source is paper node)
			let sourceId = normRel;
			for (const pDir of paperDirSet) {
				if (normRel === pDir || normRel.startsWith(`${pDir}/`)) {
					sourceId = pDir;
					break;
				}
			}

			const sourceNode = nodes.get(sourceId);
			if (!sourceNode) continue;

			// Extract tags
			const extractedTags = extractTagsFromMarkdown(content);
			const nodeTags = tagsByNode.get(sourceId) ?? new Set();
			for (const t of extractedTags) {
				nodeTags.add(t);
			}
			tagsByNode.set(sourceId, nodeTags);
			sourceNode.tags = [...nodeTags];

			// Extract links
			const extractedLinks = extractWikilinks(content);
			for (const link of extractedLinks) {
				const targetRaw = link.targetRaw.trim();
				if (!targetRaw) continue;

				// Resolve target node:
				// First check exact match or suffix match among existing nodes
				let resolvedTargetId: string | null = null;
				const lowerTarget = targetRaw.toLowerCase();
				for (const [nId, node] of nodes) {
					if (nId === targetRaw || nId.endsWith(`/${targetRaw}`)) {
						resolvedTargetId = nId;
						break;
					}
					if (stemOf(nId).toLowerCase() === lowerTarget) {
						resolvedTargetId = nId;
						break;
					}
					if (node.label.toLowerCase() === lowerTarget) {
						resolvedTargetId = nId;
						break;
					}
				}

				if (resolvedTargetId) {
					if (resolvedTargetId !== sourceId) {
						links.push({
							id: `${sourceId}->${resolvedTargetId}`,
							source: sourceId,
							target: resolvedTargetId,
							kind: "wikilink",
						});
					}
				} else {
					// Check if attachment (image, pdf, etc.)
					const isAttachment =
						/\.(png|jpe?g|gif|svg|webp|pdf|avif)$/i.test(targetRaw) ||
						link.embed;
					const kind: GraphNodeKind = isAttachment ? "attachment" : "stub";
					const stubId = `${kind}:${targetRaw}`;

					if (!nodes.has(stubId)) {
						nodes.set(stubId, {
							id: stubId,
							label: stemOf(targetRaw),
							kind,
							path: targetRaw,
							degree: 0,
							inDegree: 0,
							outDegree: 0,
							x: (Math.random() - 0.5) * 400,
							y: (Math.random() - 0.5) * 400,
							vx: 0,
							vy: 0,
							radius: isAttachment ? 4 : 3.5,
						});
					}

					links.push({
						id: `${sourceId}->${stubId}`,
						source: sourceId,
						target: stubId,
						kind: "wikilink",
					});
				}
			}
		}
	};

	await readBatch(vaultMdFiles);

	// 4. Extract Academic Citation links between papers from {paper}/source/agentero-cite.json
	await Promise.all(
		[...paperDirSet].map(async (paperRel) => {
			try {
				const citeSidecarPath = `${paperRel}/source/agentero-cite.json`;
				const content = await readVaultFile(citeSidecarPath);
				const sidecar = JSON.parse(content);
				if (!Array.isArray(sidecar?.citations)) return;

				for (const cit of sidecar.citations) {
					let targetPaperId: string | null = null;
					// A. Direct local match from Agentero citation parser
					if (cit.localMatch?.paperPath) {
						const norm = normalizeKey(cit.localMatch.paperPath);
						if (nodes.has(norm)) {
							targetPaperId = norm;
						}
					}

					// B. Fallback match by DOI / arXiv ID / title
					if (!targetPaperId) {
						const doi = cit.metadata?.doi?.toLowerCase()?.trim();
						const arxiv = cit.metadata?.arxivId?.toLowerCase()?.trim();
						const citTitle = cit.metadata?.title?.toLowerCase()?.trim();

						for (const [otherId, otherNode] of nodes) {
							if (otherId === paperRel || otherNode.kind !== "paper") continue;
							if (doi && otherNode.doi?.toLowerCase()?.trim() === doi) {
								targetPaperId = otherId;
								break;
							}
							if (arxiv && otherNode.arxivId?.toLowerCase()?.trim() === arxiv) {
								targetPaperId = otherId;
								break;
							}
							if (
								citTitle &&
								citTitle.length > 8 &&
								otherNode.label.toLowerCase().trim() === citTitle
							) {
								targetPaperId = otherId;
								break;
							}
						}
					}

					if (targetPaperId && targetPaperId !== paperRel) {
						const linkId = `cite:${paperRel}->${targetPaperId}`;
						links.push({
							id: linkId,
							source: paperRel,
							target: targetPaperId,
							kind: "citation",
						});
					}
				}
			} catch {
				// Sidecar not found or unparseable, skip quietly
			}
		}),
	);

	// 5. Create Tag Nodes and links from nodes to tags
	const allTags = new Set<string>();
	for (const tagSet of tagsByNode.values()) {
		for (const t of tagSet) allTags.add(t);
	}

	for (const tag of allTags) {
		const tagId = `tag:#${tag}`;
		nodes.set(tagId, {
			id: tagId,
			label: `#${tag}`,
			kind: "tag",
			degree: 0,
			inDegree: 0,
			outDegree: 0,
			x: (Math.random() - 0.5) * 400,
			y: (Math.random() - 0.5) * 400,
			vx: 0,
			vy: 0,
			radius: 4,
		});

		for (const [nodeId, tagSet] of tagsByNode) {
			if (tagSet.has(tag)) {
				links.push({
					id: `${nodeId}->${tagId}`,
					source: nodeId,
					target: tagId,
				});
			}
		}
	}

	return { nodes, links, tagsByNode };
}

export function filterAndColorGraph(
	raw: RawGraphExtraction,
	filters: GraphFilterSettings,
	colorGroups: ColorGroup[],
	nodeSizeMultiplier: number,
): { nodes: GraphNode[]; links: GraphLink[] } {
	const filteredNodes = new Map<string, GraphNode>();
	const query = filters.searchQuery.trim().toLowerCase();

	// 1. Initial filter by kind and search query
	for (const [id, node] of raw.nodes) {
		if (filters.papersOnly && node.kind !== "paper") continue;
		if (!filters.showPapers && node.kind === "paper") continue;
		if (!filters.showTags && node.kind === "tag") continue;
		if (!filters.showAttachments && node.kind === "attachment") continue;
		if (filters.existingOnly && node.kind === "stub") continue;

		if (query) {
			const labelMatch = node.label.toLowerCase().includes(query);
			const pathMatch = node.path?.toLowerCase().includes(query) ?? false;
			const tagMatch =
				node.tags?.some((t) => t.toLowerCase().includes(query)) ?? false;
			const authorMatch =
				node.authors?.some((a) => a.toLowerCase().includes(query)) ?? false;
			if (!labelMatch && !pathMatch && !tagMatch && !authorMatch) {
				continue;
			}
		}

		filteredNodes.set(id, { ...node, degree: 0, inDegree: 0, outDegree: 0 });
	}

	// 2. Filter links where both source and target exist
	const filteredLinks: GraphLink[] = [];
	for (const link of raw.links) {
		if (!filters.showCitations && link.kind === "citation") continue;
		const s = filteredNodes.get(link.source);
		const t = filteredNodes.get(link.target);
		if (s && t) {
			s.outDegree += 1;
			s.degree += 1;
			t.inDegree += 1;
			t.degree += 1;
			filteredLinks.push({ ...link });
		}
	}

	// 3. Filter orphans if requested
	if (!filters.showOrphans) {
		for (const [id, node] of [...filteredNodes]) {
			if (node.degree === 0) {
				filteredNodes.delete(id);
			}
		}
	}

	// 4. Color assignment and radius scaling
	const resultNodes: GraphNode[] = [];
	for (const node of filteredNodes.values()) {
		// Calculate color based on color groups
		let assignedColor: string | undefined;
		for (const group of colorGroups) {
			const gQuery = group.query.trim().toLowerCase();
			if (!gQuery) continue;

			if (gQuery.startsWith("tag:")) {
				const targetTag = gQuery.slice(4).replace(/^#/, "");
				if (
					(node.kind === "tag" &&
						node.label.replace(/^#/, "").toLowerCase() === targetTag) ||
					node.tags?.some((t) => t.toLowerCase() === targetTag)
				) {
					assignedColor = group.color;
					break;
				}
			} else if (gQuery.startsWith("path:")) {
				const targetPath = gQuery.slice(5);
				if (node.path?.toLowerCase().includes(targetPath)) {
					assignedColor = group.color;
					break;
				}
			} else {
				if (
					node.label.toLowerCase().includes(gQuery) ||
					(node.path?.toLowerCase().includes(gQuery) ?? false) ||
					(node.tags?.some((t) => t.toLowerCase().includes(gQuery)) ?? false)
				) {
					assignedColor = group.color;
					break;
				}
			}
		}

		// Fallback kind colors if no group matches
		if (!assignedColor) {
			switch (node.kind) {
				case "paper":
					assignedColor = "#6366f1"; // Indigo
					break;
				case "note":
					assignedColor = "#3b82f6"; // Blue
					break;
				case "tag":
					assignedColor = "#f97316"; // Orange
					break;
				case "attachment":
					assignedColor = "#eab308"; // Amber
					break;
				case "stub":
					assignedColor = "#9ca3af"; // Gray
					break;
			}
		}

		node.color = assignedColor;
		const baseRadius =
			node.kind === "paper" ? 6.0 : node.kind === "note" ? 4.5 : 3.5;
		const inDegreeBonus = node.kind === "paper" ? node.inDegree * 1.5 : 0;
		node.radius =
			(baseRadius + Math.sqrt(Math.max(0, node.degree + inDegreeBonus)) * 1.4) *
			nodeSizeMultiplier;

		resultNodes.push(node);
	}

	return { nodes: resultNodes, links: filteredLinks };
}
