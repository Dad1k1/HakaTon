'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, ChartNoAxesCombined } from './ui/icons';
import { type Analytics, useApp } from './context';
import { Button } from './ui/button';

export function OverviewCharts({ analytics: a }: { analytics?: Analytics }) {
  const t = useTranslations();
  const { locale, navigate } = useApp();
  const [period, setPeriod] = useState(7);
  const gradient = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(680);
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setChartWidth(Math.max(280, Math.round(entry.contentRect.width))),
    );
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const days = a?.daily.slice(-period) ?? [];
  const max = Math.ceil(Math.max(2, ...days.flatMap((d) => [d.created, d.completed])) / 2) * 2;
  const x = (i: number) => 36 + (i / Math.max(1, days.length - 1)) * (chartWidth - 72);
  const y = (value: number) => 158 - (value / max) * 126;
  const line = (key: 'created' | 'completed') =>
    days.map((d, i) => `${x(i)},${y(d[key])}`).join(' ');
  const total = days.reduce((sum, d) => sum + d.created, 0);
  const completed = days.reduce((sum, d) => sum + d.completed, 0);
  const statuses = ['NEW', 'REVIEW', 'IN_PROGRESS', 'WAITING', 'IMPLEMENTED', 'CLOSED', 'REJECTED'];
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const colors = ['#7598dc', '#a99adf', '#5178ba', '#d6ad6a', '#68ae95', '#909ba9', '#d18189'];
  let accumulated = 0;
  const segments = statuses.map((key, i) => {
    const start = accumulated;
    accumulated += ((a?.byStatus[key] || 0) / (a?.total || 1)) * 100;
    return `${colors[i]} ${start}% ${accumulated}%`;
  });
  return (
    <div className="overview-charts mb-7" data-tour="charts" aria-busy={!a}>
      <section className="panel trend-panel" ref={chartRef}>
        <div className="chart-heading">
          <div>
            <p className="eyebrow mb-2">{t('charts.eyebrow')}</p>
            <h2 className="font-semibold">{t('charts.activity')}</h2>
          </div>
          <div className="segmented" aria-label={t('charts.period')}>
            {[7, 30].map((n) => (
              <button key={n} aria-pressed={period === n} onClick={() => setPeriod(n)}>
                {t('charts.days', { count: n })}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-totals">
          <span>
            <i className="legend-dot" />
            <strong>{a ? total : '—'}</strong> {t('charts.received')}
          </span>
          <span>
            <i className="legend-dot completed" />
            <strong>{a ? completed : '—'}</strong> {t('charts.completed')}
          </span>
        </div>
        {!a ? (
          <div className="chart-placeholder" role="status">
            {t('loading')}
          </div>
        ) : (
          <>
            <svg
              className="trend-chart"
              viewBox={`0 0 ${chartWidth} 202`}
              role="img"
              aria-label={t('charts.summary', { days: period, created: total, completed })}
            >
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7598dc" stopOpacity=".2" />
                  <stop offset="100%" stopColor="#7598dc" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 1, 2].map((i) => (
                <g key={i}>
                  <line
                    x1="36"
                    x2={chartWidth - 36}
                    y1={32 + i * 63}
                    y2={32 + i * 63}
                    className="chart-grid"
                  />
                  <text x="22" y={36 + i * 63} textAnchor="end" className="chart-label">
                    {Math.round(max * (1 - i / 2))}
                  </text>
                </g>
              ))}
              <polygon
                points={`36,158 ${line('created')} ${chartWidth - 36},158`}
                fill={`url(#${gradient})`}
              />
              <polyline points={line('created')} className="chart-line" stroke="#7598dc" />
              <polyline
                points={line('completed')}
                className="chart-line"
                stroke="#68ae95"
                strokeDasharray="4 5"
              />
              {days.map((d, i) => (
                <g key={d.date}>
                  <title>
                    {formatter.format(new Date(d.date))}:{' '}
                    {t('charts.daySummary', { created: d.created, completed: d.completed })}
                  </title>
                  <circle cx={x(i)} cy={y(d.created)} r="4" fill="#7598dc" />
                  <circle cx={x(i)} cy={y(d.completed)} r="3" fill="#68ae95" />
                  {(i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2)) && (
                    <text
                      x={x(i)}
                      y="188"
                      textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}
                      className="chart-label"
                    >
                      {formatter.format(new Date(d.date))}
                    </text>
                  )}
                </g>
              ))}
            </svg>
            {total === 0 && completed === 0 && (
              <p className="chart-empty muted">{t('charts.quiet')}</p>
            )}
            <details className="chart-data">
              <summary>{t('charts.table')}</summary>
              <div className="thin-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t('charts.date')}</th>
                      <th>{t('charts.received')}</th>
                      <th>{t('charts.completed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => (
                      <tr key={d.date}>
                        <td>{formatter.format(new Date(d.date))}</td>
                        <td>{d.created}</td>
                        <td>{d.completed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>
      <section className="panel status-panel">
        <div className="chart-heading">
          <h2 className="font-semibold">{t('charts.statuses')}</h2>
          <ChartNoAxesCombined size={17} className="muted" />
        </div>
        <div className="status-chart-body">
          <div
            className="status-donut"
            style={{
              background: a?.total ? `conic-gradient(${segments.join(',')})` : 'hsl(var(--border))',
            }}
            role="img"
            aria-label={t('charts.statusSummary', {
              total: a?.total || 0,
              completed: a?.completed || 0,
            })}
          >
            <div>
              <strong>{a ? a.total : '—'}</strong>
              <span className="muted">{t('total')}</span>
            </div>
          </div>
          <div className="status-legend">
            {statuses
              .filter((key) => a?.byStatus[key])
              .map((key) => (
                <button key={key} onClick={() => navigate({ view: 'appeals', status: key })}>
                  <i className="legend-dot" style={{ background: colors[statuses.indexOf(key)] }} />
                  <span>{t(`statuses.${key}`)}</span>
                  <strong>{a?.byStatus[key]}</strong>
                </button>
              ))}
            {a && !a.total && <p className="muted text-xs">{t('noData')}</p>}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="chart-link"
          onClick={() => navigate({ view: 'analytics' })}
        >
          {t('charts.details')}
          <ArrowUpRight size={15} />
        </Button>
      </section>
    </div>
  );
}
