import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Point } from "@/lib/analytics";

export const CHART_COLORS = { red: "#E50914", soft: "#D7D7D7", amber: "#F0A020", blue: "#5AA9FF", green: "#20C77A" };

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
}

const tooltipStyle = { background: "#14171B", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 };
const axis = { stroke: "#8F969F", fontSize: 11, tickLine: false, axisLine: false } as const;

/** A themed chart. `kind` picks area, line or (stacked) bar. */
export function Chart({ data, series, kind = "area", height = 260, format, label, stacked }: { data: Point[]; series: SeriesDef[]; kind?: "area" | "line" | "bar"; height?: number; format?: (n: number) => string; label: string; stacked?: boolean }) {
  const common = { data, margin: { left: 4, right: 12, top: 8 } };
  const tick = format ? { tickFormatter: (v: number) => format(v) } : {};
  const grid = <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />;
  const x = <XAxis dataKey="label" {...axis} minTickGap={24} />;
  const y = <YAxis {...axis} width={48} {...tick} />;
  const tip = <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(255,255,255,0.15)" }} {...(format ? { formatter: (v: unknown) => format(Number(v)) } : {})} />;
  const legend = series.length > 1 ? <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} /> : null;
  return (
    <figure role="img" aria-label={label} className="m-0 px-2 pt-4 pb-2" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart {...common}>
            {grid}
            {x}
            {y}
            {tip}
            {legend}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={stacked ? 0 : [3, 3, 0, 0]} {...(stacked ? { stackId: "a" } : {})} />
            ))}
          </BarChart>
        ) : kind === "line" ? (
          <LineChart {...common}>
            {grid}
            {x}
            {y}
            {tip}
            {legend}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        ) : (
          <AreaChart {...common}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {grid}
            {x}
            {y}
            {tip}
            {legend}
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} fill={`url(#fill-${s.key})`} />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </figure>
  );
}
