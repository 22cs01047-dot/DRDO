/**
 * TunnelProgress3D — Immersive 3D pipeline visualization.
 *
 * Dependencies:
 *   three, @react-three/fiber, @react-three/drei
 *
 * Drop-in replacement for TunnelProgress with same props interface.
 */

import {
  useMemo, useState, useCallback, useRef, Suspense, memo,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useTheme } from "../contexts/ThemeContext";
import type { StageData, Alert } from "../types";

/* ═══════════════════════════════════════════════════════
   Props — identical to 2D TunnelProgress
   ═══════════════════════════════════════════════════════ */

interface TunnelProgress3DProps {
  stages: StageData[];
  activeStageId: string | null;
  onStageClick: (stageId: string) => void;
  overallProgress: number;
  sessionStatus?: string;
  alerts?: Alert[];
  onItemSelect?: (itemId: string, stageId: string) => void;
  showTooltips?: boolean;
  compact?: boolean;
  highlightNextAction?: boolean;
}

/* ═══════════════════════════════════════════════════════
   3D Layout Constants
   ═══════════════════════════════════════════════════════ */

const G = {
  RADIUS: 1.0,
  INNER_R: 0.92,
  GATE_GAP: 0.12,
  ITEM_R: 0.06,
  GATE_TUBE_R: 0.055,
  ITEM_ORBIT: 0.6,
  RADIAL: 32,
  SEG_BASE: 2.8,
  SEG_MIN: 2.0,
  SEG_MAX: 3.5,
  CANVAS_H: 300,
};

/* ═══════════════════════════════════════════════════════
   Theme-Aware 3D Palette
   ═══════════════════════════════════════════════════════ */

function makePalette(dark: boolean) {
  const d = dark;
  return {
    shell:     { color: d ? "#475569" : "#cbd5e1", opacity: d ? 0.08 : 0.07 },
    fog:       d ? "#0f172a" : "#f8fafc",
    ambient:   d ? 0.35 : 0.55,
    dirLight:  d ? 0.9 : 1.1,
    status: {
      CONFIRMED:   { col: "#10b981", em: "#10b981", int: d ? 0.55 : 0.35, op: 0.55 },
      FAILED:      { col: "#ef4444", em: "#ef4444", int: d ? 0.55 : 0.35, op: 0.55 },
      IN_PROGRESS: { col: "#3b82f6", em: "#3b82f6", int: d ? 0.45 : 0.25, op: 0.45 },
      PENDING:     { col: d ? "#475569" : "#94a3b8", em: d ? "#1e293b" : "#e2e8f0", int: 0.02, op: 0.08 },
      AMBIGUOUS:   { col: "#f59e0b", em: "#f59e0b", int: d ? 0.45 : 0.25, op: 0.45 },
    },
    item: {
      CONFIRMED:   { col: "#10b981", em: "#10b981", int: d ? 1.2 : 0.8 },
      FAILED:      { col: "#ef4444", em: "#ef4444", int: d ? 1.2 : 0.8 },
      IN_PROGRESS: { col: "#3b82f6", em: "#3b82f6", int: d ? 0.9 : 0.6 },
      PENDING:     { col: d ? "#475569" : "#cbd5e1", em: d ? "#334155" : "#e2e8f0", int: 0.1 },
      AMBIGUOUS:   { col: "#f59e0b", em: "#f59e0b", int: d ? 0.9 : 0.6 },
    },
    gate: {
      default:   d ? "#64748b" : "#94a3b8",
      confirmed: "#10b981",
      failed:    "#ef4444",
      active:    "#3b82f6",
      metal:     0.85,
      rough:     0.2,
    },
    glow: d ? 2.5 : 1.8,
    label: {
      text:    d ? "#e2e8f0" : "#1e293b",
      sub:     d ? "#94a3b8" : "#64748b",
      bg:      d ? "rgba(15,23,42,0.88)" : "rgba(255,255,255,0.92)",
      border:  d ? "rgba(51,65,85,0.6)" : "rgba(226,232,240,0.8)",
    },
  };
}

type Pal = ReturnType<typeof makePalette>;
type StatusKey = keyof Pal["status"];

/* ═══════════════════════════════════════════════════════
   3D Layout Computation
   ═══════════════════════════════════════════════════════ */

