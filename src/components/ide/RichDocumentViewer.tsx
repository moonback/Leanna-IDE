/**
 * RichDocumentViewer — Affichage de documents riches créés par Leanna
 *
 * Supporte : tableau, bar_chart, line_chart, area_chart, pie_chart,
 *            card (fiche info), list (liste structurée), mixed (sections multiples)
 */

import { memo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer,
} from 'recharts';
import {
  X, Download, ChevronDown, ChevronUp, Table2, BarChart2,
  TrendingUp, PieChart as PieIcon, FileText, List, Layers,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RichBlockType =
  | 'table'
  | 'bar_chart'
  | 'line_chart'
  | 'area_chart'
  | 'pie_chart'
  | 'card'
  | 'list'
  | 'text';

export interface TableBlock {
  type: 'table';
  title?: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface ChartDataPoint {
  label: string;
  [key: string]: string | number;
}

export interface BarChartBlock {
  type: 'bar_chart';
  title?: string;
  data: ChartDataPoint[];
  series: { key: string; label?: string; color?: string }[];
  xLabel?: string;
  yLabel?: string;
  stacked?: boolean;
}

export interface LineChartBlock {
  type: 'line_chart';
  title?: string;
  data: ChartDataPoint[];
  series: { key: string; label?: string; color?: string }[];
  xLabel?: string;
  yLabel?: string;
  smooth?: boolean;
}

export interface AreaChartBlock {
  type: 'area_chart';
  title?: string;
  data: ChartDataPoint[];
  series: { key: string; label?: string; color?: string }[];
  xLabel?: string;
  yLabel?: string;
  stacked?: boolean;
}

export interface PieChartBlock {
  type: 'pie_chart';
  title?: string;
  data: { label: string; value: number; color?: string }[];
  donut?: boolean;
}

export interface CardField {
  label: string;
  value: string | number;
  highlight?: boolean;
}

export interface CardBlock {
  type: 'card';
  title?: string;
  subtitle?: string;
  fields: CardField[];
  badge?: { text: string; color?: string };
}

export interface ListBlock {
  type: 'list';
  title?: string;
  items: { text: string; sub?: string; icon?: string; badge?: string }[];
  ordered?: boolean;
}

export interface TextBlock {
  type: 'text';
  title?: string;
  content: string;
}

export type RichBlock =
  | TableBlock | BarChartBlock | LineChartBlock | AreaChartBlock
  | PieChartBlock | CardBlock | ListBlock | TextBlock;

export interface RichDocument {
  title: string;
  subtitle?: string;
  createdAt?: string;
  blocks: RichBlock[];
}

// ─── Palette de couleurs ──────────────────────────────────────────────────────

const CHART_COLORS = [
  '#6366f1', '#22d3ee', '#34d399', '#f59e0b',
  '#f87171', '#a78bfa', '#fb923c', '#4ade80',
  '#38bdf8', '#e879f9',
];

function getColor(index: number, override?: string) {
  return override || CHART_COLORS[index % CHART_COLORS.length];
}

// ─── Tooltip personnalisé ─────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 rounded-xl text-xs shadow-xl"
      style={{
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-base)',
        color: 'var(--text-primary)',
      }}
    >
      {label && <p className="font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>}
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: <span className="font-bold">{entry.value?.toLocaleString?.() ?? entry.value}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Rendu de chaque type de bloc ─────────────────────────────────────────────

function BlockTitle({ title }: { title?: string }) {
  if (!title) return null;
  return (
    <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
      {title}
    </p>
  );
}

function TableRenderer({ block }: { block: TableBlock }) {
  return (
    <div>
      <BlockTitle title={block.title} />
      <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border-base)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              {block.columns.map((col, i) => (
                <th
                  key={i}
                  className="px-4 py-2.5 text-left font-semibold tracking-wide uppercase"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-base)' }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr
                key={ri}
                className="transition-colors"
                style={{ backgroundColor: ri % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-4 py-2.5"
                    style={{
                      color: 'var(--text-primary)',
                      borderBottom: ri < block.rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarChartRenderer({ block }: { block: BarChartBlock }) {
  return (
    <div>
      <BlockTitle title={block.title} />
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={block.data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--text-dimmed)' }}
            axisLine={false}
            tickLine={false}
            label={block.xLabel ? { value: block.xLabel, position: 'insideBottom', offset: -4, fontSize: 10, fill: 'var(--text-dimmed)' } : undefined}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-dimmed)' }}
            axisLine={false}
            tickLine={false}
            label={block.yLabel ? { value: block.yLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--text-dimmed)' } : undefined}
          />
          <Tooltip content={<CustomTooltip />} />
          {block.series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
          )}
          {block.series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label || s.key}
              fill={getColor(i, s.color)}
              radius={[4, 4, 0, 0]}
              stackId={block.stacked ? 'stack' : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LineChartRenderer({ block }: { block: LineChartBlock }) {
  return (
    <div>
      <BlockTitle title={block.title} />
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={block.data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--text-dimmed)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-dimmed)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {block.series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
          )}
          {block.series.map((s, i) => (
            <Line
              key={s.key}
              type={block.smooth ? 'monotone' : 'linear'}
              dataKey={s.key}
              name={s.label || s.key}
              stroke={getColor(i, s.color)}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AreaChartRenderer({ block }: { block: AreaChartBlock }) {
  return (
    <div>
      <BlockTitle title={block.title} />
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={block.data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <defs>
            {block.series.map((s, i) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={getColor(i, s.color)} stopOpacity={0.3} />
                <stop offset="95%" stopColor={getColor(i, s.color)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--text-dimmed)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-dimmed)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {block.series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
          )}
          {block.series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label || s.key}
              stroke={getColor(i, s.color)}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              stackId={block.stacked ? 'stack' : undefined}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PieChartRenderer({ block }: { block: PieChartBlock }) {
  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.05) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div>
      <BlockTitle title={block.title} />
      <div className="flex items-center gap-4">
        <ResponsiveContainer width="60%" height={240}>
          <PieChart>
            <Pie
              data={block.data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={block.donut ? '45%' : 0}
              outerRadius="80%"
              labelLine={false}
              label={renderLabel}
            >
              {block.data.map((entry, i) => (
                <Cell key={i} fill={getColor(i, entry.color)} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Légende manuelle */}
        <div className="flex flex-col gap-1.5 text-xs flex-1 min-w-0">
          {block.data.map((entry, i) => {
            const total = block.data.reduce((s, d) => s + d.value, 0);
            const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';
            return (
              <div key={i} className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getColor(i, entry.color) }}
                />
                <span className="truncate" style={{ color: 'var(--text-muted)' }}>{entry.label}</span>
                <span className="ml-auto font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CardRenderer({ block }: { block: CardBlock }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          {block.title && (
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{block.title}</p>
          )}
          {block.subtitle && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-dimmed)' }}>{block.subtitle}</p>
          )}
        </div>
        {block.badge && (
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: block.badge.color ? `${block.badge.color}22` : 'var(--bg-tertiary)',
              color: block.badge.color || 'var(--accent-primary)',
              border: `1px solid ${block.badge.color ? `${block.badge.color}44` : 'var(--border-base)'}`,
            }}
          >
            {block.badge.text}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {block.fields.map((field, i) => (
          <div
            key={i}
            className="rounded-lg px-3 py-2"
            style={{
              backgroundColor: field.highlight ? 'var(--accent-primary-20, rgba(99,102,241,0.12))' : 'var(--bg-panel)',
              border: `1px solid ${field.highlight ? 'var(--accent-primary-40, rgba(99,102,241,0.3))' : 'var(--border-subtle)'}`,
            }}
          >
            <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-dimmed)' }}>
              {field.label}
            </p>
            <p
              className="text-sm font-semibold truncate"
              style={{ color: field.highlight ? 'var(--accent-primary)' : 'var(--text-primary)' }}
            >
              {field.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListRenderer({ block }: { block: ListBlock }) {
  return (
    <div>
      <BlockTitle title={block.title} />
      <div className="space-y-1.5">
        {block.items.map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-3 px-3 py-2 rounded-lg"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
          >
            <span
              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-primary)' }}
            >
              {block.ordered ? i + 1 : (item.icon || '•')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{item.text}</p>
              {item.sub && (
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-dimmed)' }}>{item.sub}</p>
              )}
            </div>
            {item.badge && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
              >
                {item.badge}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TextRenderer({ block }: { block: TextBlock }) {
  return (
    <div>
      <BlockTitle title={block.title} />
      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
        {block.content}
      </p>
    </div>
  );
}

function BlockIcon({ type }: { type: RichBlockType }) {
  const icons: Record<RichBlockType, React.ReactNode> = {
    table: <Table2 size={12} />,
    bar_chart: <BarChart2 size={12} />,
    line_chart: <TrendingUp size={12} />,
    area_chart: <TrendingUp size={12} />,
    pie_chart: <PieIcon size={12} />,
    card: <FileText size={12} />,
    list: <List size={12} />,
    text: <FileText size={12} />,
  };
  return <>{icons[type]}</>;
}

function BlockLabel({ type }: { type: RichBlockType }) {
  const labels: Record<RichBlockType, string> = {
    table: 'Tableau',
    bar_chart: 'Barres',
    line_chart: 'Courbe',
    area_chart: 'Aires',
    pie_chart: 'Camembert',
    card: 'Fiche',
    list: 'Liste',
    text: 'Texte',
  };
  return <>{labels[type]}</>;
}

function RichBlock({ block, index }: { block: RichBlock; index: number }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
    >
      {/* Block header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)' }}
      >
        <span
          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-primary)' }}
        >
          <BlockIcon type={block.type} />
          <BlockLabel type={block.type} />
        </span>
        <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {('title' in block && block.title) ? block.title : `Bloc ${index + 1}`}
        </span>
        <span style={{ color: 'var(--text-dimmed)' }}>
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </span>
      </button>

      {/* Block content */}
      {!collapsed && (
        <div className="p-4">
          {block.type === 'table'      && <TableRenderer block={block} />}
          {block.type === 'bar_chart'  && <BarChartRenderer block={block} />}
          {block.type === 'line_chart' && <LineChartRenderer block={block} />}
          {block.type === 'area_chart' && <AreaChartRenderer block={block} />}
          {block.type === 'pie_chart'  && <PieChartRenderer block={block} />}
          {block.type === 'card'       && <CardRenderer block={block} />}
          {block.type === 'list'       && <ListRenderer block={block} />}
          {block.type === 'text'       && <TextRenderer block={block} />}
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface Props {
  document: RichDocument;
  onClose?: () => void;
}

export const RichDocumentViewer = memo(function RichDocumentViewer({ document, onClose }: Props) {
  const [allCollapsed, setAllCollapsed] = useState(false);

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.title.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <Layers size={14} style={{ color: 'var(--accent-primary)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {document.title}
          </p>
          {document.subtitle && (
            <p className="text-[11px] truncate" style={{ color: 'var(--text-dimmed)' }}>
              {document.subtitle}
            </p>
          )}
        </div>
        {document.createdAt && (
          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
            {new Date(document.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
        <div className="flex items-center gap-1">
          {/* Collapse/expand all */}
          <button
            onClick={() => setAllCollapsed(c => !c)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-[10px]"
            style={{ color: 'var(--text-muted)' }}
            title={allCollapsed ? 'Tout déplier' : 'Tout replier'}
          >
            {allCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
          {/* Export JSON */}
          <button
            onClick={handleExportJson}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Exporter en JSON"
          >
            <Download size={13} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Fermer"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {document.blocks.length > 0 && (
        <div
          className="flex items-center gap-3 px-5 py-2 flex-shrink-0 overflow-x-auto"
          style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
            {document.blocks.length} bloc{document.blocks.length > 1 ? 's' : ''}
          </span>
          {Object.entries(
            document.blocks.reduce<Record<string, number>>((acc, b) => {
              acc[b.type] = (acc[b.type] || 0) + 1;
              return acc;
            }, {})
          ).map(([type, count]) => (
            <span
              key={type}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
            >
              <BlockIcon type={type as RichBlockType} />
              {count}× <BlockLabel type={type as RichBlockType} />
            </span>
          ))}
        </div>
      )}

      {/* Blocks */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {document.blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <Layers size={28} style={{ color: 'var(--text-dimmed)', opacity: 0.5 }} />
            <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Document vide</p>
          </div>
        ) : (
          document.blocks.map((block, i) => (
            <RichBlock key={i} block={block} index={i} />
          ))
        )}
      </div>
    </div>
  );
});
