/**
 * ECharts wrappers. The pages had hand-rolled SVG shapes that turned into
 * slabs with one or two points; a real chart gives axes, tooltips and a
 * truthful sparse series. One place owns the chart theme.
 */
import { useEffect, useRef } from "react";
import * as core from "echarts/core";
import * as charts from "echarts/charts";
import * as components from "echarts/components";
import * as renderers from "echarts/renderers";

/**
 * echarts' .d.ts files import siblings without an extension ("./shared"),
 * which NodeNext resolution refuses: every echarts type arrives as an
 * error type. The slice this module uses is typed here instead.
 */
export type ChartOption = Record<string, unknown>;

interface ChartInstance {
  setOption(option: ChartOption, opts?: { notMerge?: boolean }): void;
  resize(): void;
  dispose(): void;
}

const lib = core as unknown as {
  init(host: HTMLElement, theme?: string, opts?: { renderer: "svg" | "canvas" }): ChartInstance;
  use(parts: unknown[]): void;
};
const parts = { ...charts, ...components, ...renderers } as unknown as Record<string, unknown>;

// Only what the pages draw: lines and donuts, rendered to SVG.
lib.use(
  ["LineChart", "PieChart", "GridComponent", "TitleComponent", "TooltipComponent", "SVGRenderer"].map(
    (name) => parts[name],
  ),
);

const TEXT = "#94a3b8";
const LINE = "#8b5cf6";
const GRID = "rgba(148, 163, 184, 0.18)";

/** A mounted ECharts instance that resizes with its box and disposes on unmount. */
export function Chart({
  option,
  height = 220,
  ariaLabel,
}: {
  option: ChartOption;
  height?: number;
  ariaLabel?: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const chart = useRef<ChartInstance | null>(null);
  // One instance per mount; callers rebuild `option` every render, which
  // must update the chart, not tear it down.
  useEffect(() => {
    if (!host.current) return;
    const instance = lib.init(host.current, undefined, { renderer: "svg" });
    chart.current = instance;
    const resize = () => instance.resize();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(host.current);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      instance.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);
  return (
    <div
      ref={host}
      style={{ height, width: "100%" }}
      role="img"
      aria-label={ariaLabel ?? "chart"}
    />
  );
}

export interface Point {
  at: string;
  value: number;
}

function optionFor(
  points: Point[],
  formatValue: (v: number) => string,
): ChartOption {
  return {
    animation: false,
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      borderWidth: 0,
      textStyle: { color: "#f8fafc", fontSize: 12 },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params];
        const first = list[0] as { dataIndex?: number } | undefined;
        const point =
          first?.dataIndex !== undefined ? points[first.dataIndex] : undefined;
        if (!point) return "";
        return `${new Date(point.at).toLocaleString()}<br/><b>${formatValue(point.value)}</b>`;
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: points.map((p) => p.at),
      axisLine: { lineStyle: { color: GRID } },
      axisTick: { show: false },
      axisLabel: {
        color: TEXT,
        fontSize: 10,
        hideOverlap: true,
        formatter: (value: string) => {
          const date = new Date(value);
          return Number.isNaN(date.getTime())
            ? value
            : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        },
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: {
        color: TEXT,
        fontSize: 10,
        formatter: (v: number) => formatValue(v),
      },
      splitLine: { lineStyle: { color: GRID } },
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        showSymbol: points.length <= 24,
        data: points.map((p) => p.value),
        lineStyle: { color: LINE, width: 2 },
        itemStyle: { color: LINE },
        areaStyle: { color: "rgba(139, 92, 246, 0.12)" },
        emphasis: { focus: "series" },
      },
    ],
  };
}

/** A value over time: snapshots, prices, validator balances. */
export function ValueHistory({
  points,
  formatValue,
  height = 220,
  ariaLabel,
}: {
  points: Point[];
  formatValue: (v: number) => string;
  height?: number;
  ariaLabel?: string;
}) {
  if (points.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        No history yet.
      </div>
    );
  }
  if (points.length === 1) {
    return (
      <div className="flex h-24 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
        <span className="text-lg font-medium text-foreground">
          {formatValue(points[0].value)}
        </span>
        <span>{new Date(points[0].at).toLocaleString()} — one observation so far.</span>
      </div>
    );
  }
  return (
    <Chart
      option={optionFor(points, formatValue)}
      height={height}
      ariaLabel={ariaLabel ?? "value over time"}
    />
  );
}

/** Categorical hues for allocation slices; "Other" always takes slate. */
const PALETTE = ["#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#d946ef", "#14b8a6", "#6366f1"];
const OTHER = "#94a3b8";

export interface Slice {
  label: string;
  value: number;
}

/**
 * Allocation donut with a legend that shows each slice's share. The caller
 * passes slices already folded from the same total the page prints, so the
 * ring and the table agree.
 */
export function Donut({
  slices,
  center,
  sub,
  formatValue,
}: {
  slices: Slice[];
  center: string;
  sub?: string;
  formatValue: (v: number) => string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (slices.length === 0 || total <= 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Nothing valued yet.
      </div>
    );
  }
  const colorOf = (s: Slice, i: number) =>
    s.label === "Other" ? OTHER : PALETTE[i % PALETTE.length];
  const option: ChartOption = {
    animation: false,
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      borderWidth: 0,
      textStyle: { color: "#f8fafc", fontSize: 12 },
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number };
        return `${p.name}<br/><b>${formatValue(p.value)}</b> · ${p.percent.toFixed(1)}%`;
      },
    },
    title: {
      text: center,
      subtext: sub,
      left: "center",
      top: "center",
      itemGap: 2,
      textStyle: { fontSize: 14, fontWeight: 600, color: TEXT },
      subtextStyle: { fontSize: 10, color: TEXT },
    },
    series: [
      {
        type: "pie",
        radius: ["62%", "86%"],
        avoidLabelOverlap: true,
        label: { show: false },
        itemStyle: { borderColor: "transparent", borderWidth: 2, borderRadius: 3 },
        data: slices.map((s, i) => ({
          name: s.label,
          value: s.value,
          itemStyle: { color: colorOf(s, i) },
        })),
      },
    ],
  };
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="h-44 w-44 shrink-0">
        <Chart option={option} height={176} ariaLabel={`allocation: ${center}`} />
      </div>
      <ul className="grid min-w-0 gap-1 text-xs">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: colorOf(s, i) }}
            />
            <span className="max-w-40 truncate">{s.label}</span>
            <span className="ml-auto pl-2 tabular-nums text-muted-foreground">
              {((s.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
