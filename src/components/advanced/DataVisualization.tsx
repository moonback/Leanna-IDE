/**
 * DataVisualization — Composants de visualisation de données avancés
 * 
 * Ce module fournit des composants pour visualiser :
 * - Graphiques en barres et en lignes
 * - Graphiques circulaires (pie charts)
 * - Graphiques de progression
 * - Heatmaps
 * - Visualisations de réseaux
 */

import React, { useMemo } from "react";
import { motion } from "motion/react";
import type { Event, EventMetrics } from "../../server/core/types";

// Types pour les graphiques
interface BarChartData {
  label: string;
  value: number;
  color?: string;
}

interface LineChartData {
  label: string;
  values: number[];
  color?: string;
}

interface PieChartData {
  label: string;
  value: number;
  color?: string;
}

// Couleurs par défaut
const DEFAULT_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-red-500", "bg-teal-500", "bg-pink-500", "bg-indigo-500",
  "bg-yellow-500", "bg-cyan-500", "bg-rose-500", "bg-lime-500",
];

/**
 * Graphique en barres horizontales ou verticales
 */
export interface BarChartProps {
  data: BarChartData[];
  orientation?: "horizontal" | "vertical";
  title?: string;
  maxHeight?: string;
  showValues?: boolean;
  showLabels?: boolean;
  colors?: string[];
}