interface Seg3D {
  id: string; name: string; order: number; status: string;
  progress: number; isActive: boolean;
  startX: number; endX: number; cx: number; len: number;
  items: Item3D[]; itemCount: number;
  alertCount: number; hasCritical: boolean; needsAction: boolean;
}

interface Item3D {
  id: string; name: string; status: string;
  x: number; y: number; z: number; angle: number;
}

interface Gate3D {
  x: number; color: string; isFilled: boolean;
  index: number; needsAction: boolean;
}

interface Layout3D {
  segs: Seg3D[];
  gates: Gate3D[];
  totalLen: number;
  counts: { total: number; confirmed: number; failed: number; pending: number; ambiguous: number; inProgress: number };
  totalAlerts: number;
  fillEndX: number;
}

function computeLayout(
  stages: StageData[], activeStageId: string | null,
  alerts: Alert[], sessionStatus: string, pal: Pal
): Layout3D | null {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const N = sorted.length;
  if (N === 0) return null;

  const segLen = Math.min(G.SEG_MAX, Math.max(G.SEG_MIN, G.SEG_BASE));
  const totalLen = N * segLen + (N + 1) * G.GATE_GAP;
  const startOffset = -totalLen / 2;

  const unacked = alerts.filter((a) => !a.acknowledged);
  const alertMap: Record<string, { total: number; critical: number }> = {};
  for (const a of unacked) {
    if (a.stageId) {
      if (!alertMap[a.stageId]) alertMap[a.stageId] = { total: 0, critical: 0 };
      alertMap[a.stageId].total++;
      if (a.severity === "CRITICAL") alertMap[a.stageId].critical++;
    }
  }

  let confirmed = 0, failed = 0, pending = 0, ambiguous = 0, inProgress = 0;

  const segs: Seg3D[] = sorted.map((st, i) => {
    const sx = startOffset + G.GATE_GAP + i * (segLen + G.GATE_GAP);
    const ex = sx + segLen;
    const isActive = st.id === activeStageId;

    const items = [...st.items]
      .sort((a, b) => a.orderInStage - b.orderInStage)
      .map((it, j, arr) => {
        const k = arr.length;
        const t = k === 1 ? 0.5 : j / (k - 1);
        const ix = sx + 0.15 + t * (segLen - 0.3);
        const angle = (j / Math.max(k, 1)) * Math.PI * 2 + Math.PI * 0.25;
        return {
          id: it.id, name: it.name, status: it.status,
          x: ix,
          y: Math.sin(angle) * G.ITEM_ORBIT,
          z: Math.cos(angle) * G.ITEM_ORBIT,
          angle,
        };
      });

    for (const it of st.items) {
      switch (it.status) {
        case "CONFIRMED": confirmed++; break;
        case "FAILED": failed++; break;
        case "IN_PROGRESS": inProgress++; break;
        case "AMBIGUOUS": ambiguous++; break;
        default: pending++;
      }
    }

    const stageNeeds = sessionStatus === "RUNNING" &&
      (st.status === "PENDING" || st.status === "IN_PROGRESS" || isActive);

    return {
      id: st.id, name: st.name, order: st.order, status: st.status,
      progress: st.progress, isActive,
      startX: sx, endX: ex, cx: (sx + ex) / 2, len: segLen,
      items, itemCount: st.items.length,
      alertCount: alertMap[st.id]?.total || 0,
      hasCritical: (alertMap[st.id]?.critical || 0) > 0,
      needsAction: stageNeeds,
    };
  });

  // Gate colors
  const gateColor = (l: Seg3D | null, r: Seg3D | null): string => {
    if (l?.status === "CONFIRMED") return pal.gate.confirmed;
    if (l?.status === "FAILED" || r?.status === "FAILED") return pal.gate.failed;
    if (l?.status === "IN_PROGRESS" || r?.status === "IN_PROGRESS") return pal.gate.active;
    return pal.gate.default;
  };

  const gates: Gate3D[] = Array.from({ length: N + 1 }, (_, i) => {
    const x = startOffset + i * (segLen + G.GATE_GAP) + G.GATE_GAP / 2;
    const left = i > 0 ? segs[i - 1] : null;
    const right = i < N ? segs[i] : null;
    return {
      x,
      color: gateColor(left, right),
      isFilled: left?.status === "CONFIRMED",
      index: i,
      needsAction: (left?.needsAction || false) || (right?.needsAction || false),
    };
  });

  let fillEndX = segs[0]?.startX || 0;
  for (const s of segs) {
    if (s.progress === 100) fillEndX = s.endX;
    else if (s.progress > 0) {
      fillEndX = s.startX + (s.progress / 100) * s.len;
      break;
    } else break;
  }

  return {
    segs, gates, totalLen,
    counts: { total: confirmed + failed + pending + ambiguous + inProgress, confirmed, failed, pending, ambiguous, inProgress },
    totalAlerts: unacked.length, fillEndX,
  };
}

