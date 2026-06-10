import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { theme } from './theme';

interface ContrastEvolutionChartProps {
  data: Array<{
    iteration: number;
    top1Contrast: number;
    top10AvgContrast: number;
  }>;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: theme.colors.tooltipBg,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: '6px',
        padding: '10px',
        color: theme.colors.textPrimary,
        fontSize: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold', color: theme.colors.textSecondary }}>
          Iteration {label}
        </div>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: entry.color }} />
            <span style={{ color: theme.colors.textSecondary }}>
              {entry.name}: <strong style={{ color: theme.colors.textPrimary }}>{entry.value.toFixed(4)}</strong>
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const ContrastEvolutionChart: React.FC<ContrastEvolutionChartProps> = ({ data }) => {
  return (
    <div style={{ 
      width: '100%', 
      height: '320px', 
      backgroundColor: theme.colors.card, 
      padding: '16px 16px 24px 16px', 
      borderRadius: '8px', 
      border: `1px solid ${theme.colors.border}`,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: theme.colors.textPrimary, fontWeight: 600 }}>
        Soft Error Contrast Evolution (Δg)
      </h3>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.gridLine} vertical={false} />
            <XAxis 
              dataKey="iteration" 
              stroke={theme.colors.textSecondary} 
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: theme.colors.gridLine }}
              minTickGap={20}
            />
            <YAxis 
              domain={[0, 'dataMax + 0.1']} 
              stroke={theme.colors.textSecondary} 
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => value.toFixed(2)}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: theme.colors.gridLine, strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Legend 
              wrapperStyle={{ fontSize: '12px', color: theme.colors.textSecondary, paddingTop: '10px' }}
              iconType="circle"
            />
            <Line
              type="monotone"
              dataKey="top1Contrast"
              name="TOP-1 Contrast (Δg)"
              stroke={theme.colors.top1Highlight}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0, fill: theme.colors.top1Highlight }}
              isAnimationActive={false} // Disable to avoid jank on streaming updates
            />
            <Line
              type="monotone"
              dataKey="top10AvgContrast"
              name="TOP-10 Avg Contrast (Δg)"
              stroke={theme.colors.top10Average}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: theme.colors.top10Average }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
