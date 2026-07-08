import React, { useState } from "react";
import { ChunkingVisualData } from "../types";

interface VisualizerChartProps {
  data: ChunkingVisualData | null;
  filename?: string;
}

export const VisualizerChart: React.FC<VisualizerChartProps> = ({ data, filename }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.distances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400">
        <p className="text-sm">No semantic chunking metrics available.</p>
        <p className="text-xs text-slate-400 mt-1">Select a document above to parse semantic distance thresholds.</p>
      </div>
    );
  }

  const distances = data.distances;
  const threshold = data.threshold;
  const sentences = data.sentences;
  const splits = data.splits;

  // Chart layout dimensions
  const width = 800;
  const height = 240;
  const paddingX = 40;
  const paddingY = 30;

  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  // Find max distance to scale Y-axis (or cap at 1.0)
  const maxDistance = Math.max(...distances, threshold, 0.4);

  const getX = (index: number) => {
    if (distances.length <= 1) return paddingX + chartWidth / 2;
    return paddingX + (index / (distances.length - 1)) * chartWidth;
  };

  const getY = (value: number) => {
    return paddingY + chartHeight - (value / maxDistance) * chartHeight;
  };

  // Build SVG path
  let pathD = "";
  distances.forEach((dist, idx) => {
    const x = getX(idx);
    const y = getY(dist);
    if (idx === 0) {
      pathD = `M ${x} ${y}`;
    } else {
      pathD += ` L ${x} ${y}`;
    }
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-medium text-slate-800">
            Semantic Distance Gradient: <span className="text-indigo-600">{filename || "Active Document"}</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Plotting the semantic distance (1 - cosine similarity) between consecutive sentences. Peaks above the threshold trigger splits.
          </p>
        </div>
        <div className="flex items-center space-x-4 text-xs mt-2 sm:mt-0">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-0.5 bg-indigo-500 inline-block"></span>
            <span className="text-slate-600">Semantic distance</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-rose-500 inline-block"></span>
            <span className="text-slate-600">Split threshold (Percentile)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
            <span className="text-slate-600">Split boundary trigger</span>
          </div>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[700px] h-auto overflow-visible select-none">
          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={paddingX} y1={paddingY + chartHeight / 2} x2={width - paddingX} y2={paddingY + chartHeight / 2} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={paddingX} y1={paddingY + chartHeight} x2={width - paddingX} y2={paddingY + chartHeight} stroke="#e2e8f0" strokeWidth="1.5" />

          {/* Left Y Axis labels */}
          <text x={paddingX - 8} y={getY(0) + 4} className="text-[10px] font-mono text-slate-400" textAnchor="end">0.0</text>
          <text x={paddingX - 8} y={getY(maxDistance / 2) + 4} className="text-[10px] font-mono text-slate-400" textAnchor="end">{(maxDistance / 2).toFixed(2)}</text>
          <text x={paddingX - 8} y={getY(maxDistance) + 4} className="text-[10px] font-mono text-slate-400" textAnchor="end">{maxDistance.toFixed(2)}</text>

          {/* Boundary region highlights */}
          {splits.map((startIdx, sIdx) => {
            const endIdx = sIdx + 1 < splits.length ? splits[sIdx + 1] : sentences.length;
            const xStart = getX(Math.max(0, startIdx - 1));
            const xEnd = getX(Math.min(distances.length - 1, endIdx - 1));
            const rectWidth = xEnd - xStart;
            if (rectWidth <= 0) return null;

            return (
              <g key={`region-${sIdx}`}>
                <rect
                  x={xStart}
                  y={paddingY}
                  width={rectWidth}
                  height={chartHeight}
                  fill={sIdx % 2 === 0 ? "rgba(99, 102, 241, 0.03)" : "transparent"}
                />
                <text
                  x={xStart + rectWidth / 2}
                  y={paddingY + 16}
                  className="text-[9px] font-medium text-slate-400 fill-slate-400 text-center"
                  textAnchor="middle"
                >
                  Chunk {sIdx + 1}
                </text>
              </g>
            );
          })}

          {/* Threshold dashed line */}
          <line
            x1={paddingX}
            y1={getY(threshold)}
            x2={width - paddingX}
            y2={getY(threshold)}
            stroke="#f43f5e"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Distance Gradient Line Path */}
          <path
            d={pathD}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Nodes */}
          {distances.map((dist, idx) => {
            const x = getX(idx);
            const y = getY(dist);
            const isSplit = dist > threshold;

            return (
              <g key={`node-${idx}`}>
                {/* Visual node outline marker if it triggers a split */}
                {isSplit && (
                  <circle
                    cx={x}
                    cy={y}
                    r="8"
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="1"
                    className="animate-ping opacity-75"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={hoveredIndex === idx ? "6" : "4.5"}
                  fill={isSplit ? "#f43f5e" : "#6366f1"}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Floating dynamic context summary bar based on hovered node index */}
      <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-lg min-h-[58px]">
        {hoveredIndex !== null ? (
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-700">
              <span>Comparing sentence link {hoveredIndex + 1} → {hoveredIndex + 2}</span>
              <span className={distances[hoveredIndex] > threshold ? "text-rose-600 font-bold" : "text-indigo-600"}>
                Distance: {distances[hoveredIndex].toFixed(4)} {distances[hoveredIndex] > threshold ? "(SPLIT TRIGGERED)" : "(MERGED)"}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
              <p className="text-[10px] text-slate-500 leading-normal line-clamp-1">
                <span className="font-semibold text-slate-600">S{hoveredIndex + 1}:</span> "{sentences[hoveredIndex]}"
              </p>
              <p className="text-[10px] text-slate-500 leading-normal line-clamp-1">
                <span className="font-semibold text-slate-600">S{hoveredIndex + 2}:</span> "{sentences[hoveredIndex + 1]}"
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-8 text-[11px] text-slate-400">
            💡 Hover over the vector nodes on the chart line to read sentence pairs and compare similarity gradients.
          </div>
        )}
      </div>
    </div>
  );
};
