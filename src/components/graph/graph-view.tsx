import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	useLibraryStore,
	useVaultStore,
	useWikiStore,
} from "@/hooks/use-app-stores";
import { loadGraphSettings, saveGraphSettings } from "@/lib/graph/defaults";
import {
	buildKnowledgeGraph,
	filterAndColorGraph,
} from "@/lib/graph/graph-builder";
import type { GraphNode, GraphSettings } from "@/lib/graph/types";
import { joinVaultPath } from "@/lib/vault";
import { openPaper, openTab } from "@/lib/workspace/actions";
import { GraphCanvas } from "./graph-canvas";
import { GraphControlPanel } from "./graph-control-panel";

export type GraphViewProps = {
	vaultPath: string | null;
	active?: boolean;
	className?: string;
};

export const GraphView = memo(function GraphView({
	vaultPath,
	className,
}: GraphViewProps) {
	const { t } = useTranslation(["graph", "app"]);
	const vaultMdFiles = useVaultStore((s) => s.vaultMdFiles);
	const paperFolders = useVaultStore((s) => s.paperFolders);
	const paperMetaByRelPath = useLibraryStore((s) => s.paperMetaByRelPath);
	const wikiIndexRevision = useWikiStore((s) => s.wikiIndexRevision);

	const [settings, setSettings] = useState<GraphSettings>(() =>
		loadGraphSettings(),
	);
	const [reheatSignal, setReheatSignal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [rawGraph, setRawGraph] = useState<Awaited<
		ReturnType<typeof buildKnowledgeGraph>
	> | null>(null);

	// Persist settings whenever changed
	const handleSettingsChange = useCallback((next: GraphSettings) => {
		setSettings(next);
		saveGraphSettings(next);
	}, []);

	// Extract graph whenever vault files or revision change
	useEffect(() => {
		let isCurrent = true;
		void wikiIndexRevision;
		setLoading(true);

		void buildKnowledgeGraph({
			vaultPath,
			vaultMdFiles,
			paperFolders,
			paperMetaByRelPath,
		})
			.then((data) => {
				if (!isCurrent) return;
				setRawGraph(data);
			})
			.finally(() => {
				if (isCurrent) setLoading(false);
			});

		return () => {
			isCurrent = false;
		};
	}, [
		vaultPath,
		vaultMdFiles,
		paperFolders,
		paperMetaByRelPath,
		wikiIndexRevision,
	]);

	// Filter and color nodes and edges
	const { nodes, links } = useMemo(() => {
		if (!rawGraph) return { nodes: [], links: [] };
		return filterAndColorGraph(
			rawGraph,
			settings.filters,
			settings.colorGroups,
			settings.appearance.nodeSize,
		);
	}, [
		rawGraph,
		settings.filters,
		settings.colorGroups,
		settings.appearance.nodeSize,
	]);

	const handleReheat = useCallback(() => {
		setReheatSignal((s) => s + 1);
	}, []);

	const handleNodeClick = useCallback(
		(node: GraphNode) => {
			if (!vaultPath) return;

			if (node.kind === "tag") {
				// Clicking a tag fills search query to focus on that tag
				handleSettingsChange({
					...settings,
					filters: { ...settings.filters, searchQuery: node.label },
				});
				return;
			}

			if (node.kind === "paper") {
				const targetAbs = joinVaultPath(vaultPath, node.path || node.id);
				openPaper(targetAbs);
				return;
			}

			if (node.kind === "note" || node.kind === "attachment") {
				const targetAbs = joinVaultPath(vaultPath, node.path || node.id);
				openTab(targetAbs);
			}
		},
		[vaultPath, settings, handleSettingsChange],
	);

	return (
		<div
			className={`relative flex h-full w-full flex-col overflow-hidden bg-background ${className ?? ""}`}
		>
			{/* Top Bar with back/forward & Title */}
			<div className="flex h-9 shrink-0 items-center justify-between border-b border-border/40 px-3 select-none">
				<div className="flex items-center gap-1.5">
					<Button
						variant="ghost"
						size="icon-xs"
						className="size-6 text-muted-foreground"
						disabled
					>
						<ArrowLeft className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						className="size-6 text-muted-foreground"
						disabled
					>
						<ArrowRight className="size-3.5" />
					</Button>
					<span className="ml-1 font-medium text-xs">
						{t("graph:title", "关系图谱")}
					</span>
				</div>
				<div className="flex items-center gap-2 text-muted-foreground text-xs">
					{loading ? (
						<div className="flex items-center gap-1 text-[11px]">
							<Loader2 className="size-3 animate-spin" />
							<span>{t("graph:indexing", "Indexing graph...")}</span>
						</div>
					) : (
						<span className="text-[11px] tabular-nums">
							{nodes.length} {t("graph:nodes", "nodes")} · {links.length}{" "}
							{t("graph:links", "links")}
						</span>
					)}
				</div>
			</div>

			{/* Main Canvas Area */}
			<div className="relative min-h-0 flex-1">
				<GraphCanvas
					nodes={nodes}
					links={links}
					appearance={settings.appearance}
					forces={settings.forces}
					onNodeClick={handleNodeClick}
					reheatSignal={reheatSignal}
				/>

				{/* Floating Collapsible Control Panel */}
				<GraphControlPanel
					settings={settings}
					onSettingsChange={handleSettingsChange}
					onReheat={handleReheat}
				/>
			</div>
		</div>
	);
});
