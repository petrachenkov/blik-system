import { Fragment } from 'react';

export interface BarChartSeries {
  key: string;
  label: string;
  /** Цвет бара по умолчанию для этой серии. */
  color: string;
  values: (number | null)[];
  /** Точечное переопределение цвета для конкретной категории (напр. подсветка перегруженных красным) — по индексу, как в values. */
  colors?: (string | undefined)[];
}

interface HorizontalBarChartProps {
  /** Подписи строк (напр. ФИО исполнителя), тот же порядок, что и в series[].values. */
  categories: string[];
  series: BarChartSeries[];
  formatValue?: (value: number) => string;
  emptyLabel?: string;
  axisColor?: string;
  textColor?: string;
  mutedColor?: string;
  /** Шкала только по целым делениям — для счётчиков (штук), а не длительностей. */
  integerAxis?: boolean;
}

const CATEGORY_LABEL_WIDTH = 170;
const CHART_WIDTH = 600;
const CHART_PADDING_RIGHT = 64;
const ROW_HEIGHT = 20;
const ROW_GAP = 5;
const GROUP_GAP = 14;
const TOP_PADDING = 8;
const AXIS_AREA_HEIGHT = 22;
const MAX_LABEL_CHARS = 22;

/** «Красивое» число для шага/максимума оси — классический алгоритм nice numbers (Heckbert),
 * чтобы деления шкалы приходились на круглые значения (1/2/5 * 10^n), а не на случайные дроби. */
function niceNumber(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

function calcAxis(maxValue: number, integer: boolean, maxTicks = 5): { niceMax: number; ticks: number[] } {
  if (maxValue <= 0) return { niceMax: 1, ticks: [0, 1] };
  const niceRange = niceNumber(maxValue, false);
  let step = niceNumber(niceRange / (maxTicks - 1), true);
  // Для счётчиков (штуки заявок) шаг шкалы не может быть дробным — иначе на оси видны
  // бессмысленные деления вроде «0.2» при малых значениях (см. скриншот при проверке).
  if (integer) step = Math.max(1, Math.round(step));
  const niceMax = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step / 1000; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return { niceMax, ticks };
}

function truncateLabel(text: string): string {
  return text.length > MAX_LABEL_CHARS ? `${text.slice(0, MAX_LABEL_CHARS - 1)}…` : text;
}

/** Лёгкий горизонтальный бар-чарт на чистом SVG, без внешних зависимостей — для сравнения
 * метрик по исполнителям на странице статистики (нагрузка, решено/отклонено, время реакции). */
export function HorizontalBarChart({
  categories,
  series,
  formatValue = (v) => String(v),
  emptyLabel = 'Нет данных',
  axisColor = '#d9d9d9',
  textColor = 'currentColor',
  mutedColor = '#8c8c8c',
  integerAxis = false,
}: HorizontalBarChartProps) {
  if (categories.length === 0) {
    return (
      <div style={{ color: mutedColor, padding: '32px 0', textAlign: 'center', fontSize: 13 }}>{emptyLabel}</div>
    );
  }

  const seriesCount = series.length || 1;
  const groupHeight = seriesCount * ROW_HEIGHT + (seriesCount - 1) * ROW_GAP;
  const plotWidth = CHART_WIDTH - CATEGORY_LABEL_WIDTH - CHART_PADDING_RIGHT;
  const plotBottom = TOP_PADDING + categories.length * (groupHeight + GROUP_GAP) - GROUP_GAP;
  const totalHeight = plotBottom + AXIS_AREA_HEIGHT;

  const maxValue = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const { niceMax, ticks } = calcAxis(maxValue, integerAxis);
  const scaleX = (value: number) => (value / niceMax) * plotWidth;

  return (
    <div>
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, fontSize: 12, color: mutedColor }}>
          {series.map((s) => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg width="100%" viewBox={`0 0 ${CHART_WIDTH} ${totalHeight}`} style={{ display: 'block' }} role="img">
        {ticks.map((t) => {
          const x = CATEGORY_LABEL_WIDTH + scaleX(t);
          return (
            <Fragment key={t}>
              <line x1={x} x2={x} y1={TOP_PADDING} y2={plotBottom} stroke={axisColor} strokeDasharray={t === 0 ? undefined : '2 3'} />
              <text x={x} y={totalHeight - 6} fontSize={11} fill={mutedColor} textAnchor="middle">
                {formatValue(t)}
              </text>
            </Fragment>
          );
        })}

        {categories.map((category, catIndex) => {
          const groupY = TOP_PADDING + catIndex * (groupHeight + GROUP_GAP);
          return (
            <g key={category}>
              <text
                x={CATEGORY_LABEL_WIDTH - 10}
                y={groupY + groupHeight / 2}
                fontSize={12}
                fill={textColor}
                textAnchor="end"
                dominantBaseline="middle"
              >
                <title>{category}</title>
                {truncateLabel(category)}
              </text>
              {series.map((s, sIndex) => {
                const rawValue = s.values[catIndex];
                const value = rawValue ?? 0;
                const barY = groupY + sIndex * (ROW_HEIGHT + ROW_GAP);
                const barWidth = value > 0 ? Math.max(2, scaleX(value)) : 0;
                const color = s.colors?.[catIndex] ?? s.color;
                return (
                  <g key={s.key}>
                    <rect x={CATEGORY_LABEL_WIDTH} y={barY} width={barWidth} height={ROW_HEIGHT} rx={3} fill={color} />
                    <text x={CATEGORY_LABEL_WIDTH + barWidth + 6} y={barY + ROW_HEIGHT / 2} fontSize={11} fill={mutedColor} dominantBaseline="middle">
                      {rawValue === null ? '—' : formatValue(value)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
