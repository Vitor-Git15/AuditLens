import React, { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ErrorBar,
  Cell
} from 'recharts';
import { theme } from './theme';
import { SliceData } from './mockData';

interface SoftErrorDistributionProps {
  sliceData: SliceData | null;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
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
          {data.name}
        </div>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: theme.colors.textSecondary }}>μ: </span>
          <strong style={{ color: theme.colors.textPrimary }}>{data.y.toFixed(4)}</strong>
        </div>
        <div>
          <span style={{ color: theme.colors.textSecondary }}>±σ: </span>
          <strong style={{ color: theme.colors.textPrimary }}>{(data.error[1]).toFixed(4)}</strong>
        </div>
      </div>
    );
  }
  return null;
};

export const SoftErrorDistribution: React.FC<SoftErrorDistributionProps> = ({ sliceData }) => {
  const data = useMemo(() => {
    if (!sliceData) return [];
    
    return [
      {
        name: 'Class 0',
        x: 'Class 0',
        y: sliceData.mu0,
        error: [sliceData.sigma0, sliceData.sigma0],
        color: theme.colors.class0
      },
      {
        name: 'Class 1',
        x: 'Class 1',
        y: sliceData.mu1,
        error: [sliceData.sigma1, sliceData.sigma1],
        color: theme.colors.class1
      }
    ];
  }, [sliceData]);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: theme.colors.textPrimary, fontWeight: 600 }}>
          Soft Error Distribution (μ ± σ)
        </h3>
        {sliceData && (
          <span style={{ 
            fontSize: '11px', 
            color: theme.colors.top1Highlight, 
            fontFamily: 'monospace', 
            backgroundColor: 'rgba(6, 182, 212, 0.1)', 
            padding: '2px 6px', 
            borderRadius: '4px', 
            border: `1px solid rgba(6, 182, 212, 0.2)` 
          }}>
            {sliceData.id}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {!sliceData ? (
          <div style={{ 
            height: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: theme.colors.textSecondary, 
            fontSize: '12px' 
          }}>
            Select a slice to view the Soft Error distribution
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.gridLine} vertical={false} />
              
              <XAxis 
                type="category" 
                dataKey="x" 
                name="Class" 
                stroke={theme.colors.textSecondary} 
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: theme.colors.gridLine }}
              />
              
              <YAxis 
                type="number" 
                dataKey="y" 
                name="Soft Error" 
                domain={[0, 1]} 
                stroke={theme.colors.textSecondary} 
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
              
              <Scatter name="Error Distribution" data={data} isAnimationActive={true} animationDuration={800}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
                <ErrorBar 
                  dataKey="error" 
                  width={8} 
                  strokeWidth={2} 
                  stroke={theme.colors.textPrimary} 
                  direction="y" 
                />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