/* ═══════════════════════════════════════════════════════
   3D Sub-Components
   ═══════════════════════════════════════════════════════ */

// ── Tunnel Segment (outer shell + inner fill) ──────────

const TunnelSegment = memo(({
  seg, pal, isHovered, onClick, onHover,
}: {
  seg: Seg3D; pal: Pal; isHovered: boolean;
  onClick: () => void; onHover: (hovered: boolean) => void;
}) => {
  const sc = pal.status[seg.status as StatusKey] || pal.status.PENDING;
  const innerRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  // Pulse animation for active/in-progress segments
  useFrame((state) => {
    if (!innerRef.current) return;
    const mat = innerRef.current.material as THREE.MeshStandardMaterial;
    if (seg.isActive || seg.status === "IN_PROGRESS") {
      const t = Math.sin(state.clock.elapsedTime * 2) * 0.15 + 0.85;
      mat.emissiveIntensity = sc.int * t;
      mat.opacity = sc.op * t;
    }
    if (glowRef.current && seg.isActive) {
      glowRef.current.intensity = pal.glow * (0.8 + Math.sin(state.clock.elapsedTime * 3) * 0.2);
    }
  });

  return (
    <group
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(false); document.body.style.cursor = "auto"; }}
    >
      {/* Outer shell — glass-like */}
      <mesh
        ref={shellRef}
        position={[seg.cx, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[G.RADIUS, G.RADIUS, seg.len, G.RADIAL, 1, true]} />
        <meshStandardMaterial
          color={pal.shell.color}
          transparent
          opacity={isHovered ? pal.shell.opacity * 2.5 : pal.shell.opacity}
          side={THREE.DoubleSide}
          roughness={0.15}
          metalness={0.05}
          depthWrite={false}
        />
      </mesh>

      {/* Inner fill — status-colored */}
      <mesh
        ref={innerRef}
        position={[seg.cx, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[G.INNER_R, G.INNER_R, seg.len - 0.04, G.RADIAL, 1, false]} />
        <meshStandardMaterial
          color={sc.col}
          emissive={sc.em}
          emissiveIntensity={sc.int}
          transparent
          opacity={sc.op}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Active glow point light */}
      {seg.isActive && (
        <pointLight
          ref={glowRef}
          position={[seg.cx, 0, 0]}
          color={sc.col}
          intensity={pal.glow}
          distance={seg.len * 1.5}
          decay={2}
        />
      )}

      {/* Hover highlight ring */}
      {isHovered && (
        <mesh position={[seg.cx, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[G.RADIUS + 0.05, 0.02, 8, G.RADIAL]} />
          <meshStandardMaterial
            color={sc.col}
            emissive={sc.col}
            emissiveIntensity={0.8}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
    </group>
  );
});
TunnelSegment.displayName = "TunnelSegment";

// ── Gate Ring ──────────────────────────────────────────

const GateRing = memo(({
  gate, pal,
}: {
  gate: Gate3D; pal: Pal;
}) => {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    if (gate.needsAction) {
      const mat = ref.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.3 + Math.sin(state.clock.elapsedTime * 4) * 0.3;
    }
  });

  return (
    <group>
      {/* Main ring */}
      <mesh
        ref={ref}
        position={[gate.x, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <torusGeometry args={[G.RADIUS, G.GATE_TUBE_R, 12, G.RADIAL]} />
        <meshStandardMaterial
          color={gate.color}
          emissive={gate.color}
          emissiveIntensity={gate.isFilled ? 0.4 : 0.1}
          metalness={pal.gate.metal}
          roughness={pal.gate.rough}
        />
      </mesh>

      {/* Inner disc for filled gates (subtle) */}
      {gate.isFilled && (
        <mesh position={[gate.x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[G.RADIUS * 0.3, G.RADIAL]} />
          <meshStandardMaterial
            color={gate.color}
            emissive={gate.color}
            emissiveIntensity={0.5}
            transparent
            opacity={0.15}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Gate number label */}
      <Html
        position={[gate.x, -G.RADIUS - 0.35, 0]}
        center
        distanceFactor={12}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            width: 20, height: 20, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 800, fontFamily: "Inter, system-ui, sans-serif",
            color: gate.isFilled ? "#ffffff" : gate.color,
            background: gate.isFilled ? gate.color : "transparent",
            border: `1.5px solid ${gate.color}`,
          }}
        >
          {gate.index}
        </div>
      </Html>
    </group>
  );
});
GateRing.displayName = "GateRing";

// ── Item Orb ──────────────────────────────────────────

const ItemOrb = memo(({
  item, pal, stageId, onDotClick, sessionRunning,
}: {
  item: Item3D; pal: Pal; stageId: string;
  onDotClick?: (itemId: string, stageId: string) => void;
  sessionRunning: boolean;
}) => {
  const ref = useRef<THREE.Mesh>(null);
  const ic = pal.item[item.status as StatusKey] || pal.item.PENDING;

  useFrame((state) => {
    if (!ref.current) return;
    const mesh = ref.current;
    // Gentle float animation
    mesh.position.y = item.y + Math.sin(state.clock.elapsedTime * 1.5 + item.angle) * 0.03;

    // Pulse for in-progress items
    if (item.status === "IN_PROGRESS" && sessionRunning) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 3 + item.angle) * 0.15;
      mesh.scale.setScalar(scale);
    }
  });

  return (
    <group>
      <mesh
        ref={ref}
        position={[item.x, item.y, item.z]}
        onClick={(e) => {
          e.stopPropagation();
          if (onDotClick) onDotClick(item.id, stageId);
        }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "auto"; }}
      >
        <sphereGeometry args={[G.ITEM_R, 16, 16]} />
        <meshStandardMaterial
          color={ic.col}
          emissive={ic.em}
          emissiveIntensity={ic.int}
        />
      </mesh>

      {/* Glow halo for non-pending items */}
      {item.status !== "PENDING" && (
        <mesh position={[item.x, item.y, item.z]}>
          <sphereGeometry args={[G.ITEM_R * 2.2, 12, 12]} />
          <meshStandardMaterial
            color={ic.col}
            emissive={ic.em}
            emissiveIntensity={ic.int * 0.3}
            transparent
            opacity={0.15}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
});
ItemOrb.displayName = "ItemOrb";

// ── Segment Label (HTML overlay in 3D space) ──────────

const SegmentLabel = memo(({
  seg, pal,
}: {
  seg: Seg3D; pal: Pal;
}) => (
  <Html
    position={[seg.cx, -G.RADIUS - 0.85, 0]}
    center
    distanceFactor={12}
    style={{ pointerEvents: "none", userSelect: "none" }}
  >
    <div
      style={{
        background: pal.label.bg,
        border: `1px solid ${pal.label.border}`,
        borderRadius: 8,
        padding: "4px 10px",
        textAlign: "center",
        minWidth: 80,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div style={{
        fontSize: 10, fontWeight: 700, color: pal.label.text,
        fontFamily: "Inter, system-ui, sans-serif",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        maxWidth: 100,
      }}>
        {seg.name}
      </div>
      <div style={{
        fontSize: 9, fontWeight: 600, color: pal.label.sub,
        fontFamily: "Inter, system-ui, sans-serif",
        marginTop: 1,
      }}>
        {seg.progress}% · {seg.itemCount} item{seg.itemCount !== 1 ? "s" : ""}
        {seg.alertCount > 0 ? ` · ⚠${seg.alertCount}` : ""}
      </div>
    </div>
  </Html>
));
SegmentLabel.displayName = "SegmentLabel";

// ── Flow Rings (animated energy flowing through confirmed sections) ──

const FlowRings = ({
  startX, endX, color, count = 3,
}: {
  startX: number; endX: number; color: string; count?: number;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const range = endX - startX;

  useFrame((_, delta) => {
    if (!groupRef.current || range <= 0) return;
    groupRef.current.children.forEach((child) => {
      child.position.x += delta * 2.0;
      if (child.position.x > endX) child.position.x = startX;
    });
  });

  if (range <= 0.2) return null;

  return (
    <group ref={groupRef}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh
          key={i}
          position={[startX + (i / count) * range, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <torusGeometry args={[G.RADIUS * 0.65, 0.012, 6, G.RADIAL]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.9}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};

// ── Active Stage Cursor (floating arrow above active segment) ──

const ActiveCursor = ({ seg, sessionRunning }: { seg: Seg3D; sessionRunning: boolean }) => {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y = G.RADIUS + 0.45 + Math.sin(state.clock.elapsedTime * 2.5) * 0.08;
    if (sessionRunning) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <group ref={ref} position={[seg.cx, G.RADIUS + 0.45, 0]}>
      <mesh>
        <octahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial
          color="#3b82f6"
          emissive="#3b82f6"
          emissiveIntensity={1.2}
        />
      </mesh>
      <Html center distanceFactor={12} style={{ pointerEvents: "none", userSelect: "none" }}>
        <div style={{
          fontSize: 9, fontWeight: 800, color: "#ffffff",
          background: "rgba(30,41,59,0.9)", borderRadius: 5,
          padding: "2px 8px", whiteSpace: "nowrap",
          fontFamily: "Inter, system-ui, sans-serif",
        }}>
          {sessionRunning ? "▶ ACTIVE" : "⏸ PAUSED"}
        </div>
      </Html>
    </group>
  );
};

/* ═══════════════════════════════════════════════════════
   Scene — Assembles all 3D elements
   ═══════════════════════════════════════════════════════ */

const TunnelScene = ({
  layout, pal, isDark, sessionStatus,
  onStageClick, onItemSelect, hoveredStage, setHoveredStage,
}: {
  layout: Layout3D; pal: Pal; isDark: boolean; sessionStatus: string;
  onStageClick: (id: string) => void;
  onItemSelect?: (itemId: string, stageId: string) => void;
  hoveredStage: string | null;
  setHoveredStage: (id: string | null) => void;
}) => {
  const { camera } = useThree();
  const sessionRunning = sessionStatus === "RUNNING";
  const sessionPaused = sessionStatus === "PAUSED";

  // Position camera to see entire tunnel
  useMemo(() => {
    const dist = layout.totalLen * 0.55 + 5;
    camera.position.set(0, G.RADIUS * 3, dist);
    (camera as THREE.PerspectiveCamera).lookAt(0, -0.2, 0);
    camera.updateProjectionMatrix();
  }, [layout.totalLen, camera]);

  const fillStart = layout.segs[0]?.startX ?? 0;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={pal.ambient} />
      <directionalLight
        position={[5, 8, 8]}
        intensity={pal.dirLight}
        castShadow={false}
      />
      <directionalLight
        position={[-3, 2, -5]}
        intensity={pal.dirLight * 0.3}
        color={isDark ? "#334155" : "#e2e8f0"}
      />

      {/* Subtle fog for depth */}
      <fog attach="fog" args={[pal.fog, layout.totalLen * 0.8, layout.totalLen * 3]} />

      {/* Orbit Controls — constrained */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={layout.totalLen * 0.3}
        maxDistance={layout.totalLen * 1.8}
        minPolarAngle={Math.PI * 0.15}
        maxPolarAngle={Math.PI * 0.48}
        minAzimuthAngle={-Math.PI * 0.25}
        maxAzimuthAngle={Math.PI * 0.25}
        target={[0, -0.2, 0]}
        makeDefault
      />

      {/* Tunnel Segments */}
      {layout.segs.map((seg) => (
        <TunnelSegment
          key={seg.id}
          seg={seg}
          pal={pal}
          isHovered={hoveredStage === seg.id}
          onClick={() => onStageClick(seg.id)}
          onHover={(h) => setHoveredStage(h ? seg.id : null)}
        />
      ))}

      {/* Gate Rings */}
      {layout.gates.map((gate) => (
        <GateRing key={`gate-${gate.index}`} gate={gate} pal={pal} />
      ))}

      {/* Item Orbs */}
      {layout.segs.map((seg) =>
        seg.items.map((item) => (
          <ItemOrb
            key={item.id}
            item={item}
            pal={pal}
            stageId={seg.id}
            onDotClick={onItemSelect}
            sessionRunning={sessionRunning}
          />
        ))
      )}

      {/* Segment Labels */}
      {layout.segs.map((seg) => (
        <SegmentLabel key={`label-${seg.id}`} seg={seg} pal={pal} />
      ))}

      {/* Flow Rings through confirmed sections */}
      {sessionRunning && layout.fillEndX > fillStart + 0.5 && (
        <FlowRings
          startX={fillStart}
          endX={layout.fillEndX}
          color="#10b981"
          count={Math.min(5, Math.ceil((layout.fillEndX - fillStart) / 2))}
        />
      )}

      {/* Active Stage Cursor */}
      {(sessionRunning || sessionPaused) &&
        layout.segs
          .filter((s) => s.isActive)
          .map((seg) => (
            <ActiveCursor key={`cursor-${seg.id}`} seg={seg} sessionRunning={sessionRunning} />
          ))
      }

      {/* Subtle ground reflection plane */}
      <mesh
        position={[0, -G.RADIUS - 0.5, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[layout.totalLen * 1.5, 6]} />
        <meshStandardMaterial
          color={isDark ? "#0f172a" : "#f1f5f9"}
          transparent
          opacity={isDark ? 0.15 : 0.08}
          roughness={0.9}
          depthWrite={false}
        />
      </mesh>
    </>
  );
};

/* ═══════════════════════════════════════════════════════
   Loading Fallback
   ═══════════════════════════════════════════════════════ */

const CanvasFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Loading 3D scene…
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════
   StatChip (reused from 2D version)
   ═══════════════════════════════════════════════════════ */

const StatChip = ({
  label, value, color = "text-slate-600 dark:text-slate-400",
  bg = "bg-slate-100 dark:bg-slate-700/50", icon, pulse = false,
}: {
  label: string; value: number; color?: string; bg?: string;
  icon?: string; pulse?: boolean;
}) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${bg} ${color} shadow-sm ${pulse ? "animate-pulse" : ""}`}>
    {icon && <span className="text-xs">{icon}</span>}
    <span>{label}</span>
    <span className="font-bold tabular-nums px-1 py-0.5 rounded bg-white/60 dark:bg-white/10">{value}</span>
  </span>
);

/* ═══════════════════════════════════════════════════════
   Main Component — Canvas + HTML Overlay
   ═══════════════════════════════════════════════════════ */

export const TunnelProgress3D = ({
  stages, activeStageId, onStageClick, overallProgress,
  sessionStatus = "IDLE", alerts = [], onItemSelect,
  showTooltips = true, highlightNextAction = true,
}: TunnelProgress3DProps) => {
  const { isDark } = useTheme();
  const pal = useMemo(() => makePalette(isDark), [isDark]);

  const layout = useMemo(
    () => computeLayout(stages, activeStageId, alerts, sessionStatus, pal),
    [stages, activeStageId, alerts, sessionStatus, pal]
  );

  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  const sessionState = {
    idle: sessionStatus === "IDLE",
    running: sessionStatus === "RUNNING",
    paused: sessionStatus === "PAUSED",
    completed: sessionStatus === "COMPLETED",
    aborted: sessionStatus === "ABORTED",
  };

  const sessionColors = useMemo(() => {
    const map: Record<string, { border: string; bg: string; text: string }> = {
      IDLE:      { border: "border-slate-200 dark:border-slate-600", bg: "bg-slate-100 dark:bg-slate-700", text: "text-slate-600 dark:text-slate-400" },
      RUNNING:   { border: "border-blue-300 dark:border-blue-500/40", bg: "bg-blue-100 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-400" },
      PAUSED:    { border: "border-amber-300 dark:border-amber-500/40", bg: "bg-amber-100 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-400" },
      COMPLETED: { border: "border-emerald-300 dark:border-emerald-500/40", bg: "bg-emerald-100 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
      ABORTED:   { border: "border-red-300 dark:border-red-500/40", bg: "bg-red-100 dark:bg-red-500/15", text: "text-red-700 dark:text-red-400" },
    };
    return map[sessionStatus] || map.IDLE;
  }, [sessionStatus]);

  // Empty state
  if (!layout || stages.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center transition-colors">
        <div className="text-slate-400 dark:text-slate-500 text-sm">No stages configured</div>
      </div>
    );
  }

  const { counts, totalAlerts } = layout;

  return (
    <div
      className={`bg-white dark:bg-slate-800 border-2 ${sessionColors.border} rounded-2xl
                  overflow-hidden relative transition-all duration-300 shadow-lg
                  hover:shadow-xl dark:shadow-slate-900/30`}
    >
      {/* ── Session Status Badge ──────────────────── */}
      <div className="absolute top-3 right-4 z-10">
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${sessionColors.bg} ${sessionColors.text} border ${sessionColors.border} shadow-sm`}>
          <span className={`w-2 h-2 rounded-full ${
            sessionState.running ? "bg-blue-500 animate-pulse"
            : sessionState.completed ? "bg-emerald-500"
            : sessionState.paused ? "bg-amber-500"
            : sessionState.aborted ? "bg-red-500"
            : "bg-slate-400 dark:bg-slate-500"
          }`} />
          {sessionStatus}
        </span>
      </div>

      {/* ── Action Required Badge ─────────────────── */}
      {highlightNextAction && sessionState.running && layout.segs.some((s) => s.needsAction) && (
        <div className="absolute top-3 left-4 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-100 dark:from-blue-500/20 to-blue-50 dark:to-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 text-xs font-semibold animate-pulse shadow-sm">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            ⚡ Action Required
          </div>
        </div>
      )}

      {/* ── Idle overlay ──────────────────────────── */}
      {sessionState.idle && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-6 py-3 rounded-full border border-slate-200 dark:border-slate-600 shadow-lg">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              ▶ Start session to begin verification
            </p>
          </div>
        </div>
      )}

      {/* ── 3D Canvas ─────────────────────────────── */}
      <div style={{ height: G.CANVAS_H }} className="w-full">
        <Suspense fallback={<CanvasFallback />}>
          <Canvas
            gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
            dpr={[1, 2]}
            camera={{ fov: 50, near: 0.1, far: 200 }}
            style={{ background: "transparent" }}
          >
            <TunnelScene
              layout={layout}
              pal={pal}
              isDark={isDark}
              sessionStatus={sessionStatus}
              onStageClick={onStageClick}
              onItemSelect={onItemSelect}
              hoveredStage={hoveredStage}
              setHoveredStage={setHoveredStage}
            />
          </Canvas>
        </Suspense>
      </div>

      {/* ── Stats Bar ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-3 border-t border-slate-100 dark:border-slate-700 bg-gradient-to-r from-slate-50/80 dark:from-slate-800/80 to-white/80 dark:to-slate-800/50 gap-3">
        {/* Overall Progress Ring */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg width="44" height="44" className="transform -rotate-90">
              <circle cx="22" cy="22" r="18" fill="none" stroke={isDark ? "#334155" : "#e2e8f0"} strokeWidth="5" />
              <circle
                cx="22" cy="22" r="18" fill="none"
                stroke={sessionState.completed ? "#10b981" : "#3b82f6"}
                strokeWidth="5"
                strokeDasharray={`${(overallProgress / 100) * 113} 113`}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300">
              {overallProgress}%
            </span>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Progress</div>
            <div className="text-sm text-slate-600 dark:text-slate-300">{counts.confirmed}/{counts.total}</div>
          </div>
        </div>

        {/* Stat Chips */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <StatChip label="Done" value={counts.confirmed} color="text-emerald-700 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-500/10" icon="✓" />
          <StatChip label="Active" value={counts.inProgress} color="text-blue-700 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-500/10" icon="⟳" />
          <StatChip label="Fail" value={counts.failed} color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-500/10" icon="✕" />
          <StatChip label="Wait" value={counts.pending} color="text-slate-500 dark:text-slate-400" bg="bg-slate-50 dark:bg-slate-700/30" icon="○" />
          {totalAlerts > 0 && (
            <StatChip label="Alerts" value={totalAlerts} color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-500/10" icon="⚠" pulse />
          )}
        </div>
      </div>

      {/* ── Paused overlay ────────────────────────── */}
      {sessionState.paused && (
        <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden z-0 opacity-20">
          <div className="w-full h-full" style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(245,158,11,${isDark ? 0.1 : 0.06}) 10px, rgba(245,158,11,${isDark ? 0.1 : 0.06}) 20px)`,
          }} />
        </div>
      )}

      {/* ── 3D controls hint ──────────────────────── */}
      <div className="absolute bottom-14 right-3 z-10">
        <span className="text-[9px] text-slate-400 dark:text-slate-500 bg-white/70 dark:bg-slate-800/70 px-2 py-0.5 rounded backdrop-blur-sm">
          🖱️ Drag to orbit
        </span>
      </div>
    </div>
  );
};