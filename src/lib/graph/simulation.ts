import { DEFAULT_GRAPH_SETTINGS } from "./defaults";
import type { GraphForceSettings, GraphLink, GraphNode } from "./types";

type QuadNode = {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	cx: number;
	cy: number;
	mass: number;
	node?: GraphNode;
	children?: [QuadNode, QuadNode, QuadNode, QuadNode];
};

function buildQuadtree(nodes: GraphNode[]): QuadNode | null {
	if (nodes.length === 0) return null;

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const n of nodes) {
		if (n.x < minX) minX = n.x;
		if (n.y < minY) minY = n.y;
		if (n.x > maxX) maxX = n.x;
		if (n.y > maxY) maxY = n.y;
	}

	const dx = maxX - minX;
	const dy = maxY - minY;
	const maxD = Math.max(dx, dy, 100);
	const root: QuadNode = {
		x0: minX - 10,
		y0: minY - 10,
		x1: minX - 10 + maxD + 20,
		y1: minY - 10 + maxD + 20,
		cx: 0,
		cy: 0,
		mass: 0,
	};

	for (const n of nodes) {
		insertQuad(root, n);
	}

	return root;
}

function insertQuad(quad: QuadNode, node: GraphNode): void {
	if (quad.mass === 0) {
		quad.node = node;
		quad.cx = node.x;
		quad.cy = node.y;
		quad.mass = 1;
		return;
	}

	const totalMass = quad.mass + 1;
	quad.cx = (quad.cx * quad.mass + node.x) / totalMass;
	quad.cy = (quad.cy * quad.mass + node.y) / totalMass;
	quad.mass = totalMass;

	const midX = (quad.x0 + quad.x1) / 2;
	const midY = (quad.y0 + quad.y1) / 2;

	if (!quad.children) {
		quad.children = [
			{ x0: quad.x0, y0: quad.y0, x1: midX, y1: midY, cx: 0, cy: 0, mass: 0 },
			{ x0: midX, y0: quad.y0, x1: quad.x1, y1: midY, cx: 0, cy: 0, mass: 0 },
			{ x0: quad.x0, y0: midY, x1: midX, y1: quad.y1, cx: 0, cy: 0, mass: 0 },
			{ x0: midX, y0: midY, x1: quad.x1, y1: quad.y1, cx: 0, cy: 0, mass: 0 },
		];
		if (quad.node) {
			const oldNode = quad.node;
			quad.node = undefined;
			const idx = (oldNode.x >= midX ? 1 : 0) + (oldNode.y >= midY ? 2 : 0);
			insertQuad(quad.children[idx], oldNode);
		}
	}

	const idx = (node.x >= midX ? 1 : 0) + (node.y >= midY ? 2 : 0);
	insertQuad(quad.children[idx], node);
}

function applyManyBodyBarnesHut(
	node: GraphNode,
	quad: QuadNode,
	repelStrength: number,
	alpha: number,
	theta = 0.8,
): void {
	if (quad.mass === 0) return;

	const dx = quad.cx - node.x;
	const dy = quad.cy - node.y;
	let distSq = dx * dx + dy * dy;

	const size = quad.x1 - quad.x0;
	if (quad.node === node) return;

	if (!quad.children || size * size < theta * theta * distSq) {
		if (distSq < 1) distSq = 1;
		const dist = Math.sqrt(distSq);
		const f = (-repelStrength * quad.mass * alpha) / (distSq + 100);
		node.vx += (dx / dist) * f;
		node.vy += (dy / dist) * f;
		return;
	}

	if (quad.children) {
		for (const child of quad.children) {
			applyManyBodyBarnesHut(node, child, repelStrength, alpha, theta);
		}
	}
}

export class ForceSimulation {
	private nodes: GraphNode[] = [];
	private links: GraphLink[] = [];
	private forces: GraphForceSettings;
	private width = 800;
	private height = 600;
	private alpha = 1.0;
	private alphaMin = 0.003;
	private alphaDecay = 0.022;
	private velocityDecay = 0.6;
	private running = false;
	private rafId: number | null = null;
	private onTickCallback?: () => void;

