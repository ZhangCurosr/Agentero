import {
	ChevronDown,
	ChevronRight,
	Play,
	Plus,
	RotateCcw,
	Search,
	SlidersHorizontal,
	Trash2,
	X,
} from "lucide-react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	DEFAULT_GRAPH_COLORS,
	DEFAULT_GRAPH_SETTINGS,
} from "@/lib/graph/defaults";
import type { ColorGroup, GraphSettings } from "@/lib/graph/types";

export type GraphControlPanelProps = {
	settings: GraphSettings;
	onSettingsChange: (settings: GraphSettings) => void;
	onReheat: () => void;
};

export const GraphControlPanel = memo(function GraphControlPanel({
	settings,
	onSettingsChange,
	onReheat,
}: GraphControlPanelProps) {
	const { t } = useTranslation(["graph", "app"]);
	const [isOpen, setIsOpen] = useState(true);

	// Accordion section collapse state
	const [filtersOpen, setFiltersOpen] = useState(true);
	const [colorGroupsOpen, setColorGroupsOpen] = useState(true);
	const [appearanceOpen, setAppearanceOpen] = useState(true);
	const [forcesOpen, setForcesOpen] = useState(false);

	const updateFilters = (patch: Partial<GraphSettings["filters"]>) => {
		onSettingsChange({
			...settings,
			filters: { ...settings.filters, ...patch },
		});
	};

	const updateAppearance = (patch: Partial<GraphSettings["appearance"]>) => {
		onSettingsChange({
			...settings,
			appearance: { ...settings.appearance, ...patch },
		});
	};

	const updateForces = (patch: Partial<GraphSettings["forces"]>) => {
		onSettingsChange({
			...settings,
			forces: { ...settings.forces, ...patch },
		});
	};

	const addColorGroup = () => {
		const nextColor =
			DEFAULT_GRAPH_COLORS[
				settings.colorGroups.length % DEFAULT_GRAPH_COLORS.length
			];
		const newGroup: ColorGroup = {
			id: `cg-${Date.now()}`,
			query: "",
			color: nextColor,
		};
		onSettingsChange({
			...settings,
			colorGroups: [...settings.colorGroups, newGroup],
		});
	};

	const updateColorGroup = (id: string, patch: Partial<ColorGroup>) => {
		onSettingsChange({
			...settings,
			colorGroups: settings.colorGroups.map((g) =>
				g.id === id ? { ...g, ...patch } : g,
			),
		});
	};

	const removeColorGroup = (id: string) => {
		onSettingsChange({
			...settings,
			colorGroups: settings.colorGroups.filter((g) => g.id !== id),
		});
	};

	const resetFilters = () => {
		onSettingsChange({
			...settings,
			filters: { ...DEFAULT_GRAPH_SETTINGS.filters },
		});
	};

	if (!isOpen) {
		return (
			<TooltipProvider delayDuration={200}>
				<div className="absolute top-3 right-3 z-30">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="size-8 rounded-md border-border/80 bg-background/80 shadow-md backdrop-blur-md"
								onClick={() => setIsOpen(true)}
								aria-label={t("graph:openControls", "Settings")}
							>
								<SlidersHorizontal className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="left">
							{t("graph:openControls", "Graph settings")}
						</TooltipContent>
					</Tooltip>
				</div>
			</TooltipProvider>
		);
	}

	return (
		<TooltipProvider delayDuration={200}>
			<aside className="absolute top-3 right-3 z-30 flex max-h-[calc(100%-1.5rem)] w-72 flex-col rounded-lg border border-border/70 bg-background/85 text-foreground shadow-xl backdrop-blur-xl transition-all duration-200">
				{/* Top Panel Bar */}
				<div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
					<span className="font-semibold text-xs tracking-tight">
						{t("graph:title", "Graph view")}
					</span>
					<div className="flex items-center gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-xs"
									className="size-6 text-muted-foreground hover:text-foreground"
									onClick={() => setIsOpen(false)}
									aria-label={t("app:buttons.close", "Close")}
								>
									<X className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{t("app:buttons.close", "Close")}
							</TooltipContent>
						</Tooltip>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2 text-xs">
					{/* 1. 筛选 (Filters) */}
					<div className="border-b border-border/40 py-2">
						<div className="flex items-center justify-between">
							<button
								type="button"
								className="flex items-center gap-1 font-medium hover:text-primary"
								onClick={() => setFiltersOpen(!filtersOpen)}
							>
								{filtersOpen ? (
									<ChevronDown className="size-3.5 text-muted-foreground" />
								) : (
									<ChevronRight className="size-3.5 text-muted-foreground" />
								)}
								<span>{t("graph:filters", "Filters")}</span>
							</button>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon-xs"
										className="size-5 text-muted-foreground hover:text-foreground"
										onClick={resetFilters}
										aria-label={t("graph:reset", "Reset filters")}
									>
										<RotateCcw className="size-3" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="left">
									{t("graph:reset", "Reset filters")}
								</TooltipContent>
							</Tooltip>
						</div>

						{filtersOpen ? (
							<div className="mt-2.5 flex flex-col gap-2.5 pl-1">
								{/* Search Input */}
								<div className="relative flex items-center">
									<Search className="absolute left-2 size-3 text-muted-foreground" />
									<input
										type="text"
										value={settings.filters.searchQuery}
										placeholder={t("graph:searchFiles", "Search files...")}
										onChange={(e) =>
											updateFilters({ searchQuery: e.target.value })
										}
										className="h-7 w-full rounded-md border border-input bg-background/50 pr-2 pl-7 text-xs shadow-xs focus-visible:border-primary focus-visible:outline-hidden"
									/>
									{settings.filters.searchQuery ? (
										<button
											type="button"
											onClick={() => updateFilters({ searchQuery: "" })}
											className="absolute right-2 text-muted-foreground hover:text-foreground"
										>
											<X className="size-3" />
										</button>
									) : null}
								</div>

								{/* Toggle Switches */}
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">
										{t("graph:tags", "Tags")}
									</span>
									<Switch
										checked={settings.filters.showTags}
										onCheckedChange={(checked) =>
											updateFilters({ showTags: checked })
										}
									/>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">
										{t("graph:attachments", "Attachments")}
									</span>
									<Switch
										checked={settings.filters.showAttachments}
										onCheckedChange={(checked) =>
											updateFilters({ showAttachments: checked })
										}
									/>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">
										{t("graph:existingOnly", "Existing files only")}
									</span>
									<Switch
										checked={settings.filters.existingOnly}
										onCheckedChange={(checked) =>
											updateFilters({ existingOnly: checked })
										}
									/>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">
										{t("graph:orphans", "Orphan files")}
									</span>
									<Switch
										checked={settings.filters.showOrphans}
										onCheckedChange={(checked) =>
											updateFilters({ showOrphans: checked })
										}
									/>
								</div>
							</div>
						) : null}
					</div>

					{/* 2. 颜色组 (Color Groups) */}
					<div className="border-b border-border/40 py-2">
						<button
							type="button"
							className="flex w-full items-center gap-1 font-medium hover:text-primary"
							onClick={() => setColorGroupsOpen(!colorGroupsOpen)}
						>
							{colorGroupsOpen ? (
								<ChevronDown className="size-3.5 text-muted-foreground" />
							) : (
								<ChevronRight className="size-3.5 text-muted-foreground" />
							)}
							<span>{t("graph:colorGroups", "Color groups")}</span>
						</button>

						{colorGroupsOpen ? (
							<div className="mt-2.5 flex flex-col gap-2 pl-1">
								<Button
									variant="outline"
									size="sm"
									className="h-7 w-full justify-center text-xs"
									onClick={addColorGroup}
								>
									<Plus className="mr-1 size-3" />
									{t("graph:newColorGroup", "New color group")}
								</Button>

								{settings.colorGroups.map((group) => (
									<div
										key={group.id}
										className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 p-1"
									>
										{/* Color circle picker */}
										<Popover>
											<PopoverTrigger asChild>
												<button
													type="button"
													className="size-4 shrink-0 rounded-full border border-border/80 shadow-xs"
													style={{ backgroundColor: group.color }}
													aria-label="Pick color"
												/>
											</PopoverTrigger>
											<PopoverContent className="w-36 p-2" align="start">
												<div className="grid grid-cols-5 gap-1.5">
													{DEFAULT_GRAPH_COLORS.map((c) => (
														<button
															type="button"
															key={c}
															className="size-5 rounded-full border border-border/40 transition-transform hover:scale-110"
															style={{ backgroundColor: c }}
															onClick={() =>
																updateColorGroup(group.id, { color: c })
															}
														/>
													))}
												</div>
											</PopoverContent>
										</Popover>

										<input
											type="text"
											value={group.query}
											placeholder="tag:#ml, path:papers"
											onChange={(e) =>
												updateColorGroup(group.id, { query: e.target.value })
											}
											className="h-6 min-w-0 flex-1 rounded bg-transparent px-1 text-[11px] focus-visible:outline-hidden"
										/>

										<Button
											variant="ghost"
											size="icon-xs"
											className="size-5 text-muted-foreground hover:text-destructive"
											onClick={() => removeColorGroup(group.id)}
										>
											<Trash2 className="size-3" />
										</Button>
									</div>
								))}
							</div>
						) : null}
					</div>

					{/* 3. 外观 (Appearance) */}
					<div className="border-b border-border/40 py-2">
						<button
							type="button"
							className="flex w-full items-center gap-1 font-medium hover:text-primary"
							onClick={() => setAppearanceOpen(!appearanceOpen)}
						>
							{appearanceOpen ? (
								<ChevronDown className="size-3.5 text-muted-foreground" />
							) : (
								<ChevronRight className="size-3.5 text-muted-foreground" />
							)}
							<span>{t("graph:appearance", "Appearance")}</span>
						</button>

						{appearanceOpen ? (
							<div className="mt-2.5 flex flex-col gap-3 pl-1">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">
										{t("graph:arrows", "Arrows")}
									</span>
									<Switch
										checked={settings.appearance.showArrows}
										onCheckedChange={(checked) =>
											updateAppearance({ showArrows: checked })
										}
									/>
								</div>

								{/* Text Opacity Slider */}
								<div className="flex flex-col gap-1">
									<div className="flex justify-between text-muted-foreground">
										<span>{t("graph:textOpacity", "Text opacity")}</span>
										<span className="tabular-nums font-mono text-[11px]">
											{settings.appearance.textOpacity.toFixed(2)}
										</span>
									</div>
									<input
										type="range"
										min={0.0}
										max={1.0}
										step={0.05}
										value={settings.appearance.textOpacity}
										onChange={(e) =>
											updateAppearance({
												textOpacity: Number.parseFloat(e.target.value),
											})
										}
										className="pdf-zoom-slider h-1.5 w-full cursor-pointer accent-primary"
									/>
								</div>

								{/* Node Size Slider */}
								<div className="flex flex-col gap-1">
									<div className="flex justify-between text-muted-foreground">
										<span>{t("graph:nodeSize", "Node size")}</span>
										<span className="tabular-nums font-mono text-[11px]">
											{settings.appearance.nodeSize.toFixed(2)}
										</span>
									</div>
									<input
										type="range"
										min={0.2}
										max={3.0}
										step={0.1}
										value={settings.appearance.nodeSize}
										onChange={(e) =>
											updateAppearance({
												nodeSize: Number.parseFloat(e.target.value),
											})
										}
										className="pdf-zoom-slider h-1.5 w-full cursor-pointer accent-primary"
									/>
								</div>

								{/* Link Thickness Slider */}
								<div className="flex flex-col gap-1">
									<div className="flex justify-between text-muted-foreground">
										<span>{t("graph:linkThickness", "Link thickness")}</span>
										<span className="tabular-nums font-mono text-[11px]">
											{settings.appearance.linkThickness.toFixed(2)}
										</span>
									</div>
									<input
										type="range"
										min={0.2}
										max={3.0}
										step={0.1}
										value={settings.appearance.linkThickness}
										onChange={(e) =>
											updateAppearance({
												linkThickness: Number.parseFloat(e.target.value),
											})
										}
										className="pdf-zoom-slider h-1.5 w-full cursor-pointer accent-primary"
									/>
								</div>

								{/* Play Animation Button */}
								<div className="flex justify-end pt-1">
									<Button
										variant="outline"
										size="sm"
										className="h-7 text-xs"
										onClick={onReheat}
									>
										<Play className="mr-1 size-3" />
										{t("graph:animate", "Play animation")}
									</Button>
								</div>
							</div>
						) : null}
					</div>

					{/* 4. 力度 (Forces) */}
					<div className="py-2">
						<button
							type="button"
							className="flex w-full items-center gap-1 font-medium hover:text-primary"
							onClick={() => setForcesOpen(!forcesOpen)}
						>
							{forcesOpen ? (
								<ChevronDown className="size-3.5 text-muted-foreground" />
							) : (
								<ChevronRight className="size-3.5 text-muted-foreground" />
							)}
							<span>{t("graph:forces", "Forces")}</span>
						</button>

						{forcesOpen ? (
							<div className="mt-2.5 flex flex-col gap-3 pl-1">
								{/* Center Force */}
								<div className="flex flex-col gap-1">
									<div className="flex justify-between text-muted-foreground">
										<span>{t("graph:centerForce", "Center force")}</span>
										<span className="tabular-nums font-mono text-[11px]">
											{settings.forces.centerForce.toFixed(2)}
										</span>
									</div>
									<input
										type="range"
										min={0.0}
										max={1.0}
										step={0.05}
										value={settings.forces.centerForce}
										onChange={(e) =>
											updateForces({
												centerForce: Number.parseFloat(e.target.value),
											})
										}
										className="pdf-zoom-slider h-1.5 w-full cursor-pointer accent-primary"
									/>
								</div>

								{/* Repel Force */}
								<div className="flex flex-col gap-1">
									<div className="flex justify-between text-muted-foreground">
										<span>{t("graph:repelForce", "Repel force")}</span>
										<span className="tabular-nums font-mono text-[11px]">
											{settings.forces.repelForce}
										</span>
									</div>
									<input
										type="range"
										min={50}
										max={800}
										step={10}
										value={settings.forces.repelForce}
										onChange={(e) =>
											updateForces({
												repelForce: Number.parseInt(e.target.value, 10),
											})
										}
										className="pdf-zoom-slider h-1.5 w-full cursor-pointer accent-primary"
									/>
								</div>

								{/* Link Distance */}
								<div className="flex flex-col gap-1">
									<div className="flex justify-between text-muted-foreground">
										<span>{t("graph:linkDistance", "Link distance")}</span>
										<span className="tabular-nums font-mono text-[11px]">
											{settings.forces.linkDistance}
										</span>
									</div>
									<input
										type="range"
										min={20}
										max={300}
										step={5}
										value={settings.forces.linkDistance}
										onChange={(e) =>
											updateForces({
												linkDistance: Number.parseInt(e.target.value, 10),
											})
										}
										className="pdf-zoom-slider h-1.5 w-full cursor-pointer accent-primary"
									/>
								</div>

								{/* Link Strength */}
								<div className="flex flex-col gap-1">
									<div className="flex justify-between text-muted-foreground">
										<span>{t("graph:linkStrength", "Link strength")}</span>
										<span className="tabular-nums font-mono text-[11px]">
											{settings.forces.linkStrength.toFixed(2)}
										</span>
									</div>
									<input
										type="range"
										min={0.05}
										max={1.0}
										step={0.05}
										value={settings.forces.linkStrength}
										onChange={(e) =>
											updateForces({
												linkStrength: Number.parseFloat(e.target.value),
											})
										}
										className="pdf-zoom-slider h-1.5 w-full cursor-pointer accent-primary"
									/>
								</div>
							</div>
						) : null}
					</div>
				</div>
			</aside>
		</TooltipProvider>
	);
});
