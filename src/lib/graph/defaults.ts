import type { ColorGroup, GraphSettings } from "./types";

export const DEFAULT_GRAPH_COLORS: readonly string[] = [
	"#ef4444", // Red
	"#f97316", // Orange
	"#f59e0b", // Amber
	"#10b981", // Emerald
	"#06b6d4", // Cyan
	"#3b82f6", // Blue
	"#6366f1", // Indigo
	"#8b5cf6", // Violet
	"#ec4899", // Pink
	"#14b8a6", // Teal
] as const;

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
	filters: {
		searchQuery: "",
		showTags: true,
		showAttachments: false,
		existingOnly: false,
		showOrphans: true,
	},
	colorGroups: [],
	appearance: {
		showArrows: false,
		textOpacity: 0.0,
		nodeSize: 1.0,
		linkThickness: 1.0,
	},
	forces: {
		centerForce: 0.3,
		repelForce: 250,
		linkDistance: 70,
		linkStrength: 0.4,
	},
};

const GRAPH_SETTINGS_STORAGE_KEY = "agentero:graph-settings";

export function loadGraphSettings(): GraphSettings {
	try {
		const raw = localStorage.getItem(GRAPH_SETTINGS_STORAGE_KEY);
		if (!raw) return DEFAULT_GRAPH_SETTINGS;
		const parsed = JSON.parse(raw) as Partial<GraphSettings>;
		return {
			filters: {
				...DEFAULT_GRAPH_SETTINGS.filters,
				...(parsed.filters ?? {}),
			},
			colorGroups: Array.isArray(parsed.colorGroups)
				? (parsed.colorGroups as ColorGroup[])
				: DEFAULT_GRAPH_SETTINGS.colorGroups,
			appearance: {
				...DEFAULT_GRAPH_SETTINGS.appearance,
				...(parsed.appearance ?? {}),
			},
			forces: {
				...DEFAULT_GRAPH_SETTINGS.forces,
				...(parsed.forces ?? {}),
			},
		};
	} catch {
		return DEFAULT_GRAPH_SETTINGS;
	}
}

export function saveGraphSettings(settings: GraphSettings): void {
	try {
		localStorage.setItem(GRAPH_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Ignore storage quota or disabled localStorage
	}
}