	constructor(forces: GraphForceSettings = DEFAULT_GRAPH_SETTINGS.forces) {
		this.forces = forces;
	}

	public setDimensions(width: number, height: number): void {
		this.width = width;
		this.height = height;
	}

	public setForces(forces: GraphForceSettings): void {
		this.forces = forces;
		this.reheat(0.3);
	}

	public setData(nodes: GraphNode[], links: GraphLink[]): void {
		const nodeMap = new Map<string, GraphNode>();
		for (const n of nodes) {
			nodeMap.set(n.id, n);
		}

		for (const l of links) {
			l.sourceNode = nodeMap.get(l.source);
			l.targetNode = nodeMap.get(l.target);
		}

		this.nodes = nodes;
		this.links = links.filter((l) => Boolean(l.sourceNode && l.targetNode));
		this.reheat(1.0);
	}

	public onTick(cb: () => void): void {
		this.onTickCallback = cb;
	}

	public reheat(alpha = 1.0): void {
		this.alpha = Math.max(this.alpha, alpha);
		if (!this.running) {
			this.start();
		}
	}

	public start(): void {
		if (this.running) return;
		this.running = true;
		const loop = () => {
			if (!this.running) return;
			this.tick();
			this.onTickCallback?.();

			if (this.alpha < this.alphaMin) {
				this.running = false;
				this.rafId = null;
				return;
			}
			this.rafId = requestAnimationFrame(loop);
		};
		this.rafId = requestAnimationFrame(loop);
	}

	public stop(): void {
		this.running = false;
		if (this.rafId != null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	public tick(): void {
		if (this.nodes.length === 0) return;

		this.alpha += (0 - this.alpha) * this.alphaDecay;
		const alpha = this.alpha;
		const { centerForce, repelForce, linkDistance, linkStrength } = this.forces;

		// 1. Center gravity force
		const cx = this.width / 2;
		const cy = this.height / 2;
		const cStrength = centerForce * 0.05 * alpha;
		for (const node of this.nodes) {
			if (node.fx != null && node.fy != null) continue;
			node.vx += (cx - node.x) * cStrength;
			node.vy += (cy - node.y) * cStrength;
		}

		// 2. Many-body repulsion with Quadtree
		const quad = buildQuadtree(this.nodes);
		if (quad) {
			for (const node of this.nodes) {
				if (node.fx != null && node.fy != null) continue;
				applyManyBodyBarnesHut(node, quad, repelForce, alpha);
			}
		}

		// 3. Link spring force
		const lStrength = linkStrength * 0.2 * alpha;
		for (const link of this.links) {
			const s = link.sourceNode;
			const t = link.targetNode;
			if (!s || !t) continue;

			let dx = t.x - s.x;
			let dy = t.y - s.y;
			let dist = Math.hypot(dx, dy);
			if (dist === 0) {
				dx = (Math.random() - 0.5) * 1e-3;
				dy = (Math.random() - 0.5) * 1e-3;
				dist = Math.hypot(dx, dy);
			}

			const delta = dist - linkDistance;
			const f = (delta / dist) * lStrength;

			if (s.fx == null) {
				s.vx += dx * f;
				s.vy += dy * f;
			}
			if (t.fx == null) {
				t.vx -= dx * f;
				t.vy -= dy * f;
			}
		}

		// 4. Integrate velocity and position
		for (const node of this.nodes) {
			if (node.fx != null && node.fy != null) {
				node.x = node.fx;
				node.y = node.fy;
				node.vx = 0;
				node.vy = 0;
				continue;
			}

			node.vx *= this.velocityDecay;
			node.vy *= this.velocityDecay;
			node.x += node.vx;
			node.y += node.vy;
		}
	}
}