export function BarChart({
  data,
  orientation = "vertical",
  title,
  maxHeight = "300px",
  showValues = true,
  showLabels = true,
  colors = DEFAULT_COLORS,
}: BarChartProps) {
  const maxValue = useMemo(() => {
    return Math.max(...data.map(d => d.value), 1);
  }, [data]);

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      {title && (
        <h3 className="font-semibold text-slate-800 mb-4">{title}</h3>
      )}
      
      <div className="flex gap-4" style={{ maxHeight, overflow: "hidden" }}>
        {data.map((item, index) => {
          const percentage = (item.value / maxValue) * 100;
          const color = item.color || colors[index % colors.length];
          
          return (
            <div key={item.label} className="flex-1 flex flex-col">
              {showLabels && (
                <span className="text-xs text-slate-500 truncate mb-1">{item.label}</span>
              )}
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex-1">
                <motion.div
                  className={`h-full ${color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                />
              </div>
              {showValues && (
                <span className="text-xs text-slate-600 mt-1">{item.value}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Graphique en barres verticales (colonne)
 */
export function ColumnChart({
  data,
  title,
  maxHeight = "300px",
  showValues = true,
  showLabels = true,
  colors = DEFAULT_COLORS,
}: BarChartProps) {
  const maxValue = useMemo(() => {
    return Math.max(...data.map(d => d.value), 1);
  }, [data]);

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      {title && (
        <h3 className="font-semibold text-slate-800 mb-4">{title}</h3>
      )}
      
      <div className="flex items-end justify-between gap-2" style={{ maxHeight, overflow: "hidden" }}>
        {data.map((item, index) => {
          const percentage = (item.value / maxValue) * 100;
          const color = item.color || colors[index % colors.length];
          const colorClass = color.replace("bg-", "");
          
          return (
            <div key={item.label} className="flex-1 flex flex-col items-center">
              <motion.div
                className={`w-full ${color} rounded-t`}
                initial={{ height: 0 }}
                animate={{ height: `${percentage}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                style={{ minHeight: "8px" }}
                title={`${item.label}: ${item.value}`}
              />
              {showValues && (
                <span className="text-xs text-slate-600 mt-1">{item.value}</span>
              )}
              {showLabels && (
                <span className="text-xs text-slate-500 truncate mt-1 max-w-full">{item.label}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Graphique circulaire (Pie Chart) simplifié
 */
export interface PieChartProps {
  data: PieChartData[];
  title?: string;
  size?: number;
  showLabels?: boolean;
  showLegend?: boolean;
  colors?: string[];
}

export function PieChart({
  data,
  title,
  size = 200,
  showLabels = false,
  showLegend = true,
  colors = DEFAULT_COLORS,
}: PieChartProps) {
  const total = useMemo(() => {
    return data.reduce((sum, item) => sum + item.value, 0);
  }, [data]);

  const getArcData = (index: number) => {
    const startAngle = data.slice(0, index).reduce((sum, item) => sum + (item.value / total) * 360, 0);
    const endAngle = startAngle + (data[index].value / total) * 360;
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    
    const x1 = (size / 2) * Math.cos((startAngle * Math.PI) / 180);
    const y1 = (size / 2) * Math.sin((startAngle * Math.PI) / 180);
    const x2 = (size / 2) * Math.cos((endAngle * Math.PI) / 180);
    const y2 = (size / 2) * Math.sin((endAngle * Math.PI) / 180);
    
    return {
      d: `M ${size / 2} ${size / 2} L ${size / 2 + x1} ${size / 2 + y1} A ${size / 2} ${size / 2} 0 ${largeArc} 1 ${size / 2 + x2} ${size / 2 + y2} Z`,
      startAngle,
      endAngle,
    };
  };

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      {title && (
        <h3 className="font-semibold text-slate-800 mb-4">{title}</h3>
      )}
      
      <div className="flex flex-col items-center">
        {/* Graphique */}
        <svg width={size} height={size} className="mb-4">
          {data.map((item, index) => {
            const arcData = getArcData(index);
            const color = item.color || colors[index % colors.length];
            const colorClass = color.replace("bg-", "fill-");
            
            return (
              <path
                key={item.label}
                d={arcData.d}
                className={colorClass}
                stroke="white"
                strokeWidth="2"
              />
            );
          })}
        </svg>
        
        {/* Légende */}
        {showLegend && (
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            {data.map((item, index) => {
              const color = item.color || colors[index % colors.length];
              const percentage = ((item.value / total) * 100).toFixed(1);
              
              return (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${color}`} />
                  <span className="text-slate-600">{item.label} ({percentage}%)</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Graphique de progression circulaire
 */
export interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  showValue?: boolean;
  showLabel?: boolean;
  label?: string;
}

export function ProgressRing({
  value,
  max = 100,
  size = 100,
  strokeWidth = 8,
  color = "text-blue-500",
  backgroundColor = "text-slate-200",
  showValue = true,
  showLabel = true,
  label,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / max) * circumference;
  
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="mb-2">
        <circle
          strokeWidth={strokeWidth}
          stroke={backgroundColor}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <motion.circle
          strokeWidth={strokeWidth}
          stroke={color}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5 }}
          strokeLinecap="round"
        />
      </svg>
      
      {showValue && (
        <div className="text-center">
          <div className="text-lg font-bold text-slate-800">{value}/{max}</div>
          {showLabel && label && (
            <div className="text-xs text-slate-500">{label}</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Graphique de timeline pour les événements
 */
export interface EventTimelineProps {
  events: Event[];
  maxEvents?: number;
  maxHeight?: string;
  showTimestamp?: boolean;
}

export function EventTimeline({
  events,
  maxEvents = 50,
  maxHeight = "400px",
  showTimestamp = true,
}: EventTimelineProps) {
  const visibleEvents = useMemo(() => {
    return [...events].sort((a, b) => 
      new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    ).slice(0, maxEvents);
  }, [events, maxEvents]);

  // Regrouper les événements par heure/minute
  const groupedEvents = useMemo(() => {
    const groups: Record<string, Event[]> = {};
    
    visibleEvents.forEach(event => {
      const date = new Date(event.timestamp || 0);
      const hour = date.getHours();
      const minute = Math.floor(date.getMinutes() / 15) * 15; // Regrouper par 15 minutes
      const timeKey = `${hour}:${minute.toString().padStart(2, '0')}`;
      
      if (!groups[timeKey]) {
        groups[timeKey] = [];
      }
      groups[timeKey].push(event);
    });
    
    return Object.entries(groups).sort(([a], [b]) => {
      const [ha, ma] = a.split(':');
      const [hb, mb] = b.split(':');
      return (parseInt(hb) * 60 + parseInt(mb)) - (parseInt(ha) * 60 + parseInt(ma));
    });
  }, [visibleEvents]);

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      <h3 className="font-semibold text-slate-800 mb-4">Timeline des événements</h3>
      
      <div className="flex gap-2" style={{ maxHeight, overflowX: "auto", overflowY: "hidden" }}>
        {groupedEvents.map(([time, events]) => {
          const height = Math.min(events.length * 20, 200);
          
          return (
            <div key={time} className="flex flex-col items-center min-w-[80px]">
              <div className="text-xs text-slate-500 mb-2">{time}</div>
              <motion.div
                className="w-8 bg-blue-500/20 rounded-full relative"
                initial={{ height: 0 }}
                animate={{ height: `${height}px` }}
                transition={{ duration: 0.5 }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 text-xs font-medium text-blue-600">
                  {events.length}
                </div>
              </motion.div>
              <div className="flex flex-col gap-1 mt-2">
                {events.slice(0, 3).map((event, index) => (
                  <div
                    key={event.id || index}
                    className="text-xs text-slate-600 truncate max-w-[60px]"
                    title={event.type}
                  >
                    {event.type}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Graphique de métriques avec cartes
 */
export interface MetricsChartProps {
  metrics: EventMetrics;
  title?: string;
}

export function MetricsChart({ metrics, title }: MetricsChartProps) {
  const chartData = useMemo(() => {
    const byType = Object.entries(metrics.byType || {}).slice(0, 5);
    return byType.map(([type, count]) => ({
      label: type,
      value: count,
    }));
  }, [metrics]);

  const totalEvents = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0);
  }, [chartData]);

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      {title && (
        <h3 className="font-semibold text-slate-800 mb-4">{title}</h3>
      )}
      
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-surface-soft rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{metrics.total}</div>
          <div className="text-xs text-slate-500">Événements totaux</div>
        </div>
        <div className="bg-surface-soft rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{metrics.byPriority?.get("high") || 0}</div>
          <div className="text-xs text-slate-500">Haute priorité</div>
        </div>
        <div className="bg-surface-soft rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{metrics.failed}</div>
          <div className="text-xs text-slate-500">Échecs</div>
        </div>
      </div>
      
      <ColumnChart
        data={chartData}
        title="Par type d'événement"
        showValues={false}
        showLabels={true}
      />
    </div>
  );
}

/**
 * Graphique de heatmap pour l'activité
 */
export interface ActivityHeatmapProps {
  data: number[][];
  title?: string;
  maxValue?: number;
}

export function ActivityHeatmap({
  data,
  title,
  maxValue,
}: ActivityHeatmapProps) {
  const max = maxValue || Math.max(...data.flat());
  
  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      {title && (
        <h3 className="font-semibold text-slate-800 mb-4">{title}</h3>
      )}
      
      <div className="grid grid-cols-7 gap-1">
        {data.flat().map((value, index) => {
          const percentage = (value / max) * 100;
          const intensity = Math.min(percentage / 25, 4); // 0-4 pour les classes de couleurs
          
          const colorClasses = [
            "bg-slate-100",
            "bg-blue-200",
            "bg-blue-400",
            "bg-blue-600",
            "bg-blue-800",
          ];
          
          return (
            <motion.div
              key={index}
              className={`
                aspect-square rounded-sm ${colorClasses[Math.floor(intensity)]}
                transition-colors duration-200
              `}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.01 }}
              title={value > 0 ? `Activité: ${value}` : "Pas d'activité"}
            />
          );
        })}
      </div>
      
      <div className="flex justify-end mt-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Moins</span>
          <div className="w-3 h-3 rounded-sm bg-slate-100" />
          <div className="w-3 h-3 rounded-sm bg-blue-200" />
          <div className="w-3 h-3 rounded-sm bg-blue-400" />
          <div className="w-3 h-3 rounded-sm bg-blue-600" />
          <div className="w-3 h-3 rounded-sm bg-blue-800" />
          <span>Plus</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Visualisation de réseau d'agents (simplifiée)
 */
export interface AgentNetworkProps {
  agents: {
    id: string;
    name: string;
    status: string;
    connections?: string[];
  }[];
  title?: string;
}

export function AgentNetwork({ agents, title }: AgentNetworkProps) {
  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      {title && (
        <h3 className="font-semibold text-slate-800 mb-4">{title}</h3>
      )}
      
      <div className="flex flex-wrap items-center justify-center gap-6">
        {agents.map((agent, index) => {
          const statusColors = {
            idle: "bg-green-500",
            busy: "bg-blue-500",
            offline: "bg-gray-400",
            error: "bg-red-500",
          };
          
          const color = statusColors[agent.status as keyof typeof statusColors] || "bg-slate-400";
          const connections = agent.connections || [];
          
          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="relative">
                <div className={`
                  w-14 h-14 rounded-full flex items-center justify-center
                  bg-blue-500/10 border-2 ${color} border-opacity-20
                  shadow-lg
                `}>
                  <div className="w-3 h-3 rounded-full bg-slate-600" />
                </div>
                
                {/* Connexions */}
                {connections.length > 0 && (
                  <div className="absolute -top-2 -right-2 flex gap-1">
                    {connections.slice(0, 3).map(conn => (
                      <div key={conn} className="w-2 h-2 rounded-full bg-green-400" />
                    ))}
                  </div>
                )}
              </div>
              
              <div className="text-center">
                <div className="text-sm font-medium text-slate-700">{agent.name}</div>
                <div className="text-xs text-slate-500">{agent.status.replace("_", " ")}</div>
                <div className="text-xs text-slate-400">{connections.length} connexions</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// Export de tous les composants
export {
  BarChart as BarChart,
  ColumnChart as ColumnChart,
  PieChart as PieChart,
  ProgressRing as ProgressRing,
  EventTimeline as EventTimeline,
  MetricsChart as MetricsChart,
  ActivityHeatmap as ActivityHeatmap,
  AgentNetwork as AgentNetwork,
};
