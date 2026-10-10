export type GraphNodeKind = "note" | "paper" | "tag" | "attachment" | "stub";

export type GraphNode = {
	id: string;
	label: string;
	kind: GraphNodeKind;
	path?: string;
	degree: number;
	inDegree: number;
	outDegree: number;
	tags?: string[];
	// Paper specific metadata
	authors?: string[];
	year?: number | null;
	publication?: string | null;
	citationCount?: number | null;
	doi?: string | null;
	arxivId?: string | null;
	// Physics simulation state
	x: number;
	y: number;
	vx: number;
	vy: number;
	fx?: number | null;
	fy?: number | null;
	radius: number;
	color?: string;
};

export type GraphLinkKind = "wikilink" | "citation";

export type GraphLink = {
	id: string;
	source: string;
	target: string;
	kind?: GraphLinkKind;
	sourceNode?: GraphNode;
	targetNode?: GraphNode;
};

export type GraphFilterSettings = {
	searchQuery: string;
	showTags: boolean;
	showAttachments: boolean;
	showPapers: boolean;
	showCitations: boolean;
	papersOnly: boolean;
	existingOnly: boolean;
	showOrphans: boolean;
};

export type ColorGroup = {
	id: string;
	query: string;
	color: string;
};

export type GraphAppearanceSettings = {
	showArrows: boolean;
	textOpacity: number;
	nodeSize: number;
	linkThickness: number;
};

export type GraphForceSettings = {
	centerForce: number;
	repelForce: number;
	linkDistance: number;
	linkStrength: number;
};

export type GraphSettings = {
	filters: GraphFilterSettings;
	colorGroups: ColorGroup[];
	appearance: GraphAppearanceSettings;
	forces: GraphForceSettings;
};
