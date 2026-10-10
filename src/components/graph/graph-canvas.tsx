import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { ForceSimulation } from "@/lib/graph/simulation";
import type {
	GraphAppearanceSettings,
	GraphForceSettings,
	GraphLink,
	GraphNode,
} from "@/lib/graph/types";

export type GraphCanvasProps = {
	nodes: GraphNode[];
	links: GraphLink[];
	appearance: GraphAppearanceSettings;
	forces: GraphForceSettings;
	onNodeClick: (node: GraphNode) => void;
	onNodeDoubleClick?: (node: GraphNode) => void;
	reheatSignal?: number;
};

export const GraphCanvas = memo(function GraphCanvas({
	nodes,
	links,
	appearance,
	forces,
	onNodeClick,
	onNodeDoubleClick,
	reheatSignal = 0,
}: GraphCanvasProps) {
	const { t } = useTranslation(["app"]);
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// Camera transform: pan and zoom
	const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1.0 });
	const cameraRef = useRef(camera);
	cameraRef.current = camera;

	// Hover & drag state
	const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
	const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
		null,
	);
	const hoveredNodeRef = useRef<GraphNode | null>(null);
	hoveredNodeRef.current = hoveredNode;

	const draggingNodeRef = useRef<GraphNode | null>(null);
	const isPanningRef = useRef(false);
	const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const hasMovedRef = useRef(false);

	// Physics simulation
	const simulationRef = useRef<ForceSimulation | null>(null);

	// Fast lookup of neighbor connections
	const neighborMap = useMemo(() => {
		const map = new Map<string, Set<string>>();
		for (const link of links) {
			const s = typeof link.source === "string" ? link.source : link.source;
			const target =
				typeof link.target === "string" ? link.target : link.target;
			if (!map.has(s)) map.set(s, new Set());
			if (!map.has(target)) map.set(target, new Set());
			map.get(s)?.add(target);
			map.get(target)?.add(s);
		}
		return map;
	}, [links]);

	// Initialize simulation once
	useEffect(() => {
		const sim = new ForceSimulation();
		simulationRef.current = sim;
		return () => {
			sim.stop();
		};
	}, []);

	// Update forces
	useEffect(() => {
		simulationRef.current?.setForces(forces);
	}, [forces]);

	// Update nodes and links
	useEffect(() => {
		if (simulationRef.current) {
			simulationRef.current.setData(nodes, links);
		}
	}, [nodes, links]);

	// Reheat signal
	useEffect(() => {
		if (reheatSignal > 0) {
			simulationRef.current?.reheat(1.0);
		}
	}, [reheatSignal]);

	// Screen to graph space transformation
	const screenToGraph = useCallback((screenX: number, screenY: number) => {
		const { x, y, zoom } = cameraRef.current;
		return {
			x: (screenX - x) / zoom,
			y: (screenY - y) / zoom,
		};
	}, []);

	// Find node at screen position
	const findNodeAt = useCallback(
		(screenX: number, screenY: number): GraphNode | null => {
			const { x: gx, y: gy } = screenToGraph(screenX, screenY);
			const zoom = cameraRef.current.zoom;
			let closest: GraphNode | null = null;
			let minDistanceSq = Number.POSITIVE_INFINITY;

			for (const node of nodes) {
				const hitRadius = (node.radius + 6) / zoom;
				const dx = node.x - gx;
				const dy = node.y - gy;
				const distSq = dx * dx + dy * dy;
				if (distSq <= hitRadius * hitRadius && distSq < minDistanceSq) {
					closest = node;
					minDistanceSq = distSq;
				}
			}

			return closest;
		},
		[nodes, screenToGraph],
	);

	// Drawing routine
	const render = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const width = canvas.width / dpr;
		const height = canvas.height / dpr;

		ctx.save();
		ctx.clearRect(0, 0, width, height);

		const { x: camX, y: camY, zoom } = cameraRef.current;
		ctx.translate(camX, camY);
		ctx.scale(zoom, zoom);

		const hovered = hoveredNodeRef.current;
		const neighbors = hovered ? neighborMap.get(hovered.id) : null;
		const isDark = document.documentElement.classList.contains("dark");

		// 1. Draw Links
		for (const link of links) {
			const s = link.sourceNode;
			const target = link.targetNode;
			if (!s || !target) continue;

			const isConnected =
				hovered && (s.id === hovered.id || target.id === hovered.id);
			const isCitation = link.kind === "citation";

			let strokeColor = isCitation
				? isDark
					? "rgba(129, 140, 248, 0.45)"
					: "rgba(79, 70, 229, 0.4)"
				: isDark
					? "rgba(255, 255, 255, 0.18)"
					: "rgba(0, 0, 0, 0.16)";
			let lineWidth =
				((isCitation ? 1.2 : 1.0) * appearance.linkThickness) / zoom;

			if (hovered) {
				if (isConnected) {
					strokeColor = isCitation
						? isDark
							? "rgba(165, 180, 252, 0.95)"
							: "rgba(67, 56, 202, 0.95)"
						: isDark
							? "rgba(255, 255, 255, 0.75)"
							: "rgba(0, 0, 0, 0.75)";
					lineWidth = (2.0 * appearance.linkThickness) / zoom;
				} else {
					strokeColor = isDark
						? "rgba(255, 255, 255, 0.04)"
						: "rgba(0, 0, 0, 0.04)";
				}
			}

			ctx.beginPath();
			ctx.moveTo(s.x, s.y);
			ctx.lineTo(target.x, target.y);
			ctx.strokeStyle = strokeColor;
			ctx.lineWidth = lineWidth;
			ctx.stroke();

			// Directional Arrowheads (always show on citations or when arrows enabled)
			if ((appearance.showArrows || isCitation) && !(!isConnected && hovered)) {
				const dx = target.x - s.x;
				const dy = target.y - s.y;
				const dist = Math.hypot(dx, dy);
				if (dist > target.radius + 8) {
					const angle = Math.atan2(dy, dx);
					const arrowDist = target.radius + 3;
					const tipX = target.x - (dx / dist) * arrowDist;
					const tipY = target.y - (dy / dist) * arrowDist;
					const arrowLen = 5.5 / zoom;

					ctx.beginPath();
					ctx.moveTo(tipX, tipY);
					ctx.lineTo(
						tipX - arrowLen * Math.cos(angle - Math.PI / 6),
						tipY - arrowLen * Math.sin(angle - Math.PI / 6),
					);
					ctx.lineTo(
						tipX - arrowLen * Math.cos(angle + Math.PI / 6),
						tipY - arrowLen * Math.sin(angle + Math.PI / 6),
					);
					ctx.closePath();
					ctx.fillStyle = strokeColor;
					ctx.fill();
				}
			}
		}

		// 2. Draw Nodes
		for (const node of nodes) {
			const isHoveredNode = hovered?.id === node.id;
			const isNeighbor = neighbors?.has(node.id) ?? false;
			const isDimmed = hovered && !isHoveredNode && !isNeighbor;

			ctx.save();
			if (isDimmed) {
				ctx.globalAlpha = 0.16;
			}

			// Outer glowing ring for hovered node
			if (isHoveredNode) {
				ctx.beginPath();
				ctx.arc(node.x, node.y, node.radius + 3 / zoom, 0, Math.PI * 2);
				ctx.strokeStyle = isDark
					? "rgba(255, 255, 255, 0.85)"
					: "rgba(0, 0, 0, 0.75)";
				ctx.lineWidth = 2 / zoom;
				ctx.stroke();
			}

			// Main node circle
			ctx.beginPath();
			ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
			ctx.fillStyle = node.color || (isDark ? "#818cf8" : "#4f46e5");
			ctx.fill();

			if (node.kind === "stub") {
				ctx.setLineDash([2 / zoom, 2 / zoom]);
				ctx.strokeStyle = isDark
					? "rgba(255, 255, 255, 0.4)"
					: "rgba(0, 0, 0, 0.4)";
				ctx.lineWidth = 1 / zoom;
				ctx.stroke();
			}

			ctx.restore();
		}

		// 3. Draw Text Labels
		const textOpacity = appearance.textOpacity;
		ctx.font = `${Math.max(9, Math.min(13, 11 / zoom))}px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "top";

		for (const node of nodes) {
			const isHoveredNode = hovered?.id === node.id;
			const isNeighbor = neighbors?.has(node.id) ?? false;
			const shouldDraw =
				isHoveredNode || isNeighbor || (textOpacity > 0 && zoom > 0.4);

			if (!shouldDraw) continue;

			ctx.save();
			let labelAlpha = textOpacity;
			if (isHoveredNode || isNeighbor) {
				labelAlpha = 1.0;
			} else if (hovered) {
				labelAlpha = 0.12;
			}
			ctx.globalAlpha = labelAlpha;

			const labelY = node.y + node.radius + 3 / zoom;
			// Stroke for contrast
			ctx.strokeStyle = isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)";
			ctx.lineWidth = 3 / zoom;
			ctx.strokeText(node.label, node.x, labelY);

			ctx.fillStyle = isDark
				? isHoveredNode
					? "#ffffff"
					: "#e2e8f0"
				: isHoveredNode
					? "#0f172a"
					: "#334155";
			ctx.fillText(node.label, node.x, labelY);
			ctx.restore();
		}

		ctx.restore();
	}, [nodes, links, appearance, neighborMap]);

	// Subscribe simulation tick to re-render
	useEffect(() => {
		simulationRef.current?.onTick(render);
	}, [render]);

	// Resize canvas buffer to match DOM element with devicePixelRatio
	const handleResize = useCallback(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) return;

		const rect = container.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;

		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		canvas.style.width = `${rect.width}px`;
		canvas.style.height = `${rect.height}px`;

		const ctx = canvas.getContext("2d");
		if (ctx) {
			ctx.scale(dpr, dpr);
		}

		simulationRef.current?.setDimensions(rect.width, rect.height);
		render();
	}, [render]);

	useEffect(() => {
		handleResize();
		const ro = new ResizeObserver(handleResize);
		if (containerRef.current) {
			ro.observe(containerRef.current);
		}
		return () => ro.disconnect();
	}, [handleResize]);

	// Initial camera center
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const rect = container.getBoundingClientRect();
		setCamera({
			x: rect.width / 2,
			y: rect.height / 2,
			zoom: 1.0,
		});
	}, []);

	// Pointer Handlers: Drag, Pan, Hover, Zoom
	const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const clientX = e.clientX - rect.left;
		const clientY = e.clientY - rect.top;

		dragStartPosRef.current = { x: e.clientX, y: e.clientY };
		hasMovedRef.current = false;

		const hitNode = findNodeAt(clientX, clientY);
		if (hitNode) {
			draggingNodeRef.current = hitNode;
			const { x: gx, y: gy } = screenToGraph(clientX, clientY);
			hitNode.fx = gx;
			hitNode.fy = gy;
			simulationRef.current?.reheat(0.3);
		} else {
			isPanningRef.current = true;
		}

		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const clientX = e.clientX - rect.left;
		const clientY = e.clientY - rect.top;

		if (
			Math.abs(e.clientX - dragStartPosRef.current.x) > 3 ||
			Math.abs(e.clientY - dragStartPosRef.current.y) > 3
		) {
			hasMovedRef.current = true;
		}

		if (draggingNodeRef.current) {
			const { x: gx, y: gy } = screenToGraph(clientX, clientY);
			draggingNodeRef.current.fx = gx;
			draggingNodeRef.current.fy = gy;
			simulationRef.current?.reheat(0.2);
			render();
			return;
		}

		if (isPanningRef.current) {
			setCamera((prev) => ({
				...prev,
				x: prev.x + e.movementX,
				y: prev.y + e.movementY,
			}));
			render();
			return;
		}

		// Hover hit detection
		const hitNode = findNodeAt(clientX, clientY);
		if (hitNode !== hoveredNodeRef.current) {
			setHoveredNode(hitNode);
			if (hitNode) {
				setTooltipPos({ x: clientX, y: clientY });
			} else {
				setTooltipPos(null);
			}
			render();
		} else if (hitNode) {
			setTooltipPos({ x: clientX, y: clientY });
		}
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
		try {
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// ignore
		}

		const dragged = draggingNodeRef.current;
		if (dragged) {
			dragged.fx = null;
			dragged.fy = null;
			draggingNodeRef.current = null;
			simulationRef.current?.reheat(0.15);
		}

		isPanningRef.current = false;

		// Clean click detection
		if (!hasMovedRef.current) {
			const rect = e.currentTarget.getBoundingClientRect();
			const clientX = e.clientX - rect.left;
			const clientY = e.clientY - rect.top;
			const hit = findNodeAt(clientX, clientY);
			if (hit) {
				onNodeClick(hit);
			}
		}
	};

	const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const clientX = e.clientX - rect.left;
		const clientY = e.clientY - rect.top;
		const hit = findNodeAt(clientX, clientY);
		if (hit && onNodeDoubleClick) {
			onNodeDoubleClick(hit);
		}
	};

	const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
		e.preventDefault();
		const rect = e.currentTarget.getBoundingClientRect();
		const clientX = e.clientX - rect.left;
		const clientY = e.clientY - rect.top;

		const factor = e.deltaY < 0 ? 1.15 : 0.87;
		setCamera((prev) => {
			const nextZoom = Math.max(0.05, Math.min(8.0, prev.zoom * factor));
			const nextX = clientX - (clientX - prev.x) * (nextZoom / prev.zoom);
			const nextY = clientY - (clientY - prev.y) * (nextZoom / prev.zoom);
			return { x: nextX, y: nextY, zoom: nextZoom };
		});
		render();
	};

	return (
		<div
			ref={containerRef}
			className="relative h-full w-full select-none overflow-hidden bg-background"
		>
			<canvas
				ref={canvasRef}
				className="h-full w-full cursor-grab active:cursor-grabbing"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onDoubleClick={handleDoubleClick}
				onWheel={handleWheel}
			/>

			{/* Hover Tooltip */}
			{hoveredNode && tooltipPos ? (
				<div
					className="pointer-events-none absolute z-20 flex max-w-xs flex-col gap-1 rounded-md border border-border/60 bg-popover/90 px-3 py-2 text-popover-foreground shadow-lg backdrop-blur-md transition-opacity duration-150"
					style={{
						left: `${tooltipPos.x + 14}px`,
						top: `${tooltipPos.y + 14}px`,
					}}
				>
					<div className="flex items-center gap-1.5">
						<Badge
							variant="outline"
							className="h-4 px-1 text-[10px] uppercase tracking-wider"
						>
							{hoveredNode.kind}
						</Badge>
						<span className="truncate font-semibold text-xs">
							{hoveredNode.label}
						</span>
					</div>
					{hoveredNode.path ? (
						<span className="truncate text-[11px] text-muted-foreground">
							{hoveredNode.path}
						</span>
					) : null}
					{hoveredNode.kind === "paper" &&
					(hoveredNode.authors?.length || hoveredNode.year) ? (
						<div className="flex flex-col text-[10px] text-muted-foreground/90">
							{hoveredNode.authors?.length ? (
								<span className="truncate">
									{hoveredNode.authors.slice(0, 3).join(", ")}
									{hoveredNode.authors.length > 3 ? " et al." : ""}
								</span>
							) : null}
							{hoveredNode.year ? <span>{hoveredNode.year}</span> : null}
						</div>
					) : null}
					<div className="flex items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
						<span>
							{hoveredNode.degree} {t("graph:connections", "connections")}
							{hoveredNode.kind === "paper" && hoveredNode.inDegree > 0 ? (
								<span className="ml-1 text-primary">
									({hoveredNode.inDegree}{" "}
									{t("graph:citationsInVault", "citations")})
								</span>
							) : null}
						</span>
						{hoveredNode.kind !== "tag" ? (
							<span className="text-primary text-[10px]">
								{t("graph:openNode", "Click to open")}
							</span>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
});
