/**
 * ECharts wrappers. The pages had hand-rolled SVG shapes that turned into
 * slabs with one or two points; a real chart gives axes, tooltips and a
 * truthful sparse series. One place owns the chart theme.
 */
import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export type ChartOption = echarts.EChartsOption;

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
  useEffect(() => {
    if (!host.current) return;
    const chart = echarts.init(host.current, undefined, { renderer: "canvas" });
    chart.setOption(option);
    const resize = () => chart.resize();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(host.current);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
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
          {formatValue(points[0]!.value)}
        </span>
        <span>{new Date(points[0]!.at).toLocaleString()} — one observation so far.</span>
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
